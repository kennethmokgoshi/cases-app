import { describe, expect, it, vi } from 'vitest';
import { normalizeCreditorName, findMatchingCreditProvider } from './credit-provider-match';

describe('normalizeCreditorName', () => {
    it('uppercases, strips punctuation, and collapses whitespace', () => {
        expect(normalizeCreditorName('  African Bank Ltd.  ')).toBe('AFRICAN BANK LTD');
    });

    it('does not strip corporate suffix words like GROUP', () => {
        // "NIMBLE" and "NIMBLE GROUP" must stay distinct — credit reports can list
        // both as separate creditors on the same case.
        expect(normalizeCreditorName('Nimble')).not.toBe(normalizeCreditorName('Nimble Group'));
    });
});

describe('findMatchingCreditProvider', () => {
    function mockPrisma(overrides: { findFirst?: unknown; findMany?: unknown; findUnique?: unknown } = {}) {
        return {
            creditProvider: {
                findFirst: vi.fn().mockResolvedValue(overrides.findFirst ?? null),
                findMany: vi.fn().mockResolvedValue(overrides.findMany ?? []),
                findUnique: vi.fn().mockResolvedValue(overrides.findUnique ?? null),
            },
        } as never;
    }

    it('returns the exact case-insensitive match without a fallback query', async () => {
        const provider = { id: 'cp-1', name: 'African Bank' };
        const prisma = mockPrisma({ findFirst: provider });

        const result = await findMatchingCreditProvider(prisma, 'AFRICAN BANK');

        expect(result).toEqual(provider);
        expect((prisma as any).creditProvider.findMany).not.toHaveBeenCalled();
    });

    it('falls back to normalized matching against active providers', async () => {
        const provider = { id: 'cp-2', name: 'Nimble Group' };
        const prisma = mockPrisma({
            findFirst: null,
            findMany: [{ id: 'cp-1', name: 'Nimble' }, { id: 'cp-2', name: 'Nimble Group' }],
            findUnique: provider,
        });

        const result = await findMatchingCreditProvider(prisma, 'NIMBLE GROUP.');

        expect((prisma as any).creditProvider.findUnique).toHaveBeenCalledWith({ where: { id: 'cp-2' } });
        expect(result).toEqual(provider);
    });

    it('returns null when nothing matches', async () => {
        const prisma = mockPrisma({ findFirst: null, findMany: [{ id: 'cp-1', name: 'Capitec' }] });

        const result = await findMatchingCreditProvider(prisma, 'Totally Unrelated Creditor');

        expect(result).toBeNull();
    });

    it('returns null for a blank creditor name without querying', async () => {
        const prisma = mockPrisma();

        const result = await findMatchingCreditProvider(prisma, '   ');

        expect(result).toBeNull();
        expect((prisma as any).creditProvider.findFirst).not.toHaveBeenCalled();
    });
});
