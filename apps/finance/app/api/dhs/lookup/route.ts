/**
 * DHS Lookup API
 * 
 * Checks the DHS (NCR Debt Help System) for consumer transfer status
 * and retrieves debt counsellor information.
 * Implements automation rules 1-10 for status updates and next update calculations.
 */

import { NextResponse } from 'next/server';
import { logger } from '@zenowethu/shared-lib';
import { 
    checkTransferStatus, 
    searchConsumer, 
    closeBrowser, 
    requestTransfer, 
    scrapeDetailedConsumerInfo 
} from '@zenowethu/shared-lib/src/dhs';
import { prisma } from '@zenowethu/database';
import { addWorkingDays, auth } from '@zenowethu/shared-lib';
import path, { join } from 'path';
import { existsSync, readFileSync } from 'fs';

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
        const session = await auth();
        const { idNumber, caseId, action } = await request.json();

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
            include: { documents: true }
        }) : null;

        // Get a user ID for operations (Session User or Fallback Admin)
        const userId = session?.user?.id || (await prisma.user.findFirst({ where: { isAdmin: true } }))?.id;

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

            // === Apply Logic Rules 1-10 ===
            if (caseId && caseData) {
                const updateData: any = {};
                const comments: string[] = [];
                let notifyManager = false;

                // Rule 1: No Records Found -> Not Requested -> Request File
                if (!result.found) {
                    // Only request if not already requested or if explicitly checking
                    // and documents are available
                    const poa = caseData.documents.find(d => d.type === 'POA' || d.type === 'ZENOWETHU_POA');
                    const idDoc = caseData.documents.find(d => d.type === 'ID');

                    if (poa && idDoc) {
                        // Construct absolute paths
                        // Handle relative URLs (e.g., /uploads/...)
                        const poaPath = getFilePath(poa.fileUrl);
                        const idPath = getFilePath(idDoc.fileUrl);

                        comments.push('DHS Check: No records found. Attempting to auto-request transfer...');

                        // Attempt to request transfer
                        const requestResult = await requestTransfer(idNumber, poaPath, idPath);

                        if (requestResult.success) {
                            updateData.status = 'REQUESTED_VIA_DHS';
                            updateData.dhsStatus = 'Requested via DHS';
                            updateData.nextUpdate = addWorkingDays(new Date(), 5);
                            comments.push('Success: Transfer requested via DHS. Next update set to +5 working days.');
                        } else {
                            comments.push(`Failed to request transfer: ${requestResult.message}`);
                            updateData.dhsStatus = 'Not Requested';
                        }
                    } else {
                        updateData.dhsStatus = 'Not Requested';
                        comments.push('DHS Check: Not requested. Cannot auto-request: Missing POA or ID document.');
                    }
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

                    updateData.dhsStatus = result.status === 'PENDING' ? 'Pending' :
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
                        // Sync workflow status to 'Requested via DHS' when pending
                        updateData.status = 'REQUESTED_VIA_DHS';
                        // Create comment with the 3 KEY COLUMNS
                        const dhsID = result.consumer?.identityNo || 'Not found';
                        const dhsDC = result.debtCounsellor?.ncrRegistrationNo || 'Not found';
                        const dhsStatus = result.requestStatus || 'Unknown';
                        comments.push(`DHS Extracted Data: ID=${dhsID}, CURRENT DC=${dhsDC}, REQUEST STATUS=${dhsStatus}`);
                        // Also add the old format comment for context
                        comments.push(`DHS Check: Pending (${counter || 'New'}). Status updated to 'Requested via DHS'. Next update set to +${daysToAdd} working days.`);
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
                        updateData.dhsStatus = 'Declined Via DHS';
                        if (result.declineReason) {
                            comments.push(`DHS Check: Declined. Reason: ${result.declineReason}`);
                        } else {
                            comments.push('DHS Check: Declined. Could not retrieve reason.');
                        }
                    }
                }

                // Execute Updates
                await prisma.case.update({
                    where: { id: caseId },
                    data: {
                        ...updateData,
                        updatedBy: userId ? { connect: { id: userId } } : undefined
                    }
                });

                // Add Comments
                if (userId && comments.length > 0) {
                    for (const content of comments) {
                        await prisma.caseComment.create({
                            data: {
                                caseId,
                                userId: userId,
                                content: `[SYSTEM] ${content}`
                            }
                        });
                    }
                }

                // Notify Project Manager (Admins)
                if (notifyManager && userId) {
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
                result = { success: false, message: scrapeResult.message || 'Failed to extract data' };
            } else {
                const data = scrapeResult.data;
                let lastUsedEmail = data.dcEmail;

                // Implement DC LAST USED EMAIL Logic
                if (data.ncrdcNo) {
                    const previousCase = await prisma.case.findFirst({
                        where: {
                            ncrdcNo: data.ncrdcNo,
                            dcEmail: { not: null, gt: '' }, // Exclude null and empty
                            id: { not: caseId } // Exclude current case
                        },
                        orderBy: { createdAt: 'desc' },
                        select: { dcEmail: true }
                    });

                    if (previousCase?.dcEmail) {
                        lastUsedEmail = previousCase.dcEmail;
                    }
                }

                // Update Case if ID provided
                if (caseId) {
                    await prisma.case.update({
                        where: { id: caseId },
                        data: {
                            ncrdcNo: data.ncrdcNo,
                            dhsPreviousStatus: data.status,
                            consumerDhsStatus: data.status,
                            debtCounsellorName: data.dcFullName || data.debtCounsellorName,
                            dcTradingName: data.dcTradingName,
                            dcOperatingStatus: data.dcOperatingStatus,
                            dcMobile: data.dcMobile,
                            dcEmail: data.dcEmail,
                            lastKnownEmail: lastUsedEmail,
                            updatedBy: userId ? { connect: { id: userId } } : undefined
                        }
                    });
                }

                result = {
                    success: true,
                    data: { ...data, lastUsedEmail },
                    message: 'DHS Information Auto-filled successfully'
                };
            }
        } else if (action === 'search') {
            result = await searchConsumer(idNumber);
        } else if (action === 'validate_and_request') {
            logger.info('Starting Validate & Request Transfer flow...');

            if (!caseId || !caseData) {
                return NextResponse.json({ success: false, message: 'Case ID not provided or case not found' }, { status: 400 });
            }

            let idDoc = caseData.documents.find(d => d.type === 'ID');
            let poaDoc = caseData.documents.find(d => d.type === 'POA' || d.type === 'ZENOWETHU_POA');
            const otherDocs = caseData.documents.filter(d => d.type === 'OTHER' || d.type === 'COMBINED');

            const missingDocs = [];
            if (!idDoc) missingDocs.push('ID');
            if (!poaDoc) missingDocs.push('POA');

            if (missingDocs.length > 0 && otherDocs.length > 0) {
                const docsToAnalyze = otherDocs.map(d => ({
                    base64: '', 
                    filePath: getFilePath(d.fileUrl),
                    type: d.type as any,
                    mimeType: d.mimeType
                }));

                const analyzedDocsWithContent = [];
                for (const docData of docsToAnalyze) {
                    let resolvedPath = docData.filePath;
                    if (existsSync(resolvedPath)) {
                        try {
                            const fileBuffer = readFileSync(resolvedPath);
                            analyzedDocsWithContent.push({
                                base64: fileBuffer.toString('base64'),
                                type: 'OTHER',
                                mimeType: docData.mimeType,
                                originalId: otherDocs.find(od => od.fileUrl.includes(path.basename(docData.filePath)))?.id,
                                fileName: path.basename(resolvedPath)
                            });
                        } catch (err) {
                            logger.error(`Error reading file ${resolvedPath}:`, err);
                        }
                    }
                }

                if (analyzedDocsWithContent.length > 0) {
                    const { analyzeMultipleDocumentsAsCombined } = require('@zenowethu/shared-lib');
                    try {
                        const analysis = await analyzeMultipleDocumentsAsCombined(analyzedDocsWithContent as any);
                        const sourceDoc = otherDocs[0];
                        const idFound = analysis.validation && analysis.validation.missingID === false;
                        const poaFound = analysis.validation && analysis.validation.missingPOA === false;

                        if (idFound && !idDoc) {
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
                            poaDoc = await prisma.document.create({
                                data: {
                                    caseId: caseId,
                                    type: 'POA',
                                    fileName: `Extracted_POA_${sourceDoc.fileName}`,
                                    fileUrl: sourceDoc.fileUrl,
                                    fileSize: sourceDoc.fileSize,
                                    mimeType: sourceDoc.mimeType,
                                    extractedData: JSON.stringify(analysis.poa)
                                }
                            });
                        }
                    } catch (e) {
                        logger.error('Extraction failed:', e);
                    }
                }
            }

            if (!idDoc || !poaDoc) {
                const stillMissing = [];
                if (!idDoc) stillMissing.push('ID');
                if (!poaDoc) stillMissing.push('POA');
                return NextResponse.json({
                    success: false,
                    message: `Cannot request transfer. Missing mandatory documents: ${stillMissing.join(', ')}. Please upload them or ensure they are clear in 'Other' files.`
                });
            }

            const poaPath = getFilePath(poaDoc.fileUrl);
            const idPath = getFilePath(idDoc.fileUrl);

            const requestResult = await requestTransfer(idNumber, poaPath, idPath);
            result = requestResult;

            if (result.success) {
                await prisma.case.update({
                    where: { id: caseId },
                    data: {
                        dhsStatus: 'Requested via DHS',
                        status: 'REQUESTED_VIA_DHS',
                        nextUpdate: addWorkingDays(new Date(), 5),
                        updatedBy: userId ? { connect: { id: userId } } : undefined
                    }
                });

                await prisma.caseComment.create({
                    data: {
                        caseId,
                        userId: session?.user?.id || (await prisma.user.findFirst({ where: { isAdmin: true } }))?.id || '',
                        content: `[SYSTEM] Manual Transfer Request initiated. Status updated to 'Requested via DHS'.`
                    }
                });
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
