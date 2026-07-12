/**
 * DHS Decline — Read-Only Preview
 *
 * Produces exactly what handleDHSDecline() WOULD do for a given decline reason,
 * WITHOUT sending any email/SMS/WhatsApp or writing to the database. Used by the
 * dry-run path of the Requested-via-DHS follow-up automation so staff can review
 * the planned status change and the full content of every outbound message before
 * anything goes live.
 *
 * It reuses the shared email/SMS template builders from decline-handler.ts, so the
 * copy shown here is byte-for-byte identical to what gets sent. The per-category
 * routing mirrors handleDHSDecline() — keep the two in sync. (handleDHSDecline is
 * the executor; this is the planner.)
 */

import { prisma } from '@zenowethu/database';
import {
    classifyDeclineReason,
    extractEmailFromReason,
    getBasePeriodForCategory,
    type DeclineCategory,
    buildSendDocsEmail,
    buildSendDocsClientEmail,
    buildSendDocsSms,
    buildConsumerConsentEmail,
    buildConsentSms,
    buildOutstandingFeesEmail,
    buildFeesSms,
    buildAttorneyEmail,
    buildAttorneyClientEmail,
    buildAttorneySms,
    buildResubmitClientEmail,
    buildResubmitSms,
    formatDhsDeclineDate,
} from './decline-handler';

export interface PreviewMessage {
    channel: 'EMAIL' | 'SMS' | 'WHATSAPP';
    to: string;
    cc?: string[];
    subject?: string;
    body: string;
    attachments?: string[];
}

export interface DeclinePreview {
    caseId: string;
    fileNumber: string;
    declineReason: string;
    category: DeclineCategory;
    /** Workflow status the case WOULD be moved to (final state for the category). */
    statusWouldUpdateTo: string | null;
    /** Email found embedded in the decline text (DC or attorney), if any. */
    extractedEmail: string | null;
    /** Every message that WOULD be sent, with full rendered content. */
    messages: PreviewMessage[];
    /** Human-readable notes about gaps that would block the live run (e.g. no DC email). */
    notes: string[];
}

/**
 * Build a full preview of the decline-handling actions for a case + decline reason.
 * Read-only: no DB writes, no message dispatch.
 */
