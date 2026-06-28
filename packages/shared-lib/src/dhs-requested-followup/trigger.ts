/**
 * Requested-via-DHS Follow-up Automation
 *
 * Target cohort: OVERDUE files whose service list includes Debt Review Flag Removal
 * and whose status is exactly REQUESTED_VIA_DHS.
 *
 * ⚠️ By design this EXCLUDES the look-alike status DHS_REQUESTED. A separate
 * automation will later cover DHS_REQUESTED (the two are operationally the same
 * "transfer request pending" state, but the business asked to roll them out
 * separately). See COHORT_STATUS below.
 *
 * For each file the automation re-checks the DHS transfer status and routes:
 *   • ACCEPTED / AUTO_TRANSFERRED → status → ACCEPTED_VIA_DHS (staff take it from there)
 *   • DECLINED                    → handleDHSDecline() (classify + email/SMS/status)
 *   • PENDING                     → nextUpdate +3 working days, system comment
 *   • NOT_LINKED / NOT_REQUESTED  → system comment, left for staff review
 *
 * dryRun mode performs NO live DHS check, NO message sends and NO DB writes.
 * Instead it renders, per file, exactly what the DECLINE path WOULD send
 * (using a representative decline reason) so staff can review copy before going
 * live. See previewDHSDecline().
 */

import { prisma } from '@zenowethu/database';
import { createLogger } from '../logger';
import { checkTransferStatus, closeBrowser } from '../dhs';
import { handleDHSDecline } from '../dhs/decline-handler';
import { previewDHSDecline, type DeclinePreview } from '../dhs/decline-preview';
import { getAutomationUserId } from '../automation/automation-user';
import { updateCaseStatus, setNextUpdate, addSystemComment } from '../automation/workflow-engine';

const logger = createLogger('dhs-requested-followup');

export const FLAG_REMOVAL_SERVICE = 'debt_review_flag_removal';
/** This automation deliberately covers ONLY this status — NOT the DHS_REQUESTED look-alike. */
export const COHORT_STATUS = 'REQUESTED_VIA_DHS';
const DHS_TIMEOUT_MS = 90000;
const PENDING_RETRY_DAYS = 3;

/** Representative decline reason used only to render dry-run previews (most common real-world category). */
export const SAMPLE_DECLINE_REASON =
    'No transfer documents received. Please send a recent signed and dated POA and a copy of the consumer ID.';

export type FollowupOutcome =
    | 'PREVIEW'
    | 'ACCEPTED'
    | 'DECLINED'
    | 'STILL_PENDING'
    | 'NOT_ON_DHS'
    | 'TIMEOUT'
    | 'ERROR';

export interface FollowupFileResult {
    caseId: string;
    fileNumber: string;
    clientName: string;
    outcome: FollowupOutcome;
    /** Status the file would move to / moved to. */
    statusChange: string | null;
    message: string;
    /** dry-run only: full preview of the decline-handling messages. */
    declinePreview?: DeclinePreview;
}

export interface FollowupRunResult {
    dryRun: boolean;
    cohortStatus: string;
    cohortCount: number;
    stats: {
        accepted: number;
        declined: number;
        stillPending: number;
        notOnDhs: number;
        previewed: number;
        errors: number;
    };
    files: FollowupFileResult[];
}

interface CohortCase {
    id: string;
    fileNumber: string;
    client: { firstName: string; lastName: string; idNumber: string };
}

/** Fetch the overdue + flag-removal + REQUESTED_VIA_DHS cohort. */
export async function getRequestedViaDhsCohort(limit?: number): Promise<CohortCase[]> {
    return prisma.case.findMany({
        where: {
            deletedAt: null,
            isOverdue: true,
            status: COHORT_STATUS,
            services: { contains: FLAG_REMOVAL_SERVICE },
        },
        select: {
            id: true,
            fileNumber: true,
            client: { select: { firstName: true, lastName: true, idNumber: true } },
        },
        orderBy: { statusEntryDate: 'asc' },
        ...(limit ? { take: limit } : {}),
    });
}

