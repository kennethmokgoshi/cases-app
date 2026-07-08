import { describe, it, expect } from 'vitest';
import { buildConsentReminderEmail, CONSENT_REMINDER_SUBJECT } from './consent-reminder-email';

describe('CONSENT_REMINDER_SUBJECT', () => {
    it('is a reminder subject, not the acceptance "Good News" subject', () => {
        const s = CONSENT_REMINDER_SUBJECT('ZDM-2026-001');
        expect(s).toContain('Reminder');
        expect(s).toContain('Consent');
        expect(s).toContain('ZDM-2026-001');
        expect(s).not.toContain('Good News');
        expect(s).not.toContain('Accepted');
    });
});

describe('buildConsentReminderEmail', () => {
    const base = {
        clientFirstName: 'Letlhogonolo',
        fileNumber: 'ZDM-2026-1022-2T7',
        consentLink: 'https://credo.zenowethu.co.za/consent/tok123',
    };

    it('reminds the consumer that flag removal cannot continue without consent', () => {
        const body = buildConsentReminderEmail(base);
        expect(body).toContain('Dear Letlhogonolo,');
        expect(body).toContain('cannot continue');
        expect(body).toContain('Waiting for your consent');
        expect(body).toContain('ZDM-2026-1022-2T7');
        expect(body).toContain(base.consentLink);
        // It must NOT read like a fresh acceptance announcement.
        expect(body).not.toContain('has been accepted');
        expect(body).not.toContain('We are pleased to let you know');
        // Compliance: no guaranteed outcome / regulated-process wording present.
        expect(body).toContain('regulated process');
        // Reassures the consumer that the earlier link still works.
        expect(body).toContain('the link in it still works');
        expect(body).toContain('081 747 7616');
        expect(body).toContain('NCRDC3693');
    });

    it('includes Credo login instructions when a profile exists', () => {
        const body = buildConsentReminderEmail({
            ...base,
            credo: { idNumber: '9005135832087', setPasswordLink: 'https://credo.zenowethu.co.za/reset-password?token=abc' },
        });
        expect(body).toContain('HOW TO LOG IN TO YOUR CREDO PORTAL');
        expect(body).toContain('13-digit SA ID number (9005135832087)');
        expect(body).toContain('https://credo.zenowethu.co.za/reset-password?token=abc');
    });

    it('omits the Credo section for the public-link fallback', () => {
        const body = buildConsentReminderEmail({ ...base, credo: null });
        expect(body).not.toContain('HOW TO LOG IN TO YOUR CREDO PORTAL');
    });

    it('falls back to Sir/Madam when the first name is blank', () => {
        const body = buildConsentReminderEmail({ ...base, clientFirstName: '' });
        expect(body).toContain('Dear Sir/Madam,');
    });
});
