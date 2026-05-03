import { prisma } from '@zenowethu/database';
import { logger } from '../logger';
import { GhlService } from './ghl-service';

export class RetentionService {
    /**
     * Finds Letsatsi clients who were "Debt Review Removal" clients 
     * and settled their accounts exactly 9 months ago.
     * 
     * Tags them in GHL to trigger an automated re-engagement campaign.
     */
    static async syncLetsatsiFollowups() {
        // Calculate the date range for 9 months ago today
        const targetDate = new Date();
        targetDate.setMonth(targetDate.getMonth() - 9);
        
        const startOfDay = new Date(targetDate);
        startOfDay.setHours(0, 0, 0, 0);
        
        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);

        logger.info(`[Retention] Scanning for Letsatsi clients settled between ${startOfDay.toISOString()} and ${endOfDay.toISOString()}`);

        // We target clients from Letsatsi who had Flag Removal services and are now COMPLETED/CLOSED
        const cases = await prisma.case.findMany({
            where: {
                partnerName: {
                    contains: 'Letsatsi',
                    mode: 'insensitive'
                },
                status: {
                    in: ['COMPLETED', 'CLOSED', 'CL_CLEARED']
                },
                updatedAt: {
                    gte: startOfDay,
                    lte: endOfDay
                },
                services: {
                    contains: 'debt_review_flag_removal'
                }
            },
            include: {
                client: true
            }
        });

        logger.info(`[Retention] Found ${cases.length} eligible Letsatsi clients for 9-month follow-up`);

        const results = {
            success: 0,
            failed: 0,
            skipped: 0
        };

        for (const caseRecord of cases) {
            try {
                // We apply a specific tag in GHL which triggers a Workflow in their system
                const res = await GhlService.applyTags(caseRecord.id, ['LETSATSI_9MONTH_FOLLOWUP']);
                
                if (res.success) {
                    results.success++;
                    logger.info(`[Retention] Tagged client ${caseRecord.client.firstName} ${caseRecord.client.lastName} (File: ${caseRecord.fileNumber})`);
                } else {
                    results.failed++;
                    logger.error(`[Retention] Failed to tag case ${caseRecord.id}: ${res.error}`);
                }
            } catch (err) {
                results.failed++;
                logger.error(`[Retention] Exception tagging case ${caseRecord.id}:`, err);
            }
        }

        return {
            date: targetDate.toISOString().split('T')[0],
            found: cases.length,
            ...results
        };
    }
}
