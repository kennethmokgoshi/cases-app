/**
 * Prisma-backed lookup for the partner branch contact fallback.
 *
 * Node-only (imports @zenowethu/database) — deep-import it, do not re-export it
 * from the package index:
 *   import { resolveCaseContact } from '@zenowethu/shared-lib/src/partners/branch-contact-service'
 */

import { prisma } from '@zenowethu/database';
import { logger } from '../logger';
import { resolveContact } from './branch-contact';
import type { BranchContactInput, ReferrerContactInput, ResolvedContact } from './branch-contact';

const BRANCH_CONTACT_SELECT = {
    id: true,
    name: true,
    email: true,
    phone: true,
    alternatePhone: true,
    whatsappNumber: true,
    isActive: true } as const;

/**
 * Find the branch record for a case.
 *
 * Prefers the resolved `partnerBranchId` link. Cases captured before the branch
 * directory existed only carry the free-text `partnerName`/`partnerBranch`, so
 * fall back to matching those by name.
 */
export async function getCaseBranch(caseId: string): Promise<(BranchContactInput & { id: string }) | null> {
    const caseRecord = await prisma.case.findUnique({
        where: { id: caseId },
        select: {
            partnerName: true,
            partnerBranch: true,
            partnerBranchRef: { select: BRANCH_CONTACT_SELECT } } });

    if (!caseRecord) return null;
    if (caseRecord.partnerBranchRef) return caseRecord.partnerBranchRef;

    const branchName = caseRecord.partnerBranch?.trim();
    const partnerName = caseRecord.partnerName?.trim();
    if (!branchName || !partnerName) return null;

    const exact = await prisma.partnerBranch.findFirst({
        where: {
            name: { equals: branchName, mode: 'insensitive' },
            partnerProject: { name: { equals: partnerName, mode: 'insensitive' } } },
        select: BRANCH_CONTACT_SELECT });
    if (exact) return exact;

    // Intake sometimes records a longer form of the partner's name than the
    // project carries — "Letsatsi Finance" against the project "Letsatsi".
    // Match on the leading word so the branch still resolves, without matching
    // an unrelated partner that merely shares a substring.
    const leadingWord = partnerName.split(/\s+/)[0];
    if (!leadingWord || leadingWord.toLowerCase() === partnerName.toLowerCase()) return null;

    return prisma.partnerBranch.findFirst({
        where: {
            name: { equals: branchName, mode: 'insensitive' },
            partnerProject: { name: { equals: leadingWord, mode: 'insensitive' } } },
        select: BRANCH_CONTACT_SELECT });
}

/**
 * Resolve the contact details to use for a case's consumer, falling back to the
 * referring partner branch per channel when the consumer has none of their own.
 *
 * Never throws — a lookup failure degrades to the consumer's own details rather
 * than blocking the send.
 */
export async function resolveCaseContact(caseId: string): Promise<ResolvedContact> {
    const caseRecord = await prisma.case.findUnique({
        where: { id: caseId },
        select: {
            client: { select: { email: true, phone: true, whatsappNumber: true } },
            referrer: {
                select: { firstName: true, lastName: true, email: true, cellNumber: true, isActive: true } } } });

    const consumer = {
        email: caseRecord?.client?.email ?? null,
        phone: caseRecord?.client?.phone ?? null,
        whatsapp: caseRecord?.client?.whatsappNumber ?? null };

    const referrer: ReferrerContactInput | null = caseRecord?.referrer ?? null;

    let branch: BranchContactInput | null = null;
    try {
        branch = await getCaseBranch(caseId);
    } catch (error) {
        logger.error(
            { err: error, caseId },
            'Failed to load partner branch for contact fallback — falling through to the referrer'
        );
    }

    return resolveContact(consumer, branch, referrer);
}
