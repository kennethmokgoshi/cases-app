/**
 * Accepted-via-DHS — Consumer Notification Email
 *
 * Sent to the consumer when a "check request status" run finds their debt review
 * file transfer has been ACCEPTED on the NCR Debt Help System (DHS) — i.e. the
 * consumer is now under Zenowethu Debt Management (NCRDC3693). It confirms the
 * transfer and tells them we are beginning the debt review flag removal process.
 *
 * Compliance: phrased as a process we are starting (not a guaranteed outcome or
 * fixed timeline), per Zenowethu's debt-review-removal disclaimer rules.
 */

import { SIGNATURE } from './decline-handler';

export function buildAcceptedViaDhsEmail(p: {
    clientFirstName: string;
    fileNumber: string;
    /** Public link the consumer clicks to consent to debt review removal. */
    consentLink: string;
}): string {
    return `Dear ${p.clientFirstName},

We are pleased to inform you that the transfer of your debt review file to Zenowethu Debt Management has been ACCEPTED on the National Credit Regulator's Debt Help System (DHS).

  File Number:  ${p.fileNumber}
  Status:       Accepted via DHS

This means your file is now formally with us, and we will be acting as your debt counsellor from this point forward.

─────────────────────────────────────────
ACTION REQUIRED — YOUR CONSENT
─────────────────────────────────────────
Before we begin removing the debt review flag from your credit profile, we need your consent. Please click the secure link below to review and confirm:

  ${p.consentLink}

Once you have given your consent, we will proceed with the debt review removal on your behalf.

─────────────────────────────────────────
WHAT HAPPENS NEXT
─────────────────────────────────────────
After you consent, we will begin the process of removing the debt review flag from your credit profile at the major credit bureaus. This is the next step toward restoring your credit standing.

Our team will guide the matter through the required steps and will contact you if any further documents or information are needed from your side. Please note that the debt review flag removal follows a regulated process and timelines depend on the credit bureaus and the relevant authorities. We will keep you updated on the progress of your matter.

If you have any questions in the meantime, please reply to this email or contact us on 012 035 1824.

Thank you for choosing Zenowethu Debt Management — we look forward to assisting you.

Yours sincerely,

${SIGNATURE}`;
}

export const ACCEPTED_VIA_DHS_SUBJECT = (fileNumber: string): string =>
    `Good News – Your Debt Review File Has Been Accepted (File: ${fileNumber})`;
