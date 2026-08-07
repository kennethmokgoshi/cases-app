/**
 * DHS Decline Reason Handler
 *
 * Classifies DHS decline reasons into actionable categories and executes
 * the appropriate automated response:
 *   SEND_DOCS            — Email POA + ID to DC (or email in decline text)
 *   SEND_DOCS_WITH_NCR   — Same + NCR Certificate from admin resources
 *   CLIENT_CONSENT_NEEDED — Notify consumer via Email + WhatsApp + SMS
 *   OUTSTANDING_FEES     — Notify consumer of outstanding fees, request invoice
 *   CONTACT_ATTORNEY     — Email attorney whose address is in the decline text
 *   RESUBMIT_LATER       — Set next-update +7 working days, no external action
 *   UNKNOWN              — Log and escalate to staff for manual review
 */

import { prisma } from '@zenowethu/database';
import { sendManualMessage } from '../notifications/service';
import { addWorkingDays } from '../statuses/workingDays';
import { logger } from '../logger';
import { getAutomationUserId } from '../automation/automation-user';
import { promoteDcEmail, getBestDcEmail } from '../dc/email-priority';
import { recordDhsOutcome } from '../dc/outcome-events';
import { findPriorDocsEmail, decideDocsResend } from './decline-dedup';
import { classifyDeclineReasonSmart, type ClassificationSource } from './decline-classifier';

export type DeclineCategory =
    | 'SEND_DOCS'
    | 'SEND_DOCS_WITH_NCR'
    | 'CLIENT_CONSENT_NEEDED'
    | 'OUTSTANDING_FEES'
    | 'CONTACT_ATTORNEY'
    | 'RESUBMIT_LATER'
    | 'UNKNOWN';

export interface DeclineHandlerResult {
    category: DeclineCategory;
    emailSent: boolean;
    smsSent: boolean;
    whatsappSent: boolean;
    /** Workflow status the case was updated to, if any */
    statusUpdatedTo: string | null;
    actionsPerformed: string[];
    errors: string[];
    /** Email address extracted from the decline reason text, if found */
    extractedEmail: string | null;
    /**
     * True when a SEND_DOCS / SEND_DOCS_WITH_NCR document email was NOT sent
     * because it had already been sent for this decline and the file is not yet
     * overdue. The caller can surface a "Resend anyway" option.
     */
    skippedAsDuplicate: boolean;
    /** When the earlier document email was sent, when skippedAsDuplicate is true */
    alreadyHandledAt: Date | null;
    /** How the decline was classified: 'ai' (interpreted) or 'rules' (fallback). */
    classificationSource: ClassificationSource;
    /** 0..1 confidence in the chosen category. */
    classificationConfidence: number;
    /** One-line explanation of why this category was chosen. */
    classificationReasoning: string;
}

// ─── Classification ───────────────────────────────────────────────────────────

/**
 * Classify a raw DHS decline reason string into one of the 7 actionable categories.
 * Rules are evaluated in priority order — more specific patterns first.
 */
export function classifyDeclineReason(reason: string): DeclineCategory {
    const r = reason.toUpperCase();

    // NCR Certificate required (check before SEND_DOCS to avoid falling through)
    if (
        r.includes('NCR CERTIFICATE') ||
        r.includes('VALID NCR') ||
        r.includes('NCR CERT')
    ) {
        return 'SEND_DOCS_WITH_NCR';
    }

    // Documents needed — DC is asking us to email POA and/or ID
    if (
        r.includes('NO TRANSFER DOCUMENTS') ||
        r.includes('PLEASE SEND') ||
        r.includes('PLEASE SENT') || // real-world typo variant
        r.includes('SIGNED AND DATED POA') ||
        (r.includes('COPY OF') && (r.includes(' ID') || r.includes('IDENTITY'))) ||
        r.includes('DOCUMENTS HAVE NOT BEEN') ||
        r.includes('DOCUMENTS NOT RECEIVED') ||
        r.includes('DOCUMENTS REQUIRED') ||
        r.includes('SEND POA') ||
        r.includes('SEND DOCUMENTS') ||
        r.includes('SEND TRANSFER DOCUMENTS') ||
        r.includes('SENT TRANSFER DOCUMENTS') || // real-world typo variant
        r.includes('TRANSFER DOCUMENTS') ||
        r.includes('TRANFER DOCUMENTS') || // real-world typo variant
        r.includes('UPLOAD DOCUMENTS') ||
        r.includes('FORWARD POA') || // "Kindly forward POA & ID copy to..."
        (r.includes('FORWARD') && r.includes('POA') && r.includes('ID')) || // various orderings of forward/POA/ID
        (r.includes('ATTACH') && r.includes('POA')) ||
        r.includes('FORM 16') ||
        r.includes('RECENT SIGNED') ||
        r.includes('BARCODE ID') ||
        r.includes('SIGNED CONSENT')
    ) {
        return 'SEND_DOCS';
    }

    // Client has not consented or needs to contact their DC directly
    if (
        r.includes('UNABLE TO CONFIRM TRANSFER WITH CLIENT') ||
        r.includes('CLIENT HAS NOT CONSENTED') ||
        r.includes('CLIENT MUST CONTACT') ||
        r.includes('CLIENT TO CONTACT') ||
        r.includes('CONFIRM WITH CLIENT') ||
        r.includes('NOT YET CONSENTED') ||
        r.includes('CONSUMER TO CONTACT') ||
        r.includes('NOT CONSENT') ||
        r.includes('CONTACT THE CLIENT') ||
        r.includes('CLIENT CONTACT') ||
        r.includes('CONSUMER CONSENT') ||
        r.includes('KINDLY REQUEST THAT CLIENT CONTACTS') ||
        r.includes('REQUEST THAT CLIENT CONTACT')
    ) {
        return 'CLIENT_CONSENT_NEEDED';
    }

    // Request is progressing / pending — "under review", standard turnaround,
    // or "received & acknowledged" mean we should wait and re-check, not take a
    // decline action. Checked BEFORE OUTSTANDING_FEES so a generic policy
    // disclaimer in the same boilerplate ("a transfer request may be declined
    // if there are any outstanding fees...") is not mistaken for a real fee
    // demand against this consumer.
    if (
        r.includes('UNDER REVIEW') ||
        r.includes('TURNAROUND TIME') ||
        r.includes('STANDARD TURNAROUND') ||
        r.includes('RECEIVED AND ACKNOWLEDGED') ||
        r.includes('BEING PROCESSED') ||
        r.includes('STILL PROCESSING') ||
        (r.includes('ALLOW') && (r.includes('BUSINESS DAYS') || r.includes('WORKING DAYS')))
    ) {
        return 'RESUBMIT_LATER';
    }

    // Outstanding fees owed to current DC — only when the DC actually asserts
    // that THIS consumer owes fees, not when fee wording appears inside a
    // conditional / policy clause ("...may be declined if there are any
    // outstanding fees payable...").
    if (feeMentionIsAssertive(r)) {
        return 'OUTSTANDING_FEES';
    }

    // Legal / attorney involvement
    if (
        r.includes('ATTORNEY') ||
        r.includes('LEGAL ACTION') ||
        r.includes('COURT ORDER') ||
        r.includes('SOLICITOR') ||
        r.includes('LEGAL DEPARTMENT')
    ) {
        return 'CONTACT_ATTORNEY';
    }

    // Try again later — currently being processed
    if (
        r.includes('TRY AGAIN') ||
        r.includes('RESUBMIT') ||
        r.includes('CURRENTLY PROCESSING') ||
        r.includes('PENDING FINALIZATION') ||
        r.includes('NOT YET FINALISED') ||
        r.includes('NOT YET FINALIZED') ||
        r.includes('PLEASE TRY LATER') ||
        r.includes('AWAITING MANAGEMENT') ||
        r.includes('REQUEST AFTER')
    ) {
        return 'RESUBMIT_LATER';
    }

    return 'UNKNOWN';
}

