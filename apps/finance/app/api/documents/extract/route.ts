import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger } from '@zenowethu/shared-lib';
import { extractDocumentsFromCombinedPdf, analyzeDocument } from '@zenowethu/shared-lib';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export async function POST(request: Request) {
    let session;
    let caseId;

    try {
        session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const formData = await request.formData();
        caseId = formData.get('caseId') as string;
        const file = formData.get('file') as File;
        const documentId = formData.get('documentId') as string;

        if (!caseId) {
            return NextResponse.json({ error: 'Case ID is required' }, { status: 400 });
        }

        // Verify case exists
        const caseRecord = await prisma.case.findUnique({
            where: { id: caseId },
            include: { projects: { include: { project: true } } }
        });

        if (!caseRecord) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
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

        if (documentId) {
            // Use existing document
            const existingDoc = await prisma.document.findUnique({
                where: { id: documentId }
            });

            if (!existingDoc) {
                return NextResponse.json({ error: 'Selected document not found' }, { status: 404 });
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
                return NextResponse.json({ error: 'Physical file not found' }, { status: 404 });
            }

            buffer = await readFile(filePath);
            mimeType = existingDoc.mimeType;
            fileName = existingDoc.fileName;
            baseDocId = existingDoc.id;

            logger.info('🔄 Extract API using existing document:', existingDoc.id, 'File:', existingDoc.fileName);
        } else {
            // Use uploaded file
            if (!file) {
                return NextResponse.json({ error: 'PDF file is required' }, { status: 400 });
            }

            logger.info('📤 Extract API called with new file - CaseId:', caseId, 'File:', file.name);

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

        // Check if we should skip AI (Only skip for B2B Partners to control costs, but allow internal B2B splitting)
        const userType = session?.user?.userType;
        const isB2BPartner = userType === 'B2B_PARTNER';

        // Deep project check - if it's a strict B2B partner project, we might still want to skip
        const isB2BPartnerProject = caseRecord?.projects?.some((cp: any) =>
            cp.project.parentId === 'cm3m176ia0004v0u8pysf0j5u'
        );

        // We only skip if it's a B2B Partner user AND it's a B2B project (strict cost control)
        // Internal staff should always be able to use AI tools
        const skipAnalysis = isB2BPartner && isB2BPartnerProject;

        logger.info(`[EXTRACT_TRACE] Case: ${caseId} | B2BUser: ${isB2BPartner} | B2BProj: ${isB2BPartnerProject}`);
        logger.info(`[EXTRACT_TRACE] Final_Skip: ${skipAnalysis}`);

        if (skipAnalysis) {
            return NextResponse.json({
                success: true,
                message: "AI analysis skipped for this account type.",
                documents: documentId ? [await prisma.document.findUnique({ where: { id: documentId } })] : savedDocuments,
                analysis: {}
            });
        }

        // Extract documents using AI
        logger.info('🤖 Starting AI extraction...');
        const extraction = await extractDocumentsFromCombinedPdf(base64Pdf);

        // Save each extracted document
        for (const extractedDoc of extraction.extractedDocuments) {
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

            // Enhanced Analysis: If this is a credit report, analyze it INDIVIDUALLY to ensure detailed stats are captured
            if (extractedDoc.type === 'CREDIT_REPORT') {
                try {
                    logger.info('🔍 Performing detailed individual analysis on Credit Report...');
                    // Analyze specifically as a Credit Report
                    const result = await analyzeDocument(extractedDoc.base64Pdf, 'CREDIT_REPORT', 'application/pdf');
                    const analysis = result.data;
                    
                    // Merge including the important counts
                    extractedData = { ...extractedData, ...analysis };

                    // Re-assign refined type/name if identified
                    if (result.identifiedType) extractedDoc.type = result.identifiedType;
                    if (result.bureauName) extractedDoc.description = result.bureauName;

                    logger.info(`✅ Detailed analysis complete. Found ${analysis.totalAccounts || 0} accounts.`);
                } catch (err) {
                    logger.error('⚠️ Detailed extraction failed, falling back to combined summary:', err);
                    if (extraction.analysis.creditReport) {
                        extractedData = { ...extractedData, ...extraction.analysis.creditReport };
                    }
                }
            } else if (extractedDoc.type === 'ID' && extraction.analysis.id) {
                extractedData = { ...extractedData, ...extraction.analysis.id };
            } else if (extractedDoc.type === 'POA' && extraction.analysis.poa) {
                extractedData = { ...extractedData, ...extraction.analysis.poa };
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

        // Update client data if extraction found useful info
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
                logger.info('📝 Updated client data with extracted info');
            }
        }

        return NextResponse.json({
            success: true,
            message: `Extracted ${extraction.extractedDocuments.length} documents`,
            documents: savedDocuments,
            analysis: extraction.analysis
        });

    } catch (error) {
        logger.error('❌ Document extraction error:', error);

        // Log to Case Activity
        try {
            if (session?.user?.id && caseId) {
                await prisma.caseComment.create({
                    data: {
                        caseId,
                        userId: session.user.id,
                        content: 'Failed to extract/split PDF',
                        activityType: 'DOCUMENT_ANALYSIS_FAILED',
                        activityData: JSON.stringify({
                            error: error instanceof Error ? error.message : String(error)
                        })
                    }
                });
            }
        } catch (activityErr) {
            logger.error('Failed to log activity:', activityErr);
        }

        return NextResponse.json(
            { error: 'Failed to extract documents', details: String(error) },
            { status: 500 }
        );
    }
}

