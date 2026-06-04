/**
 * Case Created Automation Trigger — AI Employee
 *
 * Fires after a case is created OR after documents are uploaded to a case.
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
 *       → Notify relevant users
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
import { checkTransferStatus } from '../dhs/status';
import { delay } from '../dhs/browser';
import { extractDhsDocuments } from '../openai/extraction';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { GhlService } from '../integrations/ghl-service';

const logger = createLogger('ai/case-automation-trigger');

/** Service IDs as stored in Case.services (JSON array) */
const DEBT_REVIEW_REMOVAL_ID = 'debt_review_flag_removal';

/** Services that trigger a DHS transfer request (not just a lookup) */
const DHS_TRANSFER_SERVICES = [
    'debt_review_flag_removal',
    'debt_review_application',
];

export type B2BTriggerAction =
    | 'DHS_REQUESTED'       // First-time DHS request sent (DHS portal confirmed PENDING)
    | 'DHS_REQUESTED_AGAIN' // File was previously requested; re-requesting now
    | 'DHS_NOT_CONFIRMED'   // DHS portal returned NOT_REQUESTED after 30s verification — status reverted
    | 'MISSING_DOCS'        // POA or ID not yet uploaded
    | 'NO_DC_EMAIL'         // No DC email found; DHS portal lookup needed
    | 'NOT_APPLICABLE'      // Service type does not need automatic DHS action
    | 'SKIPPED';            // Not a relevant case or case not found

export interface B2BTriggerResult {
    action: B2BTriggerAction;
    message: string;
    details?: Record<string, unknown>;
}

export type B2BTriggerSource = 'CASE_CREATED' | 'DOCUMENT_UPLOADED';

// ---------------------------------------------------------------------------
// Main trigger
// ---------------------------------------------------------------------------

