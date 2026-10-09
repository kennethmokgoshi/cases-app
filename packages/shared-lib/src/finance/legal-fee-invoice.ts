/**
 * Legal fee invoice to the consumer — Prisma-backed persistence (server-only).
 *
 * Node-only (imports `prisma`). Import directly from this file in server route
 * handlers — do NOT re-export from the package index.
 *
 * The default legal fee comes from the Company Profile (`legalFeeAmount`,
 * R1,700 for Zenowethu) and is charged as the total — no VAT is added on top.
 * Staff may change the amount per invoice.
 * The org's default bank account is used for payment details.
 */

import { prisma, Prisma } from '@zenowethu/database';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { allocateDocumentNumber } from './document-number';
import { getCompanyProfile } from '../company/company-profile-service';

export const LegalFeeInvoiceInputSchema = z.object({
    /** Omit to use the Company Profile's legal fee. */
    amount: z.coerce.number().positive('Amount must be more than zero').max(1_000_000).optional(),
    description: z.string().trim().min(1).max(200).default('Legal fees'),
    dueInDays: z.coerce.number().int().min(0).max(90).default(7),
});
export type LegalFeeInvoiceInput = z.infer<typeof LegalFeeInvoiceInputSchema>;

export async function createLegalFeeInvoice(params: {
    caseId: string;
    clientId: string;
    /** Consumer ID number — used as the payment reference. */
    reference: string;
    /** Null when the automation raised it with no user available. */
    createdById: string | null;
    input: LegalFeeInvoiceInput;
}) {
    const { caseId, clientId, reference, createdById, input } = params;

    const defaultBank = await prisma.bankAccount.findFirst({ where: { isDefault: true, isActive: true } });
    if (!defaultBank) {
        return {
            ok: false as const,
            status: 500,
            error: 'No default banking details found. Please ask an administrator to set a default bank account.',
        };
    }

    const amount = input.amount ?? (await getCompanyProfile()).legalFeeAmount;

    const dueAt = new Date();
    dueAt.setDate(dueAt.getDate() + input.dueInDays);
    const lineItems = [{ description: input.description, quantity: 1, unitPrice: amount }];

    const invoice = await prisma.$transaction(async (tx) => {
        const invoiceNumber = await allocateDocumentNumber(tx, 'INV', new Date().getFullYear());
        return tx.invoice.create({
            data: {
                invoiceNumber,
                type: 'INVOICE',
                status: 'DRAFT',
                publicToken: randomUUID(),
                clientId,
                caseId,
                lineItems: lineItems as unknown as Prisma.InputJsonValue,
                subtotal: amount,
                vatRate: 0,
                vatAmount: 0,
                total: amount,
                dueAt,
                reference,
                notes: 'Legal fee invoice',
                bankAccountId: defaultBank.id,
                createdById,
            },
        });
    });

    return { ok: true as const, invoice };
}
