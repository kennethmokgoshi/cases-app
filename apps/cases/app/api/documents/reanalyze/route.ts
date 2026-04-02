import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';
import { extractDocumentsFromCombinedPdf, analyzeDocument, batchAnalyzeDocuments, verifyIdNumbers, createLogger } from '@zenowethu/shared-lib';
import { ReanalyzeSchema, parseBody } from '@/lib/schemas';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { z } from 'zod';

const logger = createLogger('api/documents/reanalyze');

export async function POST(request: Request) {
    let session;
    let body;
    let caseId;

    try {
        session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const parsed = parseBody(ReanalyzeSchema, await request.json());
        if (!parsed.success) return parsed.response;
        body = parsed.data as z.infer<typeof ReanalyzeSchema>;
        caseId = body.caseId;
        const mode = body.mode;

        // --- NEW BULLETPROOF BYPASS LOGIC ---
        // 1. Fetch Case Record to verify acquisitionType and projects
        const caseRecord = await prisma.case.findUnique({
            where: { id: caseId },
            include: { projects: { include: { project: true } } }
        });

        if (!caseRecord) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        const userType = session?.user?.userType;
        const isB2BPartner = userType === 'B2B_PARTNER';

        const isB2BPartnerProject = caseRecord.projects?.some(cp =>
            cp.project.parentId === 'cm3m176ia0004v0u8pysf0j5u'
        );

        // Only skip AI for B2B partner users uploading to a B2B project.
        // Staff and admins should always be able to re-analyze any case.
        const skipAnalysis = isB2BPartner && isB2BPartnerProject;

        logger.info(`[REANALYZE_TRACE] Case: ${caseId} | B2BUser: ${isB2BPartner} | B2BPartnerProj: ${isB2BPartnerProject}`);
        logger.info(`[REANALYZE_TRACE] Final_Skip: ${skipAnalysis}`);

        if (skipAnalysis) {
            return NextResponse.json({
                success: true,
                message: "AI analysis skipped for B2B case.",
                idVerification: { isVerified: true, warning: null }
            });
        }

        // --- BATCH MODE (SEPARATE DOCUMENTS) ---
        if (mode === 'SEPARATE') {
            const documentIds = body.documentIds;
            if (!documentIds || documentIds.length === 0) {
                return NextResponse.json({ error: 'No documents provided for batch analysis' }, { status: 400 });
            }

            logger.info('📦 Batch Re-analyzing documents:', documentIds);

            // Fetch documents
            const docs = await prisma.document.findMany({
                where: { id: { in: documentIds }, caseId },
                select: { id: true, type: true, fileUrl: true }
            });

            if (docs.length === 0) return NextResponse.json({ error: 'No documents found' }, { status: 404 });

            // Prepare for AI
            const documentsForAi = await Promise.all(docs.map(async (doc) => {
                const filePath = join(process.cwd(), 'storage', 'uploads', doc.fileUrl.replace('/uploads/', ''));
                if (!existsSync(filePath)) return null;
                const buffer = await readFile(filePath);
                return {
                    base64: buffer.toString('base64'),
                    type: doc.type as 'ID' | 'POA' | 'CREDIT_REPORT',
                    mimeType: 'application/pdf'
                };
            }));

            const validDocs = documentsForAi.filter(d => d !== null);
            if (validDocs.length === 0) return NextResponse.json({ error: 'Files could not be read' }, { status: 500 });

            // Call Batch Analysis
            const analysis = await batchAnalyzeDocuments(validDocs as any);

            // Verify IDs
            const idVerification = verifyIdNumbers(analysis);

            // Update each document
            for (const doc of docs) {
                let docData = {};
                if (doc.type === 'ID' && analysis.id) docData = analysis.id;
                else if (doc.type === 'POA' && analysis.poa) docData = analysis.poa;
                else if (doc.type === 'CREDIT_REPORT' && analysis.creditReport) docData = analysis.creditReport;

                if (Object.keys(docData).length > 0) {
                    await prisma.document.update({
                        where: { id: doc.id },
                        data: {
                            extractedData: JSON.stringify(docData),
                            analyzedAt: new Date()
                        }
                    });
                }
            }

            // Update Client Data
            await updateClientData(caseId, analysis, idVerification);

            return NextResponse.json({
                success: true,
                message: 'Batch Analysis Complete',
                idVerification
            });
        }

        // --- SINGLE / COMBINED MODE ---
        const { documentId } = body;
        if (!documentId) return NextResponse.json({ error: 'Document ID required for single analysis' }, { status: 400 });

        const document = await prisma.document.findUnique({ where: { id: documentId } });
        if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

        logger.info('🔄 Re-analyze API called - CaseId:', caseId, 'Doc:', document.fileName, 'Type:', document.type);

        const filePath = join(process.cwd(), 'storage', 'uploads', document.fileUrl.replace('/uploads/', ''));
        if (!existsSync(filePath)) return NextResponse.json({ error: 'Physical file not found' }, { status: 404 });

        const fileBuffer = await readFile(filePath);
        const base64Pdf = fileBuffer.toString('base64');

        let resultMessage = '';
        let extractedDocs: any[] = [];
        let fullAnalysis: any = null;
        let idVerification = null;

        if (document.type === 'COMBINED') {
            const { extractOnly } = body;

            if (extractOnly) {
                logger.info('🤖 Re-analyzing Combined PDF (Extraction Only)...');
                const { analyzeCombinedDocument } = await import('@zenowethu/shared-lib');
                const analysis = await analyzeCombinedDocument(base64Pdf);
                fullAnalysis = analysis;

                // Update the combined document with new analysis
                await prisma.document.update({
                    where: { id: document.id },
                    data: {
                        extractedData: JSON.stringify(analysis),
                        analyzedAt: new Date()
                    }
                });

                resultMessage = 'Successfully re-extracted data from Combined PDF';

            } else {
                logger.info('🤖 Starting AI re-extraction & SPLIT for Combined PDF...');
                const extraction = await extractDocumentsFromCombinedPdf(base64Pdf);
                fullAnalysis = extraction.analysis;

                // Verify IDs
                idVerification = verifyIdNumbers(fullAnalysis);

                const uploadsDir = join(process.cwd(), 'storage', 'uploads', caseId);
                const timestamp = Date.now();

                for (const extractedDoc of extraction.extractedDocuments) {
                    const docFileName = `${timestamp}-re-${extractedDoc.type.toLowerCase()}.pdf`;
                    const docFilePath = join(uploadsDir, docFileName);
                    const docFileUrl = `/uploads/${caseId}/${docFileName}`;

                    await writeFile(docFilePath, Buffer.from(extractedDoc.base64Pdf, 'base64'));

                    let extractedData: any = {
                        confidence: extractedDoc.confidence,
                        description: extractedDoc.description,
                        pageCount: extractedDoc.pageCount,
                        extractedFrom: document.id,
                        reanalyzed: true
                    };

                    // Detailed individual analysis
                    if (extractedDoc.type === 'CREDIT_REPORT') {
                        try {
                            const result = await analyzeDocument(extractedDoc.base64Pdf, 'CREDIT_REPORT', 'application/pdf');
                            const analysis = result.data;
                            extractedData = { ...extractedData, ...analysis };
                            
                            // Re-assign refined type/name if identified
                            if (result.identifiedType) extractedDoc.type = result.identifiedType;
                            if (result.bureauName) extractedDoc.description = result.bureauName;
                        } catch (err) {
                            if (extraction.analysis.creditReport) extractedData = { ...extractedData, ...extraction.analysis.creditReport };
                        }
                    } else if (extractedDoc.type === 'ID' && extraction.analysis.id) {
                        extractedData = { ...extractedData, ...extraction.analysis.id };
                    } else if (extractedDoc.type === 'POA' && extraction.analysis.poa) {
                        extractedData = { ...extractedData, ...extraction.analysis.poa };
                    }

                    const newDoc = await prisma.document.create({
                        data: {
                            caseId,
                            type: extractedDoc.type,
                            fileName: docFileName,
                            fileUrl: docFileUrl,
                            fileSize: extractedDoc.base64Pdf.length, // Approx
                            mimeType: 'application/pdf',
                            extractedData: JSON.stringify(extractedData),
                            analyzedAt: new Date()
                        }
                    });
                    extractedDocs.push(newDoc);
                }
                resultMessage = `Successfully re-extracted & split ${extractedDocs.length} documents`;
            }

        } else if (['ID', 'POA', 'CREDIT_REPORT', 'ZENOWETHU_POA'].includes(document.type)) {
            logger.info(`🔍 Re-analyzing single ${document.type}...`);
            const analysis = await analyzeDocument(base64Pdf, document.type as any, 'application/pdf');

            const updatedData = {
                ...(document.extractedData ? JSON.parse(document.extractedData as string) : {}),
                ...analysis,
                reanalyzedAt: new Date().toISOString()
            };

            await prisma.document.update({
                where: { id: document.id },
                data: { extractedData: JSON.stringify(updatedData), analyzedAt: new Date() }
            });

            fullAnalysis = {};
            if (document.type === 'ID') fullAnalysis.id = analysis;
            if (document.type === 'POA' || document.type === 'ZENOWETHU_POA') fullAnalysis.poa = analysis;
            if (document.type === 'CREDIT_REPORT') fullAnalysis.creditReport = analysis;

            resultMessage = `Successfully re-analyzed ${document.type}`;
        } else {
            return NextResponse.json({ error: 'Document type not supported' }, { status: 400 });
        }

        if (fullAnalysis) {
            // Since we might not have all docs in single analysis, verification might be incomplete, 
            // but we still pass what we have. 
            if (!idVerification) idVerification = verifyIdNumbers(fullAnalysis);
            await updateClientData(caseId, fullAnalysis, idVerification);
        }

        return NextResponse.json({
            success: true,
            message: resultMessage,
            documents: extractedDocs,
            idVerification
        });

    } catch (error) {
        logger.error('❌ Re-analysis error:', error);

        // Log to file for debugging
        try {
            const errorLogPath = join(process.cwd(), 'storage', 'uploads', 'reanalyze_error.log');
            const errorEntry = `[${new Date().toISOString()}] ${error instanceof Error ? error.message : String(error)}\nStack: ${error instanceof Error ? error.stack : 'No stack'}\n\n`;
            await writeFile(errorLogPath, errorEntry, { flag: 'a' });
        } catch (logErr) {
            logger.error('Failed to write error log:', logErr);
        }

        // Log to Case Activity
        try {
            if (session?.user?.id && caseId) {
                await prisma.caseComment.create({
                    data: {
                        caseId,
                        userId: session.user.id,
                        content: 'Failed to re-analyze document',
                        activityType: 'DOCUMENT_ANALYSIS_FAILED',
                        activityData: JSON.stringify({
                            error: error instanceof Error ? error.message : String(error),
                            documentId: body?.documentId || body?.documentIds,
                            mode: body?.mode
                        })
                    }
                });
            }
        } catch (activityErr) {
            logger.error('Failed to log activity:', activityErr);
        }

        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Failed to re-analyze document',
            details: String(error)
        }, { status: 500 });
    }
}
export const maxDuration = 300; // Allow 5 minutes for heavy analysis

