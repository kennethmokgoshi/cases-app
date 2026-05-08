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
import { delay } from '../dhs/browser';
import { extractDhsDocuments } from '../openai/extraction';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { GhlService } from '../integrations/ghl-service';

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
    logger.info(`[B2B_TRIGGER] Waiting 5 seconds before processing case ${caseId}...`);
    await delay(5000); // User requested delay to ensure all initial updates are done
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
                
                // GHL Sync
                GhlService.applyTags(caseId, ['dhs_linked', 'dhs_not_requested']).catch(err => {
                    logger.warn(`[B2B_TRIGGER] GHL tag sync failed for ${caseId}:`, err);
                });
            } else {
                // Automation: If search returns no records, set status to NOT_LINKED
                await prisma.case.update({
                    where: { id: caseId },
                    data: {
                        status: 'NOT_LINKED',
                        dhsStatus: 'NOT_LINKED'
                    }
                });

                await saveAIComment(caseId, adminId, {
                    service: serviceLabels,
                    triggeredBy,
                    assessment: `DHS auto-check: consumer ID ${idNumber} was not found in the DHS system.`,
                    action: 'Status set to "Not Linked on DHS". Please verify the ID number or check DHS manually.'
                });
                
                // GHL Sync
                GhlService.applyTags(caseId, ['dhs_not_linked']).catch(err => {
                    logger.warn(`[B2B_TRIGGER] GHL tag sync failed for ${caseId}:`, err);
                });

                logger.info(`[B2B_TRIGGER] ℹ️  ${caseData.fileNumber}: not found in DHS (Status updated to NOT_LINKED)`);
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

    // Reload case data to get the latest status (it might have changed to NOT_LINKED or NOT_REQUESTED_VIA_DHS)
    const currentCase = await prisma.case.findUnique({
        where: { id: caseId },
        include: { documents: true, client: true, workflowLogs: true }
    });

    if (!currentCase) return { action: 'SKIPPED', message: 'Case not found after reload' };

    //  Step 2: If status is NOT_LINKED -> STOP
    if (currentCase.status === 'NOT_LINKED') {
        return { action: 'SKIPPED', message: 'Consumer not linked on DHS - stopping automation.' };
    }

    //  Step 2: If status is NOT_REQUESTED_VIA_DHS -> Check documents
    if (currentCase.status !== 'NOT_REQUESTED_VIA_DHS' && currentCase.status !== 'NEW_LEAD') {
        // If it's already beyond these statuses, don't re-run the automation
        return { action: 'SKIPPED', message: `Case status is ${currentCase.status} - skipping auto-request.` };
    }

    //  Step 3: Check for Zenowethu POA and ID
    let poaDoc = currentCase.documents.find(d => d.type === 'ZENOWETHU_POA' || d.type === 'POA');
    let idDoc = currentCase.documents.find(d => d.type === 'ID');

    //  Step 3b: If documents missing, try to run extraction
    if (!poaDoc || !idDoc) {
        const combinedFile = currentCase.documents.find(d => d.type === 'COMBINED' || d.type === 'OTHER');
        if (combinedFile) {
            logger.info(`[B2B_TRIGGER] Missing docs for ${currentCase.fileNumber} but found combined file ${combinedFile.id}. Running auto-extraction...`);
            
            try {
                await performAutoDhsExtraction(currentCase, combinedFile, adminId, serviceLabels, triggeredBy);
                
                // Wait 5 seconds as requested by user before proceeding to the next step
                logger.info(`[B2B_TRIGGER] Extraction complete for ${currentCase.fileNumber}. Waiting 5s before checking for transfer...`);
                await delay(5000);

                // Re-check for docs after extraction
                const refreshedDocs = await prisma.document.findMany({ where: { caseId: currentCase.id } });
                poaDoc = refreshedDocs.find(d => d.type === 'ZENOWETHU_POA' || d.type === 'POA');
                idDoc = refreshedDocs.find(d => d.type === 'ID');
            } catch (extractErr) {
                logger.error(`[B2B_TRIGGER] Auto-extraction failed for ${currentCase.id}:`, extractErr);
            }
        }
    }

    //  Step 3c: If we now have both docs, run the transfer request
    if (poaDoc && idDoc) {
        logger.info(`[B2B_TRIGGER] Found all docs for ${currentCase.fileNumber}. Running auto-transfer request...`);
        return await performAutoDhsTransferRequest(currentCase, adminId, serviceLabels, triggeredBy);
    }

    // If we still don't have docs, log a comment and stop
    const missing: string[] = [];
    if (!idDoc) missing.push('ID Document');
    if (!poaDoc) missing.push('Power of Attorney (POA)');

    await saveAIComment(caseId, adminId, {
        service: serviceLabels,
        triggeredBy,
        assessment: 'Automatic document check failed.',
        action: `Missing: ${missing.join(', ')}. Please upload these documents or a combined file to trigger the transfer request.`
    });

    return { action: 'MISSING_DOCS', message: `Missing: ${missing.join(', ')}` };
}

// ---------------------------------------------------------------------------
// Action Implementation Helpers
// ---------------------------------------------------------------------------

