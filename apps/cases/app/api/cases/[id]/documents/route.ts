import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import busboy from 'busboy';
import { Readable } from 'stream';

const logger = createLogger('api/cases/[id]/documents');

// GET - List all documents for a case
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: caseId } = await params;
        const isAdmin = session.user.isAdmin === true || session.user.role === 'ADMIN';

        // Build visibility filter: admins see all; others only see non-admin-only docs
        // or docs where they have an explicit access grant
        const where: Record<string, unknown> = { caseId };
        if (!isAdmin) {
            where.OR = [
                { isAdminOnly: false },
                { accessGrants: { some: { userId: session.user.id } } }
            ];
        }

        const baseSelect = {
            id: true,
            type: true,
            fileName: true,
            fileUrl: true,
            fileSize: true,
            uploadedAt: true,
            uploadedById: true,
            isAdminOnly: true,
        } as const;

        const documents = isAdmin
            ? await prisma.document.findMany({
                where,
                orderBy: { uploadedAt: 'desc' },
                select: {
                    ...baseSelect,
                    accessGrants: {
                        select: {
                            userId: true,
                            grantedAt: true,
                            user: { select: { id: true, firstName: true, lastName: true, email: true } }
                        }
                    }
                }
            })
            : await prisma.document.findMany({
                where,
                orderBy: { uploadedAt: 'desc' },
                select: baseSelect
            });

        return NextResponse.json({ documents });

    } catch (error) {
        logger.error('Error fetching documents:', error);
        return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 });
    }
}

export const maxDuration = 600; // 10 minutes

// POST - Upload a new document
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const startTime = Date.now();
    logger.info(`[UPLOAD_TRACE] 🏁 Start: ${new Date().toISOString()}`);

    try {
        logger.info(`[UPLOAD_TRACE] 1. Auth check...`);
        const session = await auth();
        if (!session?.user) {
            logger.info(`[UPLOAD_TRACE] ❌ Auth failed`);
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: caseId } = await params;
        const contentType = request.headers.get('content-type') || '';
        logger.info(`[UPLOAD_TRACE] 2. Auth success. Content-Type: ${contentType}`);

        // Read the body as a buffer ONCE
        logger.info(`[UPLOAD_TRACE] 3. Reading request body...`);
        const buffer = await request.arrayBuffer();
        logger.info(`[UPLOAD_TRACE] 4. Body read: ${buffer.byteLength} bytes in ${Date.now() - startTime}ms`);

        if (buffer.byteLength === 0) {
            return NextResponse.json({ error: 'Empty file upload' }, { status: 400 });
        }

        // Manual Busboy parsing from buffer
        logger.info(`[UPLOAD_TRACE] 5. Starting manual Busboy parse...`);
        const { fields, files } = await new Promise<{ fields: any, files: any[] }>((resolve, reject) => {
            const bb = busboy({
                headers: { 'content-type': contentType },
                limits: { fileSize: 150 * 1024 * 1024 } // 150MB
            });
            const fields: any = {};
            const files: any[] = [];

            bb.on('field', (name, val) => {
                fields[name] = val;
            });

            bb.on('file', (name, file, info) => {
                const chunks: Buffer[] = [];
                file.on('data', (chunk) => chunks.push(chunk));
                file.on('end', () => {
                    files.push({
                        name: info.filename,
                        buffer: Buffer.concat(chunks),
                        type: info.mimeType
                    });
                });
            });

            bb.on('error', (err) => {
                logger.error('[UPLOAD_TRACE] Busboy Error:', err);
                reject(err);
            });

            bb.on('finish', () => {
                resolve({ fields, files });
            });

            bb.end(Buffer.from(buffer));
        });

        const file = files[0];
        const docType = fields.type || 'OTHER';
        const isAdmin = session.user.isAdmin === true || session.user.role === 'ADMIN';
        // Only admins can mark documents as admin-only
        const isAdminOnly = isAdmin && fields.isAdminOnly === 'true';

        if (!file) {
            logger.error(`[UPLOAD_TRACE] No file found in buffer. Fields found: ${Object.keys(fields).join(', ')}`);
            // Diagnostic: Log first 100 bytes of buffer
            const snippet = Buffer.from(buffer.slice(0, 100)).toString('ascii');
            logger.info(`[UPLOAD_TRACE] Buffer Snippet: ${snippet}`);
            return NextResponse.json({ error: 'No file found in the upload. Please try again.' }, { status: 400 });
        }

        logger.info(`[UPLOAD_TRACE] 6. Parse success: ${file.name} (${file.buffer.length} bytes)`);

        // Check for duplicate (same case, same filename, same size)
        const fileSize = file.buffer.length;
        const existingDoc = await prisma.document.findFirst({
            where: {
                caseId,
                fileName: file.name,
                fileSize: fileSize,
            }
        });

        if (existingDoc) {
            logger.info(`♻️  Duplicate detected for ${file.name} (${fileSize} bytes). Skipping write/create.`);
            return NextResponse.json({ document: existingDoc });
        }

        // Create uploads directory
        const uploadsDir = join(process.cwd(), 'storage', 'uploads', caseId);
        if (!existsSync(uploadsDir)) {
            await mkdir(uploadsDir, { recursive: true });
        }

        const timestamp = Date.now();
        const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const fileName = `${timestamp}-${safeFileName}`;
        const filePath = join(uploadsDir, fileName);
        const fileUrl = `/uploads/${caseId}/${fileName}`;

        logger.info(`[UPLOAD_TRACE] 7. Writing to disk...`);
        await writeFile(filePath, file.buffer);

        logger.info(`[UPLOAD_TRACE] 8. Creating DB record...`);
        const document = await prisma.document.create({
            data: {
                caseId,
                type: docType,
                fileName: file.name,
                fileUrl,
                fileSize: file.buffer.length,
                mimeType: file.type || 'application/octet-stream',
                uploadedById: session.user.id,
                isAdminOnly,
            }
        });

        logger.info(`[UPLOAD_TRACE] ✅ SUCCESS in ${Date.now() - startTime}ms`);
        return NextResponse.json({ document });

    } catch (error: any) {
        logger.error('❌ [UPLOAD_TRACE] CRITICAL FAILURE:', error);
        return NextResponse.json({
            error: 'Upload Failed',
            details: error?.message || String(error)
        }, { status: 500 });
    }
}

