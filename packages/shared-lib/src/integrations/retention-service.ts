import { prisma } from '@zenowethu/database';
import { GhlService } from './ghl-service';
import { logger } from '../logger';
import { subMonths, startOfDay, endOfDay } from 'date-fns';

/**
 * Retention Service
 * 
 * Handles automated follow-ups for existing clients to generate repeat business.
 */
export class RetentionService {
    /**
     * Finds Letsatsi clients who settled 9 months ago and tags them in GHL for a check-in.
     */
    static async syncLetsatsiFollowups() {
        logger.info('[Retention Service] Starting Letsatsi 9-month follow-up sync...');

        // 1. Calculate the target date (9 months ago)
        // We look for anything settled in that window
        const targetDate = subMonths(new Date(), 9);
        const start = startOfDay(targetDate);
        const end = endOfDay(targetDate);

        // 2. Find cases
        const cases = await prisma.case.findMany({
            where: {
                partnerName: 'Letsatsi',
                status: { in: ['COMPLETED', 'SETTLED', 'CLOSED'] },
                updatedAt: {
                    gte: start,
                    lte: end
                }
            },
            include: {
                client: true
            }
        });

        logger.info(`[Retention Service] Found ${cases.length} cases settled 9 months ago.`);

        let successCount = 0;
        let skipCount = 0;

        // 3. Sync to GHL
        for (const c of cases) {
            try {
                const res = await GhlService.applyTags(c.id, ['Letsatsi_9Month_Checkin']);
                if (res.success) {
                    successCount++;
                } else {
                    logger.warn(`[Retention Service] Failed to tag case ${c.id}: ${res.error}`);
                    skipCount++;
                }
            } catch (err) {
                logger.error(`[Retention Service] Error processing case ${c.id}:`, err);
                skipCount++;
            }
        }

        logger.info(`[Retention Service] Sync complete. Success: ${successCount}, Failed/Skipped: ${skipCount}`);
        
        return {
            success: true,
            processed: cases.length,
            synced: successCount,
            failed: skipCount
        };
    }
}
