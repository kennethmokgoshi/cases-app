/**
 * Debt Review Removal — Consent Reminder Email
 *
 * Sent when the consumer has ALREADY been told their transfer was accepted but
 * has not yet approved the debt-review-removal consent. Used by:
 *   • the "Resend Confirmation Link" button (2nd/3rd/4th sends), and
 *   • the "Manage Consumers" action when it finds the consent still pending.
 *
 * This is deliberately NOT the "Good News – transfer accepted" email — the
 * consumer already received that news. This one has a single job: make clear,
 * kindly but plainly, that the debt review flag removal CANNOT CONTINUE until
 * they give their consent, and show them exactly how to do it. The existing
 * secure link/token is reused, so earlier emails stay valid.
 *
 * Compliance: same rules as the acceptance email — no guaranteed outcome, no
 * fixed timeline; the consent requirement is framed under POPIA.
 */

import { ACCEPTED_SIGNATURE, buildCredoLoginSection, type CredoLoginDetails } from './accepted-email';

export const CONSENT_REMINDER_SUBJECT = (fileNumber: string): string =>
    `Reminder: Your Consent Is Needed to Continue Your Debt Review Removal (File: ${fileNumber})`;

export function buildConsentReminderEmail(p: {
    clientFirstName: string;
    fileNumber: string;
    /** Link the consumer clicks to consent to debt review removal (existing token reused). */
    consentLink: string;
    credo?: CredoLoginDetails | null;
}): string {
    const firstName = (p.clientFirstName || '').trim() || 'Sir/Madam';
    const credoSection = buildCredoLoginSection(p.credo);

    return `Dear ${firstName},

We hope this message finds you well. We recently confirmed that your debt review file is now with Zenowethu Debt Management, and we wrote to you asking for your consent to begin removing the debt review flag from your credit profile.

We have not yet received your consent, so we are gently reminding you: without it, the debt review flag removal process cannot continue, and your file remains on hold.

  File Number:  ${p.fileNumber}
  Status:       Waiting for your consent

─────────────────────────────────────────
WHY YOUR CONSENT IS NEEDED
─────────────────────────────────────────
Your consent is the formal go-ahead that allows us to process your personal information and to engage the credit bureaus and the National Credit Regulator on your behalf for the removal of the debt review flag. In keeping with the Protection of Personal Information Act (POPIA), we may not begin this work until you have given it. It takes only a moment, and once done there is nothing further you need to do.

Please click the secure link below to review and confirm your consent:

  ${p.consentLink}

If you received our earlier email, the link in it still works — this is the same secure link, sent again for your convenience.
${credoSection}
─────────────────────────────────────────
WHAT HAPPENS ONCE YOU CONSENT
─────────────────────────────────────────
As soon as your consent is received, our team continues with the removal of the debt review flag from your credit profile at all major credit bureaus. Please note that the flag removal follows a regulated process, and timelines depend on the credit bureaus and the relevant authorities — we will keep you updated on the progress of your matter.

─────────────────────────────────────────
UNTIL WE HEAR FROM YOU
─────────────────────────────────────────
Until your consent is received, your file stays parked and cannot be attended to — which only delays the restoration of your credit standing. If anything about the link or the portal is unclear, or if you have any concerns you would like to talk through first, simply reply to this email or call us on 081 747 7616. We are here to help.

Thank you — we look forward to continuing with your file.

Yours sincerely,

${ACCEPTED_SIGNATURE}`;
}
