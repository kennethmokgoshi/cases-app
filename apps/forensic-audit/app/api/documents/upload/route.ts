import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { sendStatusChangeNotification , logger } from '@zenowethu/shared-lib';
import { getStatusByCode } from '@zenowethu/shared-lib';
import {
    analyzeCombinedDocument,
    analyzeMultipleDocumentsAsCombined,
    extractDocumentsFromCombinedPdf
} from '@zenowethu/shared-lib/src/openai';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import busboy from 'busboy';
import { Readable } from 'stream';
import { auth } from '@zenowethu/shared-lib';


export const maxDuration = 600; // 10 minutes

// Helper to parse multipart/form-data using manual buffer parsing (MOST ROBUST)
async function parseFormRobust(request: Request) {
    const startTime = Date.now();
    const contentType = request.headers.get('content-type') || '';

    logger.info(`[UPLOAD_TRACE] Reading body buffer...`);
    const buffer = await request.arrayBuffer();
    logger.info(`[UPLOAD_TRACE] Buffer read: ${buffer.byteLength} bytes`);

    return new Promise<{ fields: Record<string, string>, files: Array<{ name: string, fieldName: string, buffer: Buffer, type: string }> }>((resolve, reject) => {
        const bb = busboy({
            headers: { 'content-type': contentType },
            limits: { fileSize: 150 * 1024 * 1024 } // 150MB
        });

        const fields: Record<string, string> = {};
        const files: Array<{ name: string, fieldName: string, buffer: Buffer, type: string }> = [];

        bb.on('field', (name, val) => {
            fields[name] = val;
        });

        bb.on('file', (name, file, info) => {
            const chunks: Buffer[] = [];
            file.on('data', (chunk) => chunks.push(chunk));
            file.on('end', () => {
                files.push({
                    name: info.filename,
                    fieldName: name,
                    buffer: Buffer.concat(chunks),
                    type: info.mimeType
                });
            });
        });

        bb.on('error', (err) => reject(err));
        bb.on('finish', () => resolve({ fields, files }));

        bb.end(Buffer.from(buffer));
    });
}

