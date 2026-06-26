// Prisma-backed read/write for per-app next-update dates. Node-only — import
// directly in server routes (NOT from the package root).

import { prisma } from '@zenowethu/database';
import { isNextUpdateOverdue, type NextUpdateApp } from './next-update';

/** Read a single app's next-update row for a case (null when never set). */
export async function getCaseAppNextUpdate(caseId: string, app: NextUpdateApp) {
    return prisma.caseAppNextUpdate.findUnique({
        where: { caseId_app: { caseId, app } },
    });
}

/** Read every app's next-update row for a case. */
export async function getAllCaseAppNextUpdates(caseId: string) {
    return prisma.caseAppNextUpdate.findMany({ where: { caseId } });
}

export interface SetNextUpdateInput {
    caseId: string;
    app: NextUpdateApp;
    nextUpdateDate: Date | null;
    note?: string | null;
    userId?: string | null;
}

/** Create or update an app's next-update date for a case (isolated per app). */
export async function setCaseAppNextUpdate(input: SetNextUpdateInput) {
    const isOverdue = isNextUpdateOverdue(input.nextUpdateDate);
    return prisma.caseAppNextUpdate.upsert({
        where: { caseId_app: { caseId: input.caseId, app: input.app } },
        create: {
            caseId: input.caseId,
            app: input.app,
            nextUpdateDate: input.nextUpdateDate,
            note: input.note ?? null,
            isOverdue,
            updatedById: input.userId ?? null,
        },
        update: {
            nextUpdateDate: input.nextUpdateDate,
            note: input.note ?? null,
            isOverdue,
            updatedById: input.userId ?? null,
        },
    });
}

/**
 * Recompute and persist the isOverdue flag for an app's rows whose date has
 * passed. Returns the number of rows flipped to overdue. Run on a schedule.
 */
export async function refreshAppOverdueFlags(app: NextUpdateApp, now: Date = new Date()): Promise<number> {
    const res = await prisma.caseAppNextUpdate.updateMany({
        where: { app, isOverdue: false, nextUpdateDate: { not: null, lt: now } },
        data: { isOverdue: true },
    });
    return res.count;
}

/** List the cases that are overdue in a given app (its own date has passed). */
export async function listAppOverdue(app: NextUpdateApp, now: Date = new Date()) {
    return prisma.caseAppNextUpdate.findMany({
        where: { app, nextUpdateDate: { not: null, lt: now } },
        orderBy: { nextUpdateDate: 'asc' },
        include: {
            case: {
                select: {
                    id: true,
                    fileNumber: true,
                    status: true,
                    client: { select: { firstName: true, lastName: true } },
                },
            },
        },
    });
}
