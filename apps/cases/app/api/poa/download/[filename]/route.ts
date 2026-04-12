import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

/**
 * GET /api/poa/download/[filename]
 *
 * Serves POA PDFs that were saved to /tmp/poa/ during WhatsApp delivery.
 * Filename is validated to prevent path traversal attacks.
 */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ filename: string }> },
) {
    const { filename } = await params;

    // Strict allowlist: only alphanumeric, hyphens, underscores, dots — must end in .pdf
    if (!/^[\w\-]+\.pdf$/i.test(filename)) {
        return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
    }

    const filePath = join('/tmp', 'poa', filename);

    try {
        const fileBuffer = await readFile(filePath);
        return new NextResponse(fileBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `inline; filename="${filename}"`,
                'Content-Length': String(fileBuffer.length),
                'Cache-Control': 'private, max-age=86400',
            },
        });
    } catch {
        return NextResponse.json({ error: 'File not found or has expired' }, { status: 404 });
    }
}