async function updateClientData(caseId: string, fullAnalysis: any, idVerification?: any) {
    // caseRecord already fetched in POST but we fetch again or pass it
    const caseRecord = await prisma.case.findUnique({ where: { id: caseId } });
    if (!caseRecord) return;

    const updateData: any = {};

    if (fullAnalysis.id) {
        if (fullAnalysis.id.names) updateData.firstName = fullAnalysis.id.names;
        if (fullAnalysis.id.surname) updateData.lastName = fullAnalysis.id.surname;
        // Only update ID if verified or if it's the only one found and looks like an ID
        if (fullAnalysis.id.idNumber) updateData.idNumber = fullAnalysis.id.idNumber;
    }

    // Override ID if verification says so
    if (idVerification?.bestId) {
        updateData.idNumber = idVerification.bestId;
    }

    if (fullAnalysis.poa) {
        if (fullAnalysis.poa.cellNumber) updateData.phone = fullAnalysis.poa.cellNumber;
        if (fullAnalysis.poa.email) updateData.email = fullAnalysis.poa.email;
        if (fullAnalysis.poa.address) updateData.address = fullAnalysis.poa.address;
    }
    if (fullAnalysis.creditReport?.consumer) {
        if (!updateData.address && fullAnalysis.creditReport.consumer.latestAddress) updateData.address = fullAnalysis.creditReport.consumer.latestAddress;
        if (!updateData.employer && fullAnalysis.creditReport.consumer.employer) updateData.employer = fullAnalysis.creditReport.consumer.employer;
        if (!updateData.phone && fullAnalysis.creditReport.consumer.cellNumber) updateData.phone = fullAnalysis.creditReport.consumer.cellNumber;
    }

    if (Object.keys(updateData).length > 0) {
        // If there's an ID verify warning, we might want to flag the case or log it
        // For now, we prefer the "Best ID" logic

        try {
            await prisma.client.update({
                where: { id: caseRecord.clientId },
                data: updateData
            });
            logger.info('📝 Updated client data with re-analyzed info');
        } catch (e: any) {
            logger.error('❌ Failed to update client (likely unique constraint):', e.code, e.message);

            // If unique constraint error (P2002) on idNumber, retry WITHOUT idNumber
            if (e.code === 'P2002' && updateData.idNumber) {
                logger.warn('⚠️ ID Number collision detected. Updating client metrics excluding ID Number.');
                const { idNumber, ...safeUpdateData } = updateData;
                await prisma.client.update({
                    where: { id: caseRecord.clientId },
                    data: safeUpdateData
                });
            } else {
                // If it's something else, rethrow or log
                throw e;
            }
        }
    }
}