/** Fee-related keywords that can indicate the consumer owes the current DC. */
const FEE_KEYWORDS = [
    'CLIENT OWES',
    'OUTSTANDING FEES',
    'FEES OUTSTANDING',
    'OWES FEES',
    'AMOUNT OUTSTANDING',
    'SETTLEMENT FEE',
    'AFTER-CARE FEES',
    'AFTERCARE FEES',
    'OUTSTANDING AMOUNT',
    'FEES DUE',
    'BALANCE OUTSTANDING',
];

/**
 * Decide whether a decline reason ASSERTS that this consumer owes fees, as
 * opposed to merely mentioning fees inside a conditional/policy disclaimer.
 *
 * Splits the (already upper-cased) reason into sentences and, for each sentence
 * containing a fee keyword, checks whether a conditional marker ("if", "may",
 * "should"…) appears before the keyword. A fee keyword that is only ever
 * governed by a conditional is treated as boilerplate and does NOT count as an
 * actual fee demand — e.g. "a transfer request may be declined if there are any
 * outstanding fees payable" is policy text, not a statement that fees are due.
 */
function feeMentionIsAssertive(reasonUpper: string): boolean {
    const sentences = reasonUpper.split(/[.;\n]+/);
    for (const sentence of sentences) {
        const positions = FEE_KEYWORDS
            .map(keyword => sentence.indexOf(keyword))
            .filter(index => index >= 0);
        if (positions.length === 0) continue;

        const firstIdx = Math.min(...positions);
        const preceding = sentence.slice(0, firstIdx);
        const conditional =
            /\b(IF|MAY|MIGHT|SHOULD|WOULD|COULD|UNLESS|PROVIDED|IN THE EVENT|IN CASE|WHERE THERE|CAN BE DECLINED)\b/.test(
                preceding
            );
        if (!conditional) return true; // an assertive, non-conditional mention
    }
    return false;
}

/**
 * Extract the first valid email address from a decline reason text.
 * Useful when the DC embeds their email or an attorney's email in the decline text.
 */
export function extractEmailFromReason(reason: string): string | null {
    const match = reason.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
    return match ? match[0] : null;
}

/**
 * Get the base waiting period (in working days) for a decline category.
 * Different decline types have different retry windows:
 * - RESUBMIT_LATER: 7 days (cases that are temporarily pending/processing)
 * - CLIENT_CONSENT_NEEDED: 7 days (client needs to confirm directly)
 * - SEND_DOCS: 3 days (documents being sent, quick turnaround)
 * - SEND_DOCS_WITH_NCR: 3 days (same, but also sending NCR cert)
 * - OUTSTANDING_FEES: 5 days (fees need to be settled)
 * - CONTACT_ATTORNEY: 5 days (legal matters in progress)
 * - UNKNOWN: 5 days (default conservative estimate)
 */
export function getBasePeriodForCategory(category: DeclineCategory, reason?: string): number {
    if (category === 'RESUBMIT_LATER' && reason) {
        const r = reason.toUpperCase();
        // "allow the standard turnaround time of 3–7 business days" → wait out
        // the upper bound of the stated window before re-checking.
        const rangeMatch = r.match(/(\d+)\s*(?:[-–—]|TO)\s*(\d+)\s*(?:BUSINESS|WORKING|CALENDAR)?\s*DAYS/);
        if (rangeMatch) {
            return parseInt(rangeMatch[2], 10);
        }
        const match = r.match(/(?:REQUEST|RESUBMIT|TRY)(?:\s+AGAIN)?\s+(?:AFTER|IN)\s+(\d+)\s+DAY/);
        if (match) {
            return parseInt(match[1], 10);
        }
    }

    switch (category) {
        case 'RESUBMIT_LATER':
        case 'CLIENT_CONSENT_NEEDED':
            return 7;
        case 'OUTSTANDING_FEES':
        case 'CONTACT_ATTORNEY':
            return 5;
        case 'SEND_DOCS':
        case 'SEND_DOCS_WITH_NCR':
        case 'UNKNOWN':
        default:
            return 3;
    }
}

/**
 * Calculate the nextUpdate date accounting for time already elapsed since first decline detection.
 * If decline was detected 2 days ago with a 7-day base, return +5 days from now.
 * This ensures the total window from first detection is honored.
 */
export function calculateNextUpdate(basePeriod: number, declineFirstDetectedAt: Date | null): Date {
    if (!declineFirstDetectedAt) {
        // First decline detection — use full base period from now
        return addWorkingDays(new Date(), basePeriod);
    }

    // Decline already existed — calculate days elapsed and remaining
    const now = new Date();
    const elapsedMs = now.getTime() - declineFirstDetectedAt.getTime();
    const elapsedDays = Math.ceil(elapsedMs / (1000 * 60 * 60 * 24)); // Simple calendar days for now
    const remainingDays = Math.max(basePeriod - elapsedDays, 1); // Minimum 1 day

    return addWorkingDays(now, remainingDays);
}

export function formatDhsDeclineDate(value: Date | string | null | undefined): string {
    if (!value) return 'not recorded';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return 'not recorded';

    return new Intl.DateTimeFormat('en-ZA', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    }).format(date);
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

/**
 * Handle a DHS decline by classifying the reason and automatically executing
 * the appropriate response (email, SMS, WhatsApp, status update).
 *
 * This is called both automatically on DHS check completion (Rule 10 in
 * apps/cases/app/api/dhs/lookup/route.ts) and from the manual staff trigger
 * endpoint at /api/cases/[id]/dhs-decline/handle.
 */
