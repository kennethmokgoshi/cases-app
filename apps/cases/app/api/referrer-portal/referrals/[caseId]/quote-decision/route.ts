import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { createLogger, touchCaseAction } from '@zenowethu/shared-lib';
import { recordQuoteDecision } from '@zenowethu/shared-lib/src/finance/quote-case-sync';
import { z } from 'zod';
import { getCurrentReferrerPortalAccess } from '@/lib/referrer-portal-access';

const logger = createLogger('api/referrer-portal/quote-decision');

const QuoteDecisionSchema = z.object({
    decision: z.enum(['ACCEPT', 'REJECT']),
    notes: z.string().trim().max(1000).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
    try {
        const access = await getCurrentReferrerPortalAccess();
        if (access.ok !== true) return NextResponse.json({ error: access.error }, { status: access.status });

        const { caseId } = await params;

        // Verify case belongs to the referrer
        const referralCase = await prisma.case.findFirst({
            where: { id: caseId, referrerId: access.referrer.id, deletedAt: null },
            select: { id: true, fileNumber: true },
        });

        if (!referralCase) return NextResponse.json({ error: 'Referral not found' }, { status: 404 });

        const parsed = QuoteDecisionSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid decision payload', details: parsed.error.flatten() }, { status: 422 });
        }

        const { decision, notes } = parsed.data;

        // Find the latest active Quote on the case
        const quote = await prisma.invoice.findFirst({
            where: {
                caseId,
                type: 'QUOTE',
                status: 'SENT',
            },
            orderBy: { createdAt: 'desc' },
            select: { id: true, invoiceNumber: true, total: true },
        });

        if (!quote) {
            return NextResponse.json({ error: 'No active quote found for this client' }, { status: 404 });
        }

        // Call the shared sync helper
        const result = await recordQuoteDecision({
            quoteId: quote.id,
            decision: decision === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED',
            note: notes,
            userId: access.sessionUserId,
        });

        if (!result.ok) {
            return NextResponse.json({ error: result.error || 'Failed to record decision' }, { status: result.status || 500 });
        }

        // Create the CaseComment discussion thread update
        const statusLabel = decision === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED';
        const commentContent = `[SYSTEM AUTO-MESSAGE] Quote ${quote.invoiceNumber} (R ${Number(quote.total).toFixed(2)}) was ${statusLabel} by the referrer. Notes: ${notes || 'None'}`;
        const comment = await prisma.caseComment.create({
            data: {
                caseId,
                userId: access.sessionUserId,
                content: commentContent,
                type: 'REFERRER',
                isInternal: false,
                activityType: 'REFERRER_COMMENT',
            },
        });

        await touchCaseAction(caseId, 'COMMENT', { userId: access.sessionUserId });

        return NextResponse.json({
            success: true,
            decision: decision,
            quoteNumber: quote.invoiceNumber,
            comment: { id: comment.id, content: comment.content }
        }, { status: 201 });
    } catch (error) {
        logger.error('Failed to submit quote decision', error);
        return NextResponse.json({ error: 'Failed to record quote decision' }, { status: 500 });
    }
}
