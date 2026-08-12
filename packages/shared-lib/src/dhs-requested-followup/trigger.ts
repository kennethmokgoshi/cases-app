/**
 * Requested-via-DHS Follow-up Automation
 *
 * Target cohort: every OVERDUE file that is sitting on DHS awaiting a transfer
 * outcome — i.e. status REQUESTED_VIA_DHS *or* DHS_REQUESTED, across all
 * services. Both statuses mean the same thing operationally; DHS_REQUESTED is
 * what /api/dhs/transfer writes, REQUESTED_VIA_DHS is the workflow-engine one.
 *
 * ⚠️ DHS_REQUESTED is NOT present in WORKFLOW_STATUSES, so it carries no SLA and
 * overdue-scan can never set `isOverdue` on it. Overdue is therefore evaluated
 * as: isOverdue flag OR nextUpdate elapsed OR statusEntryDate older than
 * FALLBACK_OVERDUE_DAYS. Without the fallback the DHS_REQUESTED files would be
 * invisible to this automation. See isOverdueWhere().
 *
 * For each file the automation re-checks the DHS transfer status and routes:
 *   • ACCEPTED / AUTO_TRANSFERRED → status → ACCEPTED_VIA_DHS (staff take it from there)
 *   • DECLINED                    → depends on declineMode (see DeclineMode below):
 *                                   'review' (default) classifies + flags staff, sends NOTHING;
 *                                   'auto' runs handleDHSDecline() (emails/SMS/status).
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
import { handleDHSDecline, classifyDeclineReason } from '../dhs/decline-handler';
import { previewDHSDecline, type DeclinePreview } from '../dhs/decline-preview';
import { getAutomationUserId } from '../automation/automation-user';
import { updateCaseStatus, setNextUpdate, addSystemComment } from '../automation/workflow-engine';

const logger = createLogger('dhs-requested-followup');

/** Optional service filter — pass as `service` to narrow to Debt Review Flag Removal files only. */
export const FLAG_REMOVAL_SERVICE = 'debt_review_flag_removal';

/** Both statuses that mean "a transfer request is pending an outcome on DHS". */
export const COHORT_STATUSES = ['REQUESTED_VIA_DHS', 'DHS_REQUESTED'] as const;

/**
 * Fallback overdue window in calendar days, for cohort statuses that carry no SLA
 * in WORKFLOW_STATUSES (DHS_REQUESTED is absent from the registry entirely, so
 * overdue-scan never flags it). Mirrors the 7-day SLA REQUESTED_VIA_DHS carries.
 */
export const FALLBACK_OVERDUE_DAYS = 7;

const DHS_TIMEOUT_MS = 90000;
const PENDING_RETRY_DAYS = 3;

/**
 * How DECLINED outcomes are handled.
 *   'review' — classify and flag for staff; sends NOTHING. Default, because a
 *              DHS "decline" is frequently a false positive or an under-review
 *              state, and the auto path emails and SMSes the consumer directly.
 *   'auto'   — run the full handleDHSDecline() response (emails/SMS/status).
 */
export type DeclineMode = 'review' | 'auto';
export const DEFAULT_DECLINE_MODE: DeclineMode = 'review';

/** Marker written into the review comment so repeat runs can recognise their own work. */
export const DECLINE_REVIEW_MARKER = '[DHS DECLINE — AWAITING STAFF REVIEW]';

/**
 * How long a flagged-for-review file is left alone before it is re-checked.
 * Prevents a file staff haven't actioned from being re-notified — and from
 * burning a 90s DHS check — on every single run.
 */
export const REVIEW_COOLDOWN_DAYS = 14;

/** Representative decline reason used only to render dry-run previews (most common real-world category). */
export const SAMPLE_DECLINE_REASON =
    'No transfer documents received. Please send a recent signed and dated POA and a copy of the consumer ID.';

export type FollowupOutcome =
    | 'PREVIEW'
    | 'ACCEPTED'
    | 'DECLINED'
    /** Declined, classified and flagged for staff — nothing sent (review mode). */
    | 'DECLINED_REVIEW'
    /** Already flagged for review and still inside the cooldown — not re-checked. */
    | 'SKIPPED_AWAITING_REVIEW'
    | 'STILL_PENDING'
    | 'NOT_ON_DHS'
    | 'TIMEOUT'
    | 'ERROR';

export interface FollowupFileResult {
    caseId: string;
    fileNumber: string;
    clientName: string;
    /** Cohort status the file was picked up in (REQUESTED_VIA_DHS or DHS_REQUESTED). */
    previousStatus: string;
    outcome: FollowupOutcome;
    /** Status the file would move to / moved to. */
    statusChange: string | null;
    message: string;
    /** dry-run only: full preview of the decline-handling messages. */
    declinePreview?: DeclinePreview;
}

