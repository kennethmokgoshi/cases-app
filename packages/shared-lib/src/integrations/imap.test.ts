import { describe, expect, it } from 'vitest';
import { formatImapConnectionError, mapEnvelopeToMatch } from './imap';

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

describe('mapEnvelopeToMatch', () => {
    it('flattens envelope address lists and flags', () => {
        const match = mapEnvelopeToMatch(
            'ops@zenowethu.co.za',
            {
                uid: 42,
                flags: new Set(['\\Seen']),
                envelope: {
                    messageId: '<abc@mail>',
                    subject: 'Re: Transfer request',
                    date: new Date('2026-07-10T08:30:00.000Z'),
                    from: [{ name: 'Debt Counsellor', address: 'dc@firm.co.za' }],
                    to: [{ address: 'ops@zenowethu.co.za' }],
                },
            },
            ['ID_NUMBER'],
        );

        expect(match.uid).toBe(42);
        expect(match.from).toBe('Debt Counsellor <dc@firm.co.za>');
        expect(match.to).toBe('ops@zenowethu.co.za');
        expect(match.subject).toBe('Re: Transfer request');
        expect(match.seen).toBe(true);
        expect(match.date).toBe('2026-07-10T08:30:00.000Z');
        expect(match.matchedOn).toEqual(['ID_NUMBER']);
        expect(match.mailbox).toBe('ops@zenowethu.co.za');
    });

    it('falls back gracefully when envelope fields are missing', () => {
        const match = mapEnvelopeToMatch('ops@zenowethu.co.za', { uid: 7 }, ['NAME']);
        expect(match.subject).toBe('(no subject)');
        expect(match.from).toBe('');
        expect(match.seen).toBe(false);
        expect(match.date).toBeNull();
        expect(match.messageId).toBeNull();
    });

    it('marks unseen messages as new', () => {
        const match = mapEnvelopeToMatch(
            'ops@zenowethu.co.za',
            { uid: 9, flags: new Set(), envelope: { subject: 'New mail' } },
            ['ID_NUMBER', 'NAME'],
        );
        expect(match.seen).toBe(false);
        expect(match.matchedOn).toEqual(['ID_NUMBER', 'NAME']);
    });
});
