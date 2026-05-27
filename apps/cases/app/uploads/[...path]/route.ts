import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { createLogger } from '@zenowethu/shared-lib';

const logger = createLogger('uploads/serve');


export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    try {
        const { path: pathParts } = await params;
        const filePath = join(process.cwd(), 'storage', 'uploads', ...pathParts);

        if (!existsSync(filePath)) {
            logger.error('File not found at path:', filePath);
            return new NextResponse('File not found', { status: 404 });
        }

        const fileBuffer = await readFile(filePath);
        const fileName = pathParts[pathParts.length - 1].toLowerCase();

        // Simple MIME type detection
        let contentType = 'application/octet-stream';
        if (fileName.endsWith('.pdf')) contentType = 'application/pdf';
        else if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) contentType = 'image/jpeg';
        else if (fileName.endsWith('.png')) contentType = 'image/png';
        else if (fileName.endsWith('.webp')) contentType = 'image/webp';

        return new NextResponse(fileBuffer, {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=31536000, immutable' } });
    } catch (error) {
        logger.error('Error serving file:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