async function performAutoDhsExtraction(
    caseData: any,
    combinedDoc: any,
    adminId: string,
    serviceLabels: string,
    triggeredBy: string
) {
    const caseId = caseData.id;
    const uploadsDir = join(process.cwd(), 'storage', 'uploads', caseId);
    if (!existsSync(uploadsDir)) await mkdir(uploadsDir, { recursive: true });

    // Resolve file path
    let filePath = '';
    if (combinedDoc.fileUrl.startsWith('/uploads/')) {
        filePath = join(process.cwd(), 'storage', 'uploads', combinedDoc.fileUrl.replace('/uploads/', ''));
    } else {
        const relativePath = combinedDoc.fileUrl.startsWith('/') ? combinedDoc.fileUrl.slice(1) : combinedDoc.fileUrl;
        filePath = join(process.cwd(), 'public', relativePath);
    }

    if (!existsSync(filePath)) throw new Error('Physical file not found');

    const buffer = await readFile(filePath);
    const base64Pdf = buffer.toString('base64');
    const timestamp = Date.now();

    const extraction = await extractDhsDocuments(base64Pdf);

    for (const extractedDoc of extraction.extractedDocuments) {
        const docFileName = `${timestamp}-auto-dhs-${extractedDoc.type.toLowerCase()}.pdf`;
        const docFilePath = join(uploadsDir, docFileName);
        const docFileUrl = `/uploads/${caseId}/${docFileName}`;

        const docBuffer = Buffer.from(extractedDoc.base64Pdf, 'base64');
        await writeFile(docFilePath, docBuffer);

        let extractedData: any = {
            confidence: extractedDoc.confidence,
            description: extractedDoc.description,
            pageCount: extractedDoc.pageCount,
            extractedFrom: combinedDoc.id
        };

        if (extractedDoc.type === 'ID' && extraction.analysis.id) {
            extractedData = { ...extractedData, ...extraction.analysis.id };
        } else if (extractedDoc.type === 'ZENOWETHU_POA' && extraction.analysis.poa) {
            extractedData = { ...extractedData, ...extraction.analysis.poa };
        }

        await prisma.document.create({
            data: {
                caseId,
                type: extractedDoc.type,
                fileName: docFileName,
                fileUrl: docFileUrl,
                fileSize: docBuffer.length,
                mimeType: 'application/pdf',
                extractedData: JSON.stringify(extractedData),
                analyzedAt: new Date()
            }
        });
    }

    await saveAIComment(caseId, adminId, {
        service: serviceLabels,
        triggeredBy,
        assessment: `Auto-extraction complete. Found ${extraction.extractedDocuments.length} documents.`,
        action: 'Documents have been split and identified. Proceeding to transfer request check...'
    });
}

async function performAutoDhsTransferRequest(
    caseData: any,
    adminId: string,
    serviceLabels: string,
    triggeredBy: string
): Promise<B2BTriggerResult> {
    const caseId = caseData.id;
    const dcEmail = caseData.lastKnownEmail || caseData.dcEmail;
    const clientName = `${caseData.client.firstName} ${caseData.client.lastName}`;

    const wasPreviouslyRequested =
        caseData.dhsStatus === 'Requested via DHS' ||
        caseData.dhsStatus === 'Requested Again via DHS' ||
        caseData.status === 'REQUESTED_VIA_DHS';

    const dhsStatusLabel = wasPreviouslyRequested ? 'Requested Again via DHS' : 'Requested via DHS';
    const actionVerb = wasPreviouslyRequested ? 'Re-requesting' : 'Requesting';

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
            logger.error(`[B2B_TRIGGER] Auto-email to DC failed:`, err);
        }

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
                notes: `[AI] Auto B2B trigger: ${dhsStatusLabel} — triggered by ${triggeredBy}`,
                userId: adminId || null
            }
        });

        await saveAIComment(caseId, adminId, {
            service: serviceLabels,
            triggeredBy,
            assessment: 'Auto-transfer request initiated. Required documents are present.',
            action: `${actionVerb} file from DC (${dcEmail}). Status updated to "${dhsStatusLabel}".`
        });

        await notifyManagers(caseId, caseData.fileNumber, dhsStatusLabel, adminId);
 
        // GHL Sync
        GhlService.applyTags(caseId, ['dhs_file_requested']).catch(err => {
            logger.warn(`[B2B_TRIGGER] GHL tag sync failed for ${caseId}:`, err);
        });

        return {
            action: wasPreviouslyRequested ? 'DHS_REQUESTED_AGAIN' : 'DHS_REQUESTED',
            message: `${dhsStatusLabel}: auto-email ${emailSuccess ? 'sent' : 'failed'} to ${dcEmail}`
        };
    }

    // No email case
    await prisma.case.update({
        where: { id: caseId },
        data: {
            status: 'REQUESTED_VIA_DHS',
            dhsStatus: dhsStatusLabel,
            nextUpdate: addWorkingDays(new Date(), 5)
        }
    });

    await saveAIComment(caseId, adminId, {
        service: serviceLabels,
        triggeredBy,
        assessment: 'Auto-transfer request initiated. No DC email on record.',
        action: `${actionVerb} file via portal. Status updated to "${dhsStatusLabel}".`
    });

    await notifyManagers(caseId, caseData.fileNumber, dhsStatusLabel, adminId);
    GhlService.applyTags(caseId, ['dhs_file_requested', 'dhs_portal_lookup_needed']).catch(e => logger.warn(e));

    return {
        action: 'NO_DC_EMAIL',
        message: `${dhsStatusLabel}: portal lookup required (no DC email)`
    };
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