export async function runRequestedViaDhsFollowup(opts: {
    dryRun?: boolean;
    limit?: number;
    sampleDeclineReason?: string;
} = {}): Promise<FollowupRunResult> {
    const dryRun = opts.dryRun ?? false;
    const sampleReason = opts.sampleDeclineReason ?? SAMPLE_DECLINE_REASON;

    const cohort = await getRequestedViaDhsCohort(opts.limit);
    const result: FollowupRunResult = {
        dryRun,
        cohortStatus: COHORT_STATUS,
        cohortCount: cohort.length,
        stats: { accepted: 0, declined: 0, stillPending: 0, notOnDhs: 0, previewed: 0, errors: 0 },
        files: [],
    };

    logger.info(`[DHS_FOLLOWUP] ${cohort.length} file(s) in cohort (dryRun=${dryRun})`);

    const adminId = dryRun ? undefined : (await getAutomationUserId()) ?? undefined;

    for (const c of cohort) {
        const clientName = `${c.client.firstName} ${c.client.lastName}`.trim();
        const base = { caseId: c.id, fileNumber: c.fileNumber, clientName };

        // ── DRY RUN: render the decline path preview, touch nothing ──
        if (dryRun) {
            try {
                const declinePreview = await previewDHSDecline({ caseId: c.id, declineReason: sampleReason });
                result.stats.previewed++;
                result.files.push({
                    ...base,
                    outcome: 'PREVIEW',
                    statusChange: declinePreview.statusWouldUpdateTo,
                    message:
                        `Would re-check DHS. If ACCEPTED → ACCEPTED_VIA_DHS. ` +
                        `If PENDING → nextUpdate +${PENDING_RETRY_DAYS} working days. ` +
                        `If DECLINED → handle decline (preview below, using a representative reason).`,
                    declinePreview,
                });
            } catch (err) {
                result.stats.errors++;
                result.files.push({ ...base, outcome: 'ERROR', statusChange: null, message: errMsg(err) });
            }
            continue;
        }

        // ── LIVE: re-check DHS and route ──
        try {
            const check = await withTimeout(() => checkTransferStatus(c.client.idNumber));
            if (!check) {
                result.stats.errors++;
                await setNextUpdate(c.id, PENDING_RETRY_DAYS, adminId).catch(() => null);
                result.files.push({ ...base, outcome: 'TIMEOUT', statusChange: null, message: 'DHS check timed out' });
                continue;
            }

            if (check.status === 'ACCEPTED' || check.status === 'AUTO_TRANSFERRED') {
                await updateCaseStatus(c.id, 'ACCEPTED_VIA_DHS', adminId);
                await addSystemComment(c.id, `[AUTO] Requested-via-DHS follow-up: Transfer ACCEPTED on DHS. Status → Accepted via DHS.`, adminId);
                result.stats.accepted++;
                result.files.push({ ...base, outcome: 'ACCEPTED', statusChange: 'ACCEPTED_VIA_DHS', message: 'Transfer accepted on DHS' });
                continue;
            }

            if (check.status === 'DECLINED') {
                const reason = check.declineReason || 'No decline reason captured on DHS';
                const handled = await handleDHSDecline({ caseId: c.id, declineReason: reason, triggeredByUserId: adminId });
                result.stats.declined++;
                result.files.push({
                    ...base,
                    outcome: 'DECLINED',
                    statusChange: handled.statusUpdatedTo,
                    message: `Declined (${handled.category}). Actions: ${handled.actionsPerformed.join('; ') || 'none'}${handled.errors.length ? ` | errors: ${handled.errors.join('; ')}` : ''}`,
                });
                continue;
            }

            if (check.status === 'PENDING') {
                await setNextUpdate(c.id, PENDING_RETRY_DAYS, adminId);
                await addSystemComment(c.id, `[AUTO] Requested-via-DHS follow-up: Transfer still PENDING on DHS (${check.daysCounter || 'New'}). Next update +${PENDING_RETRY_DAYS} working days.`, adminId);
                result.stats.stillPending++;
                result.files.push({ ...base, outcome: 'STILL_PENDING', statusChange: null, message: `Still pending (${check.daysCounter || 'New'})` });
                continue;
            }

            // NOT_LINKED / NOT_REQUESTED — surface for staff, don't silently flip status
            await addSystemComment(c.id, `[AUTO] Requested-via-DHS follow-up: DHS now reports "${check.status}" for a file we had as Requested via DHS. Staff to review.`, adminId);
            result.stats.notOnDhs++;
            result.files.push({ ...base, outcome: 'NOT_ON_DHS', statusChange: null, message: `DHS reports ${check.status} — flagged for staff` });
        } catch (err) {
            result.stats.errors++;
            await setNextUpdate(c.id, PENDING_RETRY_DAYS, adminId).catch(() => null);
            logger.error(`[DHS_FOLLOWUP] Error on ${c.fileNumber}:`, err);
            result.files.push({ ...base, outcome: 'ERROR', statusChange: null, message: errMsg(err) });
        }
    }

    if (!dryRun) {
        await closeBrowser().catch(() => null);
    }

    logger.info('[DHS_FOLLOWUP] Complete:', result.stats);
    return result;
}

function errMsg(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

async function withTimeout<T>(fn: () => Promise<T>): Promise<T | null> {
    try {
        return await Promise.race([
            fn(),
            new Promise<null>(resolve => setTimeout(() => resolve(null), DHS_TIMEOUT_MS)),
        ]);
    } catch (err) {
        logger.error('[DHS_FOLLOWUP] DHS operation error:', err);
        return null;
    }
}
