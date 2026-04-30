/**
 * DHS Lookup API
 * 
 * Checks the DHS (NCR Debt Help System) for consumer transfer status
 * and retrieves debt counsellor information.
 * Implements automation rules 1-10 for status updates and next update calculations.
 */

import { NextResponse } from 'next/server';
import { createLogger, sendStatusChangeNotification } from '@zenowethu/shared-lib';
import { checkTransferStatus, searchConsumer, closeBrowser, requestTransfer, scrapeDetailedConsumerInfo, lookupDCFromNCR } from '@zenowethu/shared-lib/src/dhs';
import { addWorkingDays } from '@zenowethu/shared-lib/src/statuses/workingDays';
import { prisma } from '@zenowethu/database';
import path, { join } from 'path';
import { existsSync, readFileSync } from 'fs';

const logger = createLogger('api/dhs/lookup');

// Helper to resolve file paths from URLs
const getFilePath = (fileUrl: string) => {
    if (fileUrl.startsWith('/uploads/')) {
        return join(process.cwd(), 'storage', 'uploads', fileUrl.replace('/uploads/', ''));
    }
    return join(process.cwd(), 'public', fileUrl.startsWith('/') ? fileUrl.substring(1) : fileUrl);
};

// Force dependency rebuild for lib/dhs.ts
export async function POST(request: Request) {
    try {
        const { idNumber, caseId, action, useAiExtraction = false } = await request.json();

        if (!idNumber) {
            return NextResponse.json(
                { error: 'ID number is required' },
                { status: 400 }
            );
        }

        // Validate ID number format (13 digits for SA ID)
        if (!/^\d{13}$/.test(idNumber)) {
            return NextResponse.json(
                { error: 'Invalid ID number format. Must be 13 digits.' },
                { status: 400 }
            );
        }

        let result;
        // Fetch full case data if available to get documents for auto-request
        const caseData = caseId ? await prisma.case.findUnique({
            where: { id: caseId },
            include: { documents: true, client: true }
        }) : null;

        if (action === 'check_status' || !action) {
            // Check existing transfer status with timeout protection
            logger.info('Starting checkTransferStatus with 90s timeout...');
            const startTime = Date.now();

            try {
                result = await Promise.race([
                    checkTransferStatus(idNumber),
                    new Promise<any>((_, reject) =>
                        setTimeout(() => reject(new Error('checkTransferStatus timed out after 90 seconds')), 90000)
                    )
                ]);

                const duration = ((Date.now() - startTime) / 1000).toFixed(2);
                logger.info(`✅ checkTransferStatus completed in ${duration}s`);
            } catch (error: any) {
                const duration = ((Date.now() - startTime) / 1000).toFixed(2);
                logger.error(`❌ checkTransferStatus failed after ${duration}s:`, error.message);

                // Force close browser on timeout
                await closeBrowser();

                return NextResponse.json(
                    { error: `DHS check timed out after ${duration}s. Please try again.` },
                    { status: 504 }
                );
            }

            // === Override: if CURRENT DC is our own NCRDC, consumer is already with us → Accepted ===
            // Covers two cases:
            // 1. debtCounsellor populated from scrape → use ncrRegistrationNo
            // 2. debtCounsellor null (DC popup click failed) → fall back to case's stored ncrdcNo
            {
                const dcSettings = await prisma.systemSettings.findMany({ where: { category: 'dc_profile' } });
                const ownNcrdc = (dcSettings.find(s => s.key === 'dc_ncrdcNo')?.value || process.env.DHS_USERNAME || 'NCRDC3693').trim().toUpperCase();
                const scrapedDC = result.debtCounsellor?.ncrRegistrationNo?.trim().toUpperCase() || '';
                const storedDC = (caseData?.ncrdcNo || '').trim().toUpperCase();
                const effectiveDC = scrapedDC || storedDC;
                if (result.found && effectiveDC === ownNcrdc && result.status !== 'ACCEPTED' && result.status !== 'AUTO_TRANSFERRED') {
                    logger.info(`✅ CURRENT DC (${effectiveDC}) matches own NCRDC — overriding status to ACCEPTED`);
                    result.status = 'ACCEPTED';
                    result.combinedStatus = 'Accepted';
                    result.message = 'Accepted';
                }
            }

            // === Apply Logic Rules 1-10 ===
            if (caseId && caseData) {
                const updateData: any = {};
                const comments: string[] = [];
                let notifyManager = false;

                // Detect if this file has been requested via DHS before
                const wasPreviouslyRequestedViaDHS =
                    caseData.dhsStatus === 'Requested via DHS' ||
                    caseData.dhsStatus === 'Requested Again via DHS' ||
                    caseData.status === 'REQUESTED_VIA_DHS';

                const dhsRequestLabel = wasPreviouslyRequestedViaDHS
                    ? 'Requested Again via DHS'
                    : 'Requested via DHS';

                // Rule 1: No Records Found -> Not Requested
                if (!result.found) {
                    updateData.dhsStatus = 'Not Requested';
                    const missingLabel = wasPreviouslyRequestedViaDHS
                        ? 'DHS Check: File was previously requested but no records found.'
                        : 'DHS Check: Not requested.';
                    comments.push(missingLabel);
                }
                // Rules 2-10: Records Found
                else {
                    // Update DC info always if found
                    if (result.debtCounsellor) {
                        updateData.ncrdcNo = result.debtCounsellor.ncrRegistrationNo;
                        updateData.debtCounsellorName = result.debtCounsellor.fullName;
                        updateData.dcTradingName = result.debtCounsellor.tradingName;
                        updateData.dcEmail = result.debtCounsellor.email;
                        // Also save mobile and operating status from popup
                        if (result.debtCounsellor.mobile) {
                            updateData.dcMobile = result.debtCounsellor.mobile;
                        }
                        if (result.debtCounsellor.operatingStatus) {
                            updateData.dcOperatingStatus = result.debtCounsellor.operatingStatus;
                        }
                    }

                    updateData.dhsStatus = result.status === 'PENDING' ? dhsRequestLabel :
                        result.status === 'AUTO_TRANSFERRED' ? 'Auto Transferred' :
                            result.status === 'ACCEPTED' ? 'Accepted' :
                                result.status === 'DECLINED' ? 'Declined Via DHS' : result.status;

                    updateData.dhsDaysCounter = result.daysCounter || null;

                    // Rules 2-7: Pending Status Logic
                    if (result.status === 'PENDING') {
                        let daysToAdd = 5; // Default for "New" (Rule 3) or Empty (Rule 2)
                        const counter = result.daysCounter || '';

                        if (counter.includes('1 Day')) daysToAdd = 4;      // Rule 4
                        else if (counter.includes('2 Day')) daysToAdd = 3; // Rule 5
                        else if (counter.includes('3 Day')) daysToAdd = 2; // Rule 6
                        else if (counter.includes('4 Day')) daysToAdd = 1; // Rule 7

                        updateData.nextUpdate = addWorkingDays(new Date(), daysToAdd);
                        // Sync workflow status
                        updateData.status = 'REQUESTED_VIA_DHS';
                        // Create comment with the 3 KEY COLUMNS
                        const dhsID = result.consumer?.identityNo || 'Not found';
                        const dhsDC = result.debtCounsellor?.ncrRegistrationNo || 'Not found';
                        const dhsStatus = result.requestStatus || 'Unknown';
                        comments.push(`DHS Extracted Data: ID=${dhsID}, CURRENT DC=${dhsDC}, REQUEST STATUS=${dhsStatus}`);
                        // Status label in comment reflects prior request history
                        const pendingLabel = wasPreviouslyRequestedViaDHS
                            ? `DHS Check via DHS: Pending (${counter || 'New'}) — this file was previously requested. Status updated to '${dhsRequestLabel}'. Next update set to +${daysToAdd} working days.`
                            : `DHS Check: Pending (${counter || 'New'}). Status updated to '${dhsRequestLabel}'. Next update set to +${daysToAdd} working days.`;
                        comments.push(pendingLabel);
                    }

                    // Rule 8: Auto Transferred
                    else if (result.status === 'AUTO_TRANSFERRED') {
                        updateData.nextUpdate = addWorkingDays(new Date(), 5);
                        // Auto transfer is successful, so we treat it as Accepted via DHS
                        updateData.status = 'ACCEPTED_VIA_DHS';
                        comments.push('DHS Check: Status is Auto Transferred. Workflow status updated to Accepted via DHS. Project Manager has been notified to proceed with this file.');
                        notifyManager = true;
                    }

                    // Rule 9: Accepted
                    else if (result.status === 'ACCEPTED') {
                        updateData.nextUpdate = addWorkingDays(new Date(), 5);
                        updateData.status = 'ACCEPTED_VIA_DHS'; // Sync workflow status
                        comments.push('DHS Check: Status is Accepted. Workflow status updated to Accepted via DHS. Project Manager has been notified to proceed with this file.');
                        notifyManager = true;
                    }

                    // Rule 10: Declined
                    else if (result.status === 'DECLINED') {
                        logger.info('=== DECLINED STATUS DETECTED ===');
                        logger.info('Decline reason value:', result.declineReason);
                        logger.info('Decline reason type:', typeof result.declineReason);

                        updateData.dhsStatus = 'Declined Via DHS';
                        // Map specific decline reasons if possible, otherwise default to generic rejection
                        // For now we don't auto-update main status to avoid closing cases prematurely, 
                        // but we log it heavily.
                        // Future: Map `result.declineReason` to specific rejection statuses
                        if (result.declineReason) {
                            const comment = `DHS Check: Declined. Reason: ${result.declineReason}`;
                            logger.info('Adding comment WITH reason:', comment);
                            comments.push(comment);
                        } else {
                            const comment = 'DHS Check: Declined. Could not retrieve reason.';
                            logger.info('Adding comment WITHOUT reason:', comment);
                            comments.push(comment);
                        }
                        logger.info('Comments array now has', comments.length, 'items');
                    }
                }

                // Execute Updates
                await prisma.case.update({
                    where: { id: caseId },
                    data: updateData
                });

                // Get a user ID for the comments (System or Admin)
                const admin = await prisma.user.findFirst({ where: { isAdmin: true } });
                const userId = admin?.id;

                logger.info('Admin user found:', !!admin);
                logger.info('User ID for comments:', userId);
                logger.info('Comments to save:', comments.length);

                // Add Comments
                if (userId && comments.length > 0) {
                    logger.info('=== SAVING COMMENTS ===');
                    for (const content of comments) {
                        logger.info('Creating comment:', content.substring(0, 100) + '...');
                        await prisma.caseComment.create({
                            data: {
                                caseId,
                                userId: userId,
                                content: `[SYSTEM] ${content}`
                            }
                        });
                        logger.info('✅ Comment saved successfully');
                    }
                } else {
                    logger.info('⚠️ NOT saving comments. userId:', userId, 'comments.length:', comments.length);
                }

                // Notify Project Manager (Admins)
                if (notifyManager && userId) { // Assuming admin is the user
                    const admins = await prisma.user.findMany({ where: { isAdmin: true } });
                    for (const adminUser of admins) {
                        try {
                            await prisma.inAppNotification.create({
                                data: {
                                    userId: adminUser.id,
                                    type: 'STATUS_CHANGE',
                                    title: `DHS Update: ${updateData.dhsStatus}`,
                                    message: `Case ${caseData.fileNumber} updated to ${updateData.dhsStatus}`,
                                    caseId: caseId,
                                    linkUrl: `/cases/${caseId}`
                                }
                            });
                        } catch (e) {
                            logger.error('Failed to create notification', e);
                        }
                    }
                }
            }
        } else if (action === 'auto_fill') {
            logger.info('Starting Auto-fill DHS extraction...');
            const scrapeResult = await scrapeDetailedConsumerInfo(idNumber);

            if (!scrapeResult.success || !scrapeResult.data) {
                result = {
                    success: false,
                    message: scrapeResult.message || 'DHS portal did not return data. The consumer may not be registered in the NCR Debt Help System, or the portal may be temporarily unavailable.',
                };
            } else {
                const data = scrapeResult.data;

                // ── Check which fields were actually populated ──────────────────
                const dcName = data.dcFullName || data.debtCounsellorName || '';
                const fieldStatus = {
                    'NCRDC No':           !!data.ncrdcNo,
                    'DC Name':            !!dcName,
                    'DC Trading Name':    !!data.dcTradingName,
                    'DC Mobile':          !!data.dcMobile,
                    'DC Email':           !!data.dcEmail,
                    'Operating Status':   !!data.dcOperatingStatus,
                    'Consumer DHS Status':!!data.status,
                };
                const filledFields  = Object.entries(fieldStatus).filter(([, v]) => v).map(([k]) => k);
                const emptyFields   = Object.entries(fieldStatus).filter(([, v]) => !v).map(([k]) => k);
                const anyDataFound  = filledFields.length > 0;

                logger.info(`[DHS auto-fill] Filled: ${filledFields.join(', ') || 'none'} | Empty: ${emptyFields.join(', ') || 'none'}`);

                if (!anyDataFound) {
                    // DHS connected but returned nothing useful — treat as a soft failure
                    result = {
                        success: false,
                        message: 'DHS connected but returned no information for this consumer. They may not be listed under an active debt review in the NCR Debt Help System.',
                        filledFields,
                        emptyFields,
                    };
                } else {
                    let lastUsedEmail = data.dcEmail;

                    // DC last-used email logic
                    if (data.ncrdcNo) {
                        const previousCase = await prisma.case.findFirst({
                            where: {
                                ncrdcNo: data.ncrdcNo,
                                dcEmail: { not: null, gt: '' },
                                id: { not: caseId },
                            },
                            orderBy: { createdAt: 'desc' },
                            select: { dcEmail: true },
                        });
                        if (previousCase?.dcEmail) {
                            lastUsedEmail = previousCase.dcEmail;
                            logger.info(`Found previous email for DC ${data.ncrdcNo}: ${lastUsedEmail}`);
                        }
                    }

                    // Persist to case
                    if (caseId) {
                        await prisma.case.update({
                            where: { id: caseId },
                            data: {
                                ncrdcNo:           data.ncrdcNo,
                                dhsPreviousStatus: data.status,
                                consumerDhsStatus: data.status,
                                debtCounsellorName:data.dcFullName || data.debtCounsellorName,
                                dcTradingName:     data.dcTradingName,
                                dcOperatingStatus: data.dcOperatingStatus,
                                dcMobile:          data.dcMobile,
                                dcEmail:           data.dcEmail,
                                lastKnownEmail:    lastUsedEmail,
                            },
                        });
                    }

                    result = {
                        success: true,
                        data: { ...data, lastUsedEmail },
                        filledFields,
                        emptyFields,
                        message: emptyFields.length > 0
                            ? `Partial auto-fill: ${filledFields.length} of ${filledFields.length + emptyFields.length} fields populated.`
                            : 'DHS Information Auto-filled successfully.',
                    };
                }
            }
        } else if (action === 'search') {
            // Search for consumer (for new transfer)
            result = await searchConsumer(idNumber);
        } else if (action === 'validate_and_request') {
            logger.info('Starting Validate & Request Transfer flow...');

            if (!caseId || !caseData) {
                return NextResponse.json({ success: false, message: 'Case ID not provided or case not found' }, { status: 400 });
            }

            // 1. Check for existing ID and POA
            let idDoc = caseData.documents.find(d => d.type === 'ID');
            let poaDoc = caseData.documents.find(d => d.type === 'POA' || d.type === 'ZENOWETHU_POA');
            const otherDocs = caseData.documents.filter(d => d.type === 'OTHER' || d.type === 'COMBINED');

            const missingDocs = [];
            if (!idDoc) missingDocs.push('ID');
            if (!poaDoc) missingDocs.push('POA');

            logger.info(`Document Check: ID=${!!idDoc}, POA=${!!poaDoc}, OTHER=${otherDocs.length}`);

            // 2. Attempt AI Extraction only if explicitly approved by user/AI plan
            if (missingDocs.length > 0 && otherDocs.length > 0 && useAiExtraction) {
                logger.info(`Missing ${missingDocs.join(', ')}. AI extraction approved — attempting extraction from ${otherDocs.length} 'Other' documents...`);

                // Prepare docs for analysis
                const docsToAnalyze = otherDocs.map(d => ({
                    base64: '', // We need to read the file to get base64. 
                    filePath: getFilePath(d.fileUrl),
                    type: d.type as any,
                    mimeType: d.mimeType
                }));

                const analyzedDocsWithContent = [];
                for (const docData of docsToAnalyze) {
                    let resolvedPath = docData.filePath;

                    logger.info(`Checking file at: ${resolvedPath}`);

                    if (!existsSync(resolvedPath)) {
                        // Fallback: try prepending uploads if missing
                        const altPath = path.join(process.cwd(), 'public', 'uploads', path.basename(resolvedPath));
                        logger.info(`File not found data direct path. Trying fallback: ${altPath}`);
                        if (existsSync(altPath)) {
                            resolvedPath = altPath;
                        }
                    }

                    if (existsSync(resolvedPath)) {
                        try {
                            const fileBuffer = readFileSync(resolvedPath);
                            logger.info(`Read file success: ${resolvedPath} (${fileBuffer.length} bytes)`);
                            analyzedDocsWithContent.push({
                                base64: fileBuffer.toString('base64'),
                                type: 'OTHER', // Treat as OTHER for analysis
                                mimeType: docData.mimeType,
                                originalId: otherDocs.find(od => od.fileUrl.includes(path.basename(docData.filePath)))?.id,
                                fileName: path.basename(resolvedPath) // Tracking filename for logs
                            });
                        } catch (err) {
                            logger.error(`Error reading file ${resolvedPath}:`, err);
                        }
                    } else {
                        logger.error(`File NOT FOUND at ${resolvedPath}`);
                    }
                }

                if (analyzedDocsWithContent.length > 0) {
                    logger.info(`Docs for analysis: ${analyzedDocsWithContent.length}`);
                    const { analyzeMultipleDocumentsAsCombined } = require('@zenowethu/shared-lib/src/openai');

                    try {
                        const analysis = await analyzeMultipleDocumentsAsCombined(analyzedDocsWithContent as any);
                        logger.info('Extraction Analysis Result FULL:', JSON.stringify(analysis));
                        logger.info('Validation Report:', JSON.stringify(analysis.validation));

                        // IF OpenAI confirms they exist, we "create" them by duplicating the reference
                        // We assume the FIRST 'Other' doc is the one containing them for now if multiple exist
                        // Or we use the one that analysis matched. 
                        const sourceDoc = otherDocs[0]; // Best guess or use analysis to pinpoint

                        // FIX: Ensure we create records if missingID is FALSE (meaning it IS present)
                        const idFound = analysis.validation && analysis.validation.missingID === false;
                        const poaFound = analysis.validation && analysis.validation.missingPOA === false;

                        if (idFound && !idDoc) {
                            logger.info('AI detected ID in Other document. Creating reference...');
                            idDoc = await prisma.document.create({
                                data: {
                                    caseId: caseId,
                                    type: 'ID',
                                    fileName: `Extracted_ID_${sourceDoc.fileName}`,
                                    fileUrl: sourceDoc.fileUrl,
                                    fileSize: sourceDoc.fileSize,
                                    mimeType: sourceDoc.mimeType,
                                    extractedData: JSON.stringify(analysis.id)
                                }
                            });
                        }

                        if (poaFound && !poaDoc) {
                            logger.info('AI detected POA in Other document. Creating reference...');
                            poaDoc = await prisma.document.create({
                                data: {
                                    caseId: caseId,
                                    type: 'POA',
                                    fileName: `Extracted_POA_${sourceDoc.fileName}`,
                                    fileUrl: sourceDoc.fileUrl, // Point to same file
                                    fileSize: sourceDoc.fileSize,
                                    mimeType: sourceDoc.mimeType,
                                    extractedData: JSON.stringify(analysis.poa)
                                }
                            });
                        }

                    } catch (e) {
                        logger.error('Extraction failed:', e);
                        // Continue to standard check to fail gracefully
                    }
                }
            }

            // 3. Final Validation
            if (!idDoc || !poaDoc) {
                const stillMissing = [];
                if (!idDoc) stillMissing.push('ID');
                if (!poaDoc) stillMissing.push('POA');

                const aiNote = missingDocs.length > 0 && otherDocs.length > 0 && !useAiExtraction
                    ? ' Other uploaded documents were found that may contain these — enable AI extraction to auto-detect them, or upload the documents manually.'
                    : '';

                return NextResponse.json({
                    success: false,
                    message: `Cannot request transfer. Missing mandatory documents: ${stillMissing.join(', ')}. Please upload them directly or ask staff to review uploaded files.${aiNote}`,
                    missingDocs: stillMissing,
                    canUseAiExtraction: missingDocs.length > 0 && otherDocs.length > 0 && !useAiExtraction
                });
            }

            // 4. Attempt DHS transfer first
            const idFilePath = getFilePath(idDoc.fileUrl);
            const poaFilePath = getFilePath(poaDoc.fileUrl);

            if (!existsSync(idFilePath)) {
                return NextResponse.json({
                    success: false,
                    dhsRequested: false,
                    message: `Not requested via DHS: ID document file not found on server (${idDoc.fileName}).`
                });
            }
            if (!existsSync(poaFilePath)) {
                return NextResponse.json({
                    success: false,
                    dhsRequested: false,
                    message: `Not requested via DHS: POA document file not found on server (${poaDoc.fileName}).`
                });
            }

            logger.info('Attempting DHS transfer request...');
            const dhsResult = await requestTransfer(idNumber, poaFilePath, idFilePath);

            if (!dhsResult.success) {
                return NextResponse.json({
                    success: false,
                    dhsRequested: false,
                    message: `Not requested via DHS: ${dhsResult.message || 'DHS transfer automation failed.'}`
                });
            }

            // DHS succeeded — update case status
            await prisma.case.update({
                where: { id: caseId },
                data: { dhsStatus: 'PENDING', status: 'DHS_REQUESTED' }
            });
            await prisma.workflowLog.create({
                data: {
                    caseId,
                    fromStatus: caseData.status,
                    toStatus: 'DHS_REQUESTED',
                    notes: 'Transfer request submitted via DHS automation'
                }
            });

            logger.info('DHS transfer succeeded. Attempting email notification to DC...');

            // 5. Resolve DC email and send notification (non-critical — DHS already succeeded)
            const badEmailSettings = await prisma.systemSettings.findMany({
                where: { category: 'bad_dc_email' },
                select: { value: true }
            });
            const badEmails = badEmailSettings.map(s => s.value.toLowerCase().trim());

            const isGoodEmail = (e: string | null | undefined): e is string =>
                !!e && e.trim().length > 0 && !badEmails.includes(e.toLowerCase().trim());

            let resolvedEmail: string | null = null;
            let emailSource = '';

            if (isGoodEmail(caseData.lastKnownEmail)) {
                resolvedEmail = caseData.lastKnownEmail;
                emailSource = 'last known email';
            } else if (caseData.ncrdcNo) {
                const previousCase = await prisma.case.findFirst({
                    where: {
                        ncrdcNo: caseData.ncrdcNo,
                        dcEmail: { not: null, gt: '' },
                        id: { not: caseId },
                        NOT: { dcEmail: { in: badEmails.length > 0 ? badEmails : ['__no_match__'] } }
                    },
                    orderBy: { createdAt: 'desc' },
                    select: { dcEmail: true }
                });

                if (previousCase?.dcEmail && isGoodEmail(previousCase.dcEmail)) {
                    resolvedEmail = previousCase.dcEmail;
                    emailSource = 'database history';
                    logger.info(`Resolved DC email from DB history for NCRDC ${caseData.ncrdcNo}: ${resolvedEmail}`);
                } else if (isGoodEmail(caseData.dcEmail)) {
                    resolvedEmail = caseData.dcEmail;
                    emailSource = 'case record (DHS auto-fill)';
                } else {
                    logger.info(`No DB or case email found — trying NCR website for NCRDC ${caseData.ncrdcNo}`);
                    const ncrResult = await lookupDCFromNCR(caseData.ncrdcNo);
                    if (ncrResult.found && ncrResult.email && isGoodEmail(ncrResult.email)) {
                        resolvedEmail = ncrResult.email;
                        emailSource = 'NCR website (ncr.org.za)';
                        logger.info(`Resolved DC email from NCR website: ${resolvedEmail}`);
                    }
                }
            } else if (isGoodEmail(caseData.dcEmail)) {
                resolvedEmail = caseData.dcEmail;
                emailSource = 'case record (DHS auto-fill)';
            }

            if (!resolvedEmail) {
                result = {
                    success: true,
                    dhsRequested: true,
                    emailSent: false,
                    message: 'Requested via DHS but email not sent: no valid email address found for this debt counsellor. ' +
                        'The email may have been flagged as invalid or could not be found in our records or on ncr.org.za. ' +
                        'Please call the debt counsellor to obtain a working email address and update the case.'
                };
            } else {
                if (resolvedEmail !== caseData.dcEmail) {
                    await prisma.case.update({
                        where: { id: caseId },
                        data: { dcEmail: resolvedEmail, lastKnownEmail: resolvedEmail }
                    });
                    logger.info(`Updated case dcEmail to resolved address (source: ${emailSource})`);
                }

                logger.info(`Sending email to DC (${emailSource}):`, resolvedEmail);

                const clientName = `${caseData.client.firstName} ${caseData.client.lastName}`;
                const emailResult = await sendStatusChangeNotification({
                    caseId,
                    clientName,
                    fileNumber: caseData.fileNumber,
                    statusCode: 'REQUEST_FILE_DC',
                    dcName: caseData.debtCounsellorName || 'Debt Counsellor',
                    dcEmail: resolvedEmail,
                    idNumber: caseData.client.idNumber,
                    isB2B: caseData.acquisitionType === 'B2B'
                });

                if (emailResult.emailSuccess) {
                    await prisma.case.update({
                        where: { id: caseId },
                        data: { nextUpdate: addWorkingDays(new Date(), 5) }
                    });
                    await prisma.caseComment.create({
                        data: {
                            caseId,
                            userId: (await prisma.user.findFirst({ where: { isAdmin: true } }))?.id || '',
                            content: `[SYSTEM] Requested via DHS. Email sent to DC (${resolvedEmail}) [source: ${emailSource}] requesting: Form 16, Form 17.1, Form 17.2, Form 17.7, complete consumer file, court/consent orders, account schedules, and all supporting documentation. Next update: +5 working days.`
                        }
                    });
                    result = {
                        success: true,
                        dhsRequested: true,
                        emailSent: true,
                        message: `Requested via DHS successfully. Email also sent to debt counsellor (${resolvedEmail}) requesting complete file. Source: ${emailSource}.`
                    };
                } else {
                    result = {
                        success: true,
                        dhsRequested: true,
                        emailSent: false,
                        message: `Requested via DHS but email not sent: failed to deliver to DC (${resolvedEmail}). Reason: ${emailResult.errors.join(', ')}`
                    };
                }
            }

        }

        // Close browser after operation
        await closeBrowser();

        return NextResponse.json({
            success: true,
            ...result
        });
    } catch (error) {
        logger.error('DHS lookup error:', error);
        await closeBrowser();

        return NextResponse.json(
            {
                error: 'Failed to query DHS',
                details: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
}
