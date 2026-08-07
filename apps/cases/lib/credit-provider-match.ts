import type { PrismaClient } from '@zenowethu/database';

/**
 * Uppercases, strips punctuation, and collapses whitespace only — deliberately
 * does NOT strip corporate suffixes like "GROUP" or "PTY LTD". Credit reports
 * can list closely related but distinct creditors (e.g. "NIMBLE" and "NIMBLE
 * GROUP" as separate accounts on the same case), so aggressive normalization
 * would risk merging them under one CreditProvider.
 */
export function normalizeCreditorName(name: string): string {
    return name
        .toUpperCase()
        .replace(/[^A-Z0-9 ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Finds the CreditProvider whose (normalized) name exactly matches the given
 * creditor name, if any. Returns null when there's no match — callers should
 * leave the account unlinked rather than guess.
 */
export async function findMatchingCreditProvider(
    prisma: PrismaClient,
    creditorName: string,
) {
    const target = normalizeCreditorName(creditorName);
    if (!target) return null;

    const exact = await prisma.creditProvider.findFirst({
        where: { name: { equals: creditorName.trim(), mode: 'insensitive' } },
    });
    if (exact) return exact;

    const candidates = await prisma.creditProvider.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
    });
    const match = candidates.find(p => normalizeCreditorName(p.name) === target);
    if (!match) return null;

    return prisma.creditProvider.findUnique({ where: { id: match.id } });
}
