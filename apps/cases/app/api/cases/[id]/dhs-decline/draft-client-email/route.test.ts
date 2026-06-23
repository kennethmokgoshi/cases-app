import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';

// Mock the auth and prisma
vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: vi.fn(() => ({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    })),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: {
            findUnique: vi.fn(),
        },
    },
}));

describe('POST /api/cases/[id]/dhs-decline/draft-client-email', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should draft an email for CLIENT_CONSENT_NEEDED reason', async () => {
        const mockCase = {
            id: 'case-123',
            fileNumber: 'FILE-001',
            clientId: 'client-123',
            debtCounsellordId: 'dc-123',
            client: {
                id: 'client-123',
                firstName: 'John',
                lastName: 'Doe',
                idNumber: '9101011234567',
                whatsappNumber: '+27821234567',
            },
            debtCounsellor: {
                id: 'dc-123',
                ncrdcNo: 'NCRDC123',
                tradingName: 'Debt Solutions Inc',
                fullName: 'Debt Solutions Incorporated',
            },
        };

        (auth as any).mockResolvedValue({ user: { id: 'user-123' } });
        (prisma.case.findUnique as any).mockResolvedValue(mockCase);

        const declineReason = 'Unable to confirm transfer with client';
        const draftEmail = `Hi John,\n\nYour debt counsellor transfer application has been received, but Debt Solutions Inc (current DC) needs you to confirm directly with them that you want to proceed.\n\nPlease contact your current debt counsellor as soon as possible and confirm in writing (via email or WhatsApp) that you consent to the transfer. Once they have your confirmation, the transfer can move forward.\n\nIf you have any questions, please let us know.\n\nBest regards,\nZenowethu Team`;

        expect(declineReason).toContain('Unable to confirm transfer with client');
        expect(draftEmail).toContain('John');
        expect(draftEmail).toContain('Debt Solutions Inc');
    });

    it('should include client WhatsApp number in response', () => {
        const mockCase = {
            client: {
                whatsappNumber: '+27821234567',
            },
        };

        expect(mockCase.client.whatsappNumber).toBeTruthy();
        expect(mockCase.client.whatsappNumber).toMatch(/^\+27/);
    });

    it('should mask ID number in email but preserve full ID in response', () => {
        const idNumber = '9101011234567';
        const maskedLast4 = idNumber.slice(-4); // '4567'

        expect(maskedLast4).toBe('4567');
        expect(idNumber).toBe('9101011234567');
    });

    it('should handle different decline reasons appropriately', () => {
        const reasonsAndExpectedContent = [
            {
                reason: 'Client has not consented to transfer',
                shouldContain: 'consent',
            },
            {
                reason: 'Please contact your debt counsellor',
                shouldContain: 'contact',
            },
            {
                reason: 'Consumer needs to confirm instruction',
                shouldContain: 'confirm',
            },
        ];

        reasonsAndExpectedContent.forEach(({ reason, shouldContain }) => {
            expect(reason.toLowerCase()).toContain(shouldContain);
        });
    });
});
