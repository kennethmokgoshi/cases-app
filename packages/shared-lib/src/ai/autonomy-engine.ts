
import { prisma } from '@zenowethu/database';
import { logger } from '../logger';

export type AIAutonomyLevel = 'MANUAL' | 'CO_PILOT' | 'AUTOPILOT';

export interface AutonomyDecision {
    shouldExecute: boolean;
    reason: string;
    level: AIAutonomyLevel;
}

/**
 * AI Autonomy Engine (Stage 3)
 * Governs whether an AI action should be executed immediately or queued for review
 */
export async function getAutonomyDecision(caseId: string, actionType: string): Promise<AutonomyDecision> {
    try {
        const caseRecord = await prisma.case.findUnique({
            where: { id: caseId },
            select: { aiAutonomyLevel: true }
        });

        const level = (caseRecord?.aiAutonomyLevel as AIAutonomyLevel) || 'CO_PILOT';

        if (level === 'AUTOPILOT') {
            return {
                shouldExecute: true,
                reason: 'Case is in Autopilot mode. Executing action automatically.',
                level
            };
        }

        if (level === 'MANUAL') {
            return {
                shouldExecute: false,
                reason: 'Case is in Manual mode. Action must be initiated by human.',
                level
            };
        }

        // Default: CO_PILOT
        return {
            shouldExecute: false,
            reason: 'Case is in Co-Pilot mode. Action requires human approval.',
            level
        };
    } catch (error) {
        logger.error({ err: error }, `Error getting autonomy decision for case ${caseId}`);
        return {
            shouldExecute: false,
            reason: 'Error checking autonomy level. Defaulting to safe review mode.',
            level: 'CO_PILOT'
        };
    }
}