// DELETE - Delete a document
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const documentId = searchParams.get('documentId');

        if (!documentId) {
            return NextResponse.json({ error: 'Document ID is required' }, { status: 400 });
        }

        // Find document
        const document = await prisma.document.findUnique({
            where: { id: documentId }
        });

        if (!document) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 });
        }

        // Check permission: User can only delete their own documents, unless they are admin
        const isAdmin = session.user.isAdmin || session.user.role === 'ADMIN';
        const isUploader = document.uploadedById === session.user.id;

        if (!isAdmin && !isUploader) {
            return NextResponse.json({
                error: 'Permission denied',
                details: 'You can only delete documents you uploaded'
            }, { status: 403 });
        }

        // Delete file from disk
        try {
            const filePath = join(process.cwd(), 'storage', 'uploads', document.fileUrl.replace('/uploads/', ''));
            if (existsSync(filePath)) {
                await unlink(filePath);
            }
        } catch (e) {
            logger.warn('Could not delete file from disk:', e);
        }

        // Delete from database
        await prisma.document.delete({
            where: { id: documentId }
        });

        return NextResponse.json({ success: true });

    } catch (error) {
        logger.error('Error deleting document:', error);
        return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 });
    }
}

// PATCH - Update document type
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const documentId = searchParams.get('documentId');
        const body = await request.json();
        const { type } = body;

        if (!documentId || !type) {
            return NextResponse.json({ error: 'Document ID and Type are required' }, { status: 400 });
        }

        // Verify valid type
        const validTypes = ['ID', 'POA', 'CREDIT_REPORT', 'ZENOWETHU_POA', 'COMBINED', 'OTHER'];
        if (!validTypes.includes(type)) {
            return NextResponse.json({ error: 'Invalid document type' }, { status: 400 });
        }

        const document = await prisma.document.update({
            where: { id: documentId },
            data: { type }
        });

        return NextResponse.json({ document });

    } catch (error) {
        logger.error('Error updating document:', error);
        return NextResponse.json({ error: 'Failed to update document' }, { status: 500 });
    }
}

