/**
 * POST /api/cases/[id]/fee-documents/[documentId]/send
 *
 * Email an invoice or proof of payment to whoever it goes to next:
 *   our invoice to a DC / proof of payment → the case's debt counsellor (with POA + ID)
 *   legal fee invoice / DC's invoice        → the consumer
 * The case status only moves when the email and all attachments went out.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { sendFeeDocument, type FeeDocumentFailure } from '@zenowethu/shared-lib/src/finance/fee-document-service';

const logger = createLogger('api/cases/[id]/fee-documents/send');

const SendSchema = z.object({
    note: z.string().trim().max(2000).optional().nullable(),
});

const FAILURE_STATUS: Record<FeeDocumentFailure, number> = {
    DOCUMENT_NOT_FOUND: 404,
    NOT_FEE_DOCUMENT: 422,
    DOCUMENT_UNTRUSTED: 422,
    NO_RECIPIENT: 422,
    NOT_PAYABLE: 422,
    SEND_FAILED: 502,
    ATTACHMENT_FAILED: 502,
};

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string; documentId: string }> },
) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id, documentId } = await params;
    const parsed = SendSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
        return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 });
    }

    try {
        const result = await sendFeeDocument({
            caseId: id,
            documentId,
            note: parsed.data.note,
            userId: session.user.id,
        });
        if ('failure' in result) {
            return NextResponse.json({ error: result.error, failure: result.failure }, { status: FAILURE_STATUS[result.failure] });
        }
        return NextResponse.json(result);
    } catch (error) {
        logger.error({ error, caseId: id, documentId }, 'Fee document send crashed');
        return NextResponse.json({ error: 'Could not send the document' }, { status: 500 });
    }
}
