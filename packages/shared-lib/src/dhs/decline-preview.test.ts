import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: { findUnique: vi.fn() },
    },
}));

import { prisma } from '@zenowethu/database';
import { previewDHSDecline } from './decline-preview';

const findUnique = prisma.case.findUnique as unknown as ReturnType<typeof vi.fn>;

function mockCase(overrides: Record<string, unknown> = {}) {
    return {
        id: 'case1',
        fileNumber: 'ZDM-2026-001',
        preferredDcEmail: 'dc@example.co.za',
        lastKnownEmail: null,
        dcEmail: null,
        debtCounsellorName: 'Jane DC',
        dcTradingName: null,
        client: {
            firstName: 'John',
            lastName: 'Doe',
            idNumber: '8001015009087',
            email: 'john@example.com',
            phone: '0821234567',
            whatsappNumber: null,
        },
        documents: [
            { type: 'ID', fileUrl: '/uploads/id.pdf' },
            { type: 'POA', fileUrl: '/uploads/poa.pdf' },
        ],
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = 'https://cases.test';
});

describe('previewDHSDecline', () => {
    it('SEND_DOCS: emails DC (cc client) + SMS client, status DOCUMENTS_EMAILED, no DB writes', async () => {
        findUnique.mockResolvedValue(mockCase());
        const p = await previewDHSDecline({
            caseId: 'case1',
            declineReason: 'Please send transfer documents (POA and ID).',
        });

        expect(p.category).toBe('SEND_DOCS');
        expect(p.statusWouldUpdateTo).toBe('DOCUMENTS_EMAILED');

        const email = p.messages.find(m => m.channel === 'EMAIL');
        expect(email?.to).toBe('dc@example.co.za');
        expect(email?.cc).toEqual(['john@example.com']);
        expect(email?.attachments).toHaveLength(2);
        expect(email?.body).toContain('Dear Jane DC');
        expect(email?.body).toContain('ZDM-2026-001');

        const sms = p.messages.find(m => m.channel === 'SMS');
        expect(sms?.to).toBe('0821234567');
    });

    it('SEND_DOCS with no DC email: flags blocker and stays REJECTED_EMAIL_DOCS', async () => {
        findUnique.mockResolvedValue(mockCase({ preferredDcEmail: null, lastKnownEmail: null, dcEmail: null }));
        const p = await previewDHSDecline({
            caseId: 'case1',
            declineReason: 'Please upload documents.',
        });

        expect(p.category).toBe('SEND_DOCS');
        expect(p.statusWouldUpdateTo).toBe('REJECTED_EMAIL_DOCS');
        expect(p.messages.filter(m => m.channel === 'EMAIL')).toHaveLength(0);
        expect(p.notes.join(' ')).toMatch(/No DC email/i);
    });

    it('OUTSTANDING_FEES: emails consumer, status REJECTED_OWES_FEES', async () => {
        findUnique.mockResolvedValue(mockCase());
        const p = await previewDHSDecline({
            caseId: 'case1',
            declineReason: 'Client owes outstanding fees to the current DC.',
        });
        expect(p.category).toBe('OUTSTANDING_FEES');
        expect(p.statusWouldUpdateTo).toBe('REJECTED_OWES_FEES');
        expect(p.messages.find(m => m.channel === 'EMAIL')?.to).toBe('john@example.com');
    });

    it('prefers WhatsApp over SMS for the consumer mobile message', async () => {
        findUnique.mockResolvedValue(mockCase({
            client: { ...mockCase().client, whatsappNumber: '+27820000000' },
        }));
        const p = await previewDHSDecline({
            caseId: 'case1',
            declineReason: 'Client has not consented — please confirm with client.',
        });
        expect(p.category).toBe('CLIENT_CONSENT_NEEDED');
        const mobile = p.messages.find(m => m.channel === 'WHATSAPP' || m.channel === 'SMS');
        expect(mobile?.channel).toBe('WHATSAPP');
        expect(mobile?.to).toBe('+27820000000');
    });

    it('UNKNOWN reason: no messages, escalation note only', async () => {
        findUnique.mockResolvedValue(mockCase());
        const p = await previewDHSDecline({ caseId: 'case1', declineReason: 'asdf qwer zxcv' });
        expect(p.category).toBe('UNKNOWN');
        expect(p.messages).toHaveLength(0);
        expect(p.notes.join(' ')).toMatch(/could not be auto-classified/i);
    });

    it('returns a not-found preview when the case does not exist', async () => {
        findUnique.mockResolvedValue(null);
        const p = await previewDHSDecline({ caseId: 'missing', declineReason: 'send docs' });
        expect(p.notes).toContain('Case not found');
        expect(p.messages).toHaveLength(0);
    });
});
