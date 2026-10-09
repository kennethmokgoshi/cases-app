/**
 * Keep `Case.legalFeesStatus` in step with legal fee payments (server-only).
 *
 * Node-only (imports `prisma`). Import directly — do NOT re-export from the
 * package index. See `legal-fee-rules.ts` for the mapping.
 */

import { prisma } from '@zenowethu/database';
import { createLogger } from '../logger';
import { getCompanyProfile } from '../company/company-profile-service';
import { legalFeesStatusAfterPayment } from './legal-fee-rules';

const logger = createLogger('finance/legal-fees-status-sync');

/**
 * After a legal fee payment is recorded, move Legal Fees Status to Paying /
 * Fees Paid Cash / Debited. Totals come from the case's completed legal fee
 * payments against the invoice total (Company Profile fee when no invoice row).
 * Never throws — the payment is already saved.
 */
export async function syncLegalFeesStatusAfterPayment(params: {
    caseId: string;
    /** The Invoice row the payment settled, when there is one. */
    invoiceId?: string | null;
}): Promise<string | null> {
    const { caseId, invoiceId } = params;
    try {
        const [found, invoice, payments] = await Promise.all([
            prisma.case.findUnique({ where: { id: caseId }, select: { legalFeesStatus: true } }),
            invoiceId
                ? prisma.invoice.findUnique({ where: { id: invoiceId }, select: { total: true } })
                : Promise.resolve(null),
            prisma.payment.findMany({
                where: {
                    caseId,
                    status: 'COMPLETED',
                    OR: [{ category: 'LEGAL_FEE' }, ...(invoiceId ? [{ invoiceId }] : [])],
                },
                orderBy: { date: 'desc' },
                select: { amount: true, method: true },
            }),
        ]);
        if (!found || payments.length === 0) return null;

        const total = invoice ? Number(invoice.total) : (await getCompanyProfile()).legalFeeAmount;
        const next = legalFeesStatusAfterPayment({
            current: found.legalFeesStatus,
            method: payments[0].method,
            paid: payments.reduce((sum, p) => sum + Number(p.amount), 0),
            total,
        });
        if (!next) return null;

        await prisma.case.update({ where: { id: caseId }, data: { legalFeesStatus: next } });
        logger.info({ caseId, from: found.legalFeesStatus, to: next }, 'Legal Fees Status updated after payment');
        return next;
    } catch (error) {
        logger.error({ error, caseId }, 'Could not update Legal Fees Status after payment');
        return null;
    }
}
