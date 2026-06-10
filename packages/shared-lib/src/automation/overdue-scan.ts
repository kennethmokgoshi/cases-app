/**
 * Overdue Case Scan & Follow-Up Service
 *
 * Scans all active cases and takes action when a case has exceeded its SLA threshold:
 *
 *   DC_FOLLOWUP     — Case is stuck waiting on the Debt Counsellor; re-email the DC
 *   CONSUMER_FOLLOWUP — Case is stuck because consumer hasn't uploaded documents or responded
 *   STAFF_ALERT     — Case needs human attention; create in-app alert for assigned staff + admins
 *
 * Rate-limiting: each action type is throttled per case using WorkflowLog entries.
 * DC and consumer emails: max once per 7 days.
 * Staff alerts: max once per 3 days.
 */

import { prisma } from '@zenowethu/database';
import { createLogger } from '../logger';
import { WORKFLOW_STATUSES, getStatusByCode } from '../statuses/statuses';
import { sendStatusChangeNotification } from '../notifications/service';
import { getAutomationUserId } from './automation-user';

const logger = createLogger('automation/overdue-scan');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Categories whose cases are done — never follow up */
const SKIP_CATEGORIES = new Set(['SETTLED', 'LOST']);

/** Status codes that are explicitly terminal */
const SKIP_CODES = new Set([
    'OVERDUE',          // already flagged
    'CANCELLED',
    'NOT_POTENTIAL',
    'AFTERCARE_FEES_WITHDREW',
    'PARKED',           // deliberately parked
    'FEES_TOO_HIGH',
    'QUOTE_REJECTED',
    'LEGAL_FEES_WITHDREW',
    'COLLECTION_HANDED_OVER',
]);

/**
 * Statuses where the primary blocker is the Debt Counsellor.
 * Action: re-email the DC using the REQUEST_FILE_DC template.
 */
const DC_FOLLOWUP_STATUSES = new Set([
    'REQUESTED_VIA_DHS',
    'DOCUMENTS_EMAILED',
    'INVOICE_REQUESTED_DC',
    'FORM_177_SENT',
    'ACCEPTED_VIA_DHS',
    'ACCEPTED_FORM_177',
    'IRFDC_1M',
    'IRFDC_2M',
    'IRFDC_3M',
    'IRFDC_4M_PLUS',
]);

/**
 * Statuses where the primary blocker is the consumer.
 * Action: email the consumer asking them to provide documents or respond.
 */
const CONSUMER_FOLLOWUP_STATUSES = new Set([
    'OUTSTANDING_DOCS',
    'CONSUMER_CONTACTED_DC',
    'REJECTED_NOT_CONSENT',
    'INVOICE_SENT_CONSUMER',
    'INVSNT_1M',
    'INVSNT_2M',
    'INVSNT_3M',
    'INVSNT_4M_PLUS',
    'RNYC_1M',
    'RNYC_2M',
    'RNYC_3M',
    'RNYC_4M_PLUS',
    'WAITING_R350',
    'FEES_CONSENT',
]);

/** Minimum calendar days between the same follow-up action on the same case */
const COOLDOWN_DAYS = {
    DC: 7,
    CONSUMER: 7,
    STAFF: 3,
} as const;

