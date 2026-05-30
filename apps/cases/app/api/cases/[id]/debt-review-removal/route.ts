import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { assessCaseForRemoval } from '@zenowethu/shared-lib/src/debt-review-removal/trigger';

const logger = createLogger('api/cases/[id]/debt-review-removal');

/**
 * GET /api/cases/[id]/debt-review-removal
 *
 * Returns a debt review removal assessment for the given case.
 * Staff can call this to understand whether a case is ready for DHS removal,
 * which documents are present/missing, and what the recommended path is.
 */
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: caseId } = await params;

        const assessment = await assessCaseForRemoval(caseId);

        if (!assessment) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        return NextResponse.json({ assessment });
    } catch (error) {
        logger.error('Error assessing case for debt review removal:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
