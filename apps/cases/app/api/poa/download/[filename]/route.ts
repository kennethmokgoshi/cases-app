import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

/**
 * GET /api/poa/download/[filename]
 *
 * Serves a POA PDF from /tmp/poa/ — used for WhatsApp download links.
 * Files are temporary and only persist for the lifetime of the container.
 */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ filename: string }> },
) {
    const { filename } = await params;

    // Sanitise: only allow safe filenames (no path traversal)
    if (!/^[\w\-\.]+\.pdf$/i.test(filename)) {
        return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
    }

    try {
        const filePath = join('/tmp', 'poa', filename);
        const fileBuffer = await readFile(filePath);

        return new NextResponse(fileBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Length': fileBuffer.length.toString(),
            },
        });
    } catch {
        return NextResponse.json({ error: 'File not found or has expired' }, { status: 404 });
    }
}
