/**
 * Workflow Automation Cron — /api/cron/workflow-automation
 *
 * Processes all overdue cases across 15 workflow statuses.
 * Overdue = nextUpdate is in the past OR null.
 * Every run sets nextUpdate = +3 working days.
 *
 * Statuses handled:
 *  1.  NEW_LEAD                → Run DHS Check
 *  2.  OUTSTANDING_DOCS        → Check GHL + Credo for received docs; re-request if missing
 *  3.  REQUESTED_VIA_DHS       → Run DHS Check Request Status
 *  4.  NOT_REQUESTED_VIA_DHS   → Verify docs present → Request via DHS
 *  5.  DOCUMENTS_EMAILED       → Check for Form 17.7; upload if found → Request via DHS
 *  6.  CONSUMER_CONTACTED_DC   → Request via DHS
 *  7.  INVOICE_REQUESTED_DC    → Check inbox for DC invoice → upload + email consumer; else re-request DC
 *  8.  INVOICE_SENT_CONSUMER   → Check for proof of payment → upload + request DHS; else remind consumer
 *  9.  REJECTED_EMAIL_DOCS     → Request via DHS
 * 10.  REJECTED_NOT_CONSENT    → Send consent reminder to consumer
 * 11.  REJECTED_OWES_FEES      → Request invoice from DC
 * 12.  IRFDC_1M–4M_PLUS        → Check inbox for DC invoice; re-request with escalation
 * 13.  INVSNT_1M–4M_PLUS       → Check for PoP from consumer; send follow-up
 * 14.  ACCEPTED_VIA_DHS        → Notify manager; check for Form 17.7
 * 15.  COMPLETED (Letsatsi)    → Friday only: email mmamy@letsatsifinance.co.za + update to SUBMITTED
 */

import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { createLogger } from '@zenowethu/shared-lib';
import { logAutomationRun } from '@zenowethu/shared-lib/src/automation/run-logger';
import {
    getOverdueCases,
    getOverdueLetsatsiCompleted,
    hasDocument,
    hasInboundKeyword,
    hasDocumentSince,
    updateCaseStatus,
    setNextUpdate,
    addSystemComment,
    sendConsumerMessage,
    sendDCEmail,
    notifyManagers,
    getDHSDocuments,
    type OverdueCase,
} from '@zenowethu/shared-lib/src/automation/workflow-engine';
import { checkTransferStatus, requestTransfer, closeBrowser } from '@zenowethu/shared-lib/src/dhs';
import { addWorkingDays } from '@zenowethu/shared-lib/src/statuses/workingDays';
import { sendManualMessage } from '@zenowethu/shared-lib/src/notifications/service';

const logger = createLogger('cron/workflow-automation');
const LETSATSI_REPORT_EMAIL = 'mmamy@letsatsifinance.co.za';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.zenowethu.co.za';

