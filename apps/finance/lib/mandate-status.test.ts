import { describe, it, expect } from 'vitest';
import {
    buildMandateChecklist,
    mandateProgress,
    nextMandateAction,
    canTransition,
    isMandateStatus,
} from './mandate-status';

const base = {
    requested: false,
    status: 'DRAFT',
    amount: null as number | null,
    bankName: null as string | null,
    accountNumber: null as string | null,
    branchCode: null as string | null,
    sentAt: null as Date | null,
    signedReturnedAt: null as Date | null,
    signedDocumentId: null as string | null,
    nupayDocumentId: null as string | null,
    nupayReference: null as string | null,
};

describe('buildMandateChecklist', () => {
    it('marks nothing done for a blank draft', () => {
        const items = buildMandateChecklist(base);
        expect(items.every(i => !i.done)).toBe(true);
        expect(items).toHaveLength(7);
    });

    it('requires all three banking fields before banking is done', () => {
        const partial = buildMandateChecklist({ ...base, bankName: 'Capitec', accountNumber: '123' });
        expect(partial.find(i => i.key === 'banking')?.done).toBe(false);
        const full = buildMandateChecklist({ ...base, bankName: 'Capitec', accountNumber: '123', branchCode: '470010' });
        expect(full.find(i => i.key === 'banking')?.done).toBe(true);
    });

    it('treats a zero or negative amount as not set', () => {
        expect(buildMandateChecklist({ ...base, amount: 0 }).find(i => i.key === 'amount')?.done).toBe(false);
        expect(buildMandateChecklist({ ...base, amount: 500 }).find(i => i.key === 'amount')?.done).toBe(true);
        expect(buildMandateChecklist({ ...base, amount: '750.50' }).find(i => i.key === 'amount')?.done).toBe(true);
    });
});

describe('mandateProgress', () => {
    it('is 0 for a blank draft and 100 when fully complete', () => {
        expect(mandateProgress(base)).toBe(0);
        const complete = {
            ...base,
            requested: true,
            bankName: 'Capitec',
            accountNumber: '123',
            branchCode: '470010',
            amount: 500,
            sentAt: new Date(),
            signedReturnedAt: new Date(),
            signedDocumentId: 'doc1',
            nupayDocumentId: 'doc2',
        };
        expect(mandateProgress(complete)).toBe(100);
    });
});

describe('nextMandateAction', () => {
    it('walks the consumer through the lifecycle in order', () => {
        expect(nextMandateAction(base)).toMatch(/wants a debit order/);
        expect(nextMandateAction({ ...base, requested: true })).toMatch(/banking details/);
        expect(nextMandateAction({ ...base, requested: true, bankName: 'Capitec', accountNumber: '1', branchCode: '470010' })).toMatch(/mandate amount/);
        const ready = { ...base, requested: true, bankName: 'Capitec', accountNumber: '1', branchCode: '470010', amount: 500 };
        expect(nextMandateAction(ready)).toMatch(/Send the mandate/);
        expect(nextMandateAction({ ...ready, sentAt: new Date() })).toMatch(/Upload the signed mandate/);
        expect(nextMandateAction({ ...ready, sentAt: new Date(), signedReturnedAt: new Date(), signedDocumentId: 'd' })).toMatch(/NuPay/);
    });

    it('returns null when fully set up', () => {
        const complete = { ...base, requested: true, bankName: 'C', accountNumber: '1', branchCode: '470010', amount: 500, sentAt: new Date(), signedReturnedAt: new Date(), signedDocumentId: 'd', nupayDocumentId: 'n' };
        expect(nextMandateAction(complete)).toBeNull();
    });

    it('handles cancelled and rejected terminal states', () => {
        expect(nextMandateAction({ ...base, status: 'CANCELLED' })).toBeNull();
        expect(nextMandateAction({ ...base, status: 'REJECTED' })).toMatch(/rejected/);
    });
});

describe('canTransition', () => {
    it('allows valid forward steps', () => {
        expect(canTransition('DRAFT', 'SENT')).toBe(true);
        expect(canTransition('SENT', 'SIGNED')).toBe(true);
        expect(canTransition('SIGNED', 'REGISTERED')).toBe(true);
        expect(canTransition('REGISTERED', 'ACTIVE')).toBe(true);
    });

    it('rejects illegal skips', () => {
        expect(canTransition('DRAFT', 'ACTIVE')).toBe(false);
        expect(canTransition('CANCELLED', 'ACTIVE')).toBe(false);
    });

    it('allows cancel from any live state and no-op to self', () => {
        expect(canTransition('SENT', 'CANCELLED')).toBe(true);
        expect(canTransition('ACTIVE', 'ACTIVE')).toBe(true);
    });

    it('rejects unknown statuses', () => {
        expect(canTransition('FOO', 'SENT')).toBe(false);
        expect(isMandateStatus('FOO')).toBe(false);
        expect(isMandateStatus('ACTIVE')).toBe(true);
    });
});
