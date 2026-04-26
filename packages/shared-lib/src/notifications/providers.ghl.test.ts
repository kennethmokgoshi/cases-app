import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../logger', () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { GhlSmsProvider, GhlEmailProvider, GhlWhatsAppProvider } from './providers';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockFetch(...responses: Partial<Response>[]) {
    global.fetch = vi.fn();
    let call = vi.mocked(global.fetch);
    for (const res of responses) {
        call = call.mockResolvedValueOnce(res as Response);
    }
}

function okJson(data: unknown): Partial<Response> {
    return { ok: true, json: vi.fn().mockResolvedValue(data) } as Partial<Response>;
}

function failJson(data: unknown): Partial<Response> {
    return { ok: false, json: vi.fn().mockResolvedValue(data) } as Partial<Response>;
}

// ─── GhlSmsProvider ───────────────────────────────────────────────────────────

describe('GhlSmsProvider', () => {
    beforeEach(() => { global.fetch = vi.fn(); });

    it('looks up contact by phone and sends SMS successfully', async () => {
        mockFetch(
            okJson({ contacts: [{ id: 'cid-1' }] }),
            okJson({ messageId: 'msg-abc' }),
        );

        const provider = new GhlSmsProvider('api-key', 'loc-id');
        const result = await provider.send('+27821234567', 'Hello from Zenowethu');

        expect(result.success).toBe(true);
        expect(result.messageId).toBe('msg-abc');
        expect(result.contactId).toBe('cid-1');
        expect(result.provider).toBe('GoHighLevel');
    });

    it('creates a new contact when phone lookup returns nothing', async () => {
        mockFetch(
            okJson({ contacts: [] }),
            okJson({ contact: { id: 'new-cid' } }),
            okJson({ messageId: 'msg-xyz' }),
        );

        const provider = new GhlSmsProvider('api-key', 'loc-id');
        const result = await provider.send('+27821234567', 'Hello');

        expect(result.success).toBe(true);
        expect(result.contactId).toBe('new-cid');
    });

    it('returns error when contact cannot be found or created', async () => {
        mockFetch(
            okJson({ contacts: [] }),
            failJson({ message: 'Forbidden' }),
        );

        const provider = new GhlSmsProvider('api-key', 'loc-id');
        const result = await provider.send('+27821234567', 'Hello');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Contact could not be found or created');
    });

    it('returns error when message send API call fails', async () => {
        mockFetch(
            okJson({ contacts: [{ id: 'cid-1' }] }),
            failJson({ message: 'Rate limit exceeded' }),
        );

        const provider = new GhlSmsProvider('api-key', 'loc-id');
        const result = await provider.send('+27821234567', 'Hello');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Rate limit exceeded');
    });

    it('passes SMS type in the outbound message body', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(okJson({ contacts: [{ id: 'cid-1' }] }) as Response)
            .mockResolvedValueOnce(okJson({ messageId: 'msg-1' }) as Response);
        global.fetch = fetchMock;

        const provider = new GhlSmsProvider('api-key', 'loc-id');
        await provider.send('+27821234567', 'Test message');

        const [, msgCall] = fetchMock.mock.calls;
        const body = JSON.parse(msgCall[1].body as string);
        expect(body.type).toBe('SMS');
        expect(body.message).toBe('Test message');
    });

    it('includes Authorization and Version headers', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(okJson({ contacts: [{ id: 'cid-1' }] }) as Response)
            .mockResolvedValueOnce(okJson({ messageId: 'msg-1' }) as Response);
        global.fetch = fetchMock;

        const provider = new GhlSmsProvider('my-secret-key', 'my-loc');
        await provider.send('+27821234567', 'Test');

        const [lookupCall] = fetchMock.mock.calls;
        expect(lookupCall[1].headers['Authorization']).toBe('Bearer my-secret-key');
        expect(lookupCall[1].headers['Version']).toBe('2021-07-28');
    });

    it('returns contact-not-found error when network throws during lookup', async () => {
        // getContactId swallows network errors and returns null; the provider
        // then falls through to createContact which also fails, so the final
        // error is the generic "could not be found or created" message.
        global.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

        const provider = new GhlSmsProvider('api-key', 'loc-id');
        const result = await provider.send('+27821234567', 'Hello');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Contact could not be found or created');
    });
});

// ─── GhlEmailProvider ─────────────────────────────────────────────────────────

