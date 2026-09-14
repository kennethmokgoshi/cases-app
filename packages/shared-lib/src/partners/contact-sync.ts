/**
 * Keep a partner branch and its Referrer record in step.
 *
 * A branch exists twice in this data model: as a `PartnerBranch` (the contact
 * directory) and as a `Referrer` attached to the same Project folder — 77 of
 * the 78 seeded branches have both, and they are the same real office. Staff
 * should not have to type an email address and a cell number into two places,
 * and the contact fallback should not depend on which of the two they picked.
 *
 * This module fills blanks in both directions. It deliberately never
 * overwrites a value that is already present and different: a referrer who is
 * a private individual may legitimately have their own contact details that
 * are not the branch's, and silently clobbering those would be worse than
 * leaving the two records to disagree.
 *
 * Node-only (imports @zenowethu/database) — deep-import it:
 *   import { syncBranchReferrerContact } from '@zenowethu/shared-lib/src/partners/contact-sync'
 */

import { prisma } from '@zenowethu/database';
import { logger } from '../logger';

/** The paired fields: a branch's phone is a referrer's cellNumber. */
const FIELD_PAIRS = [
    { branchField: 'email', referrerField: 'email' },
    { branchField: 'phone', referrerField: 'cellNumber' },
] as const;

export interface ContactSyncFill {
    target: 'BRANCH' | 'REFERRER';
    field: string;
    value: string;
}

export interface ContactSyncResult {
    branchId: string;
    referrerId: string;
    /** Values copied across. Empty when both sides already agreed. */
    filled: ContactSyncFill[];
}

function clean(value: string | null | undefined): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

/**
 * Decide what to copy between a branch and its referrer.
 *
 * Pure, so the rule is testable without a database: for each paired field,
 * copy from whichever side has a value to whichever side is blank; do nothing
 * when both are blank or both are set.
 */
export function planContactSync(
    branch: { email?: string | null; phone?: string | null },
    referrer: { email?: string | null; cellNumber?: string | null }
): ContactSyncFill[] {
    const fills: ContactSyncFill[] = [];

    for (const { branchField, referrerField } of FIELD_PAIRS) {
        const branchValue = clean(branch[branchField]);
        const referrerValue = clean(referrer[referrerField]);

        if (branchValue && !referrerValue) {
            fills.push({ target: 'REFERRER', field: referrerField, value: branchValue });
        } else if (referrerValue && !branchValue) {
            fills.push({ target: 'BRANCH', field: branchField, value: referrerValue });
        }
    }

    return fills;
}

/**
 * Sync one branch/referrer pair, identified from either side.
 *
 * Returns null when there is nothing to pair with — a branch with no Project
 * folder, a Project with no Referrer, or a referrer that is not a branch.
 * Never throws: a sync failure must not fail the save that triggered it.
 */
export async function syncBranchReferrerContact(
    target: { branchId: string } | { referrerId: string }
): Promise<ContactSyncResult | null> {
    try {
        const branch =
            'branchId' in target
                ? await prisma.partnerBranch.findUnique({
                    where: { id: target.branchId },
                    select: { id: true, projectId: true, email: true, phone: true } })
                : await (async () => {
                    const referrer = await prisma.referrer.findUnique({
                        where: { id: target.referrerId },
                        select: { projectId: true } });
                    if (!referrer?.projectId) return null;
                    return prisma.partnerBranch.findUnique({
                        where: { projectId: referrer.projectId },
                        select: { id: true, projectId: true, email: true, phone: true } });
                })();

        if (!branch?.projectId) return null;

        const referrer = await prisma.referrer.findUnique({
            where: { projectId: branch.projectId },
            select: { id: true, email: true, cellNumber: true } });
        if (!referrer) return null;

        const filled = planContactSync(branch, referrer);
        if (filled.length === 0) {
            return { branchId: branch.id, referrerId: referrer.id, filled: [] };
        }

        const branchData: Record<string, string> = {};
        const referrerData: Record<string, string> = {};
        for (const fill of filled) {
            if (fill.target === 'BRANCH') branchData[fill.field] = fill.value;
            else referrerData[fill.field] = fill.value;
        }

        await prisma.$transaction([
            ...(Object.keys(branchData).length > 0
                ? [prisma.partnerBranch.update({ where: { id: branch.id }, data: branchData })]
                : []),
            ...(Object.keys(referrerData).length > 0
                ? [prisma.referrer.update({ where: { id: referrer.id }, data: referrerData })]
                : []),
        ]);

        logger.info(
            { branchId: branch.id, referrerId: referrer.id, filled },
            'Synced contact details between partner branch and referrer'
        );

        return { branchId: branch.id, referrerId: referrer.id, filled };
    } catch (error) {
        logger.error({ err: error, target }, 'Branch/referrer contact sync failed');
        return null;
    }
}

/**
 * Sync every branch/referrer pair — used after a CSV import, which can fill in
 * dozens of branches at once.
 */
export async function syncPartnerContacts(partnerProjectId?: string): Promise<ContactSyncResult[]> {
    const branches = await prisma.partnerBranch.findMany({
        where: {
            ...(partnerProjectId ? { partnerProjectId } : {}),
            projectId: { not: null } },
        select: { id: true } });

    const results: ContactSyncResult[] = [];
    for (const branch of branches) {
        const result = await syncBranchReferrerContact({ branchId: branch.id });
        if (result && result.filled.length > 0) results.push(result);
    }
    return results;
}
