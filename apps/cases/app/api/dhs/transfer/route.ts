/**
 * DHS Transfer Request API
 * 
 * Submits a transfer request to DHS with the consumer's POA and ID documents.
 */

import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import path from 'path';
import fs from 'fs';
import { headers } from 'next/headers';

const logger = createLogger('api/dhs/transfer');

export async function POST(request: Request) {
    try {
        const session = await auth();
        // Attribution: Use session user or fallback to first admin
        const actingUserId = session?.user?.id || (await prisma.user.findFirst({ where: { isAdmin: true } }))?.id;
        const attribution = actingUserId ? { connect: { id: actingUserId } } : undefined;

        const { caseId, idNumber, poaDocumentId, idDocumentId, planStepId } = await request.json();

        if (!caseId || !idNumber) {
            return NextResponse.json(
                { error: 'Case ID and ID number are required' },
                { status: 400 }
            );
        }

        // Plan gate: if an active AI plan exists for this case, the DHS transfer
        // MUST originate from an approved plan step — not from a direct UI button press.
        const activePlan = await prisma.casePlan.findFirst({
            where: {
                caseId,
                status: { in: ['APPROVED', 'IN_PROGRESS'] },
            },
            include: {
                steps: {
                    where: { actionType: 'DHS_TRANSFER_REQUEST' },
                    select: { id: true, status: true },
                },
            },
        });

        if (activePlan) {
            if (!planStepId) {
                return NextResponse.json(
                    {
                        error: 'This case has an active AI plan. The DHS transfer must be executed through the approved plan — not directly. Please open the AI Plan tab and run the DHS Transfer step from there.',
                        requiresPlanApproval: true,
                        planId: activePlan.id,
                    },
                    { status: 403 }
                );
            }

            // Verify the provided planStepId is legitimate and in the correct state
            const planStep = await prisma.casePlanStep.findFirst({
                where: {
                    id: planStepId,
                    planId: activePlan.id,
                    actionType: 'DHS_TRANSFER_REQUEST',
                    status: 'IN_PROGRESS',
                },
            });

            if (!planStep) {
                return NextResponse.json(
                    {
                        error: 'Invalid or unapproved plan step. The DHS_TRANSFER_REQUEST step must be IN_PROGRESS (approved and executing) to proceed.',
                        requiresPlanApproval: true,
                        planId: activePlan.id,
                    },
                    { status: 403 }
                );
            }

            logger.info(`Plan gate passed: step ${planStepId} is IN_PROGRESS on approved plan ${activePlan.id}`);
        }

        // Get the case and documents
        const caseData = await prisma.case.findUnique({
            where: { id: caseId },
            include: {
                client: true,
                documents: true
            }
        });

        if (!caseData) {
            return NextResponse.json(
                { error: 'Case not found' },
                { status: 404 }
            );
        }

        // Log available documents for debugging
        logger.info('Available documents:', caseData.documents.map(d => ({
            id: d.id,
            type: d.type,
            fileName: d.fileName,
            fileUrl: d.fileUrl
        })));

        // Find POA and ID documents
        let poaDoc = caseData.documents.find(d => d.id === poaDocumentId);
        let idDoc = caseData.documents.find(d => d.id === idDocumentId);

        // If not specified, try to find by type/name
        // PRIORITY: ZENOWETHU_POA first, then regular POA
        if (!poaDoc) {
            // First try ZENOWETHU_POA (the signed consent form)
            poaDoc = caseData.documents.find(d => d.type === 'ZENOWETHU_POA');

            // Fall back to regular POA if ZENOWETHU_POA not found
            if (!poaDoc) {
                poaDoc = caseData.documents.find(d =>
                    d.fileName?.toLowerCase().includes('poa') ||
                    d.fileName?.toLowerCase().includes('power of attorney') ||
                    d.type === 'POA'
                );
            }
        }
        if (!idDoc) {
            idDoc = caseData.documents.find(d =>
                d.type === 'ID' ||
                (d.fileName?.toLowerCase().includes('id') &&
                    !d.fileName?.toLowerCase().includes('credit'))
            );
        }

        logger.info('Selected POA doc:', poaDoc?.fileName, poaDoc?.fileUrl);
        logger.info('Selected ID doc:', idDoc?.fileName, idDoc?.fileUrl);

        if (!poaDoc || !idDoc) {
            return NextResponse.json(
                {
                    error: 'Required documents not found',
                    details: {
                        poaFound: !!poaDoc,
                        idFound: !!idDoc,
                        availableDocs: caseData.documents.map(d => ({ type: d.type, fileName: d.fileName }))
                    }
                },
                { status: 400 }
            );
        }

        // Get file paths - fileUrl format is "/uploads/caseId/filename"
        // Files are stored in public/uploads/ directory
        const getAbsolutePath = (fileUrl: string) => {
            // Remove leading /uploads/ if present
            const relativePath = fileUrl.replace(/^\/uploads\//, '');
            return path.join(process.cwd(), 'storage', 'uploads', relativePath);
        };

        const poaPath = getAbsolutePath(poaDoc.fileUrl);
        const idPath = getAbsolutePath(idDoc.fileUrl);

        // Verify files exist
        logger.info('POA document path:', poaPath);
        logger.info('ID document path:', idPath);

        if (!fs.existsSync(poaPath)) {
            return NextResponse.json(
                {
                    error: 'POA document file not found on server',
                    details: { path: poaPath, fileUrl: poaDoc.fileUrl }
                },
                { status: 400 }
            );
        }
        if (!fs.existsSync(idPath)) {
            return NextResponse.json(
                {
                    error: 'ID document file not found on server',
                    details: { path: idPath, fileUrl: idDoc.fileUrl }
                },
                { status: 400 }
            );
        }

        // Submit transfer request to DHS
        const result = await requestTransfer(idNumber, poaPath, idPath);

        // Update case status if successful
        if (result.success) {
            await prisma.case.update({
                where: { id: caseId },
                    dhsStatus: 'PENDING',
                    status: 'DHS_REQUESTED',
                    updatedBy: attribution
                }
            });

            // Create workflow log
            await prisma.workflowLog.create({
                data: {
                    caseId: caseId,
                    fromStatus: caseData.status,
                    toStatus: 'DHS_REQUESTED',
                    notes: 'Transfer request submitted via DHS automation',
                    userId: actingUserId
                }
            });

            // Fire file-request emails to credit bureaus and credit providers
            try {
                const headersList = await headers();
                const host = headersList.get('host') || 'localhost:3000';
                const proto = process.env.NODE_ENV === 'production' ? 'https' : 'http';
                const baseUrl = `${proto}://${host}`;

                const fileReqRes = await fetch(`${baseUrl}/api/cases/${caseId}/send-file-requests`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        // Forward cookies so the internal request passes auth
                        'Cookie': headersList.get('cookie') || '',
                    },
                    body: JSON.stringify({}),
                });

                if (!fileReqRes.ok) {
                    const err = await fileReqRes.json().catch(() => ({}));
                    logger.warn('File request emails failed (non-blocking):', err);
                } else {
                    const summary = await fileReqRes.json();
                    logger.info('File request emails sent:', summary.summary);
                }
            } catch (emailErr) {
                // Non-blocking — DHS transfer success is not affected by email delivery
                logger.warn('Could not send file request emails (non-blocking):', emailErr);
            }
        }

        // Close browser
        await closeBrowser();

        return NextResponse.json({
            success: result.success,
            message: result.message,
            requestId: result.requestId
        });
    } catch (error) {
        logger.error('DHS transfer request error:', error);
        await closeBrowser();

        return NextResponse.json(
            {
                error: 'Transfer request failed',
                details: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined
            },
            { status: 500 }
        );
    }
}

