import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted stubs (available before vi.mock factories run) ───────────────────
// vi.mock() is hoisted above const declarations, so any factory that closes
// over a module-level const would hit the temporal dead zone. vi.hoisted()
// executes its callback before the module evaluates, making the result safe
// to reference inside vi.mock() factories.

const { mockSmsSend, mockEmailSend, mockWaSend } = vi.hoisted(() => ({
    mockSmsSend: vi.fn(),
    mockEmailSend: vi.fn(),
    mockWaSend: vi.fn(),
}));

// ─── Default send responses (re-applied in beforeEach) ────────────────────────

const smsSendOk = { success: true, messageId: 'sms-msg-123', contactId: 'contact-456', provider: 'GoHighLevel' };
const emailSendOk = { success: true, messageId: 'email-msg-456', contactId: 'contact-456', provider: 'GoHighLevel' };
const waSendOk = { success: true, messageId: 'wa-msg-789', contactId: 'contact-456', provider: 'GoHighLevel' };

// ─── Hoisted prisma mock ──────────────────────────────────────────────────────
// mockPrisma is referenced in the vi.mock() factory below; vi.hoisted() ensures
// it is evaluated before the factory runs (factories are hoisted above consts).

const mockPrisma = vi.hoisted(() => ({
    case: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
    },
    client: {
        update: vi.fn().mockResolvedValue({}),
    },
    user: {
        findFirst: vi.fn().mockResolvedValue({ id: 'admin-user-id' }),
    },
    caseComment: {
        create: vi.fn().mockResolvedValue({}),
    },
    notificationLog: {
        create: vi.fn().mockResolvedValue({}),
    },
}));

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@zenowethu/database', () => ({ prisma: mockPrisma }));

vi.mock('./ghl-config', () => ({
    getGHLCredentials: vi.fn().mockResolvedValue({
        apiKey: 'test-api-key',
        locationId: 'test-location-id',
    }),
}));

vi.mock('../notifications/providers', () => ({
    GhlSmsProvider: vi.fn().mockImplementation(() => ({ send: mockSmsSend })),
    GhlEmailProvider: vi.fn().mockImplementation(() => ({ send: mockEmailSend })),
    GhlWhatsAppProvider: vi.fn().mockImplementation(() => ({ send: mockWaSend })),
}));

vi.mock('../logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GhlService } from './ghl-service';
import { getGHLCredentials } from './ghl-config';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const mockClient = {
    id: 'client-1',
    firstName: 'John',
    lastName: 'Doe',
    phone: '0821234567',
    email: 'john@example.com',
    whatsappNumber: null,
    ghlContactId: null,
};

const mockCase = {
    id: 'case-1',
    clientId: 'client-1',
    assignedToId: 'user-1',
    client: mockClient,
};

// ─── handleWebhook ────────────────────────────────────────────────────────────

describe('GhlService.handleWebhook', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSmsSend.mockResolvedValue(smsSendOk);
        mockEmailSend.mockResolvedValue(emailSendOk);
        mockWaSend.mockResolvedValue(waSendOk);
    });

    it('returns success for non-message events', async () => {
        const result = await GhlService.handleWebhook({ type: 'ContactUpdated' });
        expect(result).toEqual({ success: true });
    });

    it('handles inbound message and creates case comment', async () => {
        mockPrisma.case.findFirst.mockResolvedValue(mockCase);

        const result = await GhlService.handleWebhook({
            type: 'InboundMessage',
            message: 'Hello, I need help',
            phone: '0821234567',
            channelType: 'SMS',
            contactId: 'contact-456',
        });

        expect(result).toEqual({ success: true, caseId: 'case-1' });
        expect(mockPrisma.caseComment.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    caseId: 'case-1',
                    content: '[Inbound SMS] Hello, I need help',
                    type: 'GHL',
                    activityType: 'INBOUND_MESSAGE',
                }),
            })
        );
    });

    it('persists contactId on client if not already set', async () => {
        mockPrisma.case.findFirst.mockResolvedValue(mockCase);

        await GhlService.handleWebhook({
            type: 'InboundMessage',
            message: 'Hi there',
            phone: '0821234567',
            contactId: 'new-contact-id',
        });

        expect(mockPrisma.client.update).toHaveBeenCalledWith({
            where: { id: 'client-1' },
            data: { ghlContactId: 'new-contact-id' },
        });
    });

    it('does not update contactId when client already has one', async () => {
        const caseWithContact = {
            ...mockCase,
            client: { ...mockClient, ghlContactId: 'existing-contact' },
        };
        mockPrisma.case.findFirst.mockResolvedValue(caseWithContact);

        await GhlService.handleWebhook({
            type: 'InboundMessage',
            message: 'Hi',
            phone: '0821234567',
            contactId: 'new-contact-id',
        });

        expect(mockPrisma.client.update).not.toHaveBeenCalled();
    });

    it('returns error when message is missing', async () => {
        const result = await GhlService.handleWebhook({
            type: 'InboundMessage',
            phone: '0821234567',
        });

        expect(result).toEqual({ success: false, error: 'Incomplete payload' });
    });

    it('returns error when neither phone nor email is present', async () => {
        const result = await GhlService.handleWebhook({
            type: 'InboundMessage',
            message: 'Hello',
        });

        expect(result).toEqual({ success: false, error: 'Incomplete payload' });
    });

    it('returns error when no matching case is found', async () => {
        mockPrisma.case.findFirst.mockResolvedValue(null);

        const result = await GhlService.handleWebhook({
            type: 'InboundMessage',
            message: 'Hello',
            phone: '0821234567',
        });

        expect(result).toEqual({ success: false, error: 'Case not found' });
    });

    it('matches on message field without explicit InboundMessage type', async () => {
        mockPrisma.case.findFirst.mockResolvedValue(mockCase);

        const result = await GhlService.handleWebhook({
            message: 'Reply via email',
            email: 'john@example.com',
        });

        expect(result).toEqual({ success: true, caseId: 'case-1' });
    });
});

