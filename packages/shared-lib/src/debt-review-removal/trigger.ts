/**
 * Debt Review Removal Trigger
 *
 * Scans cases that have been accepted via DHS (ACCEPTED_VIA_DHS) and assesses
 * whether they are ready for formal debt review removal on the DHS portal.
 *
 * For each eligible case:
 *  1. Reads the consumer's current DHS status (consumerDhsStatus)
 *  2. Determines the correct exit path and required documents
 *  3. Checks which documents are already in the case vault
 *  4. If all docs present → notifies staff to proceed on DHS
 *  5. If docs missing → requests them from the appropriate party
 *  6. If uncertain → escalates to admins + managers for staff review
 */

import { prisma } from '@zenowethu/database';
import { createLogger } from '../logger';
import { getAutomationUserId } from '../automation/automation-user';
import {
    RemovalAssessment,
    RemovalPath,
    getRemovalPaths,
    matchesDocType,
    D4_CANDIDATE_PATHS,
    PATH_D4_TO_G,
    PATH_D4_TO_F1,
    DOC_TYPES,
} from './removal-paths';

const logger = createLogger('debt-review-removal');

/**
 * How long an unchanged outcome is left alone before staff are re-notified.
 * The trigger does not move `nextUpdate`, so without this every cron run would
 * re-notify every admin/manager about every eligible case.
 */
export const REMOVAL_NOTIFY_COOLDOWN_DAYS = 5;

