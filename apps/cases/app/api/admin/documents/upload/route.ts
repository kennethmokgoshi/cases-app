import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import busboy from 'busboy';
import { createLogger } from '@zenowethu/shared-lib';

const logger = createLogger('api/admin/documents/upload');


export const maxDuration = 60;

// Helper to parse multipart/form-data using busboy
async function parseForm(request: Request) {
    return new Promise<{ fields: Record<string, string>, files: Array<{ name: string, buffer: Buffer, type: string }> }>((resolve, reject) => {
        const contentType = request.headers.get('content-type') || '';
        const bb = busboy({
            headers: { 'content-type': contentType },
            limits: {
                fileSize: 50 * 1024 * 1024, // 50MB max
            }
        });

        const fields: Record<string, string> = {};
        const files: Array<{ name: string, buffer: Buffer, type: string }> = [];

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

        bb.on('error', (err) => reject(err));
        bb.on('close', () => resolve({ fields, files }));

        request.arrayBuffer()
            .then(buffer => {
                bb.end(Buffer.from(buffer));
            })
            .catch(err => {
                reject(new Error('Failed to read request body: ' + err));
            });
    });
}

export async function POST(request: Request) {
    try {
        const { files } = await parseForm(request);

        if (files.length === 0) {
            return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
        }

        const file = files[0];
        const uploadsDir = join(process.cwd(), 'storage', 'uploads', 'resources');

        if (!existsSync(uploadsDir)) {
            await mkdir(uploadsDir, { recursive: true });
        }

        const timestamp = Date.now();
        // Sanitize filename
        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const fileName = `${timestamp}-${safeName}`;
        const filePath = join(uploadsDir, fileName);
        const fileUrl = `/uploads/resources/${fileName}`;

        await writeFile(filePath, file.buffer);

        return NextResponse.json({
            url: fileUrl,
            size: file.buffer.length,
            mimeType: file.type,
            originalName: file.name
        });

    } catch (error) {
        logger.error('Upload error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