export async function runCaseAutomationTrigger(
    caseId: string,
    triggeredBy: B2BTriggerSource = 'CASE_CREATED'
): Promise<B2BTriggerResult> {
    logger.info(`[CASE_AUTOMATION] Waiting 5 seconds before processing case ${caseId}...`);
    await delay(5000); // User requested delay to ensure all initial updates are done
    logger.info(`[CASE_AUTOMATION] Running for case ${caseId} (triggered by: ${triggeredBy})`);

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
        logger.error(`[CASE_AUTOMATION] Case ${caseId} not found`);
        return { action: 'SKIPPED', message: 'Case not found' };
    }

    // ── 2. Automation logic applies to all acquisition types ───────────────────

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

    // All cases get a DHS consumer lookup regardless of service type.
    // Transfer request (REQUESTED_VIA_DHS) is only submitted for debt review services.
    const requiresDhsTransfer = services.some(s => DHS_TRANSFER_SERVICES.includes(s));

    // ── 5. Auto DHS lookup — runs for every new case ──────────────────────────
    const idNumber = caseData.client.idNumber;
    if (idNumber) {
        logger.info(`[CASE_AUTOMATION] Running auto DHS check for ${caseData.fileNumber} (ID: ${idNumber})`);
        try {
            const dhsScrape = await scrapeDetailedConsumerInfo(idNumber);

            if (dhsScrape.success && dhsScrape.data) {
                const d = dhsScrape.data;
                const dcName = d.dcFullName || d.debtCounsellorName || d.ncrdcNo || 'Unknown DC';

                // Check if the consumer is already with Zenowethu (ZDM_CLIENT)
                const dcSettings = await prisma.systemSettings.findMany({ where: { category: 'dc_profile' } });
                const ownNcrdc = (dcSettings.find(s => s.key === 'dc_ncrdcNo')?.value || process.env.DHS_USERNAME || 'NCRDC3693').trim().toUpperCase();
                const scrapedNcrdc = (d.ncrdcNo || '').trim().toUpperCase();
                const isZdmClient = !!scrapedNcrdc && scrapedNcrdc === ownNcrdc;

                await prisma.case.update({
                    where: { id: caseId },
                    data: {
                        status:             isZdmClient ? 'ZDM_CLIENT' : 'NOT_REQUESTED_VIA_DHS',
                        dhsStatus:          isZdmClient ? 'ZDM Client' : 'Not Requested via DHS',
                        ncrdcNo:            d.ncrdcNo,
                        debtCounsellorName: d.dcFullName || d.debtCounsellorName,
                        dcTradingName:      d.dcTradingName,
                        dcOperatingStatus:  d.dcOperatingStatus,
                        dcMobile:           d.dcMobile,
                        dcEmail:            d.dcEmail,
                        consumerDhsStatus:  d.status,
                    },
                });

                if (isZdmClient) {
                    await saveAIComment(caseId, adminId, {
                        service: serviceLabels,
                        triggeredBy,
                        assessment: `DHS auto-check: consumer ID ${idNumber} is already registered under Zenowethu Debt Management (${ownNcrdc}) on DHS.`,
                        action: `Status set to "ZDM Client" — this consumer is already our client. No transfer request needed.`
                    });
                    logger.info(`[CASE_AUTOMATION] ✅ ${caseData.fileNumber}: already our client (${ownNcrdc}) — ZDM_CLIENT`);
                    GhlService.applyTags(caseId, ['zdm_client', 'dhs_linked']).catch(err => {
                        logger.warn(`[CASE_AUTOMATION] GHL tag sync failed for ${caseId}:`, err);
                    });
                } else {
                    await saveAIComment(caseId, adminId, {
                        service: serviceLabels,
                        triggeredBy,
                        assessment: `DHS auto-check: consumer ID ${idNumber} is linked on DHS under ${dcName}.`,
                        action: `Status set to "Not Requested via DHS". DC info saved (NCRDC: ${d.ncrdcNo || 'N/A'}). A transfer request has not been submitted yet — please proceed via the DHS portal.`
                    });
                    logger.info(`[CASE_AUTOMATION] ✅ ${caseData.fileNumber}: linked on DHS under ${dcName}`);
                    GhlService.applyTags(caseId, ['dhs_linked', 'dhs_not_requested']).catch(err => {
                        logger.warn(`[CASE_AUTOMATION] GHL tag sync failed for ${caseId}:`, err);
                    });
                }
            } else {
                // Scenario 1: Consumer Not Linked on DHS
                // TRIGGER: One-time Re-Analyse (GPT-4o) if not found, to catch extraction errors.
                const reAnalyseLog = await prisma.workflowLog.findFirst({
                    where: { caseId, action: 'AI_RE_ANALYSE' }
                });

                if (!reAnalyseLog) {
                    logger.info(`[CASE_AUTOMATION] ${caseData.fileNumber}: Not found on DHS. Triggering one-time Re-Analyse...`);
                    
                    await prisma.workflowLog.create({
                        data: {
                            caseId,
                            fromStatus: caseData.status,
                            toStatus: caseData.status,
                            action: 'AI_RE_ANALYSE',
                            notes: `[AI] Consumer not found in DHS (ID: ${idNumber}). Triggering document re-analysis to verify ID number.`
                        }
                    });

                    // Find combined file or ID doc to re-analyse
                    const combinedFile = caseData.documents.find(d => d.type === 'COMBINED' || d.type === 'OTHER');
                    const idDoc = caseData.documents.find(d => d.type === 'ID');
                    const docToProcess = combinedFile || idDoc;

                    if (docToProcess) {
                        await saveAIComment(caseId, adminId, {
                            service: serviceLabels,
                            triggeredBy,
                            assessment: `DHS auto-check: consumer ID ${idNumber} was not found.`,
                            action: `Triggering one-time Re-Analyse (GPT-4o Standard) on ${docToProcess.type} file to verify ID number. Will re-check DHS in 5 seconds...`
                        });

                        try {
                            // This re-extracts and UPDATES the client record (via performAutoDhsExtraction update logic)
                            await performAutoDhsExtraction(caseData, docToProcess, adminId, serviceLabels, triggeredBy);
                            
                            logger.info(`[CASE_AUTOMATION] Re-analysis complete for ${caseData.fileNumber}. Waiting 5s...`);
                            await delay(5000);

                            // Refetch the latest client data to get the potentially updated ID number
                            const refreshedClient = await prisma.client.findUnique({
                                where: { id: caseData.clientId },
                                select: { idNumber: true, firstName: true, lastName: true }
                            });

                            if (refreshedClient && refreshedClient.idNumber) {
                                logger.info(`[CASE_AUTOMATION] Running second DHS check for ${caseData.fileNumber} with ID: ${refreshedClient.idNumber}`);
                                const secondDhsScrape = await scrapeDetailedConsumerInfo(refreshedClient.idNumber);

                                if (secondDhsScrape.success && secondDhsScrape.data) {
                                    const d = secondDhsScrape.data;
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
                                        assessment: `DHS re-check SUCCESS: consumer ID ${refreshedClient.idNumber} is linked on DHS under ${dcName}.`,
                                        action: `Status set to "Not Requested via DHS". Proceeding with automation.`
                                    });

                                    // GHL Sync
                                    GhlService.applyTags(caseId, ['dhs_linked', 'dhs_not_requested']).catch(e => logger.warn(e));
                                    
                                    // Successfully found - continue with Phase 2/3 by letting the rest of the function run
                                    // (Actually, runCaseAutomationTrigger reloads the case after this block, so it will see the updated status)
                                    return await runCaseAutomationTrigger(caseId, 'DOCUMENT_UPLOADED'); 
                                }
                            }
                        } catch (reErr) {
                            logger.error(`[CASE_AUTOMATION] Re-analysis failed for ${caseData.fileNumber}:`, reErr);
                        }
                    }
                }

                // If we reach here, either it was already re-analysed OR re-analysis didn't find the consumer
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
                    logger.warn(`[CASE_AUTOMATION] GHL tag sync failed for ${caseId}:`, err);
                });

                logger.info(`[CASE_AUTOMATION] ℹ️  ${caseData.fileNumber}: not found in DHS (Status updated to NOT_LINKED)`);
            }
        } catch (dhsErr) {
            logger.error(`[CASE_AUTOMATION] DHS auto-check failed for ${caseData.fileNumber}:`, dhsErr);
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

    //  Step 2a: Terminal statuses — stop here
    if (currentCase.status === 'NOT_LINKED') {
        return { action: 'SKIPPED', message: 'Consumer not linked on DHS - stopping automation.' };
    }
    if (currentCase.status === 'ZDM_CLIENT') {
        return { action: 'SKIPPED', message: 'Consumer is already a ZDM client — no transfer needed.' };
    }

    //  Step 2b: Non-debt-review services stop here — DHS lookup info saved, no transfer needed
    if (!requiresDhsTransfer) {
        await saveAIComment(caseId, adminId, {
            service: serviceLabels,
            triggeredBy,
            assessment: `DHS consumer lookup complete. Current DC info saved to case record.`,
            action: `Service "${serviceLabels}" does not require a DHS transfer request — no further automated action taken.`
        });
        return {
            action: 'NOT_APPLICABLE',
            message: `DHS lookup complete — no transfer request needed for service "${serviceLabels}"`
        };
    }

    //  Step 2c: If status is NOT_REQUESTED_VIA_DHS -> Check documents for transfer
    if (currentCase.status !== 'NOT_REQUESTED_VIA_DHS' && currentCase.status !== 'NEW_LEAD') {
        // Already beyond these statuses — don't re-run
        return { action: 'SKIPPED', message: `Case status is ${currentCase.status} - skipping auto-request.` };
    }

    //  Step 3 (DHS PORTAL CHECK FIRST): Before touching documents, verify whether a transfer
    //  request already exists on DHS — the client may have been requested before via another route.
    logger.info(`[CASE_AUTOMATION] Checking DHS portal for existing transfer request on ${currentCase.fileNumber}...`);
    let existingDhsStatus: string | undefined;
    try {
        const portalCheck = await checkTransferStatus(currentCase.client.idNumber);
        existingDhsStatus = portalCheck?.status;
        logger.info(`[CASE_AUTOMATION] DHS portal pre-check for ${currentCase.fileNumber}: status=${existingDhsStatus}`);
    } catch (preCheckErr) {
        logger.warn(`[CASE_AUTOMATION] DHS portal pre-check failed for ${currentCase.fileNumber} — proceeding to document check:`, preCheckErr);
    }

    if (existingDhsStatus === 'PENDING') {
        // Already requested — update case to match DHS reality and stop
        await prisma.case.update({
            where: { id: caseId },
            data: {
                status: 'REQUESTED_VIA_DHS',
                dhsStatus: 'Requested via DHS',
                nextUpdate: addWorkingDays(new Date(), 3),
            }
        });
        await prisma.workflowLog.create({
            data: {
                caseId,
                fromStatus: currentCase.status,
                toStatus: 'REQUESTED_VIA_DHS',
                timestamp: new Date(),
                notes: `[AI] DHS portal pre-check found existing PENDING request — status updated to match DHS reality.`,
                userId: adminId || null
            }
        });
        await saveAIComment(caseId, adminId, {
            service: serviceLabels,
            triggeredBy,
            assessment: 'DHS portal pre-check: a transfer request is already PENDING on NCR Debt Help System.',
            action: 'Status updated to "Requested via DHS" to match DHS reality. No new request submitted. Next update: 3 working days.'
        });
        await notifyManagers(caseId, currentCase.fileNumber, 'Requested via DHS', adminId);
        GhlService.applyTags(caseId, ['dhs_file_requested']).catch(err =>
            logger.warn(`[CASE_AUTOMATION] GHL tag sync failed for ${caseId}:`, err)
        );
        return { action: 'DHS_REQUESTED', message: 'Existing PENDING request found on DHS portal — case status updated.' };
    }

    if (existingDhsStatus === 'ACCEPTED') {
        await prisma.case.update({
            where: { id: caseId },
            data: { status: 'ACCEPTED_VIA_DHS', dhsStatus: 'Accepted', nextUpdate: addWorkingDays(new Date(), 5) }
        });
        await prisma.workflowLog.create({
            data: {
                caseId,
                fromStatus: currentCase.status,
                toStatus: 'ACCEPTED_VIA_DHS',
                timestamp: new Date(),
                notes: `[AI] DHS portal pre-check found transfer already ACCEPTED.`,
                userId: adminId || null
            }
        });
        await saveAIComment(caseId, adminId, {
            service: serviceLabels,
            triggeredBy,
            assessment: 'DHS portal pre-check: transfer has already been ACCEPTED on NCR Debt Help System.',
            action: 'Status updated to "Accepted via DHS". Next update: 5 working days. Admin notified.'
        });
        await notifyManagers(caseId, currentCase.fileNumber, 'Accepted via DHS', adminId);
        return { action: 'SKIPPED', message: 'Transfer already ACCEPTED on DHS — case status updated.' };
    }

    if (existingDhsStatus === 'DECLINED') {
        await saveAIComment(caseId, adminId, {
            service: serviceLabels,
            triggeredBy,
            assessment: 'DHS portal pre-check: transfer request has been DECLINED on NCR Debt Help System.',
            action: 'Please check the decline reason on the DHS portal and handle accordingly.'
        });
        return { action: 'SKIPPED', message: 'Transfer DECLINED on DHS — staff must review decline reason.' };
    }

    // DHS portal confirmed NOT_REQUESTED (or check failed) — proceed to document check and submit transfer.

    //  Step 4: Check for Zenowethu POA and ID
    let poaDoc = currentCase.documents.find(d => d.type === 'ZENOWETHU_POA' || d.type === 'POA');
    let idDoc = currentCase.documents.find(d => d.type === 'ID');

    //  Step 4b: If documents missing, try to run extraction
    if (!poaDoc || !idDoc) {
        const combinedFile = currentCase.documents.find(d => d.type === 'COMBINED' || d.type === 'OTHER');
        if (combinedFile) {
            logger.info(`[CASE_AUTOMATION] Missing docs for ${currentCase.fileNumber} but found combined file ${combinedFile.id}. Running auto-extraction...`);
            
            try {
                await performAutoDhsExtraction(currentCase, combinedFile, adminId, serviceLabels, triggeredBy);
                
                // Wait 5 seconds as requested by user before proceeding to the next step
                logger.info(`[CASE_AUTOMATION] Extraction complete for ${currentCase.fileNumber}. Waiting 5s before checking for transfer...`);
                await delay(5000);

                // Re-check for docs after extraction
                const refreshedDocs = await prisma.document.findMany({ where: { caseId: currentCase.id } });
                poaDoc = refreshedDocs.find(d => d.type === 'ZENOWETHU_POA' || d.type === 'POA');
                idDoc = refreshedDocs.find(d => d.type === 'ID');
            } catch (extractErr) {
                logger.error(`[CASE_AUTOMATION] Auto-extraction failed for ${currentCase.id}:`, extractErr);
            }
        }
    }

    //  Step 4c: If we now have both docs, run the transfer request
    if (poaDoc && idDoc) {
        logger.info(`[CASE_AUTOMATION] Found all docs for ${currentCase.fileNumber}. Running auto-transfer request...`);
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

    // Sync extracted client data back to the database - ONLY fill in missing/default data
    if (extraction.analysis) {
        const updateData: any = {};
        const client = caseData.client || {};

        if (extraction.analysis.id) {
            const id = extraction.analysis.id;
            // Only update if current data is missing, N/A, or default "Client"
            if (id.names && id.names !== 'NA' && (!client.firstName || client.firstName === 'Unknown' || client.firstName === 'NA')) {
                updateData.firstName = id.names;
            }
            if (id.surname && id.surname !== 'NA' && (!client.lastName || client.lastName === 'Client' || client.lastName === 'NA')) {
                updateData.lastName = id.surname;
            }
            // CRITICAL: Never overwrite a valid 13-digit ID number with AI extraction
            if (id.idNumber && id.idNumber !== 'NA' && (!client.idNumber || client.idNumber.length < 13)) {
                updateData.idNumber = id.idNumber;
            }
        }
        
        if (extraction.analysis.poa) {
            const poa = extraction.analysis.poa;
            if (poa.cellNumber && poa.cellNumber !== 'NA' && !client.phone) {
                updateData.phone = poa.cellNumber;
            }
            if (poa.email && poa.email !== 'NA' && !client.email) {
                updateData.email = poa.email;
            }
            if (poa.address && poa.address !== 'NA' && !client.address) {
                updateData.address = poa.address;
            }
        }

        if (Object.keys(updateData).length > 0) {
            await prisma.client.update({
                where: { id: caseData.clientId },
                data: updateData
            });
            logger.info(`[CASE_AUTOMATION] Updated client ${caseData.clientId} data from auto-extraction`);
        }
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
    const idNumber = caseData.client.idNumber;

    const wasPreviouslyRequested =
        caseData.dhsStatus === 'Requested via DHS' ||
        caseData.dhsStatus === 'Requested Again via DHS' ||
        caseData.status === 'REQUESTED_VIA_DHS';

    const dhsStatusLabel = wasPreviouslyRequested ? 'Requested Again via DHS' : 'Requested via DHS';
    const actionVerb = wasPreviouslyRequested ? 'Re-requesting' : 'Requesting';

    // Step 6a: Wait 30 seconds then verify the DHS portal actually shows PENDING
    // This prevents marking a case as REQUESTED_VIA_DHS when the portal didn't register the request.
    logger.info(`[CASE_AUTOMATION] Documents confirmed for ${caseData.fileNumber}. Waiting 30s before verifying DHS portal...`);

    await saveAIComment(caseId, adminId, {
        service: serviceLabels,
        triggeredBy,
        assessment: 'Required documents confirmed (POA + ID). Waiting 30 seconds to verify the DHS portal shows a PENDING request before updating status or emailing the DC.',
        action: 'DHS portal verification in progress — do not manually change the status yet.'
    });

    await delay(30000);

    // Step 6b: Check DHS portal to confirm the request registered
    logger.info(`[CASE_AUTOMATION] Running DHS status verification for ${caseData.fileNumber} (ID: ${idNumber})...`);
    let dhsVerification: Awaited<ReturnType<typeof checkTransferStatus>> | null = null;
    try {
        dhsVerification = await checkTransferStatus(idNumber);
        logger.info(`[CASE_AUTOMATION] DHS verification result for ${caseData.fileNumber}: status=${dhsVerification?.status}`);
    } catch (verifyErr) {
        logger.error(`[CASE_AUTOMATION] DHS verification check failed for ${caseData.fileNumber}:`, verifyErr);
    }

    const dhsPortalStatus = dhsVerification?.status;

    // Step 6c: NOT_REQUESTED — the request did not register on the DHS portal
    if (!dhsVerification || dhsPortalStatus === 'NOT_REQUESTED') {
        await prisma.case.update({
            where: { id: caseId },
            data: { status: 'NOT_REQUESTED_VIA_DHS', dhsStatus: 'Not Requested via DHS' }
        });

        await saveAIComment(caseId, adminId, {
            service: serviceLabels,
            triggeredBy,
            assessment: 'DHS portal verification: the transfer request did NOT register on the NCR Debt Help System (status returned NOT_REQUESTED).',
            action: 'Status reverted to "Not Requested via DHS". No email sent to DC. Please submit the transfer request manually via the DHS portal and re-check status.'
        });

        logger.info(`[CASE_AUTOMATION] ⚠️  ${caseData.fileNumber}: DHS verification returned NOT_REQUESTED — status reverted to NOT_REQUESTED_VIA_DHS.`);

        return {
            action: 'DHS_NOT_CONFIRMED',
            message: 'DHS portal returned NOT_REQUESTED after 30s verification — status reverted to NOT_REQUESTED_VIA_DHS'
        };
    }

    // Step 6d: PENDING — DHS portal confirms the request is live. Now update status and send email.
    if (dhsPortalStatus === 'PENDING') {
        await prisma.case.update({
            where: { id: caseId },
            data: {
                status: 'REQUESTED_VIA_DHS',
                dhsStatus: dhsStatusLabel,
                nextUpdate: addWorkingDays(new Date(), 3)
            }
        });

        await prisma.workflowLog.create({
            data: {
                caseId,
                fromStatus: caseData.status,
                toStatus: 'REQUESTED_VIA_DHS',
                timestamp: new Date(),
                notes: `[AI] DHS portal confirmed PENDING. ${dhsStatusLabel} — triggered by ${triggeredBy}`,
                userId: adminId || null
            }
        });

        // Send email to DC only after DHS confirms PENDING, and only if email is known
        let emailSuccess = false;
        if (dcEmail) {
            try {
                const emailResult = await sendStatusChangeNotification({
                    caseId,
                    clientName,
                    fileNumber: caseData.fileNumber,
                    statusCode: 'REQUEST_FILE_DC',
                    dcName: caseData.debtCounsellorName || 'Debt Counsellor',
                    dcEmail,
                    idNumber,
                    isB2B: true
                });
                emailSuccess = emailResult.emailSuccess;
            } catch (err) {
                logger.error(`[CASE_AUTOMATION] Auto-email to DC failed:`, err);
            }
        }

        await saveAIComment(caseId, adminId, {
            service: serviceLabels,
            triggeredBy,
            assessment: `DHS portal verified: transfer request is showing as PENDING (${dhsVerification.daysCounter || 'New'}). Request confirmed on NCR Debt Help System.`,
            action: `${actionVerb} file from DC${dcEmail ? ` (${dcEmail}) — email ${emailSuccess ? 'sent ✓' : 'failed ✗'}` : ' — no DC email on record, portal lookup required'}. Status updated to "${dhsStatusLabel}". Next update: 3 working days.`
        });

        await notifyManagers(caseId, caseData.fileNumber, dhsStatusLabel, adminId);

        GhlService.applyTags(caseId, ['dhs_file_requested', ...(dcEmail ? [] : ['dhs_portal_lookup_needed'])]).catch(err => {
            logger.warn(`[CASE_AUTOMATION] GHL tag sync failed for ${caseId}:`, err);
        });

        return {
            action: wasPreviouslyRequested ? 'DHS_REQUESTED_AGAIN' : 'DHS_REQUESTED',
            message: `${dhsStatusLabel}: DHS portal PENDING confirmed — email ${dcEmail ? (emailSuccess ? 'sent' : 'failed') : 'not applicable (no DC email)'} to ${dcEmail || 'N/A'}`
        };
    }

    // Step 6e: Any other DHS status (ACCEPTED, DECLINED, etc.) — log and stop
    await saveAIComment(caseId, adminId, {
        service: serviceLabels,
        triggeredBy,
        assessment: `DHS portal verification returned an unexpected status: ${dhsPortalStatus}.`,
        action: 'Please check the DHS portal manually and update the case status accordingly.'
    });

    logger.info(`[CASE_AUTOMATION] ${caseData.fileNumber}: DHS verification returned unexpected status=${dhsPortalStatus}. Stopping.`);
    return { action: 'SKIPPED', message: `DHS verification returned unexpected status: ${dhsPortalStatus}` };
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
        `[AI EMPLOYEE — CASE AUTOMATION]\n` +
        `Service: ${payload.service}\n` +
        `Trigger: ${payload.triggeredBy === 'CASE_CREATED' ? 'New case created' : 'Document uploaded to case'}\n` +
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
                    message: `Case automation updated case ${fileNumber} → ${dhsStatusLabel}`,
                    caseId,
                    linkUrl: `/cases/${caseId}`
                }
            });
        }
    } catch (err) {
        logger.error(`[CASE_AUTOMATION] Failed to notify managers for ${caseId}:`, err);
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