export interface FollowupRunResult {
    dryRun: boolean;
    cohortStatuses: string[];
    /** Service the cohort was narrowed to, or null when all services are included. */
    cohortService: string | null;
    cohortCount: number;
    declineMode: DeclineMode;
    stats: {
        accepted: number;
        /** Declines that were actioned — messages sent. Always 0 in review mode. */
        declined: number;
        /** Declines classified and flagged for staff, nothing sent. */
        declinedForReview: number;
        /** Files left alone because they are already awaiting staff review. */
        skippedAwaitingReview: number;
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
    status: string;
    client: { firstName: string; lastName: string; idNumber: string };
}

export interface CohortOptions {
    limit?: number;
    /** Defaults to both "requested via DHS" statuses. */
    statuses?: readonly string[];
    /** Narrow to a single service (e.g. FLAG_REMOVAL_SERVICE). Default: all services. */
    service?: string | null;
    /** Overrides the fallback overdue window for statuses that carry no SLA. */
    overdueDays?: number;
}

/**
 * "Due for a DHS re-check" for this cohort.
 *
 * DHS_REQUESTED has no SLA entry, so overdue-scan never sets `isOverdue` on it —
 * hence the isOverdue flag alone is not enough and we fall back to how long the
 * file has sat in the status.
 *
 * `nextUpdate` is the throttle and MUST win: a file the automation has just
 * actioned is scheduled forward, and it stays out of the cohort until that date
 * passes. An earlier version OR-ed the stale-statusEntryDate check in
 * unconditionally, which meant any file older than the window matched on every
 * single run no matter how recently it had been handled — the cohort never
 * drained and each run re-spent a DHS check on the same files.
 *
 * Due when:  nextUpdate has passed
 *        OR  nextUpdate was never set AND (flagged overdue OR sat too long)
 */
function isDueWhere(overdueDays: number) {
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - overdueDays);
    return [
        { nextUpdate: { lt: now } },
        {
            AND: [
                { nextUpdate: null },
                { OR: [{ isOverdue: true }, { statusEntryDate: { lt: cutoff } }] },
            ],
        },
    ];
}

/** Fetch every overdue file awaiting a DHS transfer outcome. */
export async function getRequestedViaDhsCohort(opts: CohortOptions = {}): Promise<CohortCase[]> {
    const statuses = opts.statuses ?? COHORT_STATUSES;
    const service = opts.service ?? null;

    return prisma.case.findMany({
        where: {
            deletedAt: null,
            status: { in: [...statuses] },
            ...(service ? { services: { contains: service } } : {}),
            OR: isDueWhere(opts.overdueDays ?? FALLBACK_OVERDUE_DAYS),
        },
        select: {
            id: true,
            fileNumber: true,
            status: true,
            client: { select: { firstName: true, lastName: true, idNumber: true } },
        },
        orderBy: { statusEntryDate: 'asc' },
        ...(opts.limit ? { take: opts.limit } : {}),
    });
}

/**
 * True when this case was already flagged for staff review inside the cooldown
 * window. Never throws — on a DB error we treat the file as not-yet-flagged, so
 * the worst case is a duplicate review note rather than a silently skipped file.
 */
export async function isAwaitingDeclineReview(caseId: string): Promise<boolean> {
    const since = new Date();
    since.setDate(since.getDate() - REVIEW_COOLDOWN_DAYS);
    try {
        const prior = await prisma.caseComment.findFirst({
            where: { caseId, content: { contains: DECLINE_REVIEW_MARKER }, createdAt: { gte: since } },
            select: { id: true },
        });
        return prior !== null;
    } catch (err) {
        logger.error(`[DHS_FOLLOWUP] Review-flag lookup failed for ${caseId} — treating as not flagged:`, err);
        return false;
    }
}

/** Record a decline for staff to verify, and notify them. Sends nothing to the consumer or DC. */
async function flagDeclineForReview(params: {
    caseId: string;
    fileNumber: string;
    clientName: string;
    declineReason: string;
    adminId: string | undefined;
}): Promise<{ category: string; notified: number }> {
    const { caseId, fileNumber, clientName, declineReason, adminId } = params;
    const category = classifyDeclineReason(declineReason);

    await prisma.caseComment.create({
        data: {
            caseId,
            userId: adminId,
            content:
                `[SYSTEM] ${DECLINE_REVIEW_MARKER}\n` +
                `DHS reports this transfer request as DECLINED.\n` +
                `Reason given on DHS: "${declineReason}"\n` +
                `Auto-classified as: ${category}\n\n` +
                `NOTHING has been sent to the consumer or the Debt Counsellor. DHS declines are ` +
                `frequently false positives or still-under-review states, so this is left for a ` +
                `person to confirm. If the decline is genuine, action it from the case's DHS ` +
                `decline tools. This file will not be re-checked automatically for ` +
                `${REVIEW_COOLDOWN_DAYS} days.`,
        },
    });

    // Notify the assigned staff member plus admins, matching overdue-scan's alert pattern.
    const [caseRow, admins] = await Promise.all([
        prisma.case.findUnique({ where: { id: caseId }, select: { assignedToId: true } }),
        prisma.user.findMany({ where: { isAdmin: true, isLocked: false }, select: { id: true } }),
    ]);

    const recipientIds = new Set<string>(admins.map(u => u.id));
    if (caseRow?.assignedToId) recipientIds.add(caseRow.assignedToId);

    if (recipientIds.size > 0) {
        await prisma.inAppNotification.createMany({
            data: [...recipientIds].map(userId => ({
                userId,
                type: 'DHS_DECLINE_REVIEW',
                title: `🔍 Verify DHS decline: ${fileNumber}`,
                message: `${clientName} — DHS reports DECLINED (${category}). Nothing was sent; please confirm before actioning.`,
                caseId,
                linkUrl: `/cases/${caseId}`,
            })),
        });
    }

    return { category, notified: recipientIds.size };
}

