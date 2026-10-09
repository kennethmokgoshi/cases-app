import { NextResponse } from 'next/server';
import { createLogger } from '@zenowethu/shared-lib';
import { requireStaff } from '@zenowethu/shared-lib/src/auth/route-guards';
import {
    RepossessionEnquiryInputSchema,
    prepareRepossessionEnquiry,
    processRepossessionEnquiry,
    type RepossessionEnquiryFailure,
} from '@zenowethu/shared-lib/src/financer';

const logger = createLogger('api/cases/[id]/repossession-enquiry');

const FAILURE_STATUS: Record<RepossessionEnquiryFailure, number> = {
    CASE_NOT_FOUND: 404,
    ACCOUNT_NOT_FOUND: 400,
    MANDATE_INCOMPLETE: 422,
    SEND_FAILED: 502,
};

/** Data for the "Repossession Enquiry" modal: accounts to choose from + POA/ID status. */
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const guard = await requireStaff();
    if (guard.response) return guard.response;

    try {
        const { id } = await params;
        const context = await prepareRepossessionEnquiry(id);
        if (!context) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }
        return NextResponse.json(context);
    } catch (error) {
        logger.error({ error }, 'Failed to prepare repossession enquiry');
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

/** `action: "preview"` returns the letter unsent; `action: "send"` sends it. */
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const guard = await requireStaff();
    if (guard.response || !guard.user) return guard.response;

    try {
        const { id } = await params;
        const parsed = RepossessionEnquiryInputSchema.safeParse(await request.json().catch(() => ({})));
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
                { status: 400 }
            );
        }

        const result = await processRepossessionEnquiry({
            caseId: id,
            input: parsed.data,
            actorUserId: guard.user.id,
        });

        if (!result.ok) {
            return NextResponse.json(
                {
                    error: result.error,
                    failure: result.failure,
                    missingMandate: result.missingMandate ?? [],
                },
                { status: FAILURE_STATUS[result.failure ?? 'SEND_FAILED'] }
            );
        }

        return NextResponse.json({
            success: true,
            sent: result.sent,
            letter: result.letter,
            mandateSummary: result.mandateSummary,
        });
    } catch (error) {
        logger.error({ error }, 'Failed to process repossession enquiry');
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