/** Comment activity types written by this trigger — used to find its previous outcome. */
const TRIGGER_ACTIVITY_TYPES = [
    'DEBT_REVIEW_REMOVAL_CHECK',
    'DEBT_REVIEW_REMOVAL_ESCALATED',
    'DEBT_REVIEW_REMOVAL_DOCS_REQUESTED',
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RemovalTriggerResult {
    assessed: number;
    readyForRemoval: number;
    needsDocs: number;
    escalated: number;
    noAction: number;
    /** Cases whose outcome is unchanged since staff were last notified (inside the cooldown). */
    skippedRecent: number;
    errors: number;
    assessments: RemovalAssessment[];
}

// ─── Core assessment logic ─────────────────────────────────────────────────────

/**
 * Assess a single case for debt review removal readiness.
 */
export async function assessCaseForRemoval(caseId: string): Promise<RemovalAssessment | null> {
    const caseRecord = await prisma.case.findUnique({
        where: { id: caseId },
        include: {
            client: { select: { firstName: true, lastName: true, phone: true, email: true } },
            documents: { select: { type: true, uploadedAt: true } },
        },
    });

    if (!caseRecord) return null;

    const { consumerDhsStatus, fileNumber } = caseRecord;
    const clientName = `${caseRecord.client.firstName} ${caseRecord.client.lastName}`;

    const base: Omit<RemovalAssessment, 'recommendedPath' | 'candidatePaths' | 'confidence' | 'requiredDocTypes' | 'presentDocTypes' | 'missingDocTypes' | 'readyForRemoval' | 'action' | 'actionReason'> = {
        caseId,
        fileNumber,
        clientName,
        consumerDhsStatus: consumerDhsStatus ?? null,
    };

    // No DHS status recorded yet — cannot assess
    if (!consumerDhsStatus) {
        return {
            ...base,
            recommendedPath: null,
            candidatePaths: [],
            confidence: 'UNCERTAIN',
            requiredDocTypes: [],
            presentDocTypes: [],
            missingDocTypes: [],
            readyForRemoval: false,
            action: 'NO_ACTION',
            actionReason: 'No consumer DHS status on record — run a DHS check first.',
        };
    }

    const dhsStatus = consumerDhsStatus.trim().toUpperCase();
    const candidatePaths = getRemovalPaths(dhsStatus);

    // Status is not one we handle
    if (candidatePaths.length === 0) {
        return {
            ...base,
            recommendedPath: null,
            candidatePaths: [],
            confidence: 'UNCERTAIN',
            requiredDocTypes: [],
            presentDocTypes: [],
            missingDocTypes: [],
            readyForRemoval: false,
            action: 'NO_ACTION',
            actionReason: `DHS status "${consumerDhsStatus}" does not require a removal transition (may already be closed or in an unrecognised state).`,
        };
    }

    // Already at an exitable status (F1, F2, G)
    if (candidatePaths[0]?.alreadyExitable) {
        return {
            ...base,
            recommendedPath: candidatePaths[0],
            candidatePaths,
            confidence: 'HIGH',
            requiredDocTypes: [],
            presentDocTypes: [],
            missingDocTypes: [],
            readyForRemoval: true,
            action: 'PROCEED',
            actionReason: `Consumer DHS status is already "${consumerDhsStatus}" — ready for formal removal on DHS portal.`,
        };
    }

    const uploadedTypes = caseRecord.documents.map(d => d.type);

    // ── Single-path statuses (A, C) ───────────────────────────────────────────
    if (dhsStatus !== 'D4') {
        const path = candidatePaths[0]!;
        return evaluatePath(base, path, candidatePaths, uploadedTypes);
    }

    // ── D4: multiple possible paths — detect the most likely one ─────────────
    return evaluateD4Case(base, candidatePaths, uploadedTypes, caseRecord.todos ?? '');
}

/** Evaluate whether all required documents for a single path are present */
function evaluatePath(
    base: Omit<RemovalAssessment, 'recommendedPath' | 'candidatePaths' | 'confidence' | 'requiredDocTypes' | 'presentDocTypes' | 'missingDocTypes' | 'readyForRemoval' | 'action' | 'actionReason'>,
    path: RemovalPath,
    candidatePaths: RemovalPath[],
    uploadedTypes: string[],
    confidence: RemovalAssessment['confidence'] = 'HIGH',
): RemovalAssessment {
    const requiredDocTypes = path.requiredDocTypes;
    const presentDocTypes = requiredDocTypes.filter(req =>
        uploadedTypes.some(up => matchesDocType(up, req))
    );
    const missingDocTypes = requiredDocTypes.filter(req =>
        !uploadedTypes.some(up => matchesDocType(up, req))
    );
    const readyForRemoval = missingDocTypes.length === 0;

    return {
        ...base,
        recommendedPath: path,
        candidatePaths,
        confidence,
        requiredDocTypes,
        presentDocTypes,
        missingDocTypes,
        readyForRemoval,
        action: readyForRemoval ? 'PROCEED' : 'REQUEST_DOCS',
        actionReason: readyForRemoval
            ? `All required documents present for ${path.fromStatus} → ${path.toStatus} transition.`
            : `Missing ${missingDocTypes.length} document(s) for ${path.fromStatus} → ${path.toStatus}: ${missingDocTypes.join(', ')}.`,
    };
}

/**
 * D4 path detection logic:
 * 1. Court order docs present → G path (rescission)
 * 2. Form 19 + paid-up letters + Form 17.2(c) present → F1 (mortgage case)
 * 3. Form 19 + paid-up letters present → F2 (all settled)
 * 4. Otherwise → UNCERTAIN, escalate to staff
 */
function evaluateD4Case(
    base: Omit<RemovalAssessment, 'recommendedPath' | 'candidatePaths' | 'confidence' | 'requiredDocTypes' | 'presentDocTypes' | 'missingDocTypes' | 'readyForRemoval' | 'action' | 'actionReason'>,
    candidatePaths: RemovalPath[],
    uploadedTypes: string[],
    caseNotes: string,
): RemovalAssessment {
    const hasDoc = (req: string) => uploadedTypes.some(up => matchesDocType(up, req));

    const hasCourtOrder   = hasDoc(DOC_TYPES.COURT_ORDER_GRANTED);
    const hasNoticeMotion = hasDoc(DOC_TYPES.NOTICE_OF_MOTION);
    const hasAffidavit    = hasDoc(DOC_TYPES.FOUNDING_AFFIDAVIT);
    const hasForm19       = hasDoc(DOC_TYPES.CERTIFIED_FORM_19);
    const hasPaidUp       = hasDoc(DOC_TYPES.PAID_UP_LETTERS);
    const hasForm17_2C    = hasDoc(DOC_TYPES.FORM_17_2C);
    const notesMortgage   = /mortgage|bond|home loan/i.test(caseNotes);

    // G path signal: court order rescission evidence
    if (hasCourtOrder && (hasNoticeMotion || hasAffidavit)) {
        return evaluatePath(base, PATH_D4_TO_G, candidatePaths, uploadedTypes, 'HIGH');
    }

    // F1 path signal: mortgage in notes + F1-specific docs
    if (notesMortgage && hasForm17_2C) {
        return evaluatePath(base, PATH_D4_TO_F1, candidatePaths, uploadedTypes, 'MEDIUM');
    }

    // F2 path signal: Form 19 or paid-up letters present
    if (hasForm19 || hasPaidUp) {
        return evaluatePath(base, D4_CANDIDATE_PATHS[2]!, candidatePaths, uploadedTypes, 'MEDIUM');
    }

    // Uncertain — insufficient evidence to determine path
    return {
        ...base,
        recommendedPath: null,
        candidatePaths,
        confidence: 'UNCERTAIN',
        requiredDocTypes: [],
        presentDocTypes: [],
        missingDocTypes: [],
        readyForRemoval: false,
        action: 'ESCALATE',
        actionReason: 'D4 status with insufficient document evidence to determine exit path (F1/F2/G). Staff must review and select the correct path.',
    };
}

// ─── Notification helpers ─────────────────────────────────────────────────────

/** Stable description of an assessment's outcome — changes when the action, path or missing docs change. */
export function assessmentFingerprint(a: RemovalAssessment): string {
    const path = a.recommendedPath ? `${a.recommendedPath.fromStatus}>${a.recommendedPath.toStatus}` : 'none';
    return `${a.action}|${path}|${[...a.missingDocTypes].sort().join(',')}`;
}

/**
 * True when the trigger already reported this exact outcome for the case inside
 * the cooldown. A changed outcome (documents arrived, path became clear) is NOT
 * suppressed, so staff hear about progress immediately. On a lookup failure we
 * fail open — a duplicate notification beats a silently skipped case.
 */
export async function wasRecentlyReported(assessment: RemovalAssessment): Promise<boolean> {
    const since = new Date();
    since.setDate(since.getDate() - REMOVAL_NOTIFY_COOLDOWN_DAYS);
    try {
        const last = await prisma.caseComment.findFirst({
            where: {
                caseId: assessment.caseId,
                activityType: { in: [...TRIGGER_ACTIVITY_TYPES] },
                createdAt: { gte: since },
            },
            orderBy: { createdAt: 'desc' },
            select: { activityData: true },
        });
        if (!last?.activityData) return false;
        const data = JSON.parse(last.activityData) as { fingerprint?: string };
        return data.fingerprint === assessmentFingerprint(assessment);
    } catch (err) {
        logger.error(`[DebtReviewRemoval] Cooldown lookup failed for ${assessment.fileNumber} — treating as not reported:`, err);
        return false;
    }
}

async function getStaffNotificationTargets(): Promise<string[]> {
    // Admins + internal managers only (not B2B partner managers, not locked accounts)
    const users = await prisma.user.findMany({
        where: {
            OR: [{ isAdmin: true }, { role: 'MANAGER' }],
            userType: 'STAFF',
            isLocked: false,
        },
        select: { id: true },
    });
    return users.map(u => u.id);
}

async function notifyStaff(
    userIds: string[],
    notification: { title: string; message: string; caseId: string },
): Promise<void> {
    if (userIds.length === 0) return;
    await prisma.inAppNotification.createMany({
        data: userIds.map(userId => ({
            userId,
            type: 'DEBT_REVIEW_REMOVAL',
            title: notification.title,
            message: notification.message,
            caseId: notification.caseId,
            linkUrl: `/cases/${notification.caseId}`,
        })),
    });
}

/** Documents the consumer/attorney must supply. */
const CLIENT_SIDE_DOCS: readonly string[] = [
    DOC_TYPES.PAID_UP_LETTERS,
    DOC_TYPES.COURT_ORDER_GRANTED,
    DOC_TYPES.NOTICE_OF_MOTION,
    DOC_TYPES.FOUNDING_AFFIDAVIT,
];

/** Documents the Debt Counsellor prepares. Form 17.W is requested from the DC by the DRR file-request trigger. */
const DC_SIDE_DOCS: readonly string[] = [
    DOC_TYPES.CERTIFIED_FORM_19,
    DOC_TYPES.FORM_17_2C,
    DOC_TYPES.FORM_17W,
    DOC_TYPES.FORM_16,
    DOC_TYPES.FORM_17_2A,
];

const humanise = (docType: string): string => docType.replace(/_/g, ' ');

function pathLabel(a: RemovalAssessment): string {
    return a.recommendedPath ? `${a.recommendedPath.fromStatus} → ${a.recommendedPath.toStatus}` : 'none';
}

async function notifyStaffToProcessRemoval(assessment: RemovalAssessment, systemUserId: string | undefined): Promise<void> {
    const staffIds = await getStaffNotificationTargets();
    const path = assessment.recommendedPath!;

    await notifyStaff(staffIds, {
        caseId: assessment.caseId,
        title: `✅ Ready for DHS Removal: ${assessment.fileNumber}`,
        message: `${assessment.clientName} (${assessment.fileNumber}) — DHS status "${assessment.consumerDhsStatus}" is ready for removal. All required documents are present. Please proceed on the DHS portal to update status to "${path.toStatus}".`,
    });

    await prisma.caseComment.create({
        data: {
            caseId: assessment.caseId,
            userId: systemUserId,
            content: `[Debt Review Removal] ${assessment.actionReason} Path: ${path.fromStatus} → ${path.toStatus}. Documents: ${assessment.presentDocTypes.length}/${assessment.requiredDocTypes.length} present.`,
            type: 'SYSTEM',
            isInternal: true,
            activityType: 'DEBT_REVIEW_REMOVAL_CHECK',
            activityData: JSON.stringify({
                fingerprint: assessmentFingerprint(assessment),
                consumerDhsStatus: assessment.consumerDhsStatus,
                recommendedPath: pathLabel(assessment),
                confidence: assessment.confidence,
                requiredDocTypes: assessment.requiredDocTypes,
                presentDocTypes: assessment.presentDocTypes,
                missingDocTypes: assessment.missingDocTypes,
                readyForRemoval: assessment.readyForRemoval,
            }),
        },
    });
}

async function escalateToStaff(assessment: RemovalAssessment, systemUserId: string | undefined): Promise<void> {
    const staffIds = await getStaffNotificationTargets();

    await notifyStaff(staffIds, {
        caseId: assessment.caseId,
        title: `⚠️ Manual Review Required: ${assessment.fileNumber}`,
        message: `${assessment.clientName} (${assessment.fileNumber}) — DHS status "${assessment.consumerDhsStatus}". ${assessment.actionReason}`,
    });

    await prisma.caseComment.create({
        data: {
            caseId: assessment.caseId,
            userId: systemUserId,
            content: `[Debt Review Removal] ESCALATED — ${assessment.actionReason}`,
            type: 'SYSTEM',
            isInternal: true,
            activityType: 'DEBT_REVIEW_REMOVAL_ESCALATED',
            activityData: JSON.stringify({
                fingerprint: assessmentFingerprint(assessment),
                consumerDhsStatus: assessment.consumerDhsStatus,
                candidatePaths: assessment.candidatePaths.map(p => `${p.fromStatus} → ${p.toStatus}`),
                confidence: assessment.confidence,
            }),
        },
    });
}

/**
 * Records what is missing and tells staff. Nothing is sent to the consumer or
 * attorney automatically — these are legally sensitive court/DC documents, so a
 * person makes the contact. Staff get ONE notification covering both the
 * DC-side and client-side documents.
 */
async function requestMissingDocuments(assessment: RemovalAssessment, systemUserId: string | undefined): Promise<void> {
    const missing = assessment.missingDocTypes;
    const clientDocs = missing.filter(d => CLIENT_SIDE_DOCS.includes(d));
    const dcDocs = missing.filter(d => DC_SIDE_DOCS.includes(d));
    const staffIds = await getStaffNotificationTargets();
    const fingerprint = assessmentFingerprint(assessment);

    const sections: string[] = [];
    if (dcDocs.length > 0) sections.push(`Debt Counsellor to prepare: ${dcDocs.map(humanise).join(', ')}`);
    if (clientDocs.length > 0) sections.push(`To obtain from client/attorney: ${clientDocs.map(humanise).join(', ')}`);

    await notifyStaff(staffIds, {
        caseId: assessment.caseId,
        title: `📄 Removal documents needed: ${assessment.fileNumber}`,
        message: `${assessment.clientName} (${assessment.fileNumber}) — removal path ${pathLabel(assessment)}, ${missing.length} document(s) outstanding.\n${sections.join('\n')}`,
    });

    if (clientDocs.length > 0) {
        await prisma.caseComment.create({
            data: {
                caseId: assessment.caseId,
                userId: systemUserId,
                content: `[Debt Review Removal] Missing documents required from client/attorney:\n${clientDocs.map(d => `• ${humanise(d)}`).join('\n')}\n\nPlease contact the client or attorney to obtain these.`,
                type: 'SYSTEM',
                isInternal: true,
                activityType: 'DEBT_REVIEW_REMOVAL_DOCS_REQUESTED',
                activityData: JSON.stringify({ fingerprint, missingDocs: clientDocs, requestedFrom: 'client/attorney' }),
            },
        });
    }

    await prisma.caseComment.create({
        data: {
            caseId: assessment.caseId,
            userId: systemUserId,
            content: `[Debt Review Removal] Documents required for ${pathLabel(assessment)} transition:\n${missing.map(d => `• ${humanise(d)}`).join('\n')}\nPresent: ${assessment.presentDocTypes.join(', ') || 'none'}`,
            type: 'SYSTEM',
            isInternal: true,
            activityType: 'DEBT_REVIEW_REMOVAL_CHECK',
            activityData: JSON.stringify({
                fingerprint,
                requiredDocTypes: assessment.requiredDocTypes,
                presentDocTypes: assessment.presentDocTypes,
                missingDocTypes: assessment.missingDocTypes,
                path: assessment.recommendedPath ? pathLabel(assessment) : null,
            }),
        },
    });
}

// ─── Main trigger ──────────────────────────────────────────────────────────────

/**
 * Run the full debt review removal trigger scan.
 * Processes all cases with ACCEPTED_VIA_DHS status that have a consumerDhsStatus set.
 */
export async function runDebtReviewRemovalTrigger(): Promise<RemovalTriggerResult> {
    const startedAt = new Date();
    logger.info('[DebtReviewRemoval] Starting trigger scan...');

    const result: RemovalTriggerResult = {
        assessed: 0,
        readyForRemoval: 0,
        needsDocs: 0,
        escalated: 0,
        noAction: 0,
        skippedRecent: 0,
        errors: 0,
        assessments: [],
    };

    // Find overdue eligible cases only (nextUpdate has passed or was never set)
    // ACCEPTED_VIA_DHS SLA = 2 working days — we only act once the case is overdue
    const now = new Date();
    const eligibleCases = await prisma.case.findMany({
        where: {
            status: { in: ['ACCEPTED_VIA_DHS', 'ACCEPTED_FORM_177', 'ZDM_CLIENT'] },
            consumerDhsStatus: { not: null },
            deletedAt: null,
            OR: [
                { nextUpdate: null },
                { nextUpdate: { lte: now } },
            ],
        },
        select: { id: true, fileNumber: true, consumerDhsStatus: true },
    });

    logger.info(`[DebtReviewRemoval] Found ${eligibleCases.length} eligible cases`);

    // Comments need a real user (FK); fall back to unattributed rather than a fake id.
    const systemUserId = (await getAutomationUserId()) ?? undefined;

    for (const c of eligibleCases) {
        try {
            const assessment = await assessCaseForRemoval(c.id);
            if (!assessment) { result.errors++; continue; }

            result.assessed++;
            result.assessments.push(assessment);

            if (assessment.action !== 'NO_ACTION' && await wasRecentlyReported(assessment)) {
                result.skippedRecent++;
                continue;
            }

            switch (assessment.action) {
                case 'PROCEED':
                    await notifyStaffToProcessRemoval(assessment, systemUserId);
                    result.readyForRemoval++;
                    break;

                case 'REQUEST_DOCS':
                    await requestMissingDocuments(assessment, systemUserId);
                    result.needsDocs++;
                    break;

                case 'ESCALATE':
                    await escalateToStaff(assessment, systemUserId);
                    result.escalated++;
                    break;

                case 'NO_ACTION':
                default:
                    result.noAction++;
                    break;
            }

            logger.info(`[DebtReviewRemoval] ${c.fileNumber}: action=${assessment.action} confidence=${assessment.confidence} path=${assessment.recommendedPath ? `${assessment.recommendedPath.fromStatus}→${assessment.recommendedPath.toStatus}` : 'none'}`);
        } catch (err) {
            logger.error(`[DebtReviewRemoval] Error processing case ${c.fileNumber}:`, err);
            result.errors++;
        }
    }

    const durationMs = Date.now() - startedAt.getTime();
    logger.info(`[DebtReviewRemoval] Scan complete: ${JSON.stringify({ ...result, assessments: undefined })} in ${durationMs}ms`);

    return result;
}
