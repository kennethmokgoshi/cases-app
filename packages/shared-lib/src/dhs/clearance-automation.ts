/**
 * DHS — Manage Consumers Clearance Automation
 *
 * The post-consent "Manage Consumers" step. Once the consumer has approved the
 * debt-review-removal consent AND the required documents (credit report,
 * payslip, bank statement) are on file, this automation reads the consumer's
 * status history on the DHS Search & Manage Consumer page and advances the
 * case workflow accordingly:
 *
 *   • Current code A1 / B / F1 / F2 / G / G1 (out of debt review):
 *       - status date < 7 calendar days → READY_CLEARANCE
 *       - status date ≥ 7 calendar days → COMPLETED
 *   • Current code A / C / D3 / D4 (still in active debt review under our DC):
 *       - no clearance yet — the case stays put with a follow-up comment
 *   • Anything else / not found / scrape failure → escalated to staff on the
 *     case timeline, status untouched.
 *
 * Runs Puppeteer, so it must execute inside the Cases app process (same
 * constraint as the rest of the DHS automation). Never throws — every failure
 * is captured in `errors` and posted to the case timeline.
 */

import { prisma } from '@zenowethu/database';
import { createLogger } from '../logger';
import { getAutomationUserId } from '../automation/automation-user';
import { addWorkingDays } from '../statuses/workingDays';
import { getConsumerStatusHistory } from './status-history';

const logger = createLogger('dhs/clearance-automation');

/** Follow-up windows (working days) per outcome. */
const FOLLOWUP_DAYS: Record<string, number> = {
    READY_CLEARANCE: 7,
    COMPLETED: 2,
    STILL_IN_DEBT_REVIEW: 5,
};

/**
 * Statuses the clearance automation may advance a case FROM. Guards against
 * clobbering a manual staff move — same principle as the consent hook.
 */
const CLEARANCE_ADVANCE_FROM_STATUSES = new Set([
    'CONSENT_RECEIVED',
    'AWAITING_DRR_DOCS',
    'READY_TO_CONSENT',
    'ACCEPTED_VIA_DHS',
    'ZDM_CLIENT',
]);

export interface ClearanceRunResult {
    caseId: string;
    /** True when the DHS status history was successfully read. */
    checked: boolean;
    /** The consumer's current DHS status code (e.g. "G", "A1", "C"), if read. */
    currentCode: string | null;
    /** Workflow status the case was moved to, if any. */
    statusUpdatedTo: string | null;
    /** Human-readable summary of the outcome. */
    message: string;
    actionsPerformed: string[];
    errors: string[];
}

/**
 * Run the Manage Consumers clearance check for a case and advance the workflow.
 * Safe to call repeatedly — it only ever moves the case forward from the
 * expected DRR statuses, and re-runs simply re-read DHS.
 */
