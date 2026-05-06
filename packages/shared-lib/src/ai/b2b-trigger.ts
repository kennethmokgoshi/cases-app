/**
 * B2B File Created Trigger — AI Employee
 *
 * Fires after a B2B case is created OR after documents are uploaded to a B2B case.
 * The trigger inspects the service type and available documents, then acts:
 *
 *   - Credit Profile Enquiry / Debt Review / Debt Review Flag Removal
 *       → Auto-run DHS check (scrapeDetailedConsumerInfo)
 *       → If consumer found on DHS → status = NOT_REQUESTED_VIA_DHS, DC info saved
 *       → If not found → log comment only
 *
 *   - Debt Review Flag Removal (additionally, if POA + ID present)
 *       → Email the DC on record requesting the file
 *       → Update status to REQUESTED_VIA_DHS (or "Requested Again via DHS" if previously requested)
 *       → Notify managers
 *
 *   - Documents missing (DRR only)
 *       → Log comment; will re-run automatically when documents are uploaded
 *
 *   - Other services
 *       → Log AI assessment comment only; no automatic action
 */

import { prisma } from '@zenowethu/database';
import { createLogger } from '../logger';
import { sendStatusChangeNotification } from '../notifications/service';
import { addWorkingDays } from '../statuses/workingDays';
import { scrapeDetailedConsumerInfo } from '../dhs/search';

const logger = createLogger('ai/b2b-trigger');

/** Service IDs as stored in Case.services (JSON array) */
const DEBT_REVIEW_REMOVAL_ID = 'debt_review_flag_removal';

/** Services that require an automatic DHS check on B2B case creation */
const DHS_AUTO_CHECK_SERVICES = [
    'credit_profile_enquiry',
    'debt_review_flag_removal',
    'debt_review_application',
];

export type B2BTriggerAction =
    | 'DHS_REQUESTED'       // First-time DHS request sent
    | 'DHS_REQUESTED_AGAIN' // File was previously requested; re-requesting now
    | 'MISSING_DOCS'        // POA or ID not yet uploaded
    | 'NO_DC_EMAIL'         // No DC email found; DHS portal lookup needed
    | 'NOT_APPLICABLE'      // Service type does not need automatic DHS action
    | 'SKIPPED';            // Not a B2B case or case not found

export interface B2BTriggerResult {
    action: B2BTriggerAction;
    message: string;
    details?: Record<string, unknown>;
}

export type B2BTriggerSource = 'CASE_CREATED' | 'DOCUMENT_UPLOADED';

// ---------------------------------------------------------------------------
// Main trigger
// ---------------------------------------------------------------------------

