import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@zenowethu/shared-lib';
import { auth } from '@zenowethu/shared-lib/src/auth';
import { resolveReferrerEmailForProject } from '@zenowethu/shared-lib/src/partners/branch-contact-service';

const logger = createLogger('api/projects/[id]/referrer-email');

/**
 * Email the new lead/case form pre-fills as the primary contact for a selected
 * project (referrer, partner branch or partner). `email: null` means the
 * consumer was not referred — nothing to pre-fill.
 */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { id } = await params;
        const result = await resolveReferrerEmailForProject(id);
        return NextResponse.json(result);
    } catch (error) {
        logger.error({ err: error }, 'Failed to resolve referrer email');
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
