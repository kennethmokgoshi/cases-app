import { describe, expect, it } from 'vitest';
import { formatImapConnectionError } from './imap';

describe('formatImapConnectionError', () => {
    it('adds the Gmail app-password guidance when ImapFlow only reports Command failed', () => {
        const error = Object.assign(new Error('Command failed'), {
            responseText: 'Application-specific password required',
        });

        expect(formatImapConnectionError(error, { host: 'imap.gmail.com', username: 'zenowethu@gmail.com' }))
            .toContain('Gmail IMAP does not accept the normal Gmail login password here');
    });

    it('keeps useful provider details for non-Gmail authentication failures', () => {
        const error = Object.assign(new Error('Authentication failed'), {
            responseText: 'Invalid mailbox credentials',
        });

        expect(formatImapConnectionError(error, { host: 'mail.zenowethu.co.za', username: 'transfers@zenowethu.co.za' }))
            .toBe('Authentication failed - Invalid mailbox credentials - Check the mailbox email address and saved password.');
    });
});
