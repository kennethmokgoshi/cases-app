/**
 * Accepted Transfer — Consumer Notification Email
 *
 * Sent to the consumer when a "check request status" run finds their debt review
 * file transfer has been ACCEPTED — i.e. the file has moved from their previous
 * debt counsellor on record to Zenowethu Debt Management (NCRDC3693). It confirms
 * the transfer and asks the consumer to consent before we begin the debt review
 * flag removal.
 *
 * Tone: warm and reassuring. It acknowledges that the consumer has already signed
 * a Power of Attorney, explains (kindly) that this separate consent is still needed,
 * and makes clear — gently — that without it the file cannot be attended to.
 *
 * Compliance: phrased as a process we are *starting* (no guaranteed outcome, no
 * fixed timeline). The need for consent is framed in line with POPIA (we obtain
 * informed consent before processing personal information for this purpose) — we do
 * not cite any NCA section we cannot stand behind.
 */

/**
 * Signature for the accepted-transfer email. Intentionally omits the personal
 * counsellor name (per request) — it leads with the NCRDC registration number.
 * Scoped to this email; other emails keep the shared `SIGNATURE`.
 */
export const ACCEPTED_SIGNATURE = `NCRDC3693
Zenowethu Debt Management
Suite 2, 2nd Floor, Central House, 17 Central Road, Mabopane, 0190
Tel: +27 81 747 7616 | Cell: 082 363 8207
info@zenowethu.co.za | www.zenowethu.co.za
Member of DCASA`;

/**
 * Build a human-readable label for the previous debt counsellor the file is being
 * transferred FROM. Falls back to a generic phrase when the name isn't on record.
 */
function previousDcLabel(name?: string | null, tradingName?: string | null): string {
    const n = (name || '').trim();
    const t = (tradingName || '').trim();
    if (n && t && n.toLowerCase() !== t.toLowerCase()) return `${n} (${t})`;
    if (n) return n;
    if (t) return t;
    return 'your previous debt counsellor on record';
}

/**
 * Credo portal login details — present when the consent is approved inside
 * the Credo portal (the preferred flow). The username is ALWAYS the
 * consumer's 13-digit SA ID number.
 */
export interface CredoLoginDetails {
    /** The consumer's 13-digit SA ID number — their Credo username. */
    idNumber: string;
    /** Set-password/activation link when the profile has no password yet. */
    setPasswordLink?: string | null;
}

/**
 * The "HOW TO LOG IN TO YOUR CREDO PORTAL" email section. Shared by the
 * acceptance email and the consent reminder email so login instructions
 * never drift apart. Empty string when the consumer has no Credo profile
 * (public-link fallback flow).
 */
export function buildCredoLoginSection(credo?: CredoLoginDetails | null): string {
    if (!credo) return '';
    return `
─────────────────────────────────────────
HOW TO VERIFY YOUR CONSENT LINK
─────────────────────────────────────────
You do not need to log in to give this consent. Click the secure consent link above, then type your 13-digit South African ID number to verify that the link belongs to you.

  ID number to type:  ${credo.idNumber}
After verification you will see your consent page. Please read it and press "I Approve" so our team can start working on your file.
`;
}

export function buildAcceptedViaDhsEmail(p: {
    clientFirstName: string;
    fileNumber: string;
    /** Link the consumer clicks to consent to debt review removal. */
    consentLink: string;
    /** Previous debt counsellor (the firm the file transferred FROM), if known. */
    previousDcName?: string | null;
    previousDcTradingName?: string | null;
    credo?: CredoLoginDetails | null;
}): string {
    const firstName = (p.clientFirstName || '').trim() || 'Sir/Madam';
    const fromDc = previousDcLabel(p.previousDcName, p.previousDcTradingName);

    const credoSection = buildCredoLoginSection(p.credo);

    return `Dear ${firstName},

We are pleased to let you know that your request to transfer your debt review file from ${fromDc} to Zenowethu Debt Management has been accepted. Your file is now formally with us, and from this point forward we will be acting as your debt counsellor.

  File Number:  ${p.fileNumber}
  Status:       Transfer accepted

─────────────────────────────────────────
A QUICK, IMPORTANT STEP — YOUR CONSENT
─────────────────────────────────────────
We know you have already signed a Power of Attorney appointing us, and we are truly grateful for the trust you have placed in us. This next step does not replace that — it is a separate, specific consent that allows us to process your personal information and to engage the credit bureaus and the National Credit Regulator on your behalf for the removal of the debt review flag. In keeping with the Protection of Personal Information Act (POPIA), we ask for your informed consent before we begin — it protects both you and us.

Please click the secure link below to review and confirm your consent:

  ${p.consentLink}

We completely understand if this feels like one more thing to do — it only takes a moment, and once it is done you do not need to do anything further.
${credoSection}
─────────────────────────────────────────
WHAT HAPPENS NEXT
─────────────────────────────────────────
After you consent, we will begin the process of removing the debt review flag from your credit profile at all major credit bureaus. This is the next step toward restoring your credit standing.

Our team will guide the matter through the required steps and will contact you if any further documents or information are needed from your side. Please note that the debt review flag removal follows a regulated process, and timelines depend on the credit bureaus and the relevant authorities. We will keep you updated on the progress of your matter.

─────────────────────────────────────────
IF WE DO NOT HEAR FROM YOU
─────────────────────────────────────────
Please understand, kindly, that until your consent is received we are unable to begin. Without it your file will simply be parked and cannot be attended to, which would delay the removal of the debt review flag. We would not want anything to hold back your progress, so we gently encourage you to confirm your consent at your earliest convenience.

If you have any questions in the meantime, please reply to this email or contact us on 081 747 7616. We are here to help.

Thank you for choosing Zenowethu Debt Management — we look forward to assisting you.

Yours sincerely,

${ACCEPTED_SIGNATURE}`;
}

export const ACCEPTED_VIA_DHS_SUBJECT = (fileNumber: string): string =>
    `Good News – Your Debt Review File Transfer Has Been Accepted (File: ${fileNumber})`;
