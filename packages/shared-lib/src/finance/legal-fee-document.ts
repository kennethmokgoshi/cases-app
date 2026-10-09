/**
 * Legal fee invoice — generate the PDF, file it on the case and publish it to
 * the consumer's Crediva document vault (server-only).
 *
 * Node-only (imports `prisma`, `fs`). Import directly from this file in server
 * code — do NOT re-export from the package index.
 *
 * Shared by the staff "Generate legal fee invoice" route and the automatic
 * trigger that fires when a D3/D4 file is Accepted via DHS.
 */

import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { prisma } from '@zenowethu/database';
import { createLogger } from '../logger';
import { getCompanyProfile } from '../company/company-profile-service';
import { provisionConsumerForClient } from '../crediva/consumer-provisioning';
import { uploadsRoot } from '../documents/upload-paths';
import { resolveInvoiceBankingDetails } from './banking-details';
import { applyFeeDocumentStatus, type FeeStatusChangeResult } from './fee-document-status';
import { generateInvoicePdf, type InvoiceData, type InvoiceLineItem } from './invoice-pdf';
import { createLegalFeeInvoice, type LegalFeeInvoiceInput } from './legal-fee-invoice';

const logger = createLogger('finance/legal-fee-document');

/** Crediva vault category the consumer sees the invoice under. */
export const PORTAL_INVOICE_CATEGORY = 'INVOICE';

export type LegalFeeDocumentResult =
    | {
        ok: true;
        invoiceId: string;
        invoiceNumber: string;
        total: number;
        documentId: string;
        statusChange: FeeStatusChangeResult;
        portalPublished: boolean;
    }
    | { ok: false; status: number; error: string };

export async function generateLegalFeeInvoiceDocument(params: {
    caseId: string;
    /** Staff member, or null for the automation. */
    userId: string | null;
    input: LegalFeeInvoiceInput;
    /** `false` leaves the case's workflow status alone (automatic issue). */
    moveStatus?: boolean;
    /** Marks the document as raised by the automation (it may then also send it). */
    autoIssued?: boolean;
}): Promise<LegalFeeDocumentResult> {
    const { caseId, userId, input } = params;

    const existing = await prisma.case.findUnique({
        where: { id: caseId },
        select: { id: true, clientId: true, client: { select: { idNumber: true } } },
    });
    if (!existing) return { ok: false, status: 404, error: 'Case not found' };

    const created = await createLegalFeeInvoice({
        caseId: existing.id,
        clientId: existing.clientId,
        reference: existing.client.idNumber,
        createdById: userId,
        input,
    });
    if ('error' in created) return { ok: false, status: created.status, error: created.error };

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
    const uploadsDir = join(uploadsRoot(), caseId);
    await mkdir(uploadsDir, { recursive: true });
    const fileName = `${Date.now()}-${invoice.invoiceNumber}-legal-fee.pdf`;
    const storagePath = join(uploadsDir, fileName);
    await writeFile(storagePath, Buffer.from(pdfBytes));

    const displayName = `${invoice.invoiceNumber} Legal Fee Invoice.pdf`;
    const document = await prisma.document.create({
        data: {
            caseId,
            type: 'LEGAL_FEE_INVOICE',
            fileName: displayName,
            fileUrl: `/uploads/${caseId}/${fileName}`,
            fileSize: pdfBytes.length,
            mimeType: 'application/pdf',
            ...(userId ? { uploadedById: userId } : {}),
            // Links the PDF back to its Invoice so "Mark paid" can settle it.
            extractedData: JSON.stringify({
                feeInvoiceId: invoice.id,
                ...(params.autoIssued ? { autoIssued: true } : {}),
            }),
        },
    });

    const statusChange = await applyFeeDocumentStatus({
        caseId,
        docType: 'LEGAL_FEE_INVOICE',
        event: 'UPLOADED',
        userId,
        documentId: document.id,
        notes: `${params.autoIssued ? 'Automatically generated' : 'Generated'} legal fee invoice ${invoice.invoiceNumber} for R${Number(invoice.total).toFixed(2)}`,
        moveStatus: params.moveStatus,
        recordWhenUnchanged: true,
    });

    const portalPublished = await publishInvoiceToPortal({
        clientId: existing.clientId,
        displayName,
        storagePath,
        size: pdfBytes.length,
    });

    return {
        ok: true,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        total: Number(invoice.total),
        documentId: document.id,
        statusChange,
        portalPublished,
    };
}

/**
 * Put the invoice in the consumer's Crediva document vault (category INVOICE).
 * Best-effort and idempotent per file name: the invoice is already on the case
 * and about to be emailed, so a portal failure must never fail the invoice.
 * Returns whether the vault now holds it.
 */
export async function publishInvoiceToPortal(params: {
    clientId: string;
    displayName: string;
    storagePath: string;
    size: number;
}): Promise<boolean> {
    try {
        const provision = await provisionConsumerForClient(params.clientId);
        const consumerId = provision?.consumerId
            ?? (await prisma.consumerAccount.findUnique({ where: { linkedClientId: params.clientId }, select: { id: true } }))?.id;
        if (!consumerId) {
            logger.info({ clientId: params.clientId }, 'No Crediva profile for client — legal fee invoice not published to portal');
            return false;
        }

        const already = await prisma.credoDocument.findFirst({
            where: { consumerId, originalName: params.displayName, category: PORTAL_INVOICE_CATEGORY },
            select: { id: true },
        });
        if (already) return true;

        await prisma.credoDocument.create({
            data: {
                consumerId,
                fileName: params.storagePath.split(/[\\/]/).pop() ?? params.displayName,
                originalName: params.displayName,
                mimeType: 'application/pdf',
                size: params.size,
                category: PORTAL_INVOICE_CATEGORY,
                storagePath: params.storagePath,
            },
        });
        return true;
    } catch (error) {
        logger.error({ error, clientId: params.clientId }, 'Could not publish legal fee invoice to the Crediva portal');
        return false;
    }
}
