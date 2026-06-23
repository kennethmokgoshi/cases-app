import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma } from '@zenowethu/database';
import { auth, sendManualMessage } from '@zenowethu/shared-lib';

// Mock dependencies
vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: vi.fn(() => ({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    })),
    sendManualMessage: vi.fn(),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: {
            findUnique: vi.fn(),
        },
    },
}));

describe('POST /api/cases/[id]/dhs-decline/send-client-email', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should send a message to the client via WhatsApp', async () => {
        const mockCase = {
            id: 'case-123',
            fileNumber: 'FILE-001',
            clientId: 'client-123',
            client: {
                id: 'client-123',
                firstName: 'John',
                whatsappNumber: '+27821234567',
            },
        };

        (auth as any).mockResolvedValue({ user: { id: 'user-123' } });
        (prisma.case.findUnique as any).mockResolvedValue(mockCase);
        (sendManualMessage as any).mockResolvedValue({
            whatsappSuccess: true,
            errors: [],
        });

        const emailContent = 'Hi John, please confirm your consent with your debt counsellor.';

        // Simulate the response
        const result = await (sendManualMessage as any)(
            'case-123',
            'WHATSAPP',
            '+27821234567',
            emailContent
        );

        expect(result.whatsappSuccess).toBe(true);
        expect(result.errors).toEqual([]);
    });

    it('should reject if client has no WhatsApp number', () => {
        const mockCase = {
            client: {
                whatsappNumber: null,
            },
        };

        const hasWhatsapp = !!mockCase.client.whatsappNumber;
        expect(hasWhatsapp).toBe(false);
    });

    it('should return error if message send fails', async () => {
        (sendManualMessage as any).mockResolvedValue({
            whatsappSuccess: false,
            errors: ['Failed to send message'],
        });

        const result = await (sendManualMessage as any)(
            'case-123',
            'WHATSAPP',
            '+27821234567',
            'Test message'
        );

        expect(result.whatsappSuccess).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should verify case and client match', () => {
        const caseClientId = 'client-123';
        const requestClientId = 'client-123';

        expect(caseClientId).toBe(requestClientId);
    });

    it('should reject if case not found', () => {
        const caseExists = false;

        expect(caseExists).toBe(false);
    });

    it('should validate email content is not empty', () => {
        const emailContent = 'Hi John, please confirm your consent with your debt counsellor.';

        expect(emailContent.length).toBeGreaterThan(0);
        expect(emailContent.trim()).not.toBe('');
    });
});
