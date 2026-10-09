/**
 * POST /api/cases/[id]/legal-fee-invoice
 *
 * Generate the consumer's legal fee invoice (default R1,700, no VAT added),
 * render it to PDF and file it on the case as a LEGAL_FEE_INVOICE document.
 * The case moves to LEGAL_FEE_INVOICE_ISSUED; staff then use "Send to consumer"
 * on the document, which moves it to LEGAL_FEE_INVOICE_SENT.
 */

import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { prisma } from '@zenowethu/database';
import { auth, createLogger, touchCaseAction } from '@zenowethu/shared-lib';
import { resolveInvoiceBankingDetails } from '@zenowethu/shared-lib/src/finance/banking-details';
import { createLegalFeeInvoice, LegalFeeInvoiceInputSchema } from '@zenowethu/shared-lib/src/finance/legal-fee-invoice';
import { applyFeeDocumentStatus } from '@zenowethu/shared-lib/src/finance/fee-document-status';
import { getCompanyProfile } from '@zenowethu/shared-lib/src/company/company-profile-service';
import { generateInvoicePdf, type InvoiceLineItem, type InvoiceData } from '@/lib/invoice-pdf';

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
        const existing = await prisma.case.findUnique({
            where: { id },
            select: { id: true, clientId: true, client: { select: { idNumber: true } } },
        });
        if (!existing) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

        const created = await createLegalFeeInvoice({
            caseId: existing.id,
            clientId: existing.clientId,
            reference: existing.client.idNumber,
            createdById: session.user.id,
            input: parsed.data,
        });
        if (!created.ok) return NextResponse.json({ error: created.error }, { status: created.status });

        const invoice = await prisma.invoice.findUniqueOrThrow({
            where: { id: created.invoice.id },
            include: {
                client: { select: { firstName: true, lastName: true, email: true, phone: true, idNumber: true } },
                case: { select: { fileNumber: true } },
                bankAccount: { select: { bankName: true, accountName: true, accountNumber: true, branchCode: true } },
                createdBy: { select: { firstName: true, lastName: true } },
            },
        });

        const invoiceData: InvoiceData = {
            documentType: 'INVOICE',
            invoiceNumber: invoice.invoiceNumber,
            issuedAt: invoice.issuedAt,
            dueAt: invoice.dueAt,
            status: invoice.status,
            clientName: `${invoice.client!.firstName} ${invoice.client!.lastName}`,
            clientEmail: invoice.client!.email ?? undefined,
            clientPhone: invoice.client!.phone ?? undefined,
            clientIdNumber: invoice.client!.idNumber ?? undefined,
            caseFileNumber: invoice.case?.fileNumber ?? undefined,
            lineItems: invoice.lineItems as unknown as InvoiceLineItem[],
            subtotal: Number(invoice.subtotal),
            vatRate: Number(invoice.vatRate),
            vatAmount: Number(invoice.vatAmount),
            total: Number(invoice.total),
            reference: invoice.reference ?? undefined,
            createdByName: invoice.createdBy ? `${invoice.createdBy.firstName} ${invoice.createdBy.lastName}` : undefined,
            bankingDetails: await resolveInvoiceBankingDetails(invoice),
            company: await getCompanyProfile(),
        };
        const pdfBytes = await generateInvoicePdf(invoiceData);

        // Same storage layout as a manual upload (served by /uploads/[...path]).
        const uploadsDir = join(process.cwd(), 'storage', 'uploads', id);
        await mkdir(uploadsDir, { recursive: true });
        const fileName = `${Date.now()}-${invoice.invoiceNumber}-legal-fee.pdf`;
        await writeFile(join(uploadsDir, fileName), Buffer.from(pdfBytes));

        const document = await prisma.document.create({
            data: {
                caseId: id,
                type: 'LEGAL_FEE_INVOICE',
                fileName: `${invoice.invoiceNumber} Legal Fee Invoice.pdf`,
                fileUrl: `/uploads/${id}/${fileName}`,
                fileSize: pdfBytes.length,
                mimeType: 'application/pdf',
                uploadedById: session.user.id,
                // Links the PDF back to its Invoice so "Mark paid" can settle it.
                extractedData: JSON.stringify({ feeInvoiceId: invoice.id }),
            },
        });

        await touchCaseAction(id, 'DOCUMENT_UPLOAD', { userId: session.user.id });
        const statusChange = await applyFeeDocumentStatus({
            caseId: id,
            docType: 'LEGAL_FEE_INVOICE',
            event: 'UPLOADED',
            userId: session.user.id,
            documentId: document.id,
            notes: `Generated legal fee invoice ${invoice.invoiceNumber} for R${Number(invoice.total).toFixed(2)}`,
        });

        logger.info(`Legal fee invoice ${invoice.invoiceNumber} generated for case ${id} by ${session.user.id}`);
        return NextResponse.json(
            { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, total: Number(invoice.total), documentId: document.id, statusChange },
            { status: 201 },
        );
    } catch (error) {
        logger.error({ error, caseId: id }, 'Legal fee invoice generation failed');
        return NextResponse.json({ error: 'Could not generate the legal fee invoice' }, { status: 500 });
    }
}
