import { NextResponse } from 'next/server';
import { auth } from '@zenowethu/shared-lib/src/auth';
import { createLogger } from '@zenowethu/shared-lib';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import busboy from 'busboy';

const logger = createLogger('api/comments/attachments/upload');

// Helper to parse multipart/form-data
async function parseForm(request: Request) {
    const contentType = request.headers.get('content-type') || '';
    const buffer = await request.arrayBuffer();

    return new Promise<{ fields: Record<string, string>, files: Array<{ name: string, fieldName: string, buffer: Buffer, type: string }> }>((resolve, reject) => {
        const bb = busboy({
            headers: { 'content-type': contentType },
            limits: { fileSize: 15 * 1024 * 1024 } // 15MB limit for comment attachments
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
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { fields, files } = await parseForm(request);
        const caseId = fields.caseId;

        if (!caseId) {
            return NextResponse.json({ error: 'Case ID is required' }, { status: 400 });
        }

        if (files.length === 0) {
            return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
        }

        // Create uploads directory if it doesn't exist
        const uploadsDir = join(process.cwd(), 'storage', 'uploads', 'comments', caseId);
        if (!existsSync(uploadsDir)) {
            await mkdir(uploadsDir, { recursive: true });
        }

        const uploadedFiles = [];

        for (const file of files) {
            const buffer = file.buffer;
            
            // Generate unique filename to prevent collisions
            const timestamp = Date.now();
            const safeName = file.name.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
            const fileName = `${timestamp}-${safeName}`;
            const filePath = join(uploadsDir, fileName);
            const fileUrl = `/uploads/comments/${caseId}/${fileName}`;

            await writeFile(filePath, buffer);

            uploadedFiles.push({
                name: file.name,
                url: fileUrl,
                type: file.type,
                size: buffer.length
            });
        }

        return NextResponse.json({
            success: true,
            files: uploadedFiles
        }, { status: 201 });

    } catch (error) {
        logger.error('Error uploading comment attachments:', error);
        return NextResponse.json(
            { error: 'Failed to upload attachments', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