export async function runRequestedViaDhsFollowup(opts: CohortOptions & {
    dryRun?: boolean;
    declineMode?: DeclineMode;
    sampleDeclineReason?: string;
} = {}): Promise<FollowupRunResult> {
    const dryRun = opts.dryRun ?? false;
    const declineMode = opts.declineMode ?? DEFAULT_DECLINE_MODE;
    const sampleReason = opts.sampleDeclineReason ?? SAMPLE_DECLINE_REASON;
    const statuses = opts.statuses ?? COHORT_STATUSES;
    const service = opts.service ?? null;

    const cohort = await getRequestedViaDhsCohort(opts);
    const result: FollowupRunResult = {
        dryRun,
        cohortStatuses: [...statuses],
        cohortService: service,
        cohortCount: cohort.length,
        declineMode,
        stats: {
            accepted: 0,
            declined: 0,
            declinedForReview: 0,
            skippedAwaitingReview: 0,
            stillPending: 0,
            notOnDhs: 0,
            previewed: 0,
            errors: 0,
        },
        files: [],
    };

    logger.info(
        `[DHS_FOLLOWUP] ${cohort.length} file(s) in cohort ` +
        `(statuses=${statuses.join('/')}, service=${service ?? 'all'}, dryRun=${dryRun})`,
    );

    const adminId = dryRun ? undefined : (await getAutomationUserId()) ?? undefined;

    for (const c of cohort) {
        const clientName = `${c.client.firstName} ${c.client.lastName}`.trim();
        const base = { caseId: c.id, fileNumber: c.fileNumber, clientName, previousStatus: c.status };

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
                        (declineMode === 'review'
                            ? `If DECLINED → classify and flag for staff, SENDING NOTHING (declineMode=review). ` +
                              `The preview below shows what the 'auto' mode would have sent instead.`
                            : `If DECLINED → handle decline and SEND the messages previewed below ` +
                              `(declineMode=auto; the reason shown is representative, not the real one).`),
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
            // Already sitting with staff — don't re-notify, and don't burn a 90s DHS check on it.
            if (declineMode === 'review' && await isAwaitingDeclineReview(c.id)) {
                result.stats.skippedAwaitingReview++;
                result.files.push({
                    ...base,
                    outcome: 'SKIPPED_AWAITING_REVIEW',
                    statusChange: null,
                    message: `Already flagged for staff review within the last ${REVIEW_COOLDOWN_DAYS} days — not re-checked`,
                });
                continue;
            }

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

                // Review mode: classify, record, notify staff — send nothing.
                if (declineMode === 'review') {
                    const { category, notified } = await flagDeclineForReview({
                        caseId: c.id,
                        fileNumber: c.fileNumber,
                        clientName,
                        declineReason: reason,
                        adminId,
                    });
                    // Schedule past the review cooldown so the file leaves the cohort
                    // entirely rather than being re-fetched and skipped every run.
                    await setNextUpdate(c.id, REVIEW_COOLDOWN_DAYS, adminId);
                    result.stats.declinedForReview++;
                    result.files.push({
                        ...base,
                        outcome: 'DECLINED_REVIEW',
                        statusChange: null,
                        message:
                            `Declined on DHS (classified ${category}) — flagged for staff, nothing sent. ` +
                            `${notified} staff member(s) notified. Reason: "${reason}"`,
                    });
                    continue;
                }

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

            // NOT_LINKED / NOT_REQUESTED — surface for staff, don't silently flip status.
            // Still schedule it forward, or it would be re-checked on every run forever.
            await addSystemComment(c.id, `[AUTO] Requested-via-DHS follow-up: DHS now reports "${check.status}" for a file we had as "${c.status}". Staff to review.`, adminId);
            await setNextUpdate(c.id, PENDING_RETRY_DAYS, adminId);
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
