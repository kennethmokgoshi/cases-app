import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger } from '@zenowethu/shared-lib';

const logger = createLogger('api/admin/automations/retry');

export async function POST(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const runId = params.id;
        if (!runId) {
            return NextResponse.json({ error: 'Missing run ID' }, { status: 400 });
        }

        const run = await prisma.automationRun.findUnique({
            where: { id: runId }
        });

        if (!run) {
            return NextResponse.json({ error: 'Run not found' }, { status: 404 });
        }

        if (run.status !== 'FAILED') {
            return NextResponse.json({ error: 'Only failed runs can be retried' }, { status: 400 });
        }

        // Increment retry count and set to RETRYING
        const updatedRun = await prisma.automationRun.update({
            where: { id: runId },
            data: {
                status: 'RETRYING',
                retryCount: { increment: 1 },
                nextRetryAt: null,
                errorMessage: null, // clear previous error
                updatedAt: new Date()
            }
        });

        // Normally here we would dispatch to an event bus or background worker
        // For now, we will log the dispatch. Real implementation will hook into the specific service.
        logger.info(`Dispatched retry for automation run ${runId} of type ${run.type}`);

        return NextResponse.json(updatedRun);
    } catch (error) {
        logger.error(`Error retrying automation run ${params.id}:`, error);
        return NextResponse.json({ error: 'Failed to retry automation run' }, { status: 500 });
    }
}