export async function handleDHSDecline(params: {
    caseId: string;
    declineReason: string;
    triggeredByUserId?: string;
    /**
     * Bypass the "already emailed the docs for this decline" guard and send the
     * document email regardless. Set by the staff "Resend anyway" action.
     */
    forceResend?: boolean;
}): Promise<DeclineHandlerResult> {
    // When not triggered by a staff member, attribute actions to the
    // Kenny Mokgoshi system automation user so updates show a name in the UI
    const { caseId, declineReason, forceResend } = params;
    const triggeredByUserId = params.triggeredByUserId ?? (await getAutomationUserId()) ?? undefined;
    const log = logger.child ? logger.child({ module: 'decline-handler', caseId }) : logger;

    const result: DeclineHandlerResult = {
        category: 'UNKNOWN',
        emailSent: false,
        smsSent: false,
        whatsappSent: false,
        statusUpdatedTo: null,
        actionsPerformed: [],
        errors: [],
        extractedEmail: null,
        skippedAsDuplicate: false,
        alreadyHandledAt: null,
        classificationSource: 'rules',
        classificationConfidence: 0,
        classificationReasoning: '',
    };

    try {
        const caseData = await prisma.case.findUnique({
            where: { id: caseId },
            include: {
                client: true,
                documents: true,
                debtCounsellor: true,
            },
        });

        if (!caseData) {
            result.errors.push('Case not found');
            return result;
        }

        const classification = await classifyDeclineReasonSmart(declineReason);
        const category = classification.category;
        result.category = category;
        result.classificationSource = classification.source;
        result.classificationConfidence = classification.confidence;
        result.classificationReasoning = classification.reasoning;
        log.info(
            { category, source: classification.source, confidence: classification.confidence },
            `[DHS Decline Handler] Category: ${category} (${classification.source}, ${Math.round(classification.confidence * 100)}%)`
        );
        // Record how the decline was interpreted so staff can see the reasoning
        // behind the automated action — a smart employee explains its decisions.
        await addComment(
            caseId,
            triggeredByUserId,
            `[SYSTEM] DHS Decline Handler: Interpreted decline as ${category} (${classification.source === 'ai' ? 'AI-assisted' : 'rule-based'}, ${Math.round(classification.confidence * 100)}% confidence). Reasoning: ${classification.reasoning}`
        );

        const extractedEmail = extractEmailFromReason(declineReason);
        result.extractedEmail = extractedEmail;

        // ── DC contact-book & outcome history maintenance (best-effort) ──────
        // Record this decline as a durable outcome event (dedupes re-checks) and,
        // when the DC embedded an email in the decline text, promote it to
        // priority 1 on their contact list — the DC has just instructed us to
        // use it. CONTACT_ATTORNEY is excluded: that email is the attorney's,
        // not the DC's.
        const dcRecordId: string | null = (caseData as { debtCounsellordId?: string | null }).debtCounsellordId ?? null;
        try {
            await recordDhsOutcome({
                debtCounsellordId: dcRecordId,
                ncrdcNo: caseData.ncrdcNo,
                caseId,
                outcome: 'DECLINED',
                message: declineReason,
                category,
                extractedEmail,
            });
            if (dcRecordId && extractedEmail && category !== 'CONTACT_ATTORNEY') {
                const promo = await promoteDcEmail({
                    debtCounsellordId: dcRecordId,
                    email: extractedEmail,
                    source: 'DECLINE_EXTRACTED',
                    notes: `Set automatically from DHS decline on case ${caseData.fileNumber}`,
                });
                if (promo.promoted) {
                    result.actionsPerformed.push(
                        `DC contact list updated: ${extractedEmail} set as priority 1 email${promo.droppedEmail ? ` (dropped ${promo.droppedEmail} from slot 5)` : ''}`
                    );
                }
            }
        } catch (contactBookError) {
            // Contact-book upkeep must never block the decline response itself.
            log.error({ contactBookError }, '[DHS Decline Handler] DC contact-book update failed');
        }

        const clientName = `${caseData.client.firstName} ${caseData.client.lastName}`;
        const clientFirstName = caseData.client.firstName;
        const idNumber = caseData.client.idNumber;
        const fileNumber = caseData.fileNumber;
        const baseUrl =
            process.env.NEXT_PUBLIC_APP_URL ||
            process.env.APP_URL ||
            'https://cases.zenowethu.co.za';

        // DC contact: prefer the extracted email from the decline text (the DC
        // just instructed us to use it), then the priority contact list (skips
        // bounced addresses), then the legacy per-case/per-DC email fields.
        const priorityListEmail = dcRecordId
            ? (await getBestDcEmail(dcRecordId).catch(() => null))?.email ?? null
            : null;
        const dcEmail =
            extractedEmail ||
            priorityListEmail ||
            caseData.preferredDcEmail ||
            caseData.debtCounsellor?.preferredEmail ||
            caseData.lastKnownEmail ||
            caseData.debtCounsellor?.lastKnownEmail ||
            caseData.dcEmail ||
            caseData.debtCounsellor?.email ||
            null;
        const { dcName, dcFirmName } = resolveDcIdentity(caseData);

        // Attachment URLs for POA + ID documents
        const docAttachments = caseData.documents
            .filter(d => ['ID', 'POA', 'ZENOWETHU_POA'].includes(d.type))
            .map(d => `${baseUrl}${d.fileUrl}`);

        // ── Category handlers ────────────────────────────────────────────────

        // Helper: send client SMS or WhatsApp (WhatsApp preferred)
        const notifyClientSmsOrWa = async (body: string): Promise<void> => {
            if (caseData.client.whatsappNumber) {
                const r = await sendManualMessage(caseId, 'WHATSAPP', caseData.client.whatsappNumber, body);
                if (r.whatsappSuccess) {
                    result.whatsappSent = true;
                    result.actionsPerformed.push(`WhatsApp sent to consumer (${caseData.client.whatsappNumber})`);
                } else result.errors.push(...r.errors);
            } else if (caseData.client.phone) {
                const r = await sendManualMessage(caseId, 'SMS', caseData.client.phone, body);
                if (r.smsSuccess) {
                    result.smsSent = true;
                    result.actionsPerformed.push(`SMS sent to consumer (${caseData.client.phone})`);
                } else result.errors.push(...r.errors);
            }
        };

        const clientCc = caseData.client.email ? [caseData.client.email] : [];
        const handledAt = new Date();
        const transferRequestedDate = formatDhsDeclineDate(
            caseData.dhsApplicationDate ?? caseData.statusEntryDate ?? caseData.createdAt
        );
        const declineRecordedDate = formatDhsDeclineDate(handledAt);

        // Calculate nextUpdate based on category and time elapsed since first decline
        const basePeriod = getBasePeriodForCategory(category, declineReason);
        const nextUpdateDate = calculateNextUpdate(basePeriod, caseData.declineFirstDetectedAt);

        if (category === 'SEND_DOCS' || category === 'SEND_DOCS_WITH_NCR') {
            // ── Idempotency guard ───────────────────────────────────────────
            // Do not re-email the documents if we already sent them for this
            // decline and the file is not yet overdue. This protects both the
            // automatic DHS re-check path and repeated staff clicks. The
            // "Resend anyway" action passes forceResend to bypass it.
            const declineSince =
                caseData.declineFirstDetectedAt ??
                caseData.declineLastDetectedAt ??
                caseData.dhsApplicationDate ??
                caseData.statusEntryDate ??
                caseData.createdAt;
            const prior = await findPriorDocsEmail({ caseId, dcEmail, since: declineSince });
            const decision = decideDocsResend({
                prior,
                nextUpdate: caseData.nextUpdate ?? null,
                forceResend,
                now: handledAt,
            });

            if (!decision.send) {
                result.skippedAsDuplicate = true;
                result.alreadyHandledAt = prior.sentAt;
                result.statusUpdatedTo = null;
                const when = prior.sentAt ? formatDhsDeclineDate(prior.sentAt) : 'earlier';
                const recipientNote = prior.recipient ? ` to ${prior.recipient}` : '';
                result.actionsPerformed.push(
                    `Documents already emailed${recipientNote} on ${when} for this decline — not resent (file not overdue).`
                );
                await addComment(
                    caseId,
                    triggeredByUserId,
                    `[SYSTEM] DHS Decline Handler: SKIPPED resend — the document email was already sent${recipientNote} on ${when} for this decline and the file is not yet overdue. Use "Resend anyway" to override. DHS decline reason: "${declineReason}"`
                );
                log.info({ prior }, '[DHS Decline Handler] SEND_DOCS skipped as duplicate (not overdue)');
                return result;
            }

            if (prior.found && decision.overdue) {
                result.actionsPerformed.push(
                    `File overdue — resending documents despite an earlier send on ${prior.sentAt ? formatDhsDeclineDate(prior.sentAt) : 'a previous date'}.`
                );
            }

            const updateData: any = {
                status: 'REJECTED_EMAIL_DOCS',
                nextUpdate: nextUpdateDate,
                declineLastDetectedAt: handledAt,
            };
            // Set first detection time if this is the first decline
            if (!caseData.declineFirstDetectedAt) {
                updateData.declineFirstDetectedAt = new Date();
            }
            await safeUpdateCase(caseId, updateData, triggeredByUserId, false); // false = don't double-set declineLastDetectedAt
            result.statusUpdatedTo = 'REJECTED_EMAIL_DOCS';

            if (!dcEmail) {
                result.errors.push(
                    'No DC email address available. Please set the preferred DC email on this case and retry.'
                );
            } else {
                let ncrCertUrl: string | null = null;
                if (category === 'SEND_DOCS_WITH_NCR') {
                    const ncrCert = await prisma.documentResource.findFirst({
                        where: {
                            OR: [
                                { name: { contains: 'NCR', mode: 'insensitive' } },
                                { fileUrl: { contains: 'NCR', mode: 'insensitive' } },
                                { description: { contains: 'NCR certificate', mode: 'insensitive' } },
                            ],
                        },
                        orderBy: { createdAt: 'desc' },
                    });
                    if (ncrCert) {
                        ncrCertUrl = `${baseUrl}${ncrCert.fileUrl}`;
                        log.info(`Found NCR certificate: ${ncrCert.name}`);
                    } else {
                        result.errors.push(
                            'NCR Certificate not found in admin resources. Upload it on the Documents & Resources page, then retry.'
                        );
                    }
                }

                const allAttachments = ncrCertUrl
                    ? [...docAttachments, ncrCertUrl]
                    : docAttachments;
                const ncrLine = ncrCertUrl
                    ? '\n• NCR Certificate of Registration (NCRDC3693)'
                    : '';
                const subject = `Re: DHS Transfer Request – ${clientName} (ID: ${idNumber})`;
                const body = buildSendDocsEmail({
                    clientName,
                    idNumber,
                    fileNumber,
                    dcName,
                    declineReason,
                    ncrLine,
                });

                // Email DC — CC client so they can see we responded on their behalf
                const emailResult = await sendManualMessage(
                    caseId,
                    'EMAIL',
                    dcEmail,
                    body,
                    subject,
                    { attachments: allAttachments, cc: clientCc }
                );
                result.emailSent = emailResult.emailSuccess;

                if (emailResult.emailSuccess) {
                    const withNCR = ncrCertUrl ? ' (including NCR Certificate)' : '';
                    const ccNote = clientCc.length ? ` (client CC'd on ${clientCc[0]})` : '';
                    result.actionsPerformed.push(`Documents emailed to DC at ${dcEmail}${withNCR}${ccNote}`);
                    const updateData: any = {
                        status: 'DOCUMENTS_EMAILED',
                        lastKnownEmail: dcEmail,
                        nextUpdate: addWorkingDays(new Date(), 5),
                        declineLastDetectedAt: handledAt,
                    };
                    if (!caseData.declineFirstDetectedAt) {
                        updateData.declineFirstDetectedAt = new Date();
                    }
                    await safeUpdateCase(
                        caseId,
                        updateData,
                        triggeredByUserId,
                        false
                    );
                    result.statusUpdatedTo = 'DOCUMENTS_EMAILED';
                    await addComment(
                        caseId,
                        triggeredByUserId,
                        `[SYSTEM] DHS Decline Handler: Documents emailed to ${dcEmail}${withNCR}${ccNote}. Status → Documents Emailed. DHS decline reason: "${declineReason}"`
                    );
                    if (caseData.client.email) {
                        const clientEmailResult = await sendManualMessage(
                            caseId,
                            'EMAIL',
                            caseData.client.email,
                            buildSendDocsClientEmail({
                                clientFirstName,
                                dcName,
                                dcFirmName,
                                fileNumber,
                                declineReason,
                                transferRequestedDate,
                                declineRecordedDate,
                                solutionSummary: ncrCertUrl
                                    ? 'We emailed your signed Power of Attorney, ID copy, and our NCR certificate to the Debt Counsellor and requested that they proceed with the transfer.'
                                    : 'We emailed your signed Power of Attorney and ID copy to the Debt Counsellor and requested that they proceed with the transfer.',
                            }),
                            `Update: DHS Transfer Declined (File: ${fileNumber})`
                        );
                        if (clientEmailResult.emailSuccess) {
                            result.actionsPerformed.push(`Client decline update email sent (${caseData.client.email})`);
                        } else {
                            result.errors.push(...clientEmailResult.errors);
                        }
                    }
                } else {
                    result.errors.push(...emailResult.errors);
                }

                // SMS/WhatsApp client to let them know we've responded
                await notifyClientSmsOrWa(buildSendDocsSms({ clientFirstName, dcName, declineReason }));
            }
        }

        else if (category === 'CLIENT_CONSENT_NEEDED') {
            const updateData: any = {
                status: 'REJECTED_NOT_CONSENT',
                nextUpdate: nextUpdateDate,
                declineLastDetectedAt: handledAt,
            };
            if (!caseData.declineFirstDetectedAt) {
                updateData.declineFirstDetectedAt = new Date();
            }
            await safeUpdateCase(
                caseId,
                updateData,
                triggeredByUserId,
                false
            );
            result.statusUpdatedTo = 'REJECTED_NOT_CONSENT';

            const dcContactLine = dcEmail ? ` at ${dcEmail}` : '';
            const emailBody = buildConsumerConsentEmail({
                clientFirstName,
                dcName,
                dcFirmName,
                dcContactLine,
                declineReason,
                transferRequestedDate,
                declineRecordedDate,
            });
            const smsBody = buildConsentSms({ clientFirstName, dcName, dcContactLine });
            const subject = `Action Required: Please Contact Your Debt Counsellor – ${clientName}`;

            if (caseData.client.email) {
                const emailResult = await sendManualMessage(
                    caseId, 'EMAIL', caseData.client.email, emailBody, subject
                );
                result.emailSent = emailResult.emailSuccess;
                if (emailResult.emailSuccess)
                    result.actionsPerformed.push(`Consent email sent to consumer (${caseData.client.email})`);
                else result.errors.push(...emailResult.errors);
            }

            await notifyClientSmsOrWa(smsBody);

            if (result.actionsPerformed.length > 0) {
                const updateData: any = {
                    status: 'CONSUMER_CONTACTED_DC',
                    nextUpdate: nextUpdateDate,
                    declineLastDetectedAt: handledAt,
                };
                if (!caseData.declineFirstDetectedAt) {
                    updateData.declineFirstDetectedAt = new Date();
                }
                await safeUpdateCase(
                    caseId,
                    updateData,
                    triggeredByUserId,
                    false
                );
                result.statusUpdatedTo = 'CONSUMER_CONTACTED_DC';
            }

            await addComment(
                caseId,
                triggeredByUserId,
                `[SYSTEM] DHS Decline Handler: Consumer notified via ${result.actionsPerformed.join(' + ') || 'no channels available'}. Status → Consumer Contacted DC. DHS decline reason: "${declineReason}"`
            );
        }

        else if (category === 'OUTSTANDING_FEES') {
            const updateData: any = {
                status: 'REJECTED_OWES_FEES',
                nextUpdate: nextUpdateDate,
                declineLastDetectedAt: handledAt,
            };
            if (!caseData.declineFirstDetectedAt) {
                updateData.declineFirstDetectedAt = new Date();
            }

            const feesEmailBody = buildOutstandingFeesEmail({
                clientFirstName,
                dcName,
                dcFirmName,
                fileNumber,
                declineReason,
                transferRequestedDate,
                declineRecordedDate,
            });
            const feesSmsBody = buildFeesSms({ clientFirstName, dcName });
            const feesSubject = `Outstanding Fees – Your Debt Review Transfer (File: ${fileNumber})`;

            // If we have a DC email, request the invoice from them and CC the client
            if (dcEmail) {
                const dcInvoiceEmailBody = buildRequestInvoiceEmail({
                    clientName,
                    idNumber,
                    fileNumber,
                    dcName,
                    declineReason,
                    hasAttachments: docAttachments.length > 0,
                });
                const dcInvoiceSubject = `Request for Invoice/Statement – ${clientName} (ID: ${idNumber})`;

                const dcEmailResult = await sendManualMessage(
                    caseId,
                    'EMAIL',
                    dcEmail,
                    dcInvoiceEmailBody,
                    dcInvoiceSubject,
                    { attachments: docAttachments, cc: clientCc }
                );

                if (dcEmailResult.emailSuccess) {
                    result.emailSent = true;
                    const withPoa = docAttachments.length > 0 ? ' (POA + ID attached)' : '';
                    result.actionsPerformed.push(`Invoice request emailed to DC at ${dcEmail}${withPoa} (client CC'd)`);
                    updateData.lastKnownEmail = dcEmail;
                } else {
                    result.errors.push(...dcEmailResult.errors);
                }

                // If DC email succeeded, we still send the client-focused explanation email separately
                // so the client understands the context.
                if (dcEmailResult.emailSuccess && caseData.client.email) {
                    const clientEmailResult = await sendManualMessage(
                        caseId,
                        'EMAIL',
                        caseData.client.email,
                        feesEmailBody,
                        feesSubject
                    );
                    if (clientEmailResult.emailSuccess) {
                        result.actionsPerformed.push(`Outstanding fees email sent to consumer (${caseData.client.email})`);
                    } else {
                        result.errors.push(...clientEmailResult.errors);
                    }
                }
            } else {
                result.errors.push(
                    'No DC email address available to request invoice. Please set the preferred DC email on this case.'
                );
                // Still notify client of the decline so they are not left in the dark
                if (caseData.client.email) {
                    const clientEmailResult = await sendManualMessage(
                        caseId,
                        'EMAIL',
                        caseData.client.email,
                        feesEmailBody,
                        feesSubject
                    );
                    result.emailSent = clientEmailResult.emailSuccess;
                    if (clientEmailResult.emailSuccess) {
                        result.actionsPerformed.push(`Outstanding fees email sent to consumer (${caseData.client.email})`);
                    } else {
                        result.errors.push(...clientEmailResult.errors);
                    }
                }
            }

            await safeUpdateCase(
                caseId,
                updateData,
                triggeredByUserId,
                false
            );
            result.statusUpdatedTo = 'REJECTED_OWES_FEES';

            await notifyClientSmsOrWa(feesSmsBody);

            await addComment(
                caseId,
                triggeredByUserId,
                `[SYSTEM] DHS Decline Handler: Outstanding fees. Consumer notified via ${result.actionsPerformed.join(' + ') || 'no channels available'}. Status → Rejected - Owes Fees. DHS decline reason: "${declineReason}"`
            );
        }

        else if (category === 'CONTACT_ATTORNEY') {
            const attorneyEmail = extractedEmail;
            if (!attorneyEmail) {
                result.errors.push(
                    'Attorney contact required but no email address found in decline reason. Please contact them manually.'
                );
                // Still notify client so they are not left in the dark
                if (caseData.client.email) {
                    const r = await sendManualMessage(
                        caseId, 'EMAIL', caseData.client.email,
                        buildAttorneyClientEmail({
                            clientFirstName,
                            dcName,
                            dcFirmName,
                            fileNumber,
                            declineReason,
                            attorneyEmail: null,
                            transferRequestedDate,
                            declineRecordedDate,
                        }),
                        `Update on Your Debt Review Transfer – ${clientName}`
                    );
                    if (r.emailSuccess) result.actionsPerformed.push(`Client notified of attorney involvement (${caseData.client.email})`);
                }
                await notifyClientSmsOrWa(buildAttorneySms({ clientFirstName }));
                await addComment(
                    caseId,
                    triggeredByUserId,
                    `[SYSTEM] DHS Decline Handler: Attorney involvement required — no email found in decline text. Manual contact needed. Client notified. DHS decline reason: "${declineReason}"`
                );
            } else {
                // Email attorney — CC client
                const body = buildAttorneyEmail({
                    clientName,
                    idNumber,
                    fileNumber,
                    dcName,
                    declineReason,
                });
                const subject = `Debt Review Transfer Request – ${clientName} (ID: ${idNumber})`;
                const emailResult = await sendManualMessage(
                    caseId,
                    'EMAIL',
                    attorneyEmail,
                    body,
                    subject,
                    { attachments: docAttachments, cc: clientCc }
                );
                result.emailSent = emailResult.emailSuccess;
                if (emailResult.emailSuccess) {
                    const ccNote = clientCc.length ? ` (client CC'd on ${clientCc[0]})` : '';
                    result.actionsPerformed.push(`Attorney email sent to ${attorneyEmail}${ccNote}`);
                    // Separate plain-language client email + SMS
                    if (caseData.client.email) {
                        const r = await sendManualMessage(
                            caseId, 'EMAIL', caseData.client.email,
                            buildAttorneyClientEmail({
                                clientFirstName,
                                dcName,
                                dcFirmName,
                                fileNumber,
                                declineReason,
                                attorneyEmail,
                                transferRequestedDate,
                                declineRecordedDate,
                            }),
                            `Update on Your Debt Review Transfer – ${clientName}`
                        );
                        if (r.emailSuccess) result.actionsPerformed.push(`Client update email sent (${caseData.client.email})`);
                    }
                    await notifyClientSmsOrWa(buildAttorneySms({ clientFirstName }));
                    await addComment(
                        caseId,
                        triggeredByUserId,
                        `[SYSTEM] DHS Decline Handler: Attorney at ${attorneyEmail} contacted${ccNote}. Client notified. DHS decline reason: "${declineReason}"`
                    );
                } else {
                    result.errors.push(...emailResult.errors);
                }
            }
        }

        else if (category === 'RESUBMIT_LATER') {
            const updateData: any = {
                nextUpdate: nextUpdateDate,
                declineLastDetectedAt: handledAt,
            };
            if (!caseData.declineFirstDetectedAt) {
                updateData.declineFirstDetectedAt = new Date();
            }
            await safeUpdateCase(
                caseId,
                updateData,
                triggeredByUserId,
                false
            );
            result.actionsPerformed.push(`Next update set to +${basePeriod} working days — file will be re-checked`);

            // Client update — they deserve to know the file is still being processed
            if (caseData.client.email) {
                const r = await sendManualMessage(
                    caseId, 'EMAIL', caseData.client.email,
                    buildResubmitClientEmail({
                        clientFirstName,
                        dcName,
                        dcFirmName,
                        fileNumber,
                        declineReason,
                        transferRequestedDate,
                        declineRecordedDate,
                    }),
                    `Update on Your Debt Review Transfer (File: ${fileNumber})`
                );
                if (r.emailSuccess) {
                    result.emailSent = true;
                    result.actionsPerformed.push(`Client update email sent (${caseData.client.email})`);
                }
            }
            await notifyClientSmsOrWa(buildResubmitSms({ clientFirstName }));

            await addComment(
                caseId,
                triggeredByUserId,
                `[SYSTEM] DHS Decline Handler: Classified as resubmit later. Next update +7 working days. Client notified. DHS decline reason: "${declineReason}"`
            );
        }

        else {
            // UNKNOWN — escalate to staff
            result.errors.push(
                'Decline reason could not be auto-classified. Please review and handle manually.'
            );
            await addComment(
                caseId,
                triggeredByUserId,
                `[SYSTEM] DHS Decline Handler: Could not classify decline reason. Manual review required. Decline reason: "${declineReason}"`
            );
            // Notify admins via in-app notification
            const admins = await prisma.user.findMany({
                where: { isAdmin: true },
                select: { id: true },
            });
            for (const admin of admins) {
                await prisma.inAppNotification.create({
                    data: {
                        userId: admin.id,
                        type: 'SYSTEM_ALERT',
                        title: 'DHS Decline Needs Manual Review',
                        message: `Case ${caseData.fileNumber}: Decline reason could not be auto-classified. Please review.`,
                        caseId,
                        linkUrl: `/cases/${caseId}`,
                    },
                });
            }
        }

        log.info({ result }, '[DHS Decline Handler] Completed');
        return result;
    } catch (error) {
        log.error({ error }, '[DHS Decline Handler] Unexpected error');
        result.errors.push(
            `Internal error: ${error instanceof Error ? error.message : String(error)}`
        );
        return result;
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function safeUpdateCase(
    caseId: string,
    data: Record<string, unknown>,
    userId?: string,
    trackDeclineDate: boolean = true
): Promise<void> {
    // Add decline tracking if flagged
    const updateData = { ...data };
    if (trackDeclineDate) {
        updateData.declineLastDetectedAt = new Date(); // Always update last detection time
        // declineFirstDetectedAt is set separately if this is a first decline
    }

    await prisma.case.update({
        where: { id: caseId },
        data: {
            ...updateData,
            ...(userId ? { updatedBy: { connect: { id: userId } } } : {}),
        },
    });
}

async function addComment(
    caseId: string,
    userId: string | undefined,
    content: string
): Promise<void> {
    if (!userId) return;
    await prisma.caseComment.create({
        data: { caseId, userId, content },
    });
}

/**
 * Resolve the DC's personal name and firm (trading) name for outbound copy.
 * Falls back through case-level overrides to the linked DebtCounsellor record
 * so consumer emails never render the literal placeholder "Debt Counsellor"
 * when the DC is actually known.
 */
export function resolveDcIdentity(caseData: {
    debtCounsellorName: string | null;
    dcTradingName: string | null;
    debtCounsellor?: { fullName: string | null; tradingName: string | null } | null;
}): { dcName: string; dcFirmName: string | null } {
    const tradingName =
        caseData.dcTradingName || caseData.debtCounsellor?.tradingName || null;
    const dcName =
        caseData.debtCounsellorName ||
        caseData.debtCounsellor?.fullName ||
        tradingName ||
        'Debt Counsellor';
    // Only show the firm separately when it adds information beyond the name
    const dcFirmName = tradingName && tradingName !== dcName ? tradingName : null;
    return { dcName, dcFirmName };
}

/** Renders "(Gasant Essack) from (Creditore Debt Counselling)" or just "(Gasant Essack)". */
function dcDisplayPhrase(dcName: string, dcFirmName: string | null): string {
    return dcFirmName ? `(${dcName}) from (${dcFirmName})` : `(${dcName})`;
}

// ─── Email Templates ──────────────────────────────────────────────────────────

const SIGNATURE = `Zenowethu Debt Management
NCRDC3693
Suite 2, 2nd Floor, Central House, 17 Central Road, Mabopane, 0190
Tel: +27 81 747 7616 | Cell: 082 363 8207
notifications@zenowethu.co.za | www.zenowethu.co.za
Member of DCASA`;

function buildSendDocsEmail(p: {
    clientName: string;
    idNumber: string;
    fileNumber: string;
    dcName: string;
    declineReason: string;
    ncrLine: string;
}): string {
    return `Dear ${p.dcName},

Thank you for your response via the NCR Debt Help System (DHS) regarding the transfer request for the following consumer:

  Client:       ${p.clientName}
  ID Number:    ${p.idNumber}
  File Number:  ${p.fileNumber}

Your DHS response reads:
"${p.declineReason}"

As requested, please find the following documents attached to this email:
  • Signed and dated Power of Attorney (POA)
  • Copy of Consumer Identity Document (ID)${p.ncrLine}

We trust these documents meet your requirements and kindly request that you proceed with processing the transfer on the DHS at your earliest convenience.

Should you require any additional documentation or information, please do not hesitate to contact us.

Please note: our client (${p.clientName}) has been copied on this email for transparency.

Yours sincerely,

${SIGNATURE}`;
}

function buildConsumerDeclineStatusBlock(p: {
    transferRequestedDate: string;
    declineRecordedDate: string;
    declineReason: string;
    solutionSummary: string;
}): string {
    return `Transfer request date: ${p.transferRequestedDate}
Decline recorded date: ${p.declineRecordedDate}

Reason given by the current Debt Counsellor:
"${p.declineReason}"

What we have done to handle the decline:
${p.solutionSummary}`;
}

function buildSendDocsClientEmail(p: {
    clientFirstName: string;
    dcName: string;
    dcFirmName: string | null;
    fileNumber: string;
    declineReason: string;
    transferRequestedDate: string;
    declineRecordedDate: string;
    solutionSummary: string;
}): string {
    return `Dear ${p.clientFirstName},

We are writing with an update on the transfer of your debt review file (File No: ${p.fileNumber}) to Zenowethu Debt Management.

Your current Debt Counsellor ${dcDisplayPhrase(p.dcName, p.dcFirmName)} declined the DHS transfer request.

${buildConsumerDeclineStatusBlock({
    transferRequestedDate: p.transferRequestedDate,
    declineRecordedDate: p.declineRecordedDate,
    declineReason: p.declineReason,
    solutionSummary: p.solutionSummary,
})}

We will monitor the response and follow up until the transfer can proceed. You do not need to take any action on this item right now.

Yours sincerely,

${SIGNATURE}`;
}

function buildSendDocsSms(p: {
    clientFirstName: string;
    dcName: string;
    declineReason: string;
}): string {
    return `Hi ${p.clientFirstName}, your DC (${p.dcName}) declined the DHS transfer request: "${p.declineReason.slice(0, 100)}${p.declineReason.length > 100 ? '…' : ''}". We have responded with your documents and requested they proceed. We will follow up. — Zenowethu (081 747 7616)`;
}

function buildConsumerConsentEmail(p: {
    clientFirstName: string;
    dcName: string;
    dcFirmName: string | null;
    dcContactLine: string;
    declineReason: string;
    transferRequestedDate: string;
    declineRecordedDate: string;
}): string {
    return `Dear ${p.clientFirstName},

We trust this message finds you well.

We are reaching out regarding the transfer of your debt review file to Zenowethu Debt Management.

We submitted a transfer request on your behalf via the NCR Debt Help System (DHS). Your current Debt Counsellor ${dcDisplayPhrase(p.dcName, p.dcFirmName)} has declined this request.

${buildConsumerDeclineStatusBlock({
    transferRequestedDate: p.transferRequestedDate,
    declineRecordedDate: p.declineRecordedDate,
    declineReason: p.declineReason,
    solutionSummary: `We are asking you to contact ${p.dcName}${p.dcContactLine} directly to confirm that you consent to the transfer, after which we can resubmit the DHS request.`,
})}

─────────────────────────────────────────
ACTION REQUIRED
─────────────────────────────────────────
Please contact ${p.dcName}${p.dcContactLine} as soon as possible and confirm that you consent to your file being transferred to Zenowethu Debt Management.

Once you have given your consent, please reply to this email or call us so we can resubmit the transfer request on your behalf.

If you are experiencing any difficulties contacting your Debt Counsellor, please let us know and we will assist you.

Thank you for your prompt attention to this matter.

Yours sincerely,

${SIGNATURE}`;
}

function buildConsentSms(p: {
    clientFirstName: string;
    dcName: string;
    dcContactLine: string;
}): string {
    return `Hi ${p.clientFirstName}, your DC (${p.dcName}) declined your DHS transfer request — they need your direct consent. Please contact them${p.dcContactLine} to confirm consent, then reply here. — Zenowethu (081 747 7616)`;
}

function buildOutstandingFeesEmail(p: {
    clientFirstName: string;
    dcName: string;
    dcFirmName: string | null;
    fileNumber: string;
    declineReason: string;
    transferRequestedDate: string;
    declineRecordedDate: string;
}): string {
    return `Dear ${p.clientFirstName},

We trust this message finds you well.

We are writing regarding your debt review file (File No: ${p.fileNumber}) and the transfer of your case to Zenowethu Debt Management.

We submitted a transfer request on your behalf via the NCR Debt Help System (DHS). Your current Debt Counsellor ${dcDisplayPhrase(p.dcName, p.dcFirmName)} has declined this request.

${buildConsumerDeclineStatusBlock({
    transferRequestedDate: p.transferRequestedDate,
    declineRecordedDate: p.declineRecordedDate,
    declineReason: p.declineReason,
    solutionSummary: 'We are requesting an invoice or statement for the outstanding amount from your Debt Counsellor so we can forward it to you with clear next steps.',
})}

─────────────────────────────────────────
NEXT STEPS
─────────────────────────────────────────
We are currently requesting an invoice from your Debt Counsellor for the outstanding amount. Once received, we will forward it to you with clear guidance on how to proceed.

If you believe this is in error, or if you have already settled these fees, please contact us immediately and we will investigate on your behalf.

We apologise for any inconvenience and thank you for your patience.

Yours sincerely,

${SIGNATURE}`;
}

function buildFeesSms(p: {
    clientFirstName: string;
    dcName: string;
}): string {
    return `Hi ${p.clientFirstName}, your DC (${p.dcName}) declined your DHS transfer — outstanding fees must be settled first. We are requesting the invoice and will send it to you. Contact us on 081 747 7616. — Zenowethu`;
}

function buildRequestInvoiceEmail(p: {
    clientName: string;
    idNumber: string;
    fileNumber: string;
    dcName: string;
    declineReason: string;
    hasAttachments: boolean;
}): string {
    const poaLine = p.hasAttachments
        ? `\n\nFor your reference and as proof of our authority to act on the consumer's behalf, please find attached our client's signed Power of Attorney and identity document.`
        : '';
    return `Dear ${p.dcName},

Thank you for your response via the NCR Debt Help System (DHS) regarding the transfer request for the following consumer:

  Client:       ${p.clientName}
  ID Number:    ${p.idNumber}
  File Number:  ${p.fileNumber}

Your DHS response indicates that there are outstanding fees:
"${p.declineReason}"

Please provide a detailed invoice or statement of the outstanding amount, along with the firm's banking details, so that we can forward it to the consumer for payment.${poaLine}

Please note: our client (${p.clientName}) has been copied on this email for transparency.

We appreciate your cooperation in resolving this matter.

Yours sincerely,

${SIGNATURE}`;
}

function buildAttorneyEmail(p: {
    clientName: string;
    idNumber: string;
    fileNumber: string;
    dcName: string;
    declineReason: string;
}): string {
    return `Dear Attorney,

We trust this email finds you well.

We are writing on behalf of our client regarding their debt review matter. We submitted a transfer request via the NCR Debt Help System (DHS) and understand the matter has been referred to your offices.

  Client:       ${p.clientName}
  ID Number:    ${p.idNumber}
  File Number:  ${p.fileNumber}
  Current DC:   ${p.dcName}

The decline received from the NCR Debt Help System (DHS) states:
"${p.declineReason}"

We kindly request your assistance in clarifying the current status of this matter and advising on the steps required before the file transfer can proceed on the DHS.

Please find attached the consumer's supporting documentation (POA and ID) for your reference. Our client has been copied on this email.

We look forward to your response.

Yours sincerely,

${SIGNATURE}`;
}

function buildAttorneyClientEmail(p: {
    clientFirstName: string;
    dcName: string;
    dcFirmName: string | null;
    fileNumber: string;
    declineReason: string;
    attorneyEmail: string | null;
    transferRequestedDate: string;
    declineRecordedDate: string;
}): string {
    const attorneyLine = p.attorneyEmail
        ? `We have contacted the attorney at ${p.attorneyEmail} and requested their guidance on the next steps. You have been copied on that email.`
        : `Attorney involvement is required but we were unable to find their contact details in the DHS response. Our team will contact them manually and keep you updated.`;
    return `Dear ${p.clientFirstName},

We are writing with an update on the transfer of your debt review file (File No: ${p.fileNumber}) to Zenowethu Debt Management.

We submitted a transfer request on your behalf via the NCR Debt Help System (DHS). Your current Debt Counsellor ${dcDisplayPhrase(p.dcName, p.dcFirmName)} has declined this request and indicated that a legal matter is involved.

${buildConsumerDeclineStatusBlock({
    transferRequestedDate: p.transferRequestedDate,
    declineRecordedDate: p.declineRecordedDate,
    declineReason: p.declineReason,
    solutionSummary: p.attorneyEmail
        ? `We contacted the attorney at ${p.attorneyEmail} and requested guidance on the steps required before the DHS transfer can proceed.`
        : 'Attorney involvement is required, but no attorney email was found in the DHS response. Our team will contact the relevant party manually and keep you updated.',
})}

─────────────────────────────────────────
WHAT WE ARE DOING
─────────────────────────────────────────
${attorneyLine}

You do not need to take any action at this time. We will keep you informed as the matter progresses. If you have any questions, please do not hesitate to contact us.

Yours sincerely,

${SIGNATURE}`;
}

function buildAttorneySms(p: { clientFirstName: string }): string {
    return `Hi ${p.clientFirstName}, your DC's DHS response indicates legal/attorney involvement is required for your transfer. We are engaging with the relevant parties and will keep you updated. — Zenowethu (081 747 7616)`;
}

function buildResubmitClientEmail(p: {
    clientFirstName: string;
    dcName: string;
    dcFirmName: string | null;
    fileNumber: string;
    declineReason: string;
    transferRequestedDate: string;
    declineRecordedDate: string;
}): string {
    return `Dear ${p.clientFirstName},

We are writing with an update on the transfer of your debt review file (File No: ${p.fileNumber}) to Zenowethu Debt Management.

We submitted a transfer request on your behalf via the NCR Debt Help System (DHS). Your current Debt Counsellor ${dcDisplayPhrase(p.dcName, p.dcFirmName)} has indicated that the request cannot be processed immediately.

${buildConsumerDeclineStatusBlock({
    transferRequestedDate: p.transferRequestedDate,
    declineRecordedDate: p.declineRecordedDate,
    declineReason: p.declineReason,
    solutionSummary: 'We have diarised the case for another DHS check and will resubmit or follow up within the next 5-7 working days.',
})}

─────────────────────────────────────────
WHAT HAPPENS NEXT
─────────────────────────────────────────
This is a temporary delay. We will monitor the DHS and resubmit your transfer request within the next 5–7 working days. You do not need to take any action at this time.

If you have any concerns or questions in the meantime, please do not hesitate to contact us on 081 747 7616 or reply to this email.

Thank you for your patience — we are working on your behalf.

Yours sincerely,

${SIGNATURE}`;
}

function buildResubmitSms(p: { clientFirstName: string }): string {
    return `Hi ${p.clientFirstName}, your DC's DHS response indicates a temporary delay on your file transfer. We will resubmit within 5–7 working days. No action needed from you. — Zenowethu (081 747 7616)`;
}

// ─── Shared exports ───────────────────────────────────────────────────────────
// Re-exported so the read-only preview path (decline-preview.ts) renders the
// EXACT same copy that handleDHSDecline() sends — a single source of truth for
// every email/SMS body. Do not duplicate these templates elsewhere.
export {
    SIGNATURE,
    buildSendDocsEmail,
    buildSendDocsClientEmail,
    buildSendDocsSms,
    buildConsumerConsentEmail,
    buildConsentSms,
    buildOutstandingFeesEmail,
    buildFeesSms,
    buildRequestInvoiceEmail,
    buildAttorneyEmail,
    buildAttorneyClientEmail,
    buildAttorneySms,
    buildResubmitClientEmail,
    buildResubmitSms,
};