export async function POST(request: Request) {
    try {
        logger.info('[UPLOAD_TRACE] 🏁 Starting Robust Upload');
        const { fields, files } = await parseFormRobust(request);
        const caseId = fields.caseId;

        if (!caseId) {
            return NextResponse.json({ error: 'Case ID is required' }, { status: 400 });
        }

        // --- NEW BULLETPROOF BYPASS LOGIC ---
        // 1. Get Session
        const session = await auth();
        const userType = session?.user?.userType;
        const isB2BPartner = userType === 'B2B_PARTNER';

        // 2. Fetch Case Record to verify acquisitionType (The source of truth)
        const caseRecord = await prisma.case.findUnique({
            where: { id: caseId },
            include: { projects: { include: { project: true } } }
        });

        const isB2BCase = caseRecord?.acquisitionType === 'B2B';

        // Check if case belongs to a B2B project path
        const isB2BProject = caseRecord?.projects?.some(cp =>
            cp.project.name.includes('B2B') ||
            cp.project.type === 'B2B' ||
            cp.project.parentId === 'cm3m176ia0004v0u8pysf0j5u' // Known B2B root ID
        );

        // 3. Determine skipAnalysis
        const skipAnalysisRaw = fields.skipAnalysis;

        // Only skip AI for B2B partner users on B2B projects. 
        // Internal staff/admins and non-B2B cases should always have active AI.
        const skipAnalysis = skipAnalysisRaw === 'true' ||
            skipAnalysisRaw === '1' ||
            (isB2BPartner && isB2BProject);

        logger.info(`[UPLOAD_TRACE] Case: ${caseId}`);
        logger.info(`[UPLOAD_TRACE] Fields: ${JSON.stringify(fields)}`);
        logger.info(`[UPLOAD_TRACE] Checks - B2BUser: ${isB2BPartner}, B2BCase: ${isB2BCase}, B2BProj: ${isB2BProject}, Flag: ${skipAnalysisRaw}`);
        logger.info(`[UPLOAD_TRACE] Final_Skip: ${skipAnalysis}`);

        if (files.length === 0) {
            return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
        }

        const isCombined = fields.combined === 'true';

        // Create uploads directory if it doesn't exist
        const uploadsDir = join(process.cwd(), 'storage', 'uploads', caseId);
        if (!existsSync(uploadsDir)) {
            await mkdir(uploadsDir, { recursive: true });
        }

        const savedDocuments = [];
        const documentsToAnalyze: Array<{ base64: string; type: 'ID' | 'POA' | 'CREDIT_REPORT' | 'OTHER' | 'PROOF_OF_RESIDENCE'; docId: string; mimeType: string }> = [];
        let combinedDocBase64 = '';
        let combinedDocId = '';

        // Save files and prepare for analysis
        for (const file of files) {
            const buffer = file.buffer;

            // Generate unique filename
            const timestamp = Date.now();
            const fileName = `${timestamp}-${file.name}`;
            const filePath = join(uploadsDir, fileName);
            const fileUrl = `/uploads/${caseId}/${fileName}`;

            // Save file to disk
            await writeFile(filePath, buffer);

            // Determine document type from fieldName OR filename
            let docType = 'OTHER';
            const nameLower = file.name.toLowerCase();

            // 1. Check explicit field names from frontend
            if (file.fieldName === 'file_ID') {
                docType = 'ID';
            } else if (file.fieldName === 'file_POA') {
                docType = 'POA';
            } else if (file.fieldName === 'file_CREDIT_REPORT') {
                docType = 'CREDIT_REPORT';
            }
            // 2. Check combined flag
            else if (isCombined) {
                docType = 'COMBINED';
            }
            // 3. Fallback to filename sniffing
            else if (nameLower.includes('id') || nameLower.includes('identity')) {
                docType = 'ID';
            } else if (nameLower.includes('poa') || nameLower.includes('power')) {
                docType = 'POA';
            } else if (nameLower.includes('credit') || nameLower.includes('report') || nameLower.includes('xds') || nameLower.includes('experian') || nameLower.includes('transunion')) {
                docType = 'CREDIT_REPORT';
            }

            logger.info(`📄 File: ${file.name} → Type: ${docType}`);

            // Save to database
            const document = await prisma.document.create({
                data: {
                    caseId,
                    type: docType,
                    fileName: file.name,
                    fileUrl,
                    fileSize: buffer.length,
                    mimeType: file.type,
                    uploadedById: session?.user?.id || null, // Track who uploaded the document
                }
            });

            savedDocuments.push(document);

            // ONLY prepare for AI analysis if we are NOT skipping it
            if (!skipAnalysis) {
                // Handle combined document
                if (isCombined && docType === 'COMBINED') {
                    combinedDocBase64 = buffer.toString('base64');
                    combinedDocId = document.id;
                }
                // Prepare for AI analysis if it's a key document type (separate mode)
                else if (docType === 'ID' || docType === 'POA' || docType === 'CREDIT_REPORT' || docType === 'OTHER') {
                    const base64 = buffer.toString('base64');
                    documentsToAnalyze.push({
                        base64,
                        type: docType as 'ID' | 'POA' | 'CREDIT_REPORT' | 'OTHER',
                        docId: document.id,
                        mimeType: file.type
                    });
                }
            }
        }

        // Analyze documents with AI
        let extractedData = {};

        if (skipAnalysis) {
            logger.info('⏭️  Skipping AI analysis as requested (skipAnalysis=true)');
        } else {
            // Handle combined document - SPLIT into separate ID, POA, Credit Report PDFs
            if (isCombined && combinedDocBase64) {
                logger.info('🤖 Starting AI extraction & split for COMBINED document');

                try {
                    // Use the extraction function that splits the PDF
                    const extraction = await extractDocumentsFromCombinedPdf(combinedDocBase64);

                    logger.info('✅ AI Extraction Results:', extraction.extractedDocuments.length, 'documents found');
                    extractedData = extraction.analysis;

                    // Save each extracted document as a separate PDF
                    for (const extractedDoc of extraction.extractedDocuments) {
                        if (extractedDoc.type === 'OTHER') continue; // Skip unknown documents

                        const docBuffer = Buffer.from(extractedDoc.base64Pdf, 'base64');
                        const docFileName = `${Date.now()}-extracted-${extractedDoc.type.toLowerCase()}.pdf`;
                        const docFilePath = join(uploadsDir, docFileName);
                        const docFileUrl = `/uploads/${caseId}/${docFileName}`;

                        // Save the split PDF file
                        await writeFile(docFilePath, docBuffer);

                        // Save to database
                        const document = await prisma.document.create({
                            data: {
                                caseId,
                                type: extractedDoc.type,
                                fileName: `Extracted ${extractedDoc.type} (${extractedDoc.pageCount} pages)`,
                                fileUrl: docFileUrl,
                                fileSize: docBuffer.length,
                                mimeType: 'application/pdf',
                                extractedData: extractedDoc.type === 'ID' ? JSON.stringify(extraction.analysis.id) :
                                    extractedDoc.type === 'POA' ? JSON.stringify(extraction.analysis.poa) :
                                        extractedDoc.type === 'CREDIT_REPORT' ? JSON.stringify(extraction.analysis.creditReport) : null,
                                analyzedAt: new Date(),
                                uploadedById: session?.user?.id || null, // Track who uploaded the document
                            }
                        });

                        savedDocuments.push(document);
                        logger.info(`📄 Saved extracted ${extractedDoc.type}: ${docFileName} (${extractedDoc.pageCount} pages, confidence: ${extractedDoc.confidence}%)`);
                    }

                    // Update combined document with full extracted data
                    if (combinedDocId) {
                        await prisma.document.update({
                            where: { id: combinedDocId },
                            data: {
                                extractedData: JSON.stringify(extractedData),
                                analyzedAt: new Date()
                            }
                        });
                    }
                } catch (aiError) {
                    logger.error('❌ AI Combined Extraction Error:', aiError);
                    // Fallback to simple analysis without splitting
                    try {
                        logger.info('⚠️ Falling back to simple analysis...');
                        const analysisResults = await analyzeCombinedDocument(combinedDocBase64);
                        extractedData = analysisResults;
                        if (combinedDocId) {
                            await prisma.document.update({
                                where: { id: combinedDocId },
                                data: {
                                    extractedData: JSON.stringify(analysisResults),
                                    analyzedAt: new Date()
                                }
                            });
                        }
                    } catch (fallbackError) {
                        logger.error('❌ Fallback analysis also failed:', fallbackError);
                        throw fallbackError; // Propagate error to the UI
                    }
                }
            }
            // Handle separate documents - analyze them together as combined
            else if (documentsToAnalyze.length > 0) {
                logger.info('🤖 Analyzing', documentsToAnalyze.length, 'separate documents as COMBINED');
                logger.info('📄 Document types:', documentsToAnalyze.map(d => d.type));

                try {
                    // Use the combined analysis approach for all separate documents
                    const analysisResults = await analyzeMultipleDocumentsAsCombined(
                        documentsToAnalyze.map(d => ({ base64: d.base64, type: d.type, mimeType: d.mimeType }))
                    );

                    logger.info('✅ AI Combined Analysis Results:', JSON.stringify(analysisResults, null, 2));
                    extractedData = analysisResults;

                    // Update documents with extracted data
                    for (const doc of documentsToAnalyze) {
                        const data = doc.type === 'ID' ? analysisResults.id :
                            doc.type === 'POA' ? analysisResults.poa :
                                analysisResults.creditReport;

                        if (data) {
                            logger.info(`💾 Saving extracted data for ${doc.type}`);
                            await prisma.document.update({
                                where: { id: doc.docId },
                                data: {
                                    extractedData: JSON.stringify(data),
                                    analyzedAt: new Date()
                                }
                            });
                        } else {
                            logger.warn(`⚠️  No data extracted for ${doc.type}`);
                        }
                    }
                } catch (aiError) {
                    logger.error('❌ AI Analysis Error:', aiError);
                }
            } else {
                logger.info('⏭️  No documents to analyze (not ID/POA/CREDIT_REPORT or COMBINED)');
            }
        }

        // --- AUTOMATED STATUS UPDATE REMOVED ---
        // Status remains NEW_LEAD as per user requirement
        logger.info('⏭️  Skipping automated status update as per requirement');

        logger.info('📤 Returning response with extracted data:', Object.keys(extractedData));

        return NextResponse.json({
            success: true,
            documents: savedDocuments,
            extractedData
        }, { status: 201 });

    } catch (error) {
        logger.error('❌ Error uploading documents:', error);
        return NextResponse.json(
            { error: 'Failed to upload documents', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