// ─── sendMessage ──────────────────────────────────────────────────────────────

describe('GhlService.sendMessage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Restore default send responses after clearAllMocks
        mockSmsSend.mockResolvedValue(smsSendOk);
        mockEmailSend.mockResolvedValue(emailSendOk);
        mockWaSend.mockResolvedValue(waSendOk);
        vi.mocked(getGHLCredentials).mockResolvedValue({ apiKey: 'test-api-key', locationId: 'test-location-id' });
    });

    it('sends SMS and logs to NotificationLog', async () => {
        mockPrisma.case.findUnique.mockResolvedValue(mockCase);

        const result = await GhlService.sendMessage('case-1', 'SMS', 'Hello John');

        expect(result.success).toBe(true);
        expect(result.channel).toBe('SMS');
        expect(result.messageId).toBe('sms-msg-123');
        expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    caseId: 'case-1',
                    channel: 'SMS',
                    success: true,
                    provider: 'GoHighLevel',
                }),
            })
        );
    });

    it('formats SA mobile number to +27 prefix for SMS', async () => {
        mockPrisma.case.findUnique.mockResolvedValue(mockCase);

        const result = await GhlService.sendMessage('case-1', 'SMS', 'Test');

        expect(result.recipient).toBe('+27821234567');
    });

    it('sends EMAIL and uses client email as recipient', async () => {
        mockPrisma.case.findUnique.mockResolvedValue(mockCase);

        const result = await GhlService.sendMessage('case-1', 'EMAIL', '<p>Hello</p>', 'Test Subject');

        expect(result.success).toBe(true);
        expect(result.channel).toBe('EMAIL');
        expect(result.recipient).toBe('john@example.com');
    });

    it('sends WHATSAPP using whatsappNumber when available', async () => {
        const caseWithWa = {
            ...mockCase,
            client: { ...mockClient, whatsappNumber: '0831111111' },
        };
        mockPrisma.case.findUnique.mockResolvedValue(caseWithWa);

        const result = await GhlService.sendMessage('case-1', 'WHATSAPP', 'Hi via WA');

        expect(result.recipient).toBe('+27831111111');
    });

    it('falls back to phone for WHATSAPP when whatsappNumber is null', async () => {
        mockPrisma.case.findUnique.mockResolvedValue(mockCase);

        const result = await GhlService.sendMessage('case-1', 'WHATSAPP', 'Hi');

        expect(result.recipient).toBe('+27821234567');
    });

    it('persists contactId on client after first successful send', async () => {
        mockPrisma.case.findUnique.mockResolvedValue(mockCase);

        await GhlService.sendMessage('case-1', 'SMS', 'Hello');

        expect(mockPrisma.client.update).toHaveBeenCalledWith({
            where: { id: 'client-1' },
            data: { ghlContactId: 'contact-456' },
        });
    });

    it('does not update contactId when client already has one', async () => {
        const caseWithContact = {
            ...mockCase,
            client: { ...mockClient, ghlContactId: 'existing-contact' },
        };
        mockPrisma.case.findUnique.mockResolvedValue(caseWithContact);

        await GhlService.sendMessage('case-1', 'SMS', 'Hello');

        expect(mockPrisma.client.update).not.toHaveBeenCalled();
    });

    it('throws when case not found', async () => {
        mockPrisma.case.findUnique.mockResolvedValue(null);

        await expect(GhlService.sendMessage('missing-case', 'SMS', 'Hi')).rejects.toThrow('Case not found');
    });

    it('throws when GHL credentials are missing', async () => {
        mockPrisma.case.findUnique.mockResolvedValue(mockCase);
        vi.mocked(getGHLCredentials).mockResolvedValueOnce({ apiKey: '', locationId: '' });

        await expect(GhlService.sendMessage('case-1', 'SMS', 'Hi')).rejects.toThrow('GHL not configured');
    });

    it('throws when client has no email for EMAIL channel', async () => {
        const caseNoEmail = {
            ...mockCase,
            client: { ...mockClient, email: null },
        };
        mockPrisma.case.findUnique.mockResolvedValue(caseNoEmail);

        await expect(GhlService.sendMessage('case-1', 'EMAIL', 'Hi')).rejects.toThrow('has no email');
    });

    it('throws when client has no phone for SMS channel', async () => {
        const caseNoPhone = {
            ...mockCase,
            client: { ...mockClient, phone: null, whatsappNumber: null },
        };
        mockPrisma.case.findUnique.mockResolvedValue(caseNoPhone);

        await expect(GhlService.sendMessage('case-1', 'SMS', 'Hi')).rejects.toThrow('has no phone');
    });

    it('logs failed send to NotificationLog and returns failure result', async () => {
        mockPrisma.case.findUnique.mockResolvedValue(mockCase);
        mockSmsSend.mockResolvedValueOnce({
            success: false,
            error: 'API rate limit',
            provider: 'GoHighLevel',
        });

        const result = await GhlService.sendMessage('case-1', 'SMS', 'Hello');

        expect(result.success).toBe(false);
        expect(result.error).toBe('API rate limit');
        expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ success: false, error: 'API rate limit' }),
            })
        );
    });
});

