/**
 * GET /api/dc-fee-invoices/[id]/pdf
 *
 * Render (and disk-cache) the branded PDF for a debt-counsellor fee invoice and
 * stream it back as an attachment download.
 */

import { auth, logger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { NextResponse } from 'next/server';
import { generateDcFeeInvoicePdf, cacheInvoicePdf } from '@/lib/dc-fee-invoice-pdf';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });

  try {
    const result = await generateDcFeeInvoicePdf(id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const { invoice, bytes } = result;

    // Cache to disk for re-use by the send route (fire-and-forget on failure).
    cacheInvoicePdf(invoice.invoiceNumber, bytes)
      .then((relPath) =>
        prisma.invoice.update({ where: { id }, data: { pdfPath: relPath } }).catch(() => {}),
      )
      .catch(() => {});

    return new Response(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${invoice.invoiceNumber}.pdf"`,
        'Content-Length': String(bytes.byteLength),
      },
    });
  } catch (err) {
    logger.error('[GET /api/dc-fee-invoices/[id]/pdf]', err);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
