/**
 * POST /api/cases/[id]/legal-fee-invoice
 *
 * Generate the consumer's legal fee invoice (default R1,700, no VAT added),
 * render it to PDF, file it on the case as a LEGAL_FEE_INVOICE document and
 * publish it to the consumer's Crediva vault. The case moves to
 * LEGAL_FEE_INVOICE_ISSUED; staff then use "Send to consumer" on the document,
 * which moves it to LEGAL_FEE_INVOICE_SENT.
 *
 * The same generator runs automatically when a D3/D4 file is Accepted via DHS.
 */

import { NextResponse } from 'next/server';
import { auth, createLogger, touchCaseAction } from '@zenowethu/shared-lib';
import { LegalFeeInvoiceInputSchema } from '@zenowethu/shared-lib/src/finance/legal-fee-invoice';
import { generateLegalFeeInvoiceDocument } from '@zenowethu/shared-lib/src/finance/legal-fee-document';

const logger = createLogger('api/cases/[id]/legal-fee-invoice');

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const parsed = LegalFeeInvoiceInputSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
        return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 });
    }

    try {
        const result = await generateLegalFeeInvoiceDocument({
            caseId: id,
            userId: session.user.id,
            input: parsed.data,
        });
        if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });

        await touchCaseAction(id, 'DOCUMENT_UPLOAD', { userId: session.user.id });

        logger.info(`Legal fee invoice ${result.invoiceNumber} generated for case ${id} by ${session.user.id}`);
        return NextResponse.json(
            {
                invoiceId: result.invoiceId,
                invoiceNumber: result.invoiceNumber,
                total: result.total,
                documentId: result.documentId,
                statusChange: result.statusChange,
                portalPublished: result.portalPublished,
            },
            { status: 201 },
        );
    } catch (error) {
        logger.error({ error, caseId: id }, 'Legal fee invoice generation failed');
        return NextResponse.json({ error: 'Could not generate the legal fee invoice' }, { status: 500 });
    }
}
