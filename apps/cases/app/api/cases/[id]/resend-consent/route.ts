import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { createLogger } from '@zenowethu/shared-lib';
import { auth } from '@zenowethu/shared-lib/src/auth';
import { handleDhsAccepted, isManageConsumersEligible } from '@zenowethu/shared-lib/src/dhs/accepted-handler';

const logger = createLogger('api/cases/[id]/resend-consent');

/**
 * POST /api/cases/[id]/resend-consent — the "Resend Confirmation Link" button.
 *
 * Sends the consumer the debt-review-removal consent REMINDER email (the
 * login-gated Credo confirmation link with ID-number login instructions) — worded
 * as a reminder that flag removal cannot continue without their consent, NOT as a
 * fresh "transfer accepted" announcement. Reuses the existing consent token so
 * links already in the consumer's inbox stay valid; issues a new link if the old
 * one expired. If the consumer has already consented, nothing is sent and the
 * response says so. No Puppeteer/DHS session involved — email only.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user || session.user.userType === 'B2B_PARTNER') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: caseId } = await params;
        const caseData = await prisma.case.findUnique({
            where: { id: caseId },
            select: { id: true, status: true, dhsStatus: true, manuallyAcceptedViaDhs: true },
        });
        if (!caseData) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        // Same gate as the Manage Consumers button — the confirmation link only
        // makes sense once the file is Accepted via DHS.
        if (!isManageConsumersEligible(caseData)) {
            return NextResponse.json({
                success: false,
                message: `The confirmation link can only be sent once the file is Accepted via DHS. Current status: ${caseData.dhsStatus || caseData.status || 'unknown'}.`,
            });
        }

        logger.info(`[Resend Consent] Staff ${session.user.id} requested a resend for case ${caseId}`);
        const result = await handleDhsAccepted({
            caseId,
            triggeredByUserId: session.user.id,
            forceResend: true,
        });

        const message = result.errors.length
            ? `Resend failed: ${result.errors.join(', ')}`
            : result.skipped
                ? (result.reason === 'Consumer has already consented'
                    ? 'The consumer has already confirmed — no email was sent.'
                    : result.reason || 'No email was sent.')
                : result.emailSent
                    ? 'Consent reminder sent to the consumer — it makes clear the flag removal cannot continue until they approve. The existing secure link remains valid.'
                    : 'No email was sent.';

        return NextResponse.json({
            success: result.errors.length === 0,
            emailSent: result.emailSent,
            skipped: result.skipped,
            alreadyConsented: result.reason === 'Consumer has already consented',
            consentLink: result.consentLink,
            message,
        });
    } catch (error) {
        logger.error('[Resend Consent] Route error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
