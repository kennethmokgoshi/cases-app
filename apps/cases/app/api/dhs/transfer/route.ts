/**
 * DHS Transfer Request API
 * 
 * Submits a transfer request to DHS with the consumer's POA and ID documents.
 */

import { NextResponse } from 'next/server';
import { requestTransfer, closeBrowser  } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import path from 'path';
import fs from 'fs';

// Server-side logger for API routes
const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    debug: (...args: any[]) => console.debug('[DEBUG]', ...args)
};

export async function POST(request: Request) {
    try {
        const { caseId, idNumber, poaDocumentId, idDocumentId } = await request.json();

        if (!caseId || !idNumber) {
            return NextResponse.json(
                { error: 'Case ID and ID number are required' },
                { status: 400 }
            );
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
                data: {
                    dhsStatus: 'PENDING',
                    status: 'DHS_REQUESTED'
                }
            });

            // Create workflow log
            await prisma.workflowLog.create({
                data: {
                    caseId: caseId,
                    fromStatus: caseData.status,
                    toStatus: 'DHS_REQUESTED',
                    notes: 'Transfer request submitted via DHS automation'
                }
            });
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

