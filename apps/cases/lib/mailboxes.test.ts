import { describe, expect, it } from 'vitest';
import { isGmailMailbox, isInvoiceRequestedFromDcStatus, toPublicMailbox, usesSmtpPassword } from './mailboxes';

describe('isInvoiceRequestedFromDcStatus', () => {
    it('matches the Invoice Requested from DC status and its detour statuses', () => {
        expect(isInvoiceRequestedFromDcStatus('INVOICE_REQUESTED_DC')).toBe(true);
        expect(isInvoiceRequestedFromDcStatus('IRFDC_1M')).toBe(true);
        expect(isInvoiceRequestedFromDcStatus('IRFDC_2M')).toBe(true);
        expect(isInvoiceRequestedFromDcStatus('IRFDC_3M')).toBe(true);
        expect(isInvoiceRequestedFromDcStatus('IRFDC_4M_PLUS')).toBe(true);
    });

    it('does not match other statuses or missing values', () => {
        expect(isInvoiceRequestedFromDcStatus('NEW')).toBe(false);
        expect(isInvoiceRequestedFromDcStatus('REJECTED_OWES_FEES')).toBe(false);
        expect(isInvoiceRequestedFromDcStatus('')).toBe(false);
        expect(isInvoiceRequestedFromDcStatus(null)).toBe(false);
        expect(isInvoiceRequestedFromDcStatus(undefined)).toBe(false);
    });
});

describe('toPublicMailbox', () => {
    it('replaces the password with hasPassword and flattens the owner name', () => {
        const publicMailbox = toPublicMailbox({
            id: 'mbx-1',
            label: 'Transfers',
            emailAddress: 'transfers@zenowethu.co.za',
            imapHost: 'mail.zenowethu.co.za',
            imapPort: 993,
            imapSecure: true,
            isDcCommunication: true,
            isActive: true,
            ownerUserId: 'user-1',
            notes: null,
            lastCheckedAt: null,
            updatedAt: new Date('2026-07-12T00:00:00.000Z'),
            password: 'enc:v1:a:b:c',
            owner: { firstName: 'Thabo', lastName: 'M' },
        });

        expect(publicMailbox.hasPassword).toBe(true);
        expect(publicMailbox.passwordSource).toBe('own');
        expect(publicMailbox.ownerName).toBe('Thabo M');
        expect((publicMailbox as Record<string, unknown>).password).toBeUndefined();
    });
});

describe('usesSmtpPassword', () => {
    it('matches case-insensitively only when the mailbox has no own password and SMTP login matches', () => {
        expect(usesSmtpPassword('notifications@zenowethu.co.za', null, 'Notifications@Zenowethu.co.za')).toBe(true);
        expect(usesSmtpPassword('notifications@zenowethu.co.za', 'enc:v1:a:b:c', 'notifications@zenowethu.co.za')).toBe(false);
        expect(usesSmtpPassword('transfers@zenowethu.co.za', null, 'notifications@zenowethu.co.za')).toBe(false);
        expect(usesSmtpPassword('notifications@zenowethu.co.za', null, null)).toBe(false);
        expect(usesSmtpPassword('notifications@zenowethu.co.za', null, '')).toBe(false);
    });
});

describe('isGmailMailbox', () => {
    it('matches Gmail hosts and Gmail addresses', () => {
        expect(isGmailMailbox('zenowethu@gmail.com', 'imap.gmail.com')).toBe(true);
        expect(isGmailMailbox('user@googlemail.com', 'imap.other.example')).toBe(true);
        expect(isGmailMailbox('user@example.com', 'imap.gmail.com')).toBe(true);
    });

    it('does not match non-Gmail mailboxes or missing values', () => {
        expect(isGmailMailbox('transfers@zenowethu.co.za', 'mail.zenowethu.co.za')).toBe(false);
        expect(isGmailMailbox('', '')).toBe(false);
        expect(isGmailMailbox(null, undefined)).toBe(false);
    });
});