/** WorkflowLog action codes used to track follow-up history */
const LOG_ACTIONS = {
    DC: 'OVERDUE_DC_FOLLOWUP',
    CONSUMER: 'OVERDUE_CONSUMER_FOLLOWUP',
    STAFF: 'OVERDUE_STAFF_ALERT',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OverdueActionType = 'DC_FOLLOWUP' | 'CONSUMER_FOLLOWUP' | 'STAFF_ALERT' | 'NONE';

export interface OverdueScanItem {
    caseId: string;
    fileNumber: string;
    status: string;
    daysInStatus: number;
    slaDays: number | null;
    actionType: OverdueActionType;
    actioned: boolean;
    skippedReason?: string;
    error?: string;
}

export interface OverdueScanResult {
    scanned: number;
    overdueFound: number;
    actioned: number;
    skipped: number;
    errors: number;
    dcFollowups: number;
    consumerFollowups: number;
    staffAlerts: number;
    items: OverdueScanItem[];
    ranAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Count calendar days between a date and now (not working days — simpler for SLA checking) */
function daysSince(date: Date): number {
    const ms = Date.now() - new Date(date).getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/** Check whether a specific follow-up action was already logged for this case within cooldown days */
function wasRecentlyActioned(
    logs: Array<{ action: string; timestamp: Date }>,
    logAction: string,
    cooldownDays: number
): boolean {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - cooldownDays);
    return logs.some(
        l => l.action === logAction && new Date(l.timestamp) > cutoff
    );
}

/** Classify what type of follow-up a case needs (or NONE if terminal/not overdue) */
function classifyAction(statusCode: string): OverdueActionType {
    const statusDef = getStatusByCode(statusCode);
    if (!statusDef) return 'STAFF_ALERT'; // Unknown status — surface to staff

    if (SKIP_CATEGORIES.has(statusDef.category)) return 'NONE';
    if (SKIP_CODES.has(statusCode)) return 'NONE';

    if (DC_FOLLOWUP_STATUSES.has(statusCode)) return 'DC_FOLLOWUP';
    if (CONSUMER_FOLLOWUP_STATUSES.has(statusCode)) return 'CONSUMER_FOLLOWUP';

    // Everything else with an SLA that's overdue → staff alert
    if (statusDef.slaEnabled) return 'STAFF_ALERT';

    return 'NONE';
}

// ---------------------------------------------------------------------------
// Main scan function
// ---------------------------------------------------------------------------

export async function runOverdueScan(): Promise<OverdueScanResult> {
    const startedAt = new Date();
    logger.info('[OVERDUE_SCAN] Starting overdue case scan...');

    // SLA map: statusCode → slaDays
    const slaMap = new Map<string, number>();
    for (const s of WORKFLOW_STATUSES) {
        if (s.slaEnabled && s.slaDays !== undefined) {
            slaMap.set(s.code, s.slaDays);
        }
    }

    // Load active cases — exclude terminal categories at DB level where possible
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 1); // at least 1 day in current status

    const cases = await prisma.case.findMany({
        where: {
            status: {
                notIn: [...SKIP_CODES],
            },
        },
        include: {
            client: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    phone: true,
                    idNumber: true,
                },
            },
            workflowLogs: {
                where: {
                    action: {
                        in: [LOG_ACTIONS.DC, LOG_ACTIONS.CONSUMER, LOG_ACTIONS.STAFF],
                    },
                    timestamp: {
                        gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000), // last 14 days
                    },
                },
                select: { action: true, timestamp: true },
            },
        },
        orderBy: { statusEntryDate: 'asc' },
    });

    const result: OverdueScanResult = {
        scanned: cases.length,
        overdueFound: 0,
        actioned: 0,
        skipped: 0,
        errors: 0,
        dcFollowups: 0,
        consumerFollowups: 0,
        staffAlerts: 0,
        items: [],
        ranAt: startedAt.toISOString(),
    };

    // Attribute scan actions to the Kenny Mokgoshi system automation user,
    // falling back to the first admin if it cannot be resolved
    let adminId: string | null = await getAutomationUserId();
    if (!adminId) {
        const admin = await prisma.user.findFirst({ where: { isAdmin: true }, select: { id: true } });
        adminId = admin?.id ?? null;
    }

    // Get all admins for in-app notifications
    const adminUsers = await prisma.user.findMany({
        where: { isAdmin: true },
        select: { id: true },
    });

    for (const caseData of cases) {
        const statusCode = caseData.status;
        const statusDef = getStatusByCode(statusCode);

        // Skip terminal categories
        if (statusDef && SKIP_CATEGORIES.has(statusDef.category)) continue;

        const daysInStatus = daysSince(caseData.statusEntryDate);
        const slaDays = slaMap.get(statusCode) ?? null;

        // Only process if SLA exceeded
        const isOverdue = slaDays !== null && daysInStatus > slaDays;
        // Also check nextUpdate field as a fallback trigger
        const isNextUpdatePast = caseData.nextUpdate !== null && new Date(caseData.nextUpdate) < new Date();

        if (!isOverdue && !isNextUpdatePast) continue;

        result.overdueFound++;

        const actionType = classifyAction(statusCode);
        const clientName = `${caseData.client.firstName} ${caseData.client.lastName}`;

        const item: OverdueScanItem = {
            caseId: caseData.id,
            fileNumber: caseData.fileNumber,
            status: statusCode,
            daysInStatus,
            slaDays,
            actionType,
            actioned: false,
        };

        if (actionType === 'NONE') {
            item.skippedReason = 'Terminal or non-actionable status';
            result.skipped++;
            result.items.push(item);
            continue;
        }

        try {
            // Mark the case as overdue in DB (always, even if rate-limited on follow-up)
            await prisma.case.update({
                where: { id: caseData.id },
                data: {
                    isOverdue: true,
                    daysInStatus,
                },
            });

            // ── DC Follow-up ──────────────────────────────────────────────────
            if (actionType === 'DC_FOLLOWUP') {
                if (wasRecentlyActioned(caseData.workflowLogs, LOG_ACTIONS.DC, COOLDOWN_DAYS.DC)) {
                    item.skippedReason = `DC follow-up already sent within last ${COOLDOWN_DAYS.DC} days`;
                    result.skipped++;
                    result.items.push(item);
                    continue;
                }

                const dcEmail = caseData.lastKnownEmail || caseData.dcEmail;
                if (!dcEmail) {
                    item.skippedReason = 'No DC email on record';
                    result.skipped++;

                    // Still alert staff that DC email is missing
                    await createStaffAlert(
                        caseData.id,
                        caseData.fileNumber,
                        clientName,
                        statusCode,
                        daysInStatus,
                        adminId,
                        adminUsers.map(u => u.id),
                        caseData.assignedToId,
                        `Case is overdue (${daysInStatus} days in "${statusCode}") but no DC email is on record. Please find the DC contact and update the case.`
                    );

                    result.items.push(item);
                    continue;
                }

                const emailResult = await sendStatusChangeNotification({
                    caseId: caseData.id,
                    clientName,
                    clientEmail: caseData.client.email,
                    fileNumber: caseData.fileNumber,
                    statusCode: 'REQUEST_FILE_DC',
                    dcName: caseData.debtCounsellorName || 'Debt Counsellor',
                    dcEmail,
                    idNumber: caseData.client.idNumber,
                    isB2B: caseData.acquisitionType === 'B2B',
                });

                await prisma.workflowLog.create({
                    data: {
                        caseId: caseData.id,
                        fromStatus: statusCode,
                        toStatus: statusCode,
                        action: LOG_ACTIONS.DC,
                        timestamp: new Date(),
                        notes: `[OVERDUE SCAN] DC follow-up email sent to ${dcEmail}. Case is ${daysInStatus} days in "${statusCode}" (SLA: ${slaDays} days). Email ${emailResult.emailSuccess ? 'delivered ✓' : 'failed ✗'}.`,
                        userId: adminId ?? undefined,
                    },
                });

                await addCaseComment(
                    caseData.id,
                    adminId,
                    `[OVERDUE SCAN — DC FOLLOW-UP]\nCase has been in "${statusCode}" for ${daysInStatus} day(s) (SLA: ${slaDays} day(s)).\nFollow-up email sent to DC (${dcEmail}) — ${emailResult.emailSuccess ? 'delivered ✓' : 'failed ✗'}.\nNext follow-up will be sent in ${COOLDOWN_DAYS.DC} days if no status change.`
                );

                item.actioned = true;
                result.actioned++;
                result.dcFollowups++;
            }

            // ── Consumer Follow-up ────────────────────────────────────────────
            else if (actionType === 'CONSUMER_FOLLOWUP') {
                if (wasRecentlyActioned(caseData.workflowLogs, LOG_ACTIONS.CONSUMER, COOLDOWN_DAYS.CONSUMER)) {
                    item.skippedReason = `Consumer follow-up already sent within last ${COOLDOWN_DAYS.CONSUMER} days`;
                    result.skipped++;
                    result.items.push(item);
                    continue;
                }

                const consumerEmail = caseData.client.email;
                if (!consumerEmail) {
                    item.skippedReason = 'No consumer email on record';
                    result.skipped++;

                    await createStaffAlert(
                        caseData.id,
                        caseData.fileNumber,
                        clientName,
                        statusCode,
                        daysInStatus,
                        adminId,
                        adminUsers.map(u => u.id),
                        caseData.assignedToId,
                        `Case is overdue (${daysInStatus} days in "${statusCode}") but no consumer email is on record. Please contact the consumer manually.`
                    );

                    result.items.push(item);
                    continue;
                }

                const emailResult = await sendStatusChangeNotification({
                    caseId: caseData.id,
                    clientName,
                    clientEmail: consumerEmail,
                    clientPhone: caseData.client.phone,
                    fileNumber: caseData.fileNumber,
                    statusCode: 'OUTSTANDING_DOCS',
                    isB2B: caseData.acquisitionType === 'B2B',
                    partnerName: caseData.partnerName,
                    services: caseData.services ? (() => {
                        try { return (JSON.parse(caseData.services as string) as string[]).join(', '); }
                        catch { return ''; }
                    })() : '',
                });

                await prisma.workflowLog.create({
                    data: {
                        caseId: caseData.id,
                        fromStatus: statusCode,
                        toStatus: statusCode,
                        action: LOG_ACTIONS.CONSUMER,
                        timestamp: new Date(),
                        notes: `[OVERDUE SCAN] Consumer follow-up email sent to ${consumerEmail}. Case is ${daysInStatus} days in "${statusCode}" (SLA: ${slaDays} days). Email ${emailResult.emailSuccess ? 'delivered ✓' : 'failed ✗'}.`,
                        userId: adminId ?? undefined,
                    },
                });

                await addCaseComment(
                    caseData.id,
                    adminId,
                    `[OVERDUE SCAN — CONSUMER FOLLOW-UP]\nCase has been in "${statusCode}" for ${daysInStatus} day(s) (SLA: ${slaDays} day(s)).\nReminder email sent to consumer (${consumerEmail}) — ${emailResult.emailSuccess ? 'delivered ✓' : 'failed ✗'}.\nNext follow-up will be sent in ${COOLDOWN_DAYS.CONSUMER} days if no status change.`
                );

                item.actioned = true;
                result.actioned++;
                result.consumerFollowups++;
            }

            // ── Staff Alert ───────────────────────────────────────────────────
            else if (actionType === 'STAFF_ALERT') {
                if (wasRecentlyActioned(caseData.workflowLogs, LOG_ACTIONS.STAFF, COOLDOWN_DAYS.STAFF)) {
                    item.skippedReason = `Staff alert already sent within last ${COOLDOWN_DAYS.STAFF} days`;
                    result.skipped++;
                    result.items.push(item);
                    continue;
                }

                await createStaffAlert(
                    caseData.id,
                    caseData.fileNumber,
                    clientName,
                    statusCode,
                    daysInStatus,
                    adminId,
                    adminUsers.map(u => u.id),
                    caseData.assignedToId,
                    `Case has been in "${statusCode}" for ${daysInStatus} day(s) (SLA: ${slaDays ?? 'N/A'} day(s)). Please review and take action.`
                );

                await prisma.workflowLog.create({
                    data: {
                        caseId: caseData.id,
                        fromStatus: statusCode,
                        toStatus: statusCode,
                        action: LOG_ACTIONS.STAFF,
                        timestamp: new Date(),
                        notes: `[OVERDUE SCAN] Staff alert created. Case is ${daysInStatus} days in "${statusCode}" (SLA: ${slaDays} days).`,
                        userId: adminId ?? undefined,
                    },
                });

                item.actioned = true;
                result.actioned++;
                result.staffAlerts++;
            }

        } catch (err) {
            logger.error(`[OVERDUE_SCAN] Error processing case ${caseData.fileNumber}:`, err);
            item.error = err instanceof Error ? err.message : String(err);
            result.errors++;
        }

        result.items.push(item);
    }

    const duration = Date.now() - startedAt.getTime();
    logger.info(
        `[OVERDUE_SCAN] Complete in ${duration}ms. Scanned: ${result.scanned}, Overdue: ${result.overdueFound}, ` +
        `Actioned: ${result.actioned} (DC: ${result.dcFollowups}, Consumer: ${result.consumerFollowups}, Staff: ${result.staffAlerts}), ` +
        `Skipped: ${result.skipped}, Errors: ${result.errors}`
    );

    return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createStaffAlert(
    caseId: string,
    fileNumber: string,
    clientName: string,
    statusCode: string,
    daysInStatus: number,
    adminId: string | null,
    adminUserIds: string[],
    assignedToId: string | null | undefined,
    message: string
): Promise<void> {
    const recipientIds = new Set<string>([...adminUserIds]);
    if (assignedToId) recipientIds.add(assignedToId);

    const notificationData = [...recipientIds].map(userId => ({
        userId,
        type: 'OVERDUE_ALERT',
        title: `⚠️ Overdue: ${fileNumber}`,
        message: `${clientName} — ${message}`,
        caseId,
        linkUrl: `/cases/${caseId}`,
    }));

    if (notificationData.length > 0) {
        await prisma.inAppNotification.createMany({ data: notificationData });
    }

    await addCaseComment(
        caseId,
        adminId,
        `[OVERDUE SCAN — STAFF ALERT]\nCase has been in "${statusCode}" for ${daysInStatus} day(s).\n${message}\nAssigned staff and admins have been notified.`
    );
}

async function addCaseComment(
    caseId: string,
    userId: string | null,
    content: string
): Promise<void> {
    await prisma.caseComment.create({
        data: {
            caseId,
            userId: userId ?? undefined,
            content: `[SYSTEM] ${content}`,
            type: 'NOTE',
            isInternal: true,
            activityType: 'SYSTEM_NOTIFICATION',
        },
    });
}
