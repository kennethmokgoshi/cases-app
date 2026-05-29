import { prisma, Prisma } from '@zenowethu/database';
import { logger } from '../logger';

export interface RunLoggerParams {
    type: string;
    caseId?: string;
    clientId?: string;
    triggeredById?: string;
    status: 'SUCCESS' | 'FAILED';
    startedAt: Date;
    logs?: Record<string, unknown>;
    errorMessage?: string;
}

/**
 * Log a completed automation run to the AutomationRun table so it appears
 * on the Automation Runs admin page.
 */
export async function logAutomationRun(params: RunLoggerParams): Promise<void> {
    try {
        await prisma.automationRun.create({
            data: {
                type: params.type,
                status: params.status,
                caseId: params.caseId ?? null,
                clientId: params.clientId ?? null,
                triggeredById: params.triggeredById ?? null,
                startedAt: params.startedAt,
                completedAt: new Date(),
                durationMs: Date.now() - params.startedAt.getTime(),
                logs: (params.logs ?? {}) as Prisma.InputJsonValue,
                errorMessage: params.errorMessage ?? null,
            },
        });
    } catch (err) {
        logger.error('[RunLogger] Failed to write AutomationRun record:', err);
    }
}
