/**
 * Consumer contact fallback — pure resolution logic.
 *
 * B2B consumers are referred by a partner branch (e.g. a Letsatsi branch) and
 * often by a named referrer as well. Many of those consumers have no email
 * address and no cell number of their own; without a fallback, every
 * notification for those cases is silently undeliverable.
 *
 * The rule this module implements is a per-channel chain:
 *
 *     consumer  →  referring branch  →  referrer
 *
 * Each channel falls through independently — a consumer with a cell number but
 * no email gets SMS at their own number and email at the branch. The branch is
 * tried before the referrer because a branch is always a business office,
 * whereas a referrer may be a private individual.
 *
 * This file is deliberately Prisma-free so it can be imported anywhere. The
 * database-backed lookup lives in `./branch-contact-service`.
 */

/** Where a resolved contact detail came from. */
export type ContactSource = 'CONSUMER' | 'BRANCH' | 'REFERRER' | 'NONE';

export interface ConsumerContactInput {
    email?: string | null;
    phone?: string | null;
    whatsapp?: string | null;
}

export interface BranchContactInput {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    alternatePhone?: string | null;
    whatsappNumber?: string | null;
    isActive?: boolean;
}

export interface ReferrerContactInput {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    cellNumber?: string | null;
    isActive?: boolean;
}

export interface ResolvedContact {
    email: string | null;
    emailSource: ContactSource;
    phone: string | null;
    phoneSource: ContactSource;
    whatsapp: string | null;
    whatsappSource: ContactSource;
    /** Name of the branch, when the branch supplied at least one detail. */
    branchName: string | null;
    /** Name of the referrer, when the referrer supplied at least one detail. */
    referrerName: string | null;
    /** True when any channel fell through past the consumer. */
    usedFallback: boolean;
}

/** Trim and treat blank strings as absent. */
function clean(value: string | null | undefined): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

/** One rung of the fallback chain, already normalised. */
interface ContactTier {
    source: ContactSource;
    name: string | null;
    email: string | null;
    phone: string | null;
    whatsapp: string | null;
}

function consumerTier(consumer: ConsumerContactInput | null | undefined): ContactTier {
    const phone = clean(consumer?.phone);
    return {
        source: 'CONSUMER',
        name: null,
        email: clean(consumer?.email),
        phone,
        // A consumer's WhatsApp is their cell number unless recorded separately.
        whatsapp: clean(consumer?.whatsapp) ?? phone };
}

/**
 * A branch or referrer only supplies fallback details while it is active. An
 * inactive one has closed or been decommissioned — sending a consumer's case
 * correspondence there would be worse than not sending it.
 */
function branchTier(branch: BranchContactInput | null | undefined): ContactTier | null {
    if (!branch || branch.isActive === false) return null;
    // A branch's landline may be recorded as either phone or alternatePhone.
    const phone = clean(branch.phone) ?? clean(branch.alternatePhone);
    return {
        source: 'BRANCH',
        name: clean(branch.name),
        email: clean(branch.email),
        phone,
        whatsapp: clean(branch.whatsappNumber) ?? phone };
}

function referrerTier(referrer: ReferrerContactInput | null | undefined): ContactTier | null {
    if (!referrer || referrer.isActive === false) return null;
    const phone = clean(referrer.cellNumber);
    const name = [clean(referrer.firstName), clean(referrer.lastName)].filter(Boolean).join(' ');
    return {
        source: 'REFERRER',
        name: name.length > 0 ? name : null,
        email: clean(referrer.email),
        phone,
        whatsapp: phone };
}

/** First tier that has a value for this channel. */
function pick(tiers: ContactTier[], channel: 'email' | 'phone' | 'whatsapp'): ContactTier | null {
    return tiers.find((tier) => tier[channel] !== null) ?? null;
}

/**
 * Resolve the contact details to use for a consumer, falling through to their
 * referring branch and then their referrer, per channel.
 */
export function resolveContact(
    consumer: ConsumerContactInput | null | undefined,
    branch: BranchContactInput | null | undefined,
    referrer?: ReferrerContactInput | null
): ResolvedContact {
    const tiers = [consumerTier(consumer), branchTier(branch), referrerTier(referrer)]
        .filter((tier): tier is ContactTier => tier !== null);

    const emailTier = pick(tiers, 'email');
    const phoneTier = pick(tiers, 'phone');
    const whatsappTier = pick(tiers, 'whatsapp');

    const used = [emailTier, phoneTier, whatsappTier].filter(
        (tier): tier is ContactTier => tier !== null && tier.source !== 'CONSUMER'
    );

    const nameFor = (source: ContactSource) => used.find((tier) => tier.source === source)?.name ?? null;

    return {
        email: emailTier?.email ?? null,
        emailSource: emailTier?.source ?? 'NONE',
        phone: phoneTier?.phone ?? null,
        phoneSource: phoneTier?.source ?? 'NONE',
        whatsapp: whatsappTier?.whatsapp ?? null,
        whatsappSource: whatsappTier?.source ?? 'NONE',
        branchName: nameFor('BRANCH'),
        referrerName: nameFor('REFERRER'),
        usedFallback: used.length > 0 };
}

/**
 * Human-readable summary of what the fallback did, for audit logs and the
 * notification history so staff can see a message went to a branch or referrer
 * rather than to the consumer.
 */
export function describeContactFallback(resolved: ResolvedContact): string | null {
    if (!resolved.usedFallback) return null;

    const bySource = new Map<ContactSource, string[]>();
    const note = (source: ContactSource, channel: string) => {
        if (source === 'CONSUMER' || source === 'NONE') return;
        bySource.set(source, [...(bySource.get(source) ?? []), channel]);
    };
    note(resolved.emailSource, 'email');
    note(resolved.phoneSource, 'SMS');
    note(resolved.whatsappSource, 'WhatsApp');

    const parts = [...bySource.entries()].map(([source, channels]) => {
        const who =
            source === 'BRANCH'
                ? resolved.branchName ?? 'the referring branch'
                : resolved.referrerName ?? 'the referrer';
        return `no ${channels.join('/')} contact — sent to ${who} instead`;
    });

    return `Consumer has ${parts.join('; ')}.`;
}