export async function previewDHSDecline(params: {
    caseId: string;
    declineReason: string;
}): Promise<DeclinePreview> {
    const { caseId, declineReason } = params;

    const caseData = await prisma.case.findUnique({
        where: { id: caseId },
        include: {
            client: true,
            documents: true,
            debtCounsellor: true,
        },
    });

    const category = classifyDeclineReason(declineReason);
    const extractedEmail = extractEmailFromReason(declineReason);

    const preview: DeclinePreview = {
        caseId,
        fileNumber: caseData?.fileNumber ?? caseId,
        declineReason,
        category,
        statusWouldUpdateTo: null,
        extractedEmail,
        messages: [],
        notes: [],
    };

    if (!caseData) {
        preview.notes.push('Case not found');
        return preview;
    }

    const clientName = `${caseData.client.firstName} ${caseData.client.lastName}`.trim();
    const clientFirstName = caseData.client.firstName;
    const idNumber = caseData.client.idNumber;
    const fileNumber = caseData.fileNumber;
    const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.APP_URL ||
        'https://cases.zenowethu.co.za';

    const dcEmail =
        extractedEmail ||
        caseData.preferredDcEmail ||
        caseData.debtCounsellor?.preferredEmail ||
        caseData.lastKnownEmail ||
        caseData.debtCounsellor?.lastKnownEmail ||
        caseData.dcEmail ||
        caseData.debtCounsellor?.email ||
        null;
    const dcName =
        caseData.debtCounsellorName ||
        caseData.dcTradingName ||
        'Debt Counsellor';

    const docAttachments = caseData.documents
        .filter(d => ['ID', 'POA', 'ZENOWETHU_POA'].includes(d.type))
        .map(d => `${baseUrl}${d.fileUrl}`);

    const clientCc = caseData.client.email ? [caseData.client.email] : [];
    const transferRequestedDate = formatDhsDeclineDate(
        caseData.dhsApplicationDate ?? caseData.statusEntryDate ?? caseData.createdAt
    );
    const declineRecordedDate = formatDhsDeclineDate(new Date());

    // The consumer SMS/WhatsApp channel handleDHSDecline would pick (WhatsApp preferred).
    const clientMobileChannel: 'WHATSAPP' | 'SMS' | null =
        caseData.client.whatsappNumber ? 'WHATSAPP' : caseData.client.phone ? 'SMS' : null;
    const clientMobileTo = caseData.client.whatsappNumber || caseData.client.phone || '';
    const pushClientMobile = (body: string) => {
        if (!clientMobileChannel) {
            preview.notes.push('Consumer has no WhatsApp or phone number — no SMS/WhatsApp would be sent.');
            return;
        }
        preview.messages.push({ channel: clientMobileChannel, to: clientMobileTo, body });
    };

    if (category === 'SEND_DOCS' || category === 'SEND_DOCS_WITH_NCR') {
        preview.statusWouldUpdateTo = 'DOCUMENTS_EMAILED';
        const ncrLine = category === 'SEND_DOCS_WITH_NCR'
            ? '\n• NCR Certificate of Registration (NCRDC3693)'
            : '';
        if (category === 'SEND_DOCS_WITH_NCR') {
            preview.notes.push('Would also attach the NCR Certificate from admin resources (if present).');
        }
        if (!dcEmail) {
            preview.notes.push('No DC email available — live run would fail until a preferred DC email is set. Status would stay REJECTED_EMAIL_DOCS.');
            preview.statusWouldUpdateTo = 'REJECTED_EMAIL_DOCS';
        } else {
            preview.messages.push({
                channel: 'EMAIL',
                to: dcEmail,
                cc: clientCc,
                subject: `Re: DHS Transfer Request – ${clientName} (ID: ${idNumber})`,
                body: buildSendDocsEmail({ clientName, idNumber, fileNumber, dcName, declineReason, ncrLine }),
                attachments: docAttachments,
            });
            if (caseData.client.email) {
                preview.messages.push({
                    channel: 'EMAIL',
                    to: caseData.client.email,
                    subject: `Update: DHS Transfer Declined (File: ${fileNumber})`,
                    body: buildSendDocsClientEmail({
                        clientFirstName,
                        dcName,
                        fileNumber,
                        declineReason,
                        transferRequestedDate,
                        declineRecordedDate,
                        solutionSummary: category === 'SEND_DOCS_WITH_NCR'
                            ? 'We will email your signed Power of Attorney, ID copy, and our NCR certificate to the Debt Counsellor and request that they proceed with the transfer.'
                            : 'We will email your signed Power of Attorney and ID copy to the Debt Counsellor and request that they proceed with the transfer.',
                    }),
                });
            } else {
                preview.notes.push('Consumer has no email on file — only SMS/WhatsApp would be attempted.');
            }
            pushClientMobile(buildSendDocsSms({ clientFirstName, dcName, declineReason }));
        }
    }

    else if (category === 'CLIENT_CONSENT_NEEDED') {
        preview.statusWouldUpdateTo = 'CONSUMER_CONTACTED_DC';
        const dcContactLine = dcEmail ? ` at ${dcEmail}` : '';
        if (caseData.client.email) {
            preview.messages.push({
                channel: 'EMAIL',
                to: caseData.client.email,
                subject: `Action Required: Please Contact Your Debt Counsellor – ${clientName}`,
                body: buildConsumerConsentEmail({
                    clientFirstName,
                    dcName,
                    dcContactLine,
                    declineReason,
                    transferRequestedDate,
                    declineRecordedDate,
                }),
            });
        } else {
            preview.notes.push('Consumer has no email on file — only SMS/WhatsApp would be attempted.');
        }
        pushClientMobile(buildConsentSms({ clientFirstName, dcName, dcContactLine }));
    }

    else if (category === 'OUTSTANDING_FEES') {
        preview.statusWouldUpdateTo = 'REJECTED_OWES_FEES';
        if (caseData.client.email) {
            preview.messages.push({
                channel: 'EMAIL',
                to: caseData.client.email,
                subject: `Outstanding Fees – Your Debt Review Transfer (File: ${fileNumber})`,
                body: buildOutstandingFeesEmail({
                    clientFirstName,
                    dcName,
                    fileNumber,
                    declineReason,
                    transferRequestedDate,
                    declineRecordedDate,
                }),
            });
        } else {
            preview.notes.push('Consumer has no email on file — only SMS/WhatsApp would be attempted.');
        }
        pushClientMobile(buildFeesSms({ clientFirstName, dcName }));
    }

    else if (category === 'CONTACT_ATTORNEY') {
        preview.statusWouldUpdateTo = null; // handler does not change status for this category
        if (extractedEmail) {
            preview.messages.push({
                channel: 'EMAIL',
                to: extractedEmail,
                cc: clientCc,
                subject: `Debt Review Transfer Request – ${clientName} (ID: ${idNumber})`,
                body: buildAttorneyEmail({ clientName, idNumber, fileNumber, dcName, declineReason }),
                attachments: docAttachments,
            });
            if (caseData.client.email) {
                preview.messages.push({
                    channel: 'EMAIL',
                    to: caseData.client.email,
                    subject: `Update on Your Debt Review Transfer – ${clientName}`,
                    body: buildAttorneyClientEmail({
                        clientFirstName,
                        dcName,
                        fileNumber,
                        declineReason,
                        attorneyEmail: extractedEmail,
                        transferRequestedDate,
                        declineRecordedDate,
                    }),
                });
            }
        } else {
            preview.notes.push('Attorney involvement detected but no email found in decline text — staff would contact manually. Consumer still notified.');
            if (caseData.client.email) {
                preview.messages.push({
                    channel: 'EMAIL',
                    to: caseData.client.email,
                    subject: `Update on Your Debt Review Transfer – ${clientName}`,
                    body: buildAttorneyClientEmail({
                        clientFirstName,
                        dcName,
                        fileNumber,
                        declineReason,
                        attorneyEmail: null,
                        transferRequestedDate,
                        declineRecordedDate,
                    }),
                });
            }
        }
        pushClientMobile(buildAttorneySms({ clientFirstName }));
    }

    else if (category === 'RESUBMIT_LATER') {
        const basePeriod = getBasePeriodForCategory(category);
        preview.statusWouldUpdateTo = null; // status unchanged; only nextUpdate is bumped
        preview.notes.push(`Temporary delay — nextUpdate would be set +${basePeriod} working days and the file re-checked.`);
        if (caseData.client.email) {
            preview.messages.push({
                channel: 'EMAIL',
                to: caseData.client.email,
                subject: `Update on Your Debt Review Transfer (File: ${fileNumber})`,
                body: buildResubmitClientEmail({
                    clientFirstName,
                    dcName,
                    fileNumber,
                    declineReason,
                    transferRequestedDate,
                    declineRecordedDate,
                }),
            });
        }
        pushClientMobile(buildResubmitSms({ clientFirstName }));
    }

    else {
        // UNKNOWN — escalate to staff, no outbound messages
        preview.notes.push('Decline reason could not be auto-classified — live run would escalate to staff (in-app alert to admins). No emails/SMS sent.');
    }

    return preview;
}
