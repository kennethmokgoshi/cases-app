/**
 * Prisma-backed lookup for the partner branch contact fallback.
 *
 * Node-only (imports @zenowethu/database) — deep-import it, do not re-export it
 * from the package index:
 *   import { resolveCaseContact } from '@zenowethu/shared-lib/src/partners/branch-contact-service'
 */

import { prisma } from '@zenowethu/database';
import { logger } from '../logger';
import { resolveContact, resolveEmailRecipients } from './branch-contact';
import type { BranchContactInput, EmailRecipients, ReferrerContactInput, ResolvedContact } from './branch-contact';

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

export type ReferrerEmailSource = 'referrer' | 'branch' | 'partner';

export interface ReferrerEmailResult {
    email: string | null;
    /** Cell number from the same source as the email (partners carry none). */
    phone: string | null;
    source: ReferrerEmailSource | null;
    /** Display name of whoever the email belongs to (referrer, branch or partner). */
    label: string | null;
}

const EMPTY_REFERRER_EMAIL: ReferrerEmailResult = { email: null, phone: null, source: null, label: null };

function cleanEmail(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}

/**
 * The email a new lead/case form should pre-fill as the primary contact for a
 * selected project (sub-project / branch). Works for every partner and for B2C
 * referrers alike. Priority:
 *   1. the registered referrer linked to the project
 *   2. the partner branch contact (linked to the project, else matched by name
 *      under the parent partner)
 *   3. the parent partner's billing email
 * Returns an empty result when nothing is on file — i.e. the consumer was not
 * referred, so there is nothing to pre-fill.
 */
export async function resolveReferrerEmailForProject(projectId: string): Promise<ReferrerEmailResult> {
    const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: {
            name: true,
            parentId: true,
            referrer: { select: { firstName: true, lastName: true, email: true, cellNumber: true, isActive: true } },
            branchProfile: { select: { name: true, email: true, phone: true, isActive: true } },
            billingEmail: true,
            parent: { select: { billingEmail: true, name: true } } } });
    if (!project) return EMPTY_REFERRER_EMAIL;

    const referrer = project.referrer?.isActive ? project.referrer : null;
    const referrerEmail = cleanEmail(referrer?.email);
    const referrerPhone = cleanEmail(referrer?.cellNumber);
    if (referrer && (referrerEmail || referrerPhone)) {
        return {
            email: referrerEmail,
            phone: referrerPhone,
            source: 'referrer',
            label: `${referrer.firstName} ${referrer.lastName}`.trim() };
    }

    let branch = project.branchProfile;
    if (!branch && project.parentId) {
        branch = await prisma.partnerBranch.findFirst({
            where: {
                partnerProjectId: project.parentId,
                name: { equals: project.name.trim(), mode: 'insensitive' } },
            select: { name: true, email: true, phone: true, isActive: true } });
    }
    const activeBranch = branch?.isActive ? branch : null;
    const branchEmail = cleanEmail(activeBranch?.email);
    const branchPhone = cleanEmail(activeBranch?.phone);
    if (activeBranch && (branchEmail || branchPhone)) {
        // A branch with only a phone still supplies it; the email can then come
        // from the partner's billing address below.
        const partnerEmail = branchEmail ?? cleanEmail(project.parent?.billingEmail);
        return { email: partnerEmail, phone: branchPhone, source: 'branch', label: activeBranch.name };
    }

    // A top-level partner project is its own partner.
    const partnerEmail = cleanEmail(project.parent?.billingEmail ?? project.billingEmail);
    if (partnerEmail) {
        return { email: partnerEmail, phone: null, source: 'partner', label: project.parent?.name ?? project.name };
    }

    return EMPTY_REFERRER_EMAIL;
}

/**
 * Who should receive a case's email: the referring referrer/branch as the main
 * contact, with the consumer copied. Never throws — a failed lookup degrades to
 * the consumer's own address so a send is never blocked.
 */
export async function resolveCaseEmailRecipients(
    caseId: string,
    payloadConsumerEmail?: string | null
): Promise<EmailRecipients> {
    try {
        const caseRecord = await prisma.case.findUnique({
            where: { id: caseId },
            select: {
                client: { select: { email: true, alternativeEmail: true } },
                referrer: { select: { email: true, isActive: true } } } });

        const referrerEmail = caseRecord?.referrer?.isActive === false
            ? null
            : cleanEmail(caseRecord?.referrer?.email);

        let referralEmail = referrerEmail;
        if (!referralEmail) {
            const branch = await getCaseBranch(caseId);
            referralEmail = branch && branch.isActive !== false ? cleanEmail(branch.email) : null;
        }

        return resolveEmailRecipients(
            payloadConsumerEmail ?? caseRecord?.client?.email,
            caseRecord?.client?.alternativeEmail,
            referralEmail
        );
    } catch (error) {
        logger.error({ err: error, caseId }, 'Failed to resolve case email recipients — using the consumer address');
        return resolveEmailRecipients(payloadConsumerEmail, null, null);
    }
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
