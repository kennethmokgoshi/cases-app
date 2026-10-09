/**
 * Repossession enquiry letter — assessment stage.
 *
 * Sent to a vehicle financer when a consumer has approached us to look at their
 * credit profile and is only CONSIDERING debt review. Two things matter about
 * the wording, and both are deliberate:
 *
 *   • It never claims the consumer is under debt review. No section 86 application
 *     has been lodged, so section 88(3) protection does not exist yet, and saying
 *     otherwise would be a misrepresentation to the financer.
 *   • The pause is a REQUEST, not a demand. There is no legal basis to demand one
 *     at this stage, so the letter asks for information (s129 notice, summons,
 *     judgment, warrant) and a short courtesy hold while the consumer is assessed.
 *
 * Pure — no database, no I/O — so the preview and the live send always agree and
 * the wording can be tested exhaustively.
 */

import { addBusinessDays } from 'date-fns';
import { formatSignatureBlock, type CompanyProfile } from '../company/profile';

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

/** "7 October 2026" — avoids locale/ICU differences between server runtimes. */
export function formatLetterDate(date: Date): string {
    return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export interface RepossessionLetterInput {
    company: CompanyProfile;
    clientName: string;
    idNumber: string;
    financerName: string;
    accountNumber: string | null;
    /** e.g. "Toyota Hilux 2.4 GD-6 2021" — optional, staff may not have it yet. */
    vehicleDescription?: string | null;
    registrationNumber?: string | null;
    /** Name printed above the signature block. */
    signerName: string;
    /** Date the letter is issued. */
    issuedOn: Date;
    /** Business days the financer has to reply (default 5). */
    replyWithinBusinessDays: number;
    /** Business days we ask them to hold off enforcement (default 10). */
    pauseBusinessDays: number;
    /** How the attachments are named — only claims what is genuinely attached. */
    attachedLabel: string;
}

export interface RepossessionLetter {
    subject: string;
    /** Plain text; the sender converts line breaks for the HTML part. */
    body: string;
    replyBy: Date;
    pauseUntil: Date;
}

function clean(value: string | null | undefined): string {
    return (value ?? '').trim();
}

/** "Toyota Hilux 2021, Reg ABC123GP" — whichever of the two parts staff supplied. */
export function describeVehicle(
    vehicleDescription: string | null | undefined,
    registrationNumber: string | null | undefined
): string | null {
    const description = clean(vehicleDescription);
    const reg = clean(registrationNumber).toUpperCase();
    if (description && reg) return `${description}, Reg ${reg}`;
    if (description) return description;
    if (reg) return `Reg ${reg}`;
    return null;
}

export function buildRepossessionEnquiryLetter(input: RepossessionLetterInput): RepossessionLetter {
    const {
        company, clientName, idNumber, financerName, signerName, issuedOn,
        replyWithinBusinessDays, pauseBusinessDays, attachedLabel,
    } = input;

    const accountNumber = clean(input.accountNumber) || 'not yet confirmed';
    const vehicle = describeVehicle(input.vehicleDescription, input.registrationNumber);

    const replyBy = addBusinessDays(issuedOn, replyWithinBusinessDays);
    const pauseUntil = addBusinessDays(issuedOn, pauseBusinessDays);

    const subject =
        `Enquiry: ${clientName}, ID ${idNumber}, Account ${accountNumber}. ` +
        `Status of enforcement action and request for information`;

    const reLine = [`${clientName}`, `ID ${idNumber}`, vehicle, `Account ${accountNumber}`]
        .filter((part): part is string => !!part)
        .join(', ');

    const registration = company.ncrdcNumber
        ? `a registered debt counsellor, NCRDC ${company.ncrdcNumber.replace(/^NCRDC/i, '')}`
        : 'a financial services provider';

    const body = [
        `To: ${financerName} — Legal / Collections / Recoveries Department`,
        `Date: ${formatLetterDate(issuedOn)}`,
        '',
        `Re: ${reLine}`,
        '',
        `1. ${company.tradingName} is ${registration}. The consumer named above has approached us to assess their credit profile and is considering an application for debt review in terms of section 86 of the National Credit Act 34 of 2005. We act on the consumer's behalf under the attached ${attachedLabel}.`,
        '',
        `2. No application for debt review has been lodged at this stage. We are writing to establish the current status of the account so that the consumer can be properly advised.`,
        '',
        `3. Please confirm in writing by ${formatLetterDate(replyBy)}:`,
        `   a. Whether a section 129 notice has been issued and, if so, the date and method of delivery (with proof of delivery);`,
        `   b. Whether summons or any other court proceedings have been instituted and, if so, the court, case number and date;`,
        `   c. Whether a judgment or court order (including for repossession of the vehicle) has been obtained, its date, and whether a warrant or writ has been issued;`,
        `   d. Whether the vehicle has been repossessed, surrendered or earmarked for collection and, if so, the date and its current location;`,
        `   e. Whether you have instructed attorneys or a collection or tracing agent and, if so, their names and contact details.`,
        '',
        `4. Please also provide:`,
        `   a. A full statement of account showing the arrears, interest, fees and settlement figure;`,
        `   b. A copy of the credit agreement.`,
        '',
        `5. We request that, until ${formatLetterDate(pauseUntil)}, you refrain from taking any further steps to repossess the vehicle or enforce the agreement, so that the consumer can be assessed and, if appropriate, an application for debt review can be made. We will inform you immediately if an application is lodged.`,
        '',
        `6. Please direct all communication about this account to this office. All of the consumer's rights are reserved.`,
        '',
        'Yours faithfully,',
        '',
        signerName,
        formatSignatureBlock(company),
    ].join('\n');

    return { subject, body, replyBy, pauseUntil };
}

// ─── Vehicle account hint ────────────────────────────────────────────────────

/**
 * Words that suggest a credit account is vehicle finance. Credit report
 * `accountType` values are free text ("Loan", "Retail", "Other"), so this is only
 * ever a HINT used to sort and pre-select — staff always confirm which account
 * the letter is about.
 */
const VEHICLE_HINTS = [
    'vehicle', 'motor', 'instalment sale', 'installment sale', 'asset finance',
    'wesbank', 'mfc', 'toyota financial', 'bmw financial', 'mercedes-benz financial',
    'vw financial', 'volkswagen financial', 'ford credit', 'nissan', 'suzuki',
    'hyundai', 'kia', 'renault', 'tfs',
];

const VEHICLE_HINT_PATTERN = new RegExp(`\\b(${VEHICLE_HINTS.join('|')})\\b`, 'i');

export function isLikelyVehicleAccount(accountType: string, creditorName: string): boolean {
    return VEHICLE_HINT_PATTERN.test(`${accountType} ${creditorName}`);
}
