import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { createLogger } from '@zenowethu/shared-lib';

const logger = createLogger('api/admin/documents/[id]');


export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const resource = await prisma.documentResource.findUnique({
            where: { id }
        });

        if (!resource) {
            return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
        }

        // Delete file from disk
        if (resource.fileUrl) {
            // Remove leading slash if present
            const relativePath = resource.fileUrl.startsWith('/') ? resource.fileUrl.substring(1) : resource.fileUrl;
            const fullPath = join(process.cwd(), 'public', relativePath);

            // Only delete if it exists and is in uploads/resources (safety check)
            if (existsSync(fullPath) && fullPath.includes('uploads')) {
                try {
                    await unlink(fullPath);
                } catch (e) {
                    logger.warn('Failed to delete file from disk:', e);
                }
            }
        }

        // Delete from DB
        await prisma.documentResource.delete({
            where: { id }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error('Error deleting resource:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
