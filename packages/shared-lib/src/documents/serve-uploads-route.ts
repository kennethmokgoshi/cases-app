// Shared Next.js route handler for `app/uploads/[...path]/route.ts` in every
// staff app. Node-only — import by deep path, never from the package root.
//
// Serves files from `<cwd>/storage/uploads` to signed-in users only. The
// resolved path must stay inside the uploads root, so encoded `..`, absolute
// segments and backslashes cannot escape it (e.g. to `.env` or /proc).

import { NextRequest, NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import { auth } from '../auth';
import { createLogger } from '../logger';
import { uploadsRoot, resolveUploadPath, contentTypeFor } from './upload-paths';

// Re-exported so existing imports of the helpers keep working.
export { uploadsRoot, resolveUploadPath, contentTypeFor } from './upload-paths';

const logger = createLogger('uploads/serve');

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
    try {
        const session = await auth();
        if (!session?.user) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { path: parts } = await params;
        const filePath = resolveUploadPath(uploadsRoot(), parts ?? []);
        if (!filePath) {
            logger.warn({ userId: session.user.id, parts }, 'Rejected upload path');
            return new NextResponse('Invalid path', { status: 400 });
        }

        const info = await stat(filePath).catch(() => null);
        if (!info?.isFile()) {
            return new NextResponse('File not found', { status: 404 });
        }

        const fileBuffer = await readFile(filePath);
        return new NextResponse(new Uint8Array(fileBuffer), {
            headers: {
                'Content-Type': contentTypeFor(parts[parts.length - 1]),
                // Consumer documents: never cache in shared proxies.
                'Cache-Control': 'private, max-age=3600',
                'X-Content-Type-Options': 'nosniff',
            },
        });
    } catch (error) {
        logger.error({ err: error }, 'Error serving upload');
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