export async function runManageConsumersClearance(params: {
    caseId: string;
    triggeredByUserId?: string;
}): Promise<ClearanceRunResult> {
    const { caseId } = params;
    const result: ClearanceRunResult = {
        caseId,
        checked: false,
        currentCode: null,
        statusUpdatedTo: null,
        message: '',
        actionsPerformed: [],
        errors: [],
    };
    const userId = params.triggeredByUserId ?? (await getAutomationUserId().catch(() => null)) ?? undefined;

    try {
        const caseData = await prisma.case.findUnique({
            where: { id: caseId },
            include: { client: { select: { idNumber: true, firstName: true, lastName: true } } },
        });
        if (!caseData) {
            result.errors.push('Case not found');
            result.message = 'Case not found';
            return result;
        }
        const idNumber = caseData.client?.idNumber ?? '';
        if (!/^\d{13}$/.test(idNumber)) {
            result.errors.push('Client has no valid 13-digit ID number — cannot check DHS.');
            result.message = result.errors[0];
            await addComment(
                caseId,
                userId,
                `[SYSTEM] Manage Consumers: cannot run the DHS clearance check — the client has no valid 13-digit ID number on file. Please correct the ID number and re-run.`,
                'DRR_CLEARANCE_CHECK_FAILED',
            );
            return result;
        }

        logger.info(`[DRR Clearance] Reading DHS status history for case ${caseId} (ID ${idNumber.slice(0, 6)}***)`);
        const history = await getConsumerStatusHistory(idNumber);
        result.currentCode = history.evaluation.currentCode;

        if (!history.found) {
            result.errors.push(`DHS status history not readable: ${history.message}`);
            result.message = history.message;
            await addComment(
                caseId,
                userId,
                `[SYSTEM] Manage Consumers: the DHS consumer status history could not be read (${history.message}). ` +
                `Please open DHS Search & Manage Consumer manually and verify this consumer's current status.`,
                'DRR_CLEARANCE_CHECK_FAILED',
            );
            return result;
        }

        result.checked = true;
        const evaluation = history.evaluation;
        const notes = evaluation.notes.join(' ');

        // Keep the scraped DHS code on the case regardless of outcome.
        await prisma.case
            .update({ where: { id: caseId }, data: { consumerDhsStatus: evaluation.currentCode ?? undefined } })
            .catch((err) => logger.error(`[DRR Clearance] Failed to save consumerDhsStatus for ${caseId}:`, err));

        // ── Clearance outcome → workflow status ─────────────────────────────
        if (evaluation.workflowStatus === 'READY_CLEARANCE' || evaluation.workflowStatus === 'COMPLETED') {
            const target = evaluation.workflowStatus;
            const canAdvance = CLEARANCE_ADVANCE_FROM_STATUSES.has(caseData.status ?? '');
            if (canAdvance) {
                await prisma.case.update({
                    where: { id: caseId },
                    data: {
                        status: target,
                        nextUpdate: addWorkingDays(new Date(), FOLLOWUP_DAYS[target]),
                        ...(userId ? { updatedBy: { connect: { id: userId } } } : {}),
                    },
                });
                result.statusUpdatedTo = target;
                result.actionsPerformed.push(`Case status → ${target}.`);
            } else {
                result.actionsPerformed.push(
                    `DHS shows ${target} but the case is at "${caseData.status}" (moved manually?) — status left unchanged.`,
                );
            }
            result.message = notes;
            await addComment(
                caseId,
                userId,
                `[SYSTEM] Manage Consumers (DHS clearance check): ${notes}` +
                (result.statusUpdatedTo
                    ? ` Case status updated to ${target === 'READY_CLEARANCE' ? 'Ready for Clearance' : 'Completed'}.`
                    : ` Case status left at "${caseData.status}" — please review.`),
                'DRR_CLEARANCE_RESULT',
            );
            return result;
        }

        // ── Still in active debt review (A / C / D3 / D4) ────────────────────
        if (evaluation.workflowStatus === 'ACCEPTED_VIA_DHS') {
            await prisma.case
                .update({
                    where: { id: caseId },
                    data: { nextUpdate: addWorkingDays(new Date(), FOLLOWUP_DAYS.STILL_IN_DEBT_REVIEW) },
                })
                .catch((err) => logger.error(`[DRR Clearance] Failed to set follow-up for ${caseId}:`, err));
            result.message = notes;
            result.actionsPerformed.push(
                `Consumer still shows an active debt review code — follow-up set for +${FOLLOWUP_DAYS.STILL_IN_DEBT_REVIEW} working days.`,
            );
            await addComment(
                caseId,
                userId,
                `[SYSTEM] Manage Consumers (DHS clearance check): ${notes} ` +
                `All required documents are on file — the case will be re-checked in ${FOLLOWUP_DAYS.STILL_IN_DEBT_REVIEW} working days ` +
                `for a clearance-eligible status (A1, B, F1, F2, G, G1).`,
                'DRR_CLEARANCE_RESULT',
            );
            return result;
        }

        // ── Unrecognised / unclassifiable → staff review ─────────────────────
        result.errors.push(`Unrecognised DHS status outcome: ${notes || 'no classification'}`);
        result.message = notes || 'DHS status could not be classified.';
        await addComment(
            caseId,
            userId,
            `[SYSTEM] Manage Consumers (DHS clearance check): the consumer's current DHS status ` +
            `("${evaluation.currentCode ?? 'unknown'}") could not be classified automatically. ${notes} ` +
            `Please review this case manually.`,
            'DRR_CLEARANCE_NEEDS_REVIEW',
        );
        return result;
    } catch (error) {
        logger.error(`[DRR Clearance] Unexpected error for case ${caseId}:`, error);
        result.errors.push(`Internal error: ${error instanceof Error ? error.message : String(error)}`);
        result.message = result.errors[result.errors.length - 1];
        await addComment(
            caseId,
            userId,
            `[SYSTEM] Manage Consumers (DHS clearance check) failed unexpectedly: ${result.message}. Please re-run or check manually.`,
            'DRR_CLEARANCE_CHECK_FAILED',
        ).catch(() => null);
        return result;
    }
}

async function addComment(
    caseId: string,
    userId: string | undefined,
    content: string,
    activityType?: string,
): Promise<void> {
    if (!userId) return;
    await prisma.caseComment
        .create({ data: { caseId, userId, content, ...(activityType ? { activityType } : {}) } })
        .catch((err) => logger.error(`[DRR Clearance] Failed to add comment for ${caseId}:`, err));
}
