import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';
import { extractDocumentsFromCombinedPdf, analyzeDocument, createLogger } from '@zenowethu/shared-lib';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const logger = createLogger('api/documents/extract');

export async function POST(request: Request) {
    const encoder = new TextEncoder();

    return new Response(
        new ReadableStream({
            async start(controller) {
                const sendUpdate = (data: any, progress?: number) => {
                    controller.enqueue(encoder.encode(JSON.stringify({ ...data, progress }) + '\n'));
                };

                let session;
                let caseId;

                try {
                    session = await auth();
                    if (!session?.user) {
                        sendUpdate({ type: 'error', message: 'Unauthorized' });
                        controller.close();
                        return;
                    }

                    const formData = await request.formData();
                    caseId = formData.get('caseId') as string;
                    const file = formData.get('file') as File;
                    const documentId = formData.get('documentId') as string;

                    if (!caseId) {
                        sendUpdate({ type: 'error', message: 'Case ID is required' });
                        controller.close();
                        return;
                    }

                    // Verify case exists
                    const caseRecord = await prisma.case.findUnique({
                        where: { id: caseId },
                        include: { projects: { include: { project: true } } }
                    });

                    if (!caseRecord) {
                        sendUpdate({ type: 'error', message: 'Case not found' });
                        controller.close();
                        return;
                    }

                    let buffer: Buffer;
                    let mimeType: string;
                    let fileName: string;
                    let baseDocId: string;
                    const timestamp = Date.now();

                    const uploadsDir = join(process.cwd(), 'storage', 'uploads', caseId);
                    if (!existsSync(uploadsDir)) {
                        await mkdir(uploadsDir, { recursive: true });
                    }

                    const onProgress = (message: string, progress?: number) => {
                        sendUpdate({ type: 'progress', message }, progress);
                    };

                    if (documentId) {
                        // Use existing document
                        const existingDoc = await prisma.document.findUnique({
                            where: { id: documentId }
                        });

                        if (!existingDoc) {
                            sendUpdate({ type: 'error', message: 'Selected document not found' });
                            controller.close();
                            return;
                        }

                        // Resolve file path
                        let filePath = '';
                        if (existingDoc.fileUrl.startsWith('/uploads/')) {
                            filePath = join(process.cwd(), 'storage', 'uploads', existingDoc.fileUrl.replace('/uploads/', ''));
                        } else {
                            const relativePath = existingDoc.fileUrl.startsWith('/') ? existingDoc.fileUrl.slice(1) : existingDoc.fileUrl;
                            filePath = join(process.cwd(), 'public', relativePath);
                        }

                        if (!existsSync(filePath)) {
                            sendUpdate({ type: 'error', message: 'Physical file not found' });
                            controller.close();
                            return;
                        }

                        onProgress('📄 Reading file from storage...', 5);
                        buffer = await readFile(filePath);
                        mimeType = existingDoc.mimeType;
                        fileName = existingDoc.fileName;
                        baseDocId = existingDoc.id;

                        logger.info('🔄 Extract API using existing document:', existingDoc.id, 'File:', existingDoc.fileName);
                    } else {
                        // Use uploaded file
                        if (!file) {
                            sendUpdate({ type: 'error', message: 'PDF file is required' });
                            controller.close();
                            return;
                        }

                        logger.info('📤 Extract API called with new file - CaseId:', caseId, 'File:', file.name);
                        onProgress('📤 Uploading and saving original file...', 5);

                        // Read file to base64
                        const bytes = await file.arrayBuffer();
                        buffer = Buffer.from(bytes);
                        mimeType = file.type || 'application/pdf';
                        fileName = file.name;

                        // Save the original combined file
                        const combinedFileName = `${timestamp}-combined-${file.name}`;
                        const combinedFilePath = join(uploadsDir, combinedFileName);
                        const combinedFileUrl = `/uploads/${caseId}/${combinedFileName}`;
                        await writeFile(combinedFilePath, buffer);

                        // Save combined document record
                        const combinedDoc = await prisma.document.create({
                            data: {
                                caseId,
                                type: 'COMBINED',
                                fileName: file.name,
                                fileUrl: combinedFileUrl,
                                fileSize: buffer.length,
                                mimeType: mimeType }
                        });
                        baseDocId = combinedDoc.id;
                    }

                    const base64Pdf = buffer.toString('base64');

                    const savedDocuments: any[] = [];
                    // Only include the base document in the response if it was newly created
                    if (!documentId) {
                        const newBaseDoc = await prisma.document.findUnique({ where: { id: baseDocId } });
                        if (newBaseDoc) savedDocuments.push(newBaseDoc);
                    }

                    // Check if we should skip AI
                    const userType = session?.user?.userType;
                    const isB2BPartner = userType === 'B2B_PARTNER';
                    const isB2BPartnerProject = caseRecord?.projects?.some((cp: any) =>
                        cp.project.parentId === 'cm3m176ia0004v0u8pysf0j5u'
                    );
                    const skipAnalysis = isB2BPartner && isB2BPartnerProject;

                    if (skipAnalysis) {
                        sendUpdate({
                            type: 'result',
                            data: {
                                success: true,
                                message: "AI analysis skipped for this account type.",
                                documents: documentId ? [await prisma.document.findUnique({ where: { id: documentId } })] : savedDocuments,
                                analysis: {}
                            }
                        });
                        controller.close();
                        return;
                    }

                    // Extract documents using AI
                    logger.info('🤖 Starting AI extraction...');
                    const extraction = await extractDocumentsFromCombinedPdf(base64Pdf, onProgress);

                    // Save each extracted document
                    let savedCount = 0;
                    const totalToSave = extraction.extractedDocuments.length;

                    for (const extractedDoc of extraction.extractedDocuments) {
                        savedCount++;
                        const saveProgress = 90 + Math.round((savedCount / totalToSave) * 9); // 90-99%
                        onProgress(`💾 Saving ${extractedDoc.type} (${savedCount}/${totalToSave})...`, saveProgress);

                        const docFileName = `${timestamp}-${extractedDoc.type.toLowerCase()}.pdf`;
                        const docFilePath = join(uploadsDir, docFileName);
                        const docFileUrl = `/uploads/${caseId}/${docFileName}`;

                        // Write the split PDF to disk
                        const docBuffer = Buffer.from(extractedDoc.base64Pdf, 'base64');
                        await writeFile(docFilePath, docBuffer);

                        // Prepare extracted data
                        let extractedData: any = {
                            confidence: extractedDoc.confidence,
                            description: extractedDoc.description,
                            pageCount: extractedDoc.pageCount,
                            extractedFrom: baseDocId
                        };

                        // Enhanced Analysis for Credit Report
                        if (extractedDoc.type === 'CREDIT_REPORT') {
                            try {
                                logger.info('🔍 Performing detailed individual analysis on Credit Report...');
                                onProgress('🔍 Analyzing Credit Report details...', saveProgress);
                                const result = await analyzeDocument(extractedDoc.base64Pdf, 'CREDIT_REPORT', 'application/pdf');
                                const analysis = result.data;
                                extractedData = { ...extractedData, ...analysis };

                                // Re-assign refined type/name if identified
                                if (result.identifiedType) extractedDoc.type = result.identifiedType;
                                if (result.bureauName) extractedDoc.description = result.bureauName;
                            } catch (err) {
                                logger.error('⚠️ Detailed extraction failed:', err);
                                if (extraction.analysis.creditReport) {
                                    extractedData = { ...extractedData, ...extraction.analysis.creditReport };
                                }
                            }
                        } else if (extractedDoc.type === 'ID' && extraction.analysis.id) {
                            extractedData = { ...extractedData, ...extraction.analysis.id };
                        } else if (extractedDoc.type === 'POA' && extraction.analysis.poa) {
                            extractedData = { ...extractedData, ...extraction.analysis.poa };
                        } else if (extractedDoc.type === 'ZENOWETHU_POA' && extraction.analysis.poa) {
                            extractedData = { ...extractedData, ...extraction.analysis.poa };
                        } else if (extractedDoc.type === 'PAYSLIP' && extraction.analysis.payslip) {
                            extractedData = { ...extractedData, ...extraction.analysis.payslip };
                        } else if (extractedDoc.type === 'BANK_STATEMENT' && extraction.analysis.bankStatement) {
                            extractedData = { ...extractedData, ...extraction.analysis.bankStatement };
                        }

                        // Save to database
                        const document = await prisma.document.create({
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

                        savedDocuments.push(document);
                        logger.info(`✅ Saved ${extractedDoc.type} document: ${document.id}`);
                    }

                    // Update client data
                    if (extraction.analysis) {
                        const updateData: any = {};
                        if (extraction.analysis.id) {
                            if (extraction.analysis.id.names) updateData.firstName = extraction.analysis.id.names;
                            if (extraction.analysis.id.surname) updateData.lastName = extraction.analysis.id.surname;
                            if (extraction.analysis.id.idNumber) updateData.idNumber = extraction.analysis.id.idNumber;
                        }
                        if (extraction.analysis.poa) {
                            if (extraction.analysis.poa.cellNumber) updateData.phone = extraction.analysis.poa.cellNumber;
                            if (extraction.analysis.poa.email) updateData.email = extraction.analysis.poa.email;
                            if (extraction.analysis.poa.address) updateData.address = extraction.analysis.poa.address;
                        }

                        if (Object.keys(updateData).length > 0) {
                            await prisma.client.update({
                                where: { id: caseRecord.clientId },
                                data: updateData
                            });
                            logger.info('📝 Updated client data');
                        }
                    }

                    sendUpdate({
                        type: 'result',
                        data: {
                            success: true,
                            message: `Extracted ${extraction.extractedDocuments.length} documents`,
                            documents: savedDocuments,
                            analysis: extraction.analysis
                        }
                    }, 100);
                    controller.close();

                } catch (error) {
                    logger.error('❌ Document extraction error:', error);
                    sendUpdate({ type: 'error', message: error instanceof Error ? error.message : 'Failed to extract documents' });
                    controller.close();
                }
            }
        }),
        {
            headers: {
                'Content-Type': 'application/x-ndjson',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive' } }
    );
}


