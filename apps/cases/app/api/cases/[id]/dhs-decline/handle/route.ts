import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import {
    handleDHSDecline,
    classifyDeclineReasonSmart,
    extractEmailFromReason,
    findPriorDocsEmail,
    decideDocsResend,
} from '@zenowethu/shared-lib/src/dhs';
import { prisma } from '@zenowethu/database';
import { searchConsumerAcrossMailboxes } from '@/lib/mailbox-search';
import { z } from 'zod';

const logger = createLogger('api/cases/[id]/dhs-decline/handle');

const BodySchema = z.object({
    declineReason: z.string().min(1, 'Decline reason is required'),
    // Staff "Resend anyway" — bypasses the already-handled guard.
    forceResend: z.boolean().optional().default(false),
    // For SEND_DOCS declines: when the sent log shows nothing, also scan the
    // connected inboxes before sending. Defaults on.
    deepInboxCheck: z.boolean().optional().default(true),
});

const DOCS_CATEGORIES = new Set(['SEND_DOCS', 'SEND_DOCS_WITH_NCR']);

/**
 * POST /api/cases/[id]/dhs-decline/handle
 *
 * Staff-triggered endpoint to (re-)process a DHS decline reason. Classifies the
 * reason and sends the appropriate automated response.
 *
 * For SEND_DOCS / SEND_DOCS_WITH_NCR declines it first checks whether the
 * document email was already sent for this decline — our sent record
 * (NotificationLog) first, then the connected inboxes — and, unless the file is
 * overdue, stops and reports it instead of re-sending. Pass `forceResend: true`
 * to override.
 *
 * Body: { declineReason: string, forceResend?: boolean, deepInboxCheck?: boolean }
 */
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if (session.user.userType === 'B2B_PARTNER') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { id: caseId } = await params;

        const body = await request.json().catch(() => null);
        const parsed = BodySchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0]?.message || 'Invalid request body' },
                { status: 400 }
            );
        }
        const { declineReason, forceResend, deepInboxCheck } = parsed.data;

        const caseData = await prisma.case.findUnique({
            where: { id: caseId },
            select: {
                id: true,
                fileNumber: true,
                createdAt: true,
                nextUpdate: true,
                declineFirstDetectedAt: true,
                declineLastDetectedAt: true,
                preferredDcEmail: true,
                lastKnownEmail: true,
                dcEmail: true,
                client: {
                    select: { idNumber: true, firstName: true, lastName: true },
                },
            },
        });
        if (!caseData) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        const classification = await classifyDeclineReasonSmart(declineReason);
        const category = classification.category;

        // Preview mode: classify without executing (?preview=true)
        const { searchParams } = new URL(request.url);
        if (searchParams.get('preview') === 'true') {
            const extractedEmail = extractEmailFromReason(declineReason);
            return NextResponse.json({
                preview: true,
                category,
                classificationSource: classification.source,
                classificationConfidence: classification.confidence,
                classificationReasoning: classification.reasoning,
                extractedEmail,
                description: getCategoryDescription(category, extractedEmail),
            });
        }

        // ── Already-handled guard (SEND_DOCS categories only) ────────────────
        if (DOCS_CATEGORIES.has(category) && !forceResend) {
            const since =
                caseData.declineFirstDetectedAt ??
                caseData.declineLastDetectedAt ??
                caseData.createdAt;
            const dcEmail =
                caseData.preferredDcEmail || caseData.lastKnownEmail || caseData.dcEmail || null;

            // Stage 1: our sent record.
            const prior = await findPriorDocsEmail({ caseId, dcEmail, since });
            let source: 'NOTIFICATION_LOG' | 'INBOX' | null = prior.found ? 'NOTIFICATION_LOG' : null;
            let handledAt: Date | null = prior.sentAt;
            let inboxMatches: { mailbox: string; from: string; subject: string; date: string | null }[] = [];

            // Stage 2: connected inboxes, only when the sent record shows nothing.
            if (!prior.found && deepInboxCheck) {
                const sweep = await searchConsumerAcrossMailboxes({
                    userId: session.user.id,
                    idNumber: caseData.client.idNumber,
                    firstName: caseData.client.firstName,
                    lastName: caseData.client.lastName,
                    since,
                    limitPerMailbox: 25,
                });
                if (sweep.matches.length > 0) {
                    source = 'INBOX';
                    handledAt = sweep.matches[0].date ? new Date(sweep.matches[0].date) : null;
                    inboxMatches = sweep.matches.slice(0, 10).map((m) => ({
                        mailbox: m.mailbox,
                        from: m.from,
                        subject: m.subject,
                        date: m.date,
                    }));
                }
            }

            const decision = decideDocsResend({
                prior: { found: source !== null, sentAt: handledAt, recipient: prior.recipient },
                nextUpdate: caseData.nextUpdate ?? null,
                forceResend: false,
            });

            if (source && !decision.send) {
                // Already handled and file not overdue — do not resend.
                logger.info(
                    `[Decline Handle] Already handled (${source}) for case ${caseData.fileNumber} — not resending (not overdue)`
                );
                return NextResponse.json({
                    success: true,
                    category,
                    alreadyHandled: true,
                    alreadyHandledSource: source,
                    alreadyHandledAt: handledAt,
                    canResend: true,
                    overdue: decision.overdue,
                    inboxMatches,
                    actionsPerformed: [],
                    errors: [],
                    message:
                        source === 'NOTIFICATION_LOG'
                            ? `The document email was already sent${prior.recipient ? ` to ${prior.recipient}` : ''} for this decline. The file is not overdue, so it was not resent. Use "Resend anyway" to override.`
                            : `Found ${inboxMatches.length} related email(s) in the connected inbox(es) for this consumer since the decline. Nothing was resent. Review below, or use "Resend anyway".`,
                });
            }
            // source && overdue → fall through and resend (a chase is warranted).
        }

        logger.info(
            `[Decline Handle] Executing for case ${caseData.fileNumber} by user ${session.user.id} (force=${forceResend})`
        );

        const result = await handleDHSDecline({
            caseId,
            declineReason,
            triggeredByUserId: session.user.id,
            forceResend,
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
            skippedAsDuplicate: result.skippedAsDuplicate,
            alreadyHandled: result.skippedAsDuplicate,
            alreadyHandledSource: result.skippedAsDuplicate ? 'NOTIFICATION_LOG' : null,
            alreadyHandledAt: result.alreadyHandledAt,
            canResend: result.skippedAsDuplicate,
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
            return `Will email POA + ID${emailHint} and update status to Rejected - Email Documents → Documents Emailed (skips if already sent for this decline and not overdue)`;
        case 'SEND_DOCS_WITH_NCR':
            return `Will email POA + ID + NCR Certificate${emailHint} and update status to Rejected - Email Documents → Documents Emailed (skips if already sent for this decline and not overdue)`;
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
