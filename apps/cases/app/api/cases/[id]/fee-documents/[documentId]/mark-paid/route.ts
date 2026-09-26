/**
 * POST /api/cases/[id]/fee-documents/[documentId]/mark-paid
 *
 * Record payment against our own invoice (to a requesting DC, or the consumer's
 * legal fee). Creates a Payment and moves the case to the "paid" status:
 *   our invoice to a DC → DC_FEE_PAID_READY_TRANSFER (staff then accept on DHS)
 *   legal fee invoice   → LEGAL_FEE_PAID
 */

import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { markFeeDocumentPaid, MarkFeePaidSchema } from '@zenowethu/shared-lib/src/finance/fee-document-service';

const logger = createLogger('api/cases/[id]/fee-documents/mark-paid');

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string; documentId: string }> },
) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id, documentId } = await params;
    const parsed = MarkFeePaidSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 });
    }

    try {
        const result = await markFeeDocumentPaid({
            caseId: id,
            documentId,
            input: parsed.data,
            userId: session.user.id,
        });
        if ('failure' in result) {
            const status = result.failure === 'DOCUMENT_NOT_FOUND' ? 404 : 422;
            return NextResponse.json({ error: result.error, failure: result.failure }, { status });
        }
        return NextResponse.json(result, { status: 201 });
    } catch (error) {
        logger.error({ error, caseId: id, documentId }, 'Recording fee payment crashed');
        return NextResponse.json({ error: 'Could not record the payment' }, { status: 500 });
    }
}