export async function runB2BFileTrigger(
    caseId: string,
    triggeredBy: B2BTriggerSource = 'CASE_CREATED'
): Promise<B2BTriggerResult> {
    logger.info(`[B2B_TRIGGER] Running for case ${caseId} (triggered by: ${triggeredBy})`);

    // ── 1. Load case ──────────────────────────────────────────────────────────
    const caseData = await prisma.case.findUnique({
        where: { id: caseId },
        include: {
            documents: true,
            client: true,
            workflowLogs: {
                where: {
                    toStatus: { in: ['REQUESTED_VIA_DHS', 'REQUEST_FILE_DC'] }
                },
                orderBy: { timestamp: 'asc' }
            }
        }
    });

    if (!caseData) {
        logger.error(`[B2B_TRIGGER] Case ${caseId} not found`);
        return { action: 'SKIPPED', message: 'Case not found' };
    }

    // ── 2. B2B only ───────────────────────────────────────────────────────────
    if (caseData.acquisitionType !== 'B2B') {
        return { action: 'SKIPPED', message: 'Not a B2B case — trigger does not apply' };
    }

    // ── 3. Parse services ─────────────────────────────────────────────────────
    let services: string[] = [];
    try {
        services = caseData.services ? JSON.parse(caseData.services as string) : [];
    } catch {
        services = [];
    }

    const isDebtReviewRemoval = services.includes(DEBT_REVIEW_REMOVAL_ID);
    const serviceLabels = services.length > 0
        ? services.map(s => SERVICE_LABELS[s] ?? s).join(', ')
        : 'Not specified';

    // ── 4. Get admin user for system comments ─────────────────────────────────
    const admin = await prisma.user.findFirst({ where: { isAdmin: true } });
    const adminId = admin?.id ?? '';

    const requiresDhsCheck = services.some(s => DHS_AUTO_CHECK_SERVICES.includes(s));

    // ── 5a. Handle non-DHS services ───────────────────────────────────────────
    if (!requiresDhsCheck) {
        await saveAIComment(caseId, adminId, {
            service: serviceLabels,
            triggeredBy,
            assessment: `Service "${serviceLabels}" does not require an automatic DHS check.`,
            action: 'No automatic action taken — please process manually.'
        });

        return {
            action: 'NOT_APPLICABLE',
            message: `Service "${serviceLabels}" does not require automatic DHS action`
        };
    }

    // ── 5b. Auto DHS check for Credit Profile Enquiry / Debt Review / DRR ────
    const idNumber = caseData.client.idNumber;
    if (idNumber) {
        logger.info(`[B2B_TRIGGER] Running auto DHS check for ${caseData.fileNumber} (ID: ${idNumber})`);
        try {
            const dhsScrape = await scrapeDetailedConsumerInfo(idNumber);

            if (dhsScrape.success && dhsScrape.data) {
                const d = dhsScrape.data;
                const dcName = d.dcFullName || d.debtCounsellorName || d.ncrdcNo || 'Unknown DC';

                await prisma.case.update({
                    where: { id: caseId },
                    data: {
                        status:             'NOT_REQUESTED_VIA_DHS',
                        dhsStatus:          'Not Requested via DHS',
                        ncrdcNo:            d.ncrdcNo,
                        debtCounsellorName: d.dcFullName || d.debtCounsellorName,
                        dcTradingName:      d.dcTradingName,
                        dcOperatingStatus:  d.dcOperatingStatus,
                        dcMobile:           d.dcMobile,
                        dcEmail:            d.dcEmail,
                        consumerDhsStatus:  d.status,
                    },
                });

                await saveAIComment(caseId, adminId, {
                    service: serviceLabels,
                    triggeredBy,
                    assessment: `DHS auto-check: consumer ID ${idNumber} is linked on DHS under ${dcName}.`,
                    action: `Status set to "Not Requested via DHS". DC info saved (NCRDC: ${d.ncrdcNo || 'N/A'}). A transfer request has not been submitted yet — please proceed via the DHS portal.`
                });

                logger.info(`[B2B_TRIGGER] ✅ ${caseData.fileNumber}: linked on DHS under ${dcName}`);
            } else {
                await saveAIComment(caseId, adminId, {
                    service: serviceLabels,
                    triggeredBy,
                    assessment: `DHS auto-check: consumer ID ${idNumber} was not found in the DHS system.`,
                    action: 'No status change. Please verify the ID number or check DHS manually.'
                });
                logger.info(`[B2B_TRIGGER] ℹ️  ${caseData.fileNumber}: not found in DHS`);
            }
        } catch (dhsErr) {
            logger.error(`[B2B_TRIGGER] DHS auto-check failed for ${caseData.fileNumber}:`, dhsErr);
            await saveAIComment(caseId, adminId, {
                service: serviceLabels,
                triggeredBy,
                assessment: `DHS auto-check: could not connect to DHS portal.`,
                action: 'Please run the DHS check manually from the case page.'
            });
        }
    }

    // ── 5c. If not Debt Review Removal, we are done after the DHS check ───────
    if (!isDebtReviewRemoval) {
        return {
            action: 'NOT_APPLICABLE',
            message: `DHS auto-check completed for "${serviceLabels}" — no transfer request required`
        };
    }

    // ── 6. Check required documents ───────────────────────────────────────────
    const poaDoc = caseData.documents.find(
        d => d.type === 'POA' || d.type === 'ZENOWETHU_POA'
    );
    const idDoc = caseData.documents.find(d => d.type === 'ID');

    if (!poaDoc || !idDoc) {
        const missing: string[] = [];
        if (!idDoc) missing.push('ID Document');
        if (!poaDoc) missing.push('Power of Attorney (POA)');

        await saveAIComment(caseId, adminId, {
            service: serviceLabels,
            triggeredBy,
            assessment: 'Debt Review Flag Removal service detected. Document check failed.',
            action:
                `Missing required documents: ${missing.join(', ')}. ` +
                'The AI will automatically re-run this check once all required documents are uploaded.'
        });

        logger.info(`[B2B_TRIGGER] Missing documents for ${caseData.fileNumber}: ${missing.join(', ')}`);
        return { action: 'MISSING_DOCS', message: `Missing: ${missing.join(', ')}` };
    }

    // ── 7. Detect if previously requested ────────────────────────────────────
    const wasPreviouslyRequested =
        caseData.dhsStatus === 'Requested via DHS' ||
        caseData.dhsStatus === 'Requested Again via DHS' ||
        caseData.status === 'REQUESTED_VIA_DHS' ||
        (caseData.workflowLogs?.length ?? 0) > 0;

    const dhsStatusLabel = wasPreviouslyRequested
        ? 'Requested Again via DHS'
        : 'Requested via DHS';

    const actionVerb = wasPreviouslyRequested ? 'Re-requesting' : 'Requesting';

    logger.info(
        `[B2B_TRIGGER] ${caseData.fileNumber}: Debt Review Removal, POA ✓, ID ✓, ` +
        `previously requested: ${wasPreviouslyRequested}`
    );

    // ── 8. Resolve DC email ───────────────────────────────────────────────────
    const dcEmail = caseData.lastKnownEmail || caseData.dcEmail;
    const clientName = `${caseData.client.firstName} ${caseData.client.lastName}`;

    // ── 9a. Email DC if we have an address ────────────────────────────────────
    if (dcEmail) {
        let emailSuccess = false;
        try {
            const emailResult = await sendStatusChangeNotification({
                caseId,
                clientName,
                fileNumber: caseData.fileNumber,
                statusCode: 'REQUEST_FILE_DC',
                dcName: caseData.debtCounsellorName || 'Debt Counsellor',
                dcEmail,
                idNumber: caseData.client.idNumber,
                isB2B: true
            });
            emailSuccess = emailResult.emailSuccess;
        } catch (err) {
            logger.error(`[B2B_TRIGGER] Email to DC failed for ${caseData.fileNumber}:`, err);
        }

        // Update case regardless of email success — mark as requested
        await prisma.case.update({
            where: { id: caseId },
            data: {
                status: 'REQUESTED_VIA_DHS',
                dhsStatus: dhsStatusLabel,
                nextUpdate: addWorkingDays(new Date(), 5)
            }
        });

        // Log workflow transition
        await prisma.workflowLog.create({
            data: {
                caseId,
                fromStatus: caseData.status,
                toStatus: 'REQUESTED_VIA_DHS',
                timestamp: new Date(),
                notes: `[AI] B2B trigger: ${dhsStatusLabel} — triggered by ${triggeredBy}`,
                userId: adminId || null
            }
        });

        await saveAIComment(caseId, adminId, {
            service: serviceLabels,
            triggeredBy,
            assessment:
                'Debt Review Flag Removal service confirmed. POA and ID documents verified.',
            action:
                `${actionVerb} file from debt counsellor (${dcEmail}). ` +
                (emailSuccess
                    ? `Email sent successfully. `
                    : `Note: email delivery failed — please send manually to ${dcEmail}. `) +
                `Status updated to "${dhsStatusLabel}". ` +
                (wasPreviouslyRequested
                    ? 'This file was requested before — checking via DHS portal is also recommended. '
                    : '') +
                'Next update set to +5 working days.'
        });

        // Notify managers
        await notifyManagers(caseId, caseData.fileNumber, dhsStatusLabel, adminId);

        const result: B2BTriggerResult = {
            action: wasPreviouslyRequested ? 'DHS_REQUESTED_AGAIN' : 'DHS_REQUESTED',
            message: `${dhsStatusLabel}: email ${emailSuccess ? 'sent' : 'failed'} to ${dcEmail}`,
            details: { dcEmail, dhsStatusLabel, wasPreviouslyRequested, emailSuccess }
        };

        logger.info(`[B2B_TRIGGER] ✅ ${caseData.fileNumber}: ${result.message}`);
        return result;
    }

    // ── 9b. No DC email — update status and flag for manual DHS lookup ────────
    await prisma.case.update({
        where: { id: caseId },
        data: {
            status: 'REQUESTED_VIA_DHS',
            dhsStatus: dhsStatusLabel,
            nextUpdate: addWorkingDays(new Date(), 5)
        }
    });

    await prisma.workflowLog.create({
        data: {
            caseId,
            fromStatus: caseData.status,
            toStatus: 'REQUESTED_VIA_DHS',
            timestamp: new Date(),
            notes: `[AI] B2B trigger: ${dhsStatusLabel} (no DC email — portal lookup required)`,
            userId: adminId || null
        }
    });

    await saveAIComment(caseId, adminId, {
        service: serviceLabels,
        triggeredBy,
        assessment:
            'Debt Review Flag Removal service confirmed. POA and ID documents verified.',
        action:
            `${actionVerb} file via DHS portal — no DC email address on record. ` +
            'Status updated to "' + dhsStatusLabel + '". ' +
            (wasPreviouslyRequested
                ? 'This file was previously requested via DHS — please use "Check via DHS" to follow up. '
                : 'Please run the DHS Lookup to submit the transfer request and retrieve the DC email. ') +
            'Next update set to +5 working days.'
    });

    await notifyManagers(caseId, caseData.fileNumber, dhsStatusLabel, adminId);

    const noEmailResult: B2BTriggerResult = {
        action: wasPreviouslyRequested ? 'DHS_REQUESTED_AGAIN' : 'NO_DC_EMAIL',
        message: `${dhsStatusLabel}: no DC email — DHS portal lookup required`,
        details: { dhsStatusLabel, wasPreviouslyRequested, dcEmail: null }
    };

    logger.info(`[B2B_TRIGGER] ⚠️  ${caseData.fileNumber}: ${noEmailResult.message}`);
    return noEmailResult;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface AICommentPayload {
    service: string;
    triggeredBy: string;
    assessment: string;
    action: string;
}

async function saveAIComment(
    caseId: string,
    userId: string,
    payload: AICommentPayload
): Promise<void> {
    const content =
        `[AI EMPLOYEE — B2B TRIGGER]\n` +
        `Service: ${payload.service}\n` +
        `Trigger: ${payload.triggeredBy === 'CASE_CREATED' ? 'New B2B referral created' : 'Document uploaded to B2B case'}\n` +
        `Assessment: ${payload.assessment}\n` +
        `Action: ${payload.action}`;

    await prisma.caseComment.create({
        data: {
            caseId,
            userId: userId || undefined,
            content: `[SYSTEM] ${content}`,
            type: 'NOTE',
            isInternal: true,
            activityType: 'SYSTEM_NOTIFICATION'
        }
    });
}

async function notifyManagers(
    caseId: string,
    fileNumber: string,
    dhsStatusLabel: string,
    _adminId: string
): Promise<void> {
    try {
        const admins = await prisma.user.findMany({ where: { isAdmin: true } });
        for (const adminUser of admins) {
            await prisma.inAppNotification.create({
                data: {
                    userId: adminUser.id,
                    type: 'STATUS_CHANGE',
                    title: `AI Action: ${fileNumber}`,
                    message: `B2B trigger updated case ${fileNumber} → ${dhsStatusLabel}`,
                    caseId,
                    linkUrl: `/cases/${caseId}`
                }
            });
        }
    } catch (err) {
        logger.error(`[B2B_TRIGGER] Failed to notify managers for ${caseId}:`, err);
    }
}

/** Human-readable labels for service IDs (mirrors SERVICES_MAP in @zenowethu/config) */
const SERVICE_LABELS: Record<string, string> = {
    admin_order_removal: 'Administration Order Removal',
    admin_order_application: 'Administration Order Application',
    credit_profile_enquiry: 'Credit Profile Enquiry',
    debt_review_flag_removal: 'Debt Review Flag Removal',
    debt_review_application: 'Debt Review',
    payment_profile_update: 'Payment Profile Update',
    paid_accounts_update: 'Paid Accounts Update',
    prescription_dispute: 'Prescription Dispute',
    credit_bureau_dispute: 'Credit Bureau Dispute',
    reckless_lending: 'Reckless Lending Assessment',
    insurance_replacement: 'Insurance Replacement (DCCP)'
};