// ─── applyTags ────────────────────────────────────────────────────────────────

describe('GhlService.applyTags', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSmsSend.mockResolvedValue(smsSendOk);
        vi.mocked(getGHLCredentials).mockResolvedValue({ apiKey: 'test-api-key', locationId: 'test-location-id' });
        global.fetch = vi.fn();
    });

    it('applies tags to a contact with an existing ghlContactId', async () => {
        const caseWithContact = {
            ...mockCase,
            client: { ...mockClient, ghlContactId: 'contact-123' },
        };
        mockPrisma.case.findUnique.mockResolvedValue(caseWithContact);
        vi.mocked(global.fetch).mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue({}),
            text: vi.fn().mockResolvedValue(''),
        } as unknown as Response);

        const result = await GhlService.applyTags('case-1', ['debt-review-removal', 'urgent']);

        expect(result).toEqual({ success: true });
        expect(global.fetch).toHaveBeenCalledWith(
            'https://services.leadconnectorhq.com/contacts/contact-123/tags',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ tags: ['debt-review-removal', 'urgent'] }),
            })
        );
    });

    it('looks up contact by email when ghlContactId is not set', async () => {
        mockPrisma.case.findUnique.mockResolvedValue(mockCase);
        vi.mocked(global.fetch)
            .mockResolvedValueOnce({
                ok: true,
                json: vi.fn().mockResolvedValue({ contacts: [{ id: 'found-contact' }] }),
            } as unknown as Response)
            .mockResolvedValueOnce({
                ok: true,
                json: vi.fn().mockResolvedValue({}),
                text: vi.fn().mockResolvedValue(''),
            } as unknown as Response);

        const result = await GhlService.applyTags('case-1', ['follow-up']);

        expect(result).toEqual({ success: true });
        expect(mockPrisma.client.update).toHaveBeenCalledWith({
            where: { id: 'client-1' },
            data: { ghlContactId: 'found-contact' },
        });
    });

    it('returns error when no GHL contact found after lookup', async () => {
        mockPrisma.case.findUnique.mockResolvedValue(mockCase);
        vi.mocked(global.fetch).mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue({ contacts: [] }),
        } as unknown as Response);

        const result = await GhlService.applyTags('case-1', ['tag']);

        expect(result).toEqual({ success: false, error: 'GHL contact not found' });
    });

    it('returns error when GHL is not configured', async () => {
        mockPrisma.case.findUnique.mockResolvedValue(mockCase);
        vi.mocked(getGHLCredentials).mockResolvedValueOnce({ apiKey: '', locationId: '' });

        const result = await GhlService.applyTags('case-1', ['tag']);

        expect(result).toEqual({ success: false, error: 'GHL not configured' });
    });

    it('returns error when case not found', async () => {
        mockPrisma.case.findUnique.mockResolvedValue(null);

        const result = await GhlService.applyTags('missing', ['tag']);

        expect(result.success).toBe(false);
    });

    it('returns error when GHL tag API call fails', async () => {
        const caseWithContact = {
            ...mockCase,
            client: { ...mockClient, ghlContactId: 'contact-123' },
        };
        mockPrisma.case.findUnique.mockResolvedValue(caseWithContact);
        vi.mocked(global.fetch).mockResolvedValue({
            ok: false,
            text: vi.fn().mockResolvedValue('Unauthorized'),
        } as unknown as Response);

        const result = await GhlService.applyTags('case-1', ['tag']);

        expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });
});