// ─── Auth & Guard ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
    const cronSecret = request.headers.get('x-cron-secret');
    if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const startedAt = new Date();
    const adminUser = await prisma.user.findFirst({ where: { isAdmin: true }, select: { id: true } });
    const adminId = adminUser?.id;

    const summary: Record<string, { processed: number; actioned: number; errors: number }> = {};
    const log = (handler: string, processed: number, actioned: number, errors: number) => {
        summary[handler] = { processed, actioned, errors };
        logger.info(`[${handler}] processed=${processed} actioned=${actioned} errors=${errors}`);
    };

    try {
        logger.info('[CRON] Workflow automation starting...');

        // ── 1. NEW_LEAD → Run DHS Check ──────────────────────────────────────
        await handleWithDHS('NEW_LEAD', 'Check DHS status for new leads', adminId, log, async (c) => {
            const result = await withDHSTimeout(() => checkTransferStatus(c.client.idNumber));
            if (!result) return { actioned: false, comment: 'DHS check timed out' };

            let newStatus = c.status;
            let comment = '';

            if (!result.found && result.status === 'NOT_LINKED') {
                newStatus = 'NOT_LINKED'; comment = 'DHS Check: ID not found on DHS (NOT_LINKED)';
            } else if (!result.found) {
                newStatus = 'NOT_REQUESTED_VIA_DHS'; comment = 'DHS Check: Consumer exists on DHS but no active transfer request found';
            } else if (result.status === 'PENDING') {
                newStatus = 'REQUESTED_VIA_DHS'; comment = `DHS Check: Request is PENDING (${result.daysCounter || 'New'})`;
            } else if (result.status === 'ACCEPTED' || result.status === 'AUTO_TRANSFERRED') {
                newStatus = 'ACCEPTED_VIA_DHS'; comment = 'DHS Check: Transfer ACCEPTED';
            } else if (result.status === 'DECLINED') {
                newStatus = 'DECLINED_VIA_DHS'; comment = `DHS Check: DECLINED — ${result.declineReason || 'no reason captured'}`;
            }

            await updateCaseStatus(c.id, newStatus, adminId);
            await addSystemComment(c.id, `[AUTO] New Lead DHS Check. ${comment}. Next update +3 working days.`, adminId);
            return { actioned: true, comment };
        });

        // ── 2. OUTSTANDING_DOCS → Check GHL + Credo for received docs ────────
        {
            const cases = await getOverdueCases('OUTSTANDING_DOCS');
            let processed = 0, actioned = 0, errors = 0;
            for (const c of cases) {
                try {
                    processed++;
                    const clientName = `${c.client.firstName} ${c.client.lastName}`.trim();

                    // Check if ID + POA arrived (either as documents or inbound messages)
                    const hasId = hasDocument(c, ['ID'], ['identity', 'id doc', 'id_doc']);
                    const hasPoa = hasDocument(c, ['POA', 'ZENOWETHU_POA'], ['poa', 'power of attorney', 'consent']);
                    const hasInbound = await hasInboundKeyword(c.id, ['id', 'document', 'attached', 'proof']);

                    if (hasId && hasPoa) {
                        // Documents received — advance to check DHS
                        await updateCaseStatus(c.id, 'NOT_REQUESTED_VIA_DHS', adminId);
                        await addSystemComment(c.id, `[AUTO] Outstanding Docs: ID and POA received. Status advanced to NOT_REQUESTED_VIA_DHS. Next update +3 working days.`, adminId);
                        actioned++;
                    } else if (hasInbound) {
                        // Something came in — flag for staff review
                        await setNextUpdate(c.id, 3, adminId);
                        await notifyManagers(c.id, `Documents may have arrived: ${c.fileNumber}`, `An inbound message was detected for ${clientName}. Please check if the required documents (${!hasId ? 'ID' : ''}${!hasId && !hasPoa ? ' + ' : ''}${!hasPoa ? 'POA' : ''}) have been received.`);
                        await addSystemComment(c.id, `[AUTO] Outstanding Docs: Inbound message detected. Manager notified to verify documents. Next update +3 working days.`, adminId);
                        actioned++;
                    } else {
                        // Nothing received — send reminder to consumer
                        const missing = [...(!hasId ? ['ID document'] : []), ...(!hasPoa ? ['Power of Attorney / Consent form'] : [])];
                        const msg = `Hi ${c.client.firstName}, we are still waiting for your outstanding documents: ${missing.join(' and ')}. Please submit these as soon as possible so we can proceed with your file. — Zenowethu Debt Management`;
                        await sendConsumerMessage(c.id, c, msg, 'Outstanding Documents Reminder');
                        await setNextUpdate(c.id, 3, adminId);
                        await addSystemComment(c.id, `[AUTO] Outstanding Docs: Documents not yet received (missing: ${missing.join(', ')}). Reminder sent to consumer. Next update +3 working days.`, adminId);
                        actioned++;
                    }
                } catch (err) {
                    errors++;
                    logger.error(`[OUTSTANDING_DOCS] Error on ${c.fileNumber}:`, err);
                    await setNextUpdate(c.id, 3, adminId).catch(() => null);
                }
            }
            log('OUTSTANDING_DOCS', processed, actioned, errors);
        }

        // ── 3. REQUESTED_VIA_DHS → Run DHS Check Request Status ──────────────
        await handleWithDHS('REQUESTED_VIA_DHS', 'Check DHS status for pending requests', adminId, log, async (c) => {
            const result = await withDHSTimeout(() => checkTransferStatus(c.client.idNumber));
            if (!result) return { actioned: false, comment: 'DHS check timed out' };

            let newStatus = c.status;
            let comment = '';

            if (result.status === 'ACCEPTED' || result.status === 'AUTO_TRANSFERRED') {
                newStatus = 'ACCEPTED_VIA_DHS'; comment = 'DHS: Transfer ACCEPTED';
            } else if (result.status === 'DECLINED') {
                newStatus = 'DECLINED_VIA_DHS'; comment = `DHS: DECLINED — ${result.declineReason || 'no reason captured'}`;
            } else if (result.status === 'PENDING') {
                comment = `DHS: Still PENDING (${result.daysCounter || 'New'})`;
            } else if (!result.found) {
                newStatus = 'NOT_REQUESTED_VIA_DHS'; comment = 'DHS: Request no longer found — status reverted';
            }

            await updateCaseStatus(c.id, newStatus, adminId);
            await addSystemComment(c.id, `[AUTO] Requested via DHS Check. ${comment}. Next update +3 working days.`, adminId);
            return { actioned: true, comment };
        });

        // ── 4. NOT_REQUESTED_VIA_DHS → Check docs → Request via DHS ──────────
        await handleWithDHS('NOT_REQUESTED_VIA_DHS', 'Check docs and request via DHS', adminId, log, async (c) => {
            const { idPath, poaPath } = getDHSDocuments(c);

            if (!idPath || !poaPath) {
                const missing = [...(!idPath ? ['ID'] : []), ...(!poaPath ? ['POA'] : [])];
                // Missing docs — move to OUTSTANDING_DOCS and notify consumer
                await updateCaseStatus(c.id, 'OUTSTANDING_DOCS', adminId);
                const msg = `Hi ${c.client.firstName}, we need your ${missing.join(' and ')} document(s) to proceed with your debt review removal request. Please send them as soon as possible. — Zenowethu Debt Management`;
                await sendConsumerMessage(c.id, c, msg, 'Documents Required');
                await addSystemComment(c.id, `[AUTO] Not Requested via DHS: Missing ${missing.join(', ')}. Status changed to OUTSTANDING_DOCS. Consumer notified. Next update +3 working days.`, adminId);
                return { actioned: true, comment: `Missing docs: ${missing.join(', ')}` };
            }

            // Docs present — request via DHS
            const result = await withDHSTimeout(() => requestTransfer(c.client.idNumber, poaPath, idPath));
            if (!result) return { actioned: false, comment: 'DHS request timed out' };

            if (result.success) {
                await updateCaseStatus(c.id, 'REQUESTED_VIA_DHS', adminId);
                await addSystemComment(c.id, `[AUTO] Not Requested via DHS: Documents verified (ID + POA). Transfer requested via DHS successfully. Status → REQUESTED_VIA_DHS. Next update +3 working days.`, adminId);
                return { actioned: true, comment: 'DHS request submitted' };
            } else {
                await setNextUpdate(c.id, 3, adminId);
                await addSystemComment(c.id, `[AUTO] Not Requested via DHS: DHS request failed — ${result.message || 'unknown error'}. Will retry. Next update +3 working days.`, adminId);
                return { actioned: false, comment: result.message || 'DHS request failed' };
            }
        });

        // ── 5. DOCUMENTS_EMAILED → Check for Form 17.7 → Request via DHS ─────
        await handleWithDHS('DOCUMENTS_EMAILED', 'Check for Form 17.7 and request via DHS', adminId, log, async (c) => {
            const hasForm177 = hasDocument(c, ['FORM_17_7', 'FORM_177'], ['17.7', '17_7', 'form17.7']);

            if (hasForm177) {
                await addSystemComment(c.id, `[AUTO] Documents Emailed: Form 17.7 found in case documents. Proceeding to request via DHS.`, adminId);
            }

            // Whether or not Form 17.7 is present, proceed to request via DHS
            const { idPath, poaPath } = getDHSDocuments(c);
            if (!idPath || !poaPath) {
                await setNextUpdate(c.id, 3, adminId);
                await addSystemComment(c.id, `[AUTO] Documents Emailed: Cannot request via DHS — missing ID or POA on file. Next update +3 working days.`, adminId);
                return { actioned: false, comment: 'Missing ID or POA' };
            }

            const result = await withDHSTimeout(() => requestTransfer(c.client.idNumber, poaPath, idPath));
            if (!result) return { actioned: false, comment: 'DHS request timed out' };

            if (result.success) {
                await updateCaseStatus(c.id, 'REQUESTED_VIA_DHS', adminId);
                await addSystemComment(c.id, `[AUTO] Documents Emailed: ${hasForm177 ? 'Form 17.7 found. ' : ''}Transfer requested via DHS. Status → REQUESTED_VIA_DHS. Next update +3 working days.`, adminId);
                return { actioned: true, comment: 'DHS requested' };
            } else {
                await setNextUpdate(c.id, 3, adminId);
                await addSystemComment(c.id, `[AUTO] Documents Emailed: DHS request failed — ${result.message || 'unknown error'}. Next update +3 working days.`, adminId);
                return { actioned: false, comment: result.message || 'DHS failed' };
            }
        });

        // ── 6. CONSUMER_CONTACTED_DC → Request via DHS ───────────────────────
        await handleWithDHS('CONSUMER_CONTACTED_DC', 'Consumer contacted DC — request via DHS', adminId, log, async (c) => {
            const { idPath, poaPath } = getDHSDocuments(c);
            if (!idPath || !poaPath) {
                await setNextUpdate(c.id, 3, adminId);
                await addSystemComment(c.id, `[AUTO] Consumer Contacted DC: Cannot request via DHS — missing ID or POA. Next update +3 working days.`, adminId);
                return { actioned: false, comment: 'Missing ID or POA' };
            }

            const result = await withDHSTimeout(() => requestTransfer(c.client.idNumber, poaPath, idPath));
            if (!result) return { actioned: false, comment: 'DHS request timed out' };

            if (result.success) {
                await updateCaseStatus(c.id, 'REQUESTED_VIA_DHS', adminId);
                await addSystemComment(c.id, `[AUTO] Consumer Contacted DC: Transfer requested via DHS. Status → REQUESTED_VIA_DHS. Next update +3 working days.`, adminId);
                return { actioned: true, comment: 'DHS requested' };
            } else {
                await setNextUpdate(c.id, 3, adminId);
                await addSystemComment(c.id, `[AUTO] Consumer Contacted DC: DHS request failed — ${result.message}. Next update +3 working days.`, adminId);
                return { actioned: false, comment: result.message || 'DHS failed' };
            }
        });

        // ── 7. INVOICE_REQUESTED_DC → Check inbox for DC invoice ─────────────
        {
            const cases = await getOverdueCases('INVOICE_REQUESTED_DC');
            let processed = 0, actioned = 0, errors = 0;
            for (const c of cases) {
                try {
                    processed++;
                    const clientName = `${c.client.firstName} ${c.client.lastName}`.trim();
                    const hasInvoice = hasDocument(c, ['INVOICE', 'DC_INVOICE'], ['invoice', 'statement', 'fees']);
                    const hasInboundInvoice = await hasInboundKeyword(c.id, ['invoice', 'statement', 'fees', 'settlement']);

                    if (hasInvoice || hasInboundInvoice) {
                        // Invoice received — send to consumer
                        const appUrl = `${APP_URL}/cases/${c.id}`;
                        const consumerMsg = `Hi ${c.client.firstName}, we have received the invoice from your Debt Counsellor. Please log in to view and action it at ${appUrl} or contact us for assistance. — Zenowethu Debt Management`;
                        await sendConsumerMessage(c.id, c, consumerMsg, `Invoice Received — ${c.fileNumber}`);
                        await updateCaseStatus(c.id, 'INVOICE_SENT_CONSUMER', adminId);
                        await addSystemComment(c.id, `[AUTO] Invoice Requested DC: Invoice found in case records. Consumer notified. Status → INVOICE_SENT_CONSUMER. Next update +3 working days.`, adminId);
                        actioned++;
                    } else {
                        // No invoice — re-request from DC, CC consumer
                        const dcName = c.debtCounsellorName || c.dcTradingName || 'Debt Counsellor';
                        const subject = `Request for Invoice — ${clientName} (${c.client.idNumber}) — ${c.fileNumber}`;
                        const body = `Dear ${dcName},\n\nWe are following up on our invoice request for the consumer file of ${clientName} (ID: ${c.client.idNumber}, File: ${c.fileNumber}).\n\nKindly provide the outstanding invoice/statement of fees so that we may resolve this matter and proceed with the file transfer.\n\nPlease reply to this email with the invoice attached.\n\nThank you,\nZenowethu Debt Management\nTel: +27 12 035 1824 | info@zenowethu.co.za`;
                        const emailSent = await sendDCEmail(c.id, c, subject, body);

                        // CC consumer on follow-up
                        if (c.client.email) {
                            const ccBody = `Dear ${c.client.firstName},\n\nWe have sent a follow-up request to your Debt Counsellor (${dcName}) for the outstanding invoice on your file.\n\nWe will update you as soon as we receive a response.\n\nZenowethu Debt Management`;
                            await sendManualMessage(c.id, 'EMAIL', c.client.email, ccBody, `Follow-up on DC Invoice — ${c.fileNumber}`);
                        }

                        await setNextUpdate(c.id, 3, adminId);
                        await addSystemComment(c.id, `[AUTO] Invoice Requested DC: No invoice found. Follow-up sent to DC (${c.dcEmail || 'no email'})${c.client.email ? ` — consumer CC'd` : ''}. Next update +3 working days.`, adminId);
                        if (emailSent) actioned++;
                    }
                } catch (err) {
                    errors++;
                    logger.error(`[INVOICE_REQUESTED_DC] Error on ${c.fileNumber}:`, err);
                    await setNextUpdate(c.id, 3, adminId).catch(() => null);
                }
            }
            log('INVOICE_REQUESTED_DC', processed, actioned, errors);
        }

        // ── 8. INVOICE_SENT_CONSUMER → Check for proof of payment ────────────
        await handleWithDHS('INVOICE_SENT_CONSUMER', 'Check for proof of payment from consumer', adminId, log, async (c) => {
            const hasPoP = hasDocument(c, ['PROOF_OF_PAYMENT', 'PROOF_PAYMENT', 'POP'], ['proof of payment', 'pop', 'receipt', 'payment confirmation']);
            const hasInboundPoP = await hasInboundKeyword(c.id, ['proof of payment', 'pop', 'paid', 'settled', 'receipt', 'eft']);

            if (hasPoP || hasInboundPoP) {
                // PoP received — request via DHS
                const { idPath, poaPath } = getDHSDocuments(c);
                if (idPath && poaPath) {
                    const result = await withDHSTimeout(() => requestTransfer(c.client.idNumber, poaPath, idPath));
                    if (result?.success) {
                        await updateCaseStatus(c.id, 'REQUESTED_VIA_DHS', adminId);
                        await addSystemComment(c.id, `[AUTO] Invoice Sent to Consumer: Proof of payment received. Transfer requested via DHS. Status → REQUESTED_VIA_DHS. Next update +3 working days.`, adminId);
                        return { actioned: true, comment: 'PoP received, DHS requested' };
                    }
                }
                // PoP received but DHS failed or no docs — flag for staff
                await notifyManagers(c.id, `PoP received: ${c.fileNumber}`, `Proof of payment was detected for ${c.client.firstName} ${c.client.lastName}. Please verify and request via DHS.`);
                await setNextUpdate(c.id, 3, adminId);
                await addSystemComment(c.id, `[AUTO] Invoice Sent to Consumer: Proof of payment detected. Manager notified. Could not auto-request DHS (verify ID/POA docs). Next update +3 working days.`, adminId);
                return { actioned: true, comment: 'PoP found, manager notified' };
            } else {
                // No PoP — remind consumer
                const msg = `Hi ${c.client.firstName}, we are following up on the invoice we sent you for your file (${c.fileNumber}). Have you settled the outstanding amount? If yes, please send us your proof of payment so we can proceed. — Zenowethu Debt Management`;
                await sendConsumerMessage(c.id, c, msg, `Proof of Payment Required — ${c.fileNumber}`);
                await setNextUpdate(c.id, 3, adminId);
                await addSystemComment(c.id, `[AUTO] Invoice Sent to Consumer: No proof of payment received. Reminder sent to consumer. Next update +3 working days.`, adminId);
                return { actioned: true, comment: 'Reminder sent' };
            }
        });

        // ── 9. REJECTED_EMAIL_DOCS → Request via DHS ─────────────────────────
        await handleWithDHS('REJECTED_EMAIL_DOCS', 'Rejected email docs — request via DHS', adminId, log, async (c) => {
            const { idPath, poaPath } = getDHSDocuments(c);
            if (!idPath || !poaPath) {
                await setNextUpdate(c.id, 3, adminId);
                await addSystemComment(c.id, `[AUTO] Rejected Email Docs: Cannot request via DHS — missing ID or POA. Next update +3 working days.`, adminId);
                return { actioned: false, comment: 'Missing ID or POA' };
            }
            const result = await withDHSTimeout(() => requestTransfer(c.client.idNumber, poaPath, idPath));
            if (result?.success) {
                await updateCaseStatus(c.id, 'REQUESTED_VIA_DHS', adminId);
                await addSystemComment(c.id, `[AUTO] Rejected Email Docs: Transfer re-requested via DHS. Status → REQUESTED_VIA_DHS. Next update +3 working days.`, adminId);
                return { actioned: true, comment: 'DHS re-requested' };
            }
            await setNextUpdate(c.id, 3, adminId);
            await addSystemComment(c.id, `[AUTO] Rejected Email Docs: DHS request failed — ${result?.message || 'unknown'}. Next update +3 working days.`, adminId);
            return { actioned: false, comment: 'DHS failed' };
        });

        // ── 10. REJECTED_NOT_CONSENT → Inform consumer to consent ────────────
        {
            const cases = await getOverdueCases('REJECTED_NOT_CONSENT');
            let processed = 0, actioned = 0, errors = 0;
            for (const c of cases) {
                try {
                    processed++;
                    const dcName = c.debtCounsellorName || c.dcTradingName || 'your current Debt Counsellor';
                    const msg = `Hi ${c.client.firstName}, your debt review removal request was declined because your current Debt Counsellor (${dcName}) has not yet received your consent. Please contact ${dcName} directly and give your written consent for the file transfer. Once done, please let us know. — Zenowethu Debt Management`;
                    await sendConsumerMessage(c.id, c, msg, `Action Required: Consent Needed — ${c.fileNumber}`);
                    await setNextUpdate(c.id, 3, adminId);
                    await addSystemComment(c.id, `[AUTO] Rejected Not Consent: Consumer informed to contact DC and provide consent. Reminder sent via ${c.client.whatsappNumber ? 'WhatsApp' : c.client.phone ? 'SMS' : 'email'}. Next update +3 working days.`, adminId);
                    actioned++;
                } catch (err) {
                    errors++;
                    logger.error(`[REJECTED_NOT_CONSENT] Error on ${c.fileNumber}:`, err);
                    await setNextUpdate(c.id, 3, adminId).catch(() => null);
                }
            }
            log('REJECTED_NOT_CONSENT', processed, actioned, errors);
        }

        // ── 11. REJECTED_OWES_FEES → Request invoice from DC ─────────────────
        {
            const cases = await getOverdueCases('REJECTED_OWES_FEES');
            let processed = 0, actioned = 0, errors = 0;
            for (const c of cases) {
                try {
                    processed++;
                    const clientName = `${c.client.firstName} ${c.client.lastName}`.trim();
                    const dcName = c.debtCounsellorName || c.dcTradingName || 'Debt Counsellor';
                    const subject = `Invoice Request — ${clientName} (${c.client.idNumber}) — ${c.fileNumber}`;
                    const body = `Dear ${dcName},\n\nThe transfer request for ${clientName} (ID: ${c.client.idNumber}, File: ${c.fileNumber}) was declined due to outstanding fees.\n\nKindly provide an invoice/statement of the outstanding amount so that we may assist our client in settling this and proceed with the transfer.\n\nPlease reply with the invoice attached.\n\nThank you,\nZenowethu Debt Management\nTel: +27 12 035 1824 | info@zenowethu.co.za`;

                    const sent = await sendDCEmail(c.id, c, subject, body);
                    await updateCaseStatus(c.id, 'INVOICE_REQUESTED_DC', adminId);
                    await addSystemComment(c.id, `[AUTO] Rejected Owes Fees: Invoice requested from DC (${c.dcEmail || 'no email'}) — ${sent ? 'email sent' : 'no DC email, manager to follow up manually'}. Status → INVOICE_REQUESTED_DC. Next update +3 working days.`, adminId);
                    actioned++;
                } catch (err) {
                    errors++;
                    logger.error(`[REJECTED_OWES_FEES] Error on ${c.fileNumber}:`, err);
                    await setNextUpdate(c.id, 3, adminId).catch(() => null);
                }
            }
            log('REJECTED_OWES_FEES', processed, actioned, errors);
        }

        // ── 12. IRFDC_1M – IRFDC_4M_PLUS → Check email for DC invoice ────────
        {
            const irfdcStatuses = ['IRFDC_1M', 'IRFDC_2M', 'IRFDC_3M', 'IRFDC_4M_PLUS'];
            const escalationMonths: Record<string, number> = { IRFDC_1M: 1, IRFDC_2M: 2, IRFDC_3M: 3, IRFDC_4M_PLUS: 4 };
            const nextStatus: Record<string, string> = { IRFDC_1M: 'IRFDC_2M', IRFDC_2M: 'IRFDC_3M', IRFDC_3M: 'IRFDC_4M_PLUS', IRFDC_4M_PLUS: 'IRFDC_4M_PLUS' };

            let processed = 0, actioned = 0, errors = 0;
            for (const status of irfdcStatuses) {
                const cases = await getOverdueCases(status);
                for (const c of cases) {
                    try {
                        processed++;
                        const months = escalationMonths[status];
                        const clientName = `${c.client.firstName} ${c.client.lastName}`.trim();
                        const dcName = c.debtCounsellorName || c.dcTradingName || 'Debt Counsellor';

                        // Check if invoice has arrived since we last requested
                        const hasInvoice = hasDocument(c, ['INVOICE', 'DC_INVOICE'], ['invoice', 'statement', 'fees']);
                        const hasInboundInvoice = await hasInboundKeyword(c.id, ['invoice', 'statement', 'fees', 'settlement']);

                        if (hasInvoice || hasInboundInvoice) {
                            // Invoice received — send to consumer
                            const msg = `Hi ${c.client.firstName}, we have received the invoice from your Debt Counsellor. Please review it and let us know once you have settled the outstanding amount by sending proof of payment. — Zenowethu Debt Management`;
                            await sendConsumerMessage(c.id, c, msg, `Invoice Received — ${c.fileNumber}`);
                            await updateCaseStatus(c.id, 'INVOICE_SENT_CONSUMER', adminId);
                            await addSystemComment(c.id, `[AUTO] ${status}: Invoice found after ${months} month(s). Consumer notified. Status → INVOICE_SENT_CONSUMER. Next update +3 working days.`, adminId);
                            actioned++;
                        } else {
                            // Still no invoice — re-request with escalation note
                            const urgency = months >= 3 ? 'URGENT: ' : '';
                            const subject = `${urgency}${months}-Month Follow-up: Invoice Request — ${clientName} (${c.client.idNumber}) — ${c.fileNumber}`;
                            const body = `Dear ${dcName},\n\nThis is our ${months === 1 ? 'first' : months === 2 ? 'second' : months === 3 ? 'third' : 'fourth+'} follow-up request for an invoice/statement for ${clientName} (ID: ${c.client.idNumber}, File: ${c.fileNumber}).\n\nThis request was first submitted ${months} month(s) ago. Kindly provide the outstanding invoice so we may resolve this matter.\n\n${months >= 3 ? 'Please be advised that further delays may require formal escalation.\n\n' : ''}Thank you,\nZenowethu Debt Management\nTel: +27 12 035 1824 | info@zenowethu.co.za`;

                            await sendDCEmail(c.id, c, subject, body);
                            await updateCaseStatus(c.id, nextStatus[status], adminId);
                            await addSystemComment(c.id, `[AUTO] ${status}: No invoice received after ${months} month(s). Follow-up sent to DC (${c.dcEmail || 'no email'}). Status → ${nextStatus[status]}. Next update +3 working days.`, adminId);
                            actioned++;
                        }
                    } catch (err) {
                        errors++;
                        logger.error(`[${status}] Error on ${c.fileNumber}:`, err);
                        await setNextUpdate(c.id, 3, adminId).catch(() => null);
                    }
                }
            }
            log('IRFDC_1M-4M', processed, actioned, errors);
        }

        // ── 13. INVSNT_1M – INVSNT_4M_PLUS → Check for consumer proof of payment
        {
            const invsntStatuses = ['INVSNT_1M', 'INVSNT_2M', 'INVSNT_3M', 'INVSNT_4M_PLUS'];
            const months: Record<string, number> = { INVSNT_1M: 1, INVSNT_2M: 2, INVSNT_3M: 3, INVSNT_4M_PLUS: 4 };
            const nextStatus: Record<string, string> = { INVSNT_1M: 'INVSNT_2M', INVSNT_2M: 'INVSNT_3M', INVSNT_3M: 'INVSNT_4M_PLUS', INVSNT_4M_PLUS: 'INVSNT_4M_PLUS' };

            let processed = 0, actioned = 0, errors = 0;
            for (const status of invsntStatuses) {
                const cases = await getOverdueCases(status);
                for (const c of cases) {
                    try {
                        processed++;
                        const m = months[status];

                        const hasPoP = hasDocument(c, ['PROOF_OF_PAYMENT', 'PROOF_PAYMENT', 'POP'], ['proof of payment', 'pop', 'receipt', 'payment confirmation']);
                        const hasInboundPoP = await hasInboundKeyword(c.id, ['proof of payment', 'pop', 'paid', 'settled', 'receipt', 'eft', 'payment']);

                        if (hasPoP || hasInboundPoP) {
                            // PoP received — advance to DHS request
                            const { idPath, poaPath } = getDHSDocuments(c);
                            if (idPath && poaPath) {
                                const result = await withDHSTimeout(() => requestTransfer(c.client.idNumber, poaPath, idPath));
                                if (result?.success) {
                                    await updateCaseStatus(c.id, 'REQUESTED_VIA_DHS', adminId);
                                    await addSystemComment(c.id, `[AUTO] ${status}: Proof of payment received after ${m} month(s). DHS transfer requested. Status → REQUESTED_VIA_DHS. Next update +3 working days.`, adminId);
                                    actioned++;
                                    continue;
                                }
                            }
                            await notifyManagers(c.id, `PoP received: ${c.fileNumber}`, `Proof of payment detected for ${c.client.firstName} ${c.client.lastName} (${status}). Please verify and request via DHS.`);
                            await setNextUpdate(c.id, 3, adminId);
                            await addSystemComment(c.id, `[AUTO] ${status}: Proof of payment detected. Manager notified to request via DHS. Next update +3 working days.`, adminId);
                            actioned++;
                        } else {
                            // No PoP — remind consumer, escalate
                            const urgency = m >= 3 ? '⚠️ FINAL REMINDER: ' : '';
                            const msg = `Hi ${c.client.firstName}, this is our ${m === 1 ? 'first' : m === 2 ? 'second' : m === 3 ? 'third' : 'final'} follow-up. ${urgency}We are still awaiting your proof of payment for the invoice on your file (${c.fileNumber}). Please settle the outstanding amount and send us proof of payment to continue. — Zenowethu Debt Management`;
                            await sendConsumerMessage(c.id, c, msg, `Proof of Payment Required (${m} Month Follow-up) — ${c.fileNumber}`);
                            await updateCaseStatus(c.id, nextStatus[status], adminId);
                            await addSystemComment(c.id, `[AUTO] ${status}: No proof of payment after ${m} month(s). Follow-up sent to consumer. Status → ${nextStatus[status]}. Next update +3 working days.`, adminId);
                            actioned++;
                        }
                    } catch (err) {
                        errors++;
                        logger.error(`[${status}] Error on ${c.fileNumber}:`, err);
                        await setNextUpdate(c.id, 3, adminId).catch(() => null);
                    }
                }
            }
            log('INVSNT_1M-4M', processed, actioned, errors);
        }

        // ── 14. ACCEPTED_VIA_DHS → Notify manager + check for Form 17.7 ──────
        {
            const cases = await getOverdueCases('ACCEPTED_VIA_DHS');
            let processed = 0, actioned = 0, errors = 0;
            for (const c of cases) {
                try {
                    processed++;
                    const clientName = `${c.client.firstName} ${c.client.lastName}`.trim();
                    const hasForm177 = hasDocument(c, ['FORM_17_7', 'FORM_177'], ['17.7', '17_7', 'form17.7', 'form 17.7']);

                    // Notify managers
                    await notifyManagers(
                        c.id,
                        `✅ Transfer Accepted: ${c.fileNumber}`,
                        `The DHS transfer request for ${clientName} (${c.fileNumber}) has been accepted. ${hasForm177 ? 'Form 17.7 is already on file.' : 'Form 17.7 has not been received yet — please follow up.'}`
                    );

                    // Also send email to managers
                    const managerUsers = await prisma.user.findMany({
                        where: { isAdmin: true },
                        select: { id: true, email: true },
                    });
                    for (const mgr of managerUsers) {
                        if (mgr.email) {
                            const subject = `✅ DHS Transfer Accepted: ${c.fileNumber} — ${clientName}`;
                            const body = `Good day,\n\nThe DHS transfer request for ${clientName} (ID: ${c.client.idNumber}, File: ${c.fileNumber}) has been accepted.\n\n${hasForm177 ? '✅ Form 17.7 is on file.' : '⚠️ Form 17.7 has not been received yet. Please follow up with the Debt Counsellor.'}\n\nView case: ${APP_URL}/cases/${c.id}\n\nZenowethu Debt Management Automation`;
                            await sendManualMessage(c.id, 'EMAIL', mgr.email, body, subject);
                        }
                    }

                    await setNextUpdate(c.id, 3, adminId);
                    await addSystemComment(c.id, `[AUTO] Accepted via DHS: Manager notified via in-app and email. ${hasForm177 ? 'Form 17.7 is on file.' : 'Form 17.7 NOT yet received — staff to follow up.'} Next update +3 working days.`, adminId);
                    actioned++;
                } catch (err) {
                    errors++;
                    logger.error(`[ACCEPTED_VIA_DHS] Error on ${c.fileNumber}:`, err);
                    await setNextUpdate(c.id, 3, adminId).catch(() => null);
                }
            }
            log('ACCEPTED_VIA_DHS', processed, actioned, errors);
        }

        // ── 15. COMPLETED (Letsatsi B2B) → Friday email + update SUBMITTED ───
        {
            const today = new Date();
            const isFriday = today.getDay() === 5;
            let processed = 0, actioned = 0, errors = 0;

            if (isFriday) {
                const cases = await getOverdueLetsatsiCompleted();
                processed = cases.length;

                if (cases.length > 0) {
                    try {
                        // Build HTML table for the email
                        const rows = cases.map((c, i) => `
                            <tr style="background:${i % 2 === 0 ? '#f9f9f9' : '#fff'}">
                                <td style="padding:8px;border:1px solid #ddd">${i + 1}</td>
                                <td style="padding:8px;border:1px solid #ddd">${c.fileNumber}</td>
                                <td style="padding:8px;border:1px solid #ddd">${c.client.firstName} ${c.client.lastName}</td>
                                <td style="padding:8px;border:1px solid #ddd">${c.client.idNumber}</td>
                                <td style="padding:8px;border:1px solid #ddd">${c.status}</td>
                            </tr>`).join('');

                        const html = `
                            <div style="font-family:Inter,Arial,sans-serif;max-width:800px;margin:0 auto">
                                <div style="background:#0B1D35;padding:20px;text-align:center">
                                    <h2 style="color:#C4953A;margin:0">Zenowethu Debt Management</h2>
                                    <p style="color:#fff;margin:4px 0">Weekly Completed Files Report — ${today.toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                                </div>
                                <div style="padding:20px">
                                    <p>Dear Mmamy,</p>
                                    <p>Please find below the completed Letsatsi files for this week. These files have been processed and are now marked as Submitted.</p>
                                    <table style="width:100%;border-collapse:collapse;margin-top:16px">
                                        <thead>
                                            <tr style="background:#0B1D35;color:#fff">
                                                <th style="padding:10px;border:1px solid #ddd;text-align:left">#</th>
                                                <th style="padding:10px;border:1px solid #ddd;text-align:left">File Number</th>
                                                <th style="padding:10px;border:1px solid #ddd;text-align:left">Client</th>
                                                <th style="padding:10px;border:1px solid #ddd;text-align:left">ID Number</th>
                                                <th style="padding:10px;border:1px solid #ddd;text-align:left">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>${rows}</tbody>
                                    </table>
                                    <p style="margin-top:20px"><strong>Total files: ${cases.length}</strong></p>
                                    <p style="color:#666;font-size:13px">This is an automated weekly report from Zenowethu Debt Management.</p>
                                </div>
                                <div style="background:#0B1D35;padding:16px;text-align:center">
                                    <p style="color:#C4953A;margin:0;font-size:12px">Aaron Nzotho | NCRDC3693 | Suite 2, Central House, 17 Central Road, Mabopane | Tel: +27 12 035 1824 | info@zenowethu.co.za</p>
                                </div>
                            </div>`;

                        await sendManualMessage(
                            cases[0].id, // use first case as reference
                            'EMAIL',
                            LETSATSI_REPORT_EMAIL,
                            html,
                            `Zenowethu — Completed Letsatsi Files — ${today.toLocaleDateString('en-ZA')}`
                        );

                        // Update all to SUBMITTED
                        for (const c of cases) {
                            await updateCaseStatus(c.id, 'SUBMITTED', adminId);
                            await addSystemComment(c.id, `[AUTO] Completed (Letsatsi): Included in Friday weekly report sent to ${LETSATSI_REPORT_EMAIL}. Status → SUBMITTED. Next update +3 working days.`, adminId);
                        }
                        actioned = cases.length;
                        logger.info(`[COMPLETED_LETSATSI] Friday report sent to ${LETSATSI_REPORT_EMAIL} — ${cases.length} files`);
                    } catch (err) {
                        errors++;
                        logger.error('[COMPLETED_LETSATSI] Error sending Friday report:', err);
                    }
                } else {
                    logger.info('[COMPLETED_LETSATSI] Friday — no Letsatsi completed files to report');
                }
            } else {
                logger.info('[COMPLETED_LETSATSI] Not Friday — skipping Letsatsi weekly report');
            }
            log('COMPLETED_LETSATSI', processed, actioned, errors);
        }

        // ── Close DHS browser ─────────────────────────────────────────────────
        await closeBrowser();

        // ── Log overall run ───────────────────────────────────────────────────
        const totalProcessed = Object.values(summary).reduce((a, b) => a + b.processed, 0);
        const totalActioned = Object.values(summary).reduce((a, b) => a + b.actioned, 0);
        const totalErrors = Object.values(summary).reduce((a, b) => a + b.errors, 0);

        await logAutomationRun({
            type: 'WORKFLOW_AUTOMATION',
            status: totalErrors > 0 && totalActioned === 0 ? 'FAILED' : 'SUCCESS',
            startedAt,
            logs: { summary, totalProcessed, totalActioned, totalErrors },
        });

        logger.info('[CRON] Workflow automation complete:', { totalProcessed, totalActioned, totalErrors });
        return NextResponse.json({ success: true, summary, totalProcessed, totalActioned, totalErrors, ranAt: new Date().toISOString() });

    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error('[CRON] Workflow automation failed:', error);
        await closeBrowser();
        await logAutomationRun({ type: 'WORKFLOW_AUTOMATION', status: 'FAILED', startedAt, errorMessage: msg, logs: summary });
        return NextResponse.json({ error: msg, summary }, { status: 500 });
    }
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Run a DHS Puppeteer operation with a 90-second timeout.
 */
async function withDHSTimeout<T>(fn: () => Promise<T>): Promise<T | null> {
    try {
        return await Promise.race([
            fn(),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 90000)),
        ]);
    } catch (err) {
        logger.error('[WorkflowAutomation] DHS operation error:', err);
        return null;
    }
}

/**
 * Generic handler for statuses that include DHS checks.
 * Iterates overdue cases, runs the provided action, handles errors.
 */
async function handleWithDHS(
    status: string,
    description: string,
    adminId: string | undefined,
    log: (handler: string, processed: number, actioned: number, errors: number) => void,
    action: (c: OverdueCase) => Promise<{ actioned: boolean; comment: string }>
): Promise<void> {
    const cases = await getOverdueCases(status);
    let processed = 0, actioned = 0, errors = 0;
    for (const c of cases) {
        try {
            processed++;
            const result = await action(c);
            if (result.actioned) actioned++;
            logger.info(`[${status}] ${c.fileNumber}: ${result.comment}`);
        } catch (err) {
            errors++;
            logger.error(`[${status}] Error on ${c.fileNumber}:`, err);
            await setNextUpdate(c.id, 3, adminId).catch(() => null);
        }
    }
    log(status, processed, actioned, errors);
}
