import { describe, it, expect, vi } from 'vitest';
import type { EmailProvider, EmailResult, EmailOptions } from './providers';
import { FallbackEmailProvider } from './providers';

function mockEmailProvider(result: EmailResult): EmailProvider {
    return {
        name: result.provider,
        send: vi.fn().mockResolvedValue(result),
    };
}

describe('FallbackEmailProvider', () => {
    it('returns primary result when primary succeeds', async () => {
        const primary  = mockEmailProvider({ success: true, messageId: 'msg-1', provider: 'GHL' });
        const fallback = mockEmailProvider({ success: true, messageId: 'msg-2', provider: 'SMTP' });
        const provider = new FallbackEmailProvider(primary, fallback);

        const result = await provider.send('test@example.com', 'Subject', '<p>Hi</p>');

        expect(result.success).toBe(true);
        expect(result.messageId).toBe('msg-1');
        expect(primary.send).toHaveBeenCalledOnce();
        expect(fallback.send).not.toHaveBeenCalled();
    });

    it('falls back to secondary when primary fails', async () => {
        const primary  = mockEmailProvider({ success: false, error: 'Contact not found', provider: 'GHL' });
        const fallback = mockEmailProvider({ success: true,  messageId: 'smtp-42',       provider: 'SMTP' });
        const provider = new FallbackEmailProvider(primary, fallback);

        const result = await provider.send('dc@lawfirm.co.za', 'Subject', '<p>Hi</p>');

        expect(result.success).toBe(true);
        expect(result.messageId).toBe('smtp-42');
        expect(primary.send).toHaveBeenCalledOnce();
        expect(fallback.send).toHaveBeenCalledOnce();
    });

    it('returns fallback failure when both fail', async () => {
        const primary  = mockEmailProvider({ success: false, error: 'GHL error',  provider: 'GHL' });
        const fallback = mockEmailProvider({ success: false, error: 'SMTP error', provider: 'SMTP' });
        const provider = new FallbackEmailProvider(primary, fallback);

        const result = await provider.send('nobody@example.com', 'Subject', '<p>Hi</p>');

        expect(result.success).toBe(false);
        expect(result.error).toBe('SMTP error');
    });

    it('passes all arguments to primary provider', async () => {
        const primary  = mockEmailProvider({ success: true, provider: 'GHL' });
        const fallback = mockEmailProvider({ success: true, provider: 'SMTP' });
        const provider = new FallbackEmailProvider(primary, fallback);

        const options: EmailOptions = { cc: ['cc@example.com'] };
        await provider.send('to@example.com', 'Subj', '<b>html</b>', 'text', options);

        expect(primary.send).toHaveBeenCalledWith('to@example.com', 'Subj', '<b>html</b>', 'text', options);
    });

    it('names itself as primary→fallback', () => {
        const primary  = mockEmailProvider({ success: true, provider: 'GoHighLevel' });
        const fallback = mockEmailProvider({ success: true, provider: 'SMTP' });
        const provider = new FallbackEmailProvider(primary, fallback);
        expect(provider.name).toBe('GoHighLevel→SMTP');
    });

    it('passes BCC through to primary provider', async () => {
        const primary  = mockEmailProvider({ success: true, provider: 'GHL' });
        const fallback = mockEmailProvider({ success: true, provider: 'SMTP' });
        const provider = new FallbackEmailProvider(primary, fallback);

        const options: EmailOptions = { bcc: ['audit@example.com'] };
        await provider.send('to@example.com', 'Subj', '<b>html</b>', 'text', options);

        expect(primary.send).toHaveBeenCalledWith('to@example.com', 'Subj', '<b>html</b>', 'text', options);
        expect(options.bcc).toEqual(['audit@example.com']);
    });
});
