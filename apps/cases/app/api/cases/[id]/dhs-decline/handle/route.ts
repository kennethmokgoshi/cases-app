import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { handleDHSDecline, classifyDeclineReason, extractEmailFromReason } from '@zenowethu/shared-lib/src/dhs';
import { prisma } from '@zenowethu/database';
import { z } from 'zod';

const logger = createLogger('api/cases/[id]/dhs-decline/handle');

const BodySchema = z.object({
    declineReason: z.string().min(1, 'Decline reason is required'),
});

/**
 * POST /api/cases/[id]/dhs-decline/handle
 *
 * Staff-triggered endpoint to (re-)process a DHS decline reason.
 * Classifies the reason and sends the appropriate automated response.
 *
 * Body: { declineReason: string }
 * Returns: { category, actionsPerformed, errors, emailSent, smsSent, whatsappSent }
 */
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: caseId } = await params;

        const body = await request.json();
        const parsed = BodySchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.errors[0]?.message || 'Invalid request body' },
                { status: 400 }
            );
        }

        const { declineReason } = parsed.data;

        // Verify the case exists
        const caseData = await prisma.case.findUnique({
            where: { id: caseId },
            select: { id: true, fileNumber: true },
        });
        if (!caseData) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        // Show preview of what will happen without executing (if ?preview=true)
        const { searchParams } = new URL(request.url);
        if (searchParams.get('preview') === 'true') {
            const category = classifyDeclineReason(declineReason);
            const extractedEmail = extractEmailFromReason(declineReason);
            return NextResponse.json({
                preview: true,
                category,
                extractedEmail,
                description: getCategoryDescription(category, extractedEmail),
            });
        }

        logger.info(`[Decline Handle] Staff triggered for case ${caseData.fileNumber} by user ${session.user.id}`);

        const result = await handleDHSDecline({
            caseId,
            declineReason,
            triggeredByUserId: session.user.id,
        });

        return NextResponse.json({
            success: result.errors.length === 0,
            category: result.category,
            actionsPerformed: result.actionsPerformed,
            errors: result.errors,
            emailSent: result.emailSent,
            smsSent: result.smsSent,
            whatsappSent: result.whatsappSent,
            statusUpdatedTo: result.statusUpdatedTo,
            extractedEmail: result.extractedEmail,
        });
    } catch (error) {
        logger.error('Error handling DHS decline:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

function getCategoryDescription(
    category: string,
    extractedEmail: string | null
): string {
    const emailHint = extractedEmail ? ` to ${extractedEmail}` : ' to the DC email on file';
    switch (category) {
        case 'SEND_DOCS':
            return `Will email POA + ID${emailHint} and update status to Rejected - Email Documents → Documents Emailed`;
        case 'SEND_DOCS_WITH_NCR':
            return `Will email POA + ID + NCR Certificate${emailHint} and update status to Rejected - Email Documents → Documents Emailed`;
        case 'CLIENT_CONSENT_NEEDED':
            return 'Will notify the consumer via Email + WhatsApp/SMS to contact their DC for consent. Status → Consumer Contacted DC';
        case 'OUTSTANDING_FEES':
            return 'Will notify the consumer of outstanding fees and update status to Rejected - Owes Fees';
        case 'CONTACT_ATTORNEY':
            return extractedEmail
                ? `Will email the attorney at ${extractedEmail} with transfer documentation`
                : 'Attorney involvement required — no email found in decline text. Manual contact needed.';
        case 'RESUBMIT_LATER':
            return 'Will set next update to +7 working days. No external action required.';
        default:
            return 'Could not classify this decline reason. Staff review required.';
    }
}