describe('GhlEmailProvider', () => {
    beforeEach(() => { global.fetch = vi.fn(); });

    it('looks up contact by email and sends email successfully', async () => {
        mockFetch(
            okJson({ contacts: [{ id: 'cid-2' }] }),
            okJson({ messageId: 'email-001' }),
        );

        const provider = new GhlEmailProvider('api-key', 'loc-id');
        const result = await provider.send('john@example.com', 'Test Subject', '<p>Body</p>');

        expect(result.success).toBe(true);
        expect(result.messageId).toBe('email-001');
        expect(result.contactId).toBe('cid-2');
        expect(result.provider).toBe('GoHighLevel');
    });

    it('returns error when email contact cannot be found or created', async () => {
        mockFetch(
            okJson({ contacts: [] }),
            failJson({ message: 'Not found' }),
        );

        const provider = new GhlEmailProvider('api-key', 'loc-id');
        const result = await provider.send('unknown@example.com', 'Subject', 'Body');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Contact could not be found or created');
    });

    it('passes Email type and subject in the outbound message body', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(okJson({ contacts: [{ id: 'cid-2' }] }) as Response)
            .mockResolvedValueOnce(okJson({ messageId: 'e-1' }) as Response);
        global.fetch = fetchMock;

        const provider = new GhlEmailProvider('api-key', 'loc-id');
        await provider.send('john@example.com', 'Important Update', '<p>Hi</p>');

        const [, msgCall] = fetchMock.mock.calls;
        const body = JSON.parse(msgCall[1].body as string);
        expect(body.type).toBe('Email');
        expect(body.subject).toBe('Important Update');
    });

    it('creates new email contact when not found', async () => {
        mockFetch(
            okJson({ contacts: [] }),
            okJson({ contact: { id: 'new-email-contact' } }),
            okJson({ messageId: 'e-2' }),
        );

        const provider = new GhlEmailProvider('api-key', 'loc-id');
        const result = await provider.send('new@example.com', 'Subject', 'Body');

        expect(result.success).toBe(true);
        expect(result.contactId).toBe('new-email-contact');
    });
});

// ─── GhlWhatsAppProvider ──────────────────────────────────────────────────────

describe('GhlWhatsAppProvider', () => {
    beforeEach(() => { global.fetch = vi.fn(); });

    it('looks up contact by phone and sends WhatsApp message successfully', async () => {
        mockFetch(
            okJson({ contacts: [{ id: 'cid-3' }] }),
            okJson({ messageId: 'wa-001' }),
        );

        const provider = new GhlWhatsAppProvider('api-key', 'loc-id');
        const result = await provider.send('+27831234567', 'WhatsApp test message');

        expect(result.success).toBe(true);
        expect(result.messageId).toBe('wa-001');
        expect(result.contactId).toBe('cid-3');
        expect(result.provider).toBe('GoHighLevel');
    });

    it('passes WhatsApp type in the outbound message body', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(okJson({ contacts: [{ id: 'cid-3' }] }) as Response)
            .mockResolvedValueOnce(okJson({ messageId: 'wa-002' }) as Response);
        global.fetch = fetchMock;

        const provider = new GhlWhatsAppProvider('api-key', 'loc-id');
        await provider.send('+27831234567', 'Test');

        const [, msgCall] = fetchMock.mock.calls;
        const body = JSON.parse(msgCall[1].body as string);
        expect(body.type).toBe('WhatsApp');
        expect(body.contactId).toBe('cid-3');
    });

    it('returns error when WhatsApp contact cannot be found or created', async () => {
        mockFetch(
            okJson({ contacts: [] }),
            failJson({ message: 'Unauthorized' }),
        );

        const provider = new GhlWhatsAppProvider('api-key', 'loc-id');
        const result = await provider.send('+27831234567', 'Hi');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Contact could not be found or created');
    });

    it('creates new contact when WhatsApp lookup returns nothing', async () => {
        mockFetch(
            okJson({ contacts: [] }),
            okJson({ contact: { id: 'wa-new-contact' } }),
            okJson({ messageId: 'wa-003' }),
        );

        const provider = new GhlWhatsAppProvider('api-key', 'loc-id');
        const result = await provider.send('+27831234567', 'Hello new contact');

        expect(result.success).toBe(true);
        expect(result.contactId).toBe('wa-new-contact');
    });

    it('handles send failure and returns error', async () => {
        mockFetch(
            okJson({ contacts: [{ id: 'cid-3' }] }),
            failJson({ message: 'WhatsApp not available' }),
        );

        const provider = new GhlWhatsAppProvider('api-key', 'loc-id');
        const result = await provider.send('+27831234567', 'Test');

        expect(result.success).toBe(false);
        expect(result.error).toBe('WhatsApp not available');
    });
});
