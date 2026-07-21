/**
 * Debt Review Removal — Post-Consent Document Readiness Pipeline
 *
 * Runs right after the consumer approves the debt-review-removal consent (in
 * Credo or via the public link). It answers one question for staff: "is this
 * file ready for the Manage Consumers step?"
 *
 *   1. Check the case has the three working documents on file:
 *      credit report, payslip, bank statement.
 *   2. If any is missing and a COMBINED (or OTHER) PDF exists, run the AI page
 *      identifier and split ONLY the missing documents out of it, saving each
 *      as its own Document record.
 *   3. If the credit report is STILL missing after the split, email a request
 *      for it to the case's Referrer — or, failing that, the B2B partner
 *      project's billing email — and log the request on the case.
 *   4. Payslip / bank statement still missing → open Credo DocumentRequests so
 *      the consumer (who has just logged in) is asked to upload them.
 *   5. Everything present → run the Manage Consumers DHS clearance check
 *      automatically (see clearance-automation.ts) so the case advances without
 *      staff having to click anything. Documents outstanding → the case is
 *      parked at AWAITING_DRR_DOCS so the header reflects reality.
 *
 * IMPORTANT: steps 2 reads case files from local disk (storage/uploads), so
 * this pipeline must run inside the CASES app process. The Credo consent route
 * reaches it through POST /api/internal/drr-readiness on the Cases app.
 *
 * Never throws — every failure is captured in `errors` and posted to the case
 * timeline so nothing disappears silently.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { prisma } from '@zenowethu/database';
import { createLogger } from '../logger';
import { getAutomationUserId } from '../automation/automation-user';
import { sendManualMessage } from '../notifications/service';
import { identifyDocumentPages, splitPdf } from '../openai/pdf-process';
import { addWorkingDays } from '../statuses/workingDays';
import { runManageConsumersClearance, type ClearanceRunResult } from './clearance-automation';

const logger = createLogger('dhs/drr-readiness');

/** Workflow status a case is parked at while required documents are chased. */
export const AWAITING_DRR_DOCS_STATUS = 'AWAITING_DRR_DOCS';
/** Working-day follow-up window while documents are outstanding. */
const AWAITING_DOCS_FOLLOWUP_DAYS = 3;

/**
 * Statuses the readiness pipeline may park a case FROM at Awaiting DRR
 * Documents. A manual staff move to any other status is never overwritten.
 */
const READINESS_PARK_FROM_STATUSES = new Set([
    'READY_TO_CONSENT',
    'CONSENT_RECEIVED',
    'AWAITING_DRR_DOCS',
    'ACCEPTED_VIA_DHS',
    'ZDM_CLIENT',
]);

/** The document kinds this pipeline looks for. */
export type RequiredDocKind = 'CREDIT_REPORT' | 'PAYSLIP' | 'BANK_STATEMENT';

export const REQUIRED_DOC_KINDS: RequiredDocKind[] = ['CREDIT_REPORT', 'PAYSLIP', 'BANK_STATEMENT'];
const REQUIRED_TO_PROCEED_KINDS: RequiredDocKind[] = ['CREDIT_REPORT'];
const OPTIONAL_DOC_KINDS: RequiredDocKind[] = ['PAYSLIP', 'BANK_STATEMENT'];

const KIND_LABELS: Record<RequiredDocKind, string> = {
    CREDIT_REPORT: 'Credit report',
    PAYSLIP: 'Payslip',
    BANK_STATEMENT: 'Bank statement',
};

/** Document.type values that satisfy each required kind. */
const KIND_MATCHERS: Record<RequiredDocKind, string[]> = {
    CREDIT_REPORT: [
        'CREDIT_REPORT',
        'CREDIT_REPORT_OTHER',
        'CREDIT_REPORT_TRANSUNION',
        'CREDIT_REPORT_EXPERIAN',
        'CREDIT_REPORT_XDS',
        'CREDIT_REPORT_LIGHTSTONE',
    ],
    PAYSLIP: ['PAYSLIP'],
    BANK_STATEMENT: ['BANK_STATEMENT'],
};

/** Documents that may contain several documents bundled into one PDF. */
const COMBINED_DOC_TYPES = ['COMBINED', 'OTHER'];

/** Don't re-email the referrer about the same credit report within this window. */
const CREDIT_REPORT_REQUEST_COOLDOWN_DAYS = 7;

export interface DrrReadinessResult {
    caseId: string;
    /** True when the required credit report is on file at the end of the run. */
    ready: boolean;
    /** Kinds already on file before any splitting. */
    presentBefore: RequiredDocKind[];
    /** Kinds recovered by splitting the combined document on this run. */
    recoveredBySplit: RequiredDocKind[];
    /** Kinds still missing at the end of the run. */
    missingAfter: RequiredDocKind[];
    /** Required document kinds still missing at the end of the run. */
    requiredMissingAfter: RequiredDocKind[];
    /** Optional document kinds still missing at the end of the run. */
    optionalMissingAfter: RequiredDocKind[];
    /** True when a combined document was found and the AI split was attempted. */
    splitAttempted: boolean;
    /** Email address the credit report was requested from (referrer/B2B partner). */
    creditReportRequestedFrom: string | null;
    /** Labels of Credo DocumentRequests opened for the consumer on this run. */
    documentRequestsCreated: string[];
    /** Workflow status the case was moved to on this run, if any. */
    statusUpdatedTo: string | null;
    /** Outcome of the automatic Manage Consumers clearance run (when ready). */
    clearance: ClearanceRunResult | null;
    actionsPerformed: string[];
    errors: string[];
}

/** Map a Document.type value to the required kind it satisfies, if any. */
export function docTypeToKind(type: string): RequiredDocKind | null {
    const t = (type || '').toUpperCase();
    if (t.startsWith('CREDIT_REPORT')) return 'CREDIT_REPORT';
    for (const kind of REQUIRED_DOC_KINDS) {
        if (KIND_MATCHERS[kind].includes(t)) return kind;
    }
    return null;
}

/**
 * Resolve a Document.fileUrl to an absolute path on disk, following the same
 * convention as the Cases upload/extract routes: `/uploads/...` lives under
 * `<cwd>/storage/uploads`, anything else under `<cwd>/public`.
 */
export function resolveDocumentFilePath(fileUrl: string, cwd: string = process.cwd()): string {
    if (fileUrl.startsWith('/uploads/')) {
        return join(cwd, 'storage', 'uploads', fileUrl.replace('/uploads/', ''));
    }
    const relative = fileUrl.startsWith('/') ? fileUrl.slice(1) : fileUrl;
    return join(cwd, 'public', relative);
}

/**
 * Run the post-consent document readiness pipeline for a case.
 * Safe to call repeatedly — splitting only runs while documents are missing,
 * referrer requests respect a cooldown, and DocumentRequests are deduped.
 */
export async function runDrrDocumentReadiness(params: {
    caseId: string;
    triggeredByUserId?: string;
    /**
     * Run the Manage Consumers DHS clearance check automatically when all
     * documents are present (default true). Pass false for callers that only
     * want the document check (e.g. previews / dry runs).
     */
    runClearanceWhenReady?: boolean;
}): Promise<DrrReadinessResult> {
    const { caseId } = params;
    const runClearanceWhenReady = params.runClearanceWhenReady !== false;
    const result: DrrReadinessResult = {
        caseId,
        ready: false,
        presentBefore: [],
        recoveredBySplit: [],
        missingAfter: [],
        requiredMissingAfter: [],
        optionalMissingAfter: [],
        splitAttempted: false,
        creditReportRequestedFrom: null,
        documentRequestsCreated: [],
        statusUpdatedTo: null,
        clearance: null,
        actionsPerformed: [],
        errors: [],
    };

    const userId = params.triggeredByUserId ?? (await getAutomationUserId().catch(() => null)) ?? undefined;

    try {
        const caseData = await prisma.case.findUnique({
            where: { id: caseId },
            include: {
                client: true,
                documents: true,
                referrer: { select: { firstName: true, lastName: true, email: true } },
                projects: { include: { project: { select: { name: true, billingEmail: true } } } },
            },
        });
        if (!caseData) {
            result.errors.push('Case not found');
            return result;
        }

        const kindsPresent = (): Set<RequiredDocKind> => {
            const present = new Set<RequiredDocKind>();
            for (const doc of caseData.documents) {
                const kind = docTypeToKind(doc.type);
                if (kind) present.add(kind);
            }
            return present;
        };

        let present = kindsPresent();
        result.presentBefore = [...present];
        let missing = REQUIRED_DOC_KINDS.filter((k) => !present.has(k));

        // ── Step 2: split the combined document for the missing kinds ────────
        if (missing.length > 0) {
            const splitOutcome = await trySplitCombinedDocument(caseId, caseData.documents, missing, result);
            if (splitOutcome.newDocs.length > 0) {
                caseData.documents.push(...splitOutcome.newDocs);
                present = kindsPresent();
                result.recoveredBySplit = missing.filter((k) => present.has(k));
                missing = REQUIRED_DOC_KINDS.filter((k) => !present.has(k));
            }
        }
        result.missingAfter = missing;
        result.requiredMissingAfter = missing.filter((k) => REQUIRED_TO_PROCEED_KINDS.includes(k));
        result.optionalMissingAfter = missing.filter((k) => OPTIONAL_DOC_KINDS.includes(k));

        // ── Step 3: credit report still missing → ask the referrer/partner ───
        if (missing.includes('CREDIT_REPORT')) {
            await requestCreditReportFromReferrer(caseData, userId, result);
        }

        // ── Step 4: consumer-suppliable documents → Credo DocumentRequests ───
        if (result.optionalMissingAfter.length > 0) {
            result.actionsPerformed.push(
                `Optional documents not found: ${result.optionalMissingAfter.map((k) => KIND_LABELS[k]).join(', ')}. Continuing because they are not required for DRR.`,
            );
        }

        // ── Step 5: verdict on the case timeline + workflow status ───────────
        result.ready = result.requiredMissingAfter.length === 0;
        await postReadinessComment(caseId, userId, result);

        if (!result.ready) {
            // Park the case at Awaiting DRR Documents so the header stops
            // saying "Ready to Consent" once the consumer has approved.
            if (READINESS_PARK_FROM_STATUSES.has(caseData.status ?? '')) {
                await prisma.case
                    .update({
                        where: { id: caseId },
                        data: {
                            status: AWAITING_DRR_DOCS_STATUS,
                            nextUpdate: addWorkingDays(new Date(), AWAITING_DOCS_FOLLOWUP_DAYS),
                        },
                    })
                    .then(() => {
                        result.statusUpdatedTo = AWAITING_DRR_DOCS_STATUS;
                        result.actionsPerformed.push('Case status → Awaiting DRR Documents.');
                    })
                    .catch((err) => {
                        logger.error(`[DRR Readiness] Failed to park case ${caseId} at Awaiting DRR Documents:`, err);
                        result.errors.push('Failed to update the case status to Awaiting DRR Documents.');
                    });
            }
        } else if (runClearanceWhenReady) {
            // All documents on file → run the Manage Consumers DHS clearance
            // check automatically. It advances the workflow itself
            // (Ready for Clearance / Completed) and never throws.
            result.clearance = await runManageConsumersClearance({
                caseId,
                triggeredByUserId: params.triggeredByUserId,
            });
            result.statusUpdatedTo = result.clearance.statusUpdatedTo;
            result.actionsPerformed.push(
                result.clearance.statusUpdatedTo
                    ? `Manage Consumers clearance check ran — case status → ${result.clearance.statusUpdatedTo}.`
                    : 'Manage Consumers clearance check ran — no status change (see case timeline).',
            );
            result.errors.push(...result.clearance.errors);
        }

        logger.info({ result: { ...result } }, `[DRR Readiness] Completed for case ${caseId}`);
        return result;
    } catch (error) {
        logger.error(`[DRR Readiness] Unexpected error for case ${caseId}:`, error);
        result.errors.push(`Internal error: ${error instanceof Error ? error.message : String(error)}`);
        await postReadinessComment(caseId, userId, result).catch(() => null);
        return result;
    }
}

/** Full Prisma Document row (derived, so no drift with the schema). */
type CaseDocument = NonNullable<Awaited<ReturnType<typeof prisma.document.findUnique>>>;

/**
 * Find the most recent combined PDF on the case, identify its pages with AI and
 * split out ONLY the missing document kinds, saving each as a Document record.
 */
async function trySplitCombinedDocument(
    caseId: string,
    documents: CaseDocument[],
    missing: RequiredDocKind[],
    result: DrrReadinessResult,
): Promise<{ newDocs: CaseDocument[] }> {
    const newDocs: CaseDocument[] = [];

    // COMBINED uploads first, then OTHER as a fallback; most recent first.
    const candidates = documents
        .filter((d) => COMBINED_DOC_TYPES.includes((d.type || '').toUpperCase()) && d.mimeType === 'application/pdf')
        .sort((a, b) => {
            const typeRank = (t: string) => ((t || '').toUpperCase() === 'COMBINED' ? 0 : 1);
            return typeRank(a.type) - typeRank(b.type) || new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
        });

    if (candidates.length === 0) {
        result.actionsPerformed.push('No combined document on file to split for the missing documents.');
        return { newDocs };
    }

    for (const candidate of candidates) {
        const filePath = resolveDocumentFilePath(candidate.fileUrl);
        if (!existsSync(filePath)) {
            result.errors.push(`Combined document file not found on disk: ${candidate.fileName}`);
            continue;
        }

        try {
            result.splitAttempted = true;
            logger.info(`[DRR Readiness] Splitting ${candidate.fileName} for missing: ${missing.join(', ')}`);
            const base64Pdf = (await readFile(filePath)).toString('base64');

            const pageInfo = await identifyDocumentPages(base64Pdf);
            // Only pull out segments that satisfy a missing kind — existing
            // documents must not be duplicated.
            const wanted = (pageInfo.documents || []).filter((d) => {
                const kind = docTypeToKind(d.type);
                return kind !== null && missing.includes(kind);
            });
            if (wanted.length === 0) {
                result.actionsPerformed.push(
                    `Split of ${candidate.fileName} found none of the missing documents (${missing.map((k) => KIND_LABELS[k]).join(', ')}).`,
                );
                continue;
            }

            const splitDocs = await splitPdf(base64Pdf, wanted);

            const uploadsDir = join(process.cwd(), 'storage', 'uploads', caseId);
            if (!existsSync(uploadsDir)) await mkdir(uploadsDir, { recursive: true });

            const timestamp = Date.now();
            for (const [index, doc] of splitDocs.entries()) {
                const docFileName = `${timestamp}-${index + 1}-${doc.type.toLowerCase()}.pdf`;
                const docFilePath = join(uploadsDir, docFileName);
                const docFileUrl = `/uploads/${caseId}/${docFileName}`;
                const docBuffer = Buffer.from(doc.base64Pdf, 'base64');
                await writeFile(docFilePath, docBuffer);

                const info = wanted.find((w) => w.type === doc.type);
                const created = await prisma.document.create({
                    data: {
                        caseId,
                        type: doc.type,
                        fileName: docFileName,
                        fileUrl: docFileUrl,
                        fileSize: docBuffer.length,
                        mimeType: 'application/pdf',
                        extractedData: JSON.stringify({
                            extractedFrom: candidate.id,
                            splitBy: 'DRR_READINESS',
                            confidence: info?.confidence,
                            description: info?.description,
                            pageCount: doc.pageCount,
                        }),
                    },
                });
                newDocs.push(created);
                const kind = docTypeToKind(doc.type);
                result.actionsPerformed.push(`Split ${kind ? KIND_LABELS[kind] : doc.type} out of ${candidate.fileName}.`);
            }
            // One successful split pass is enough.
            return { newDocs };
        } catch (err) {
            logger.error(`[DRR Readiness] Split of ${candidate.fileName} failed:`, err);
            result.errors.push(
                `AI split of ${candidate.fileName} failed: ${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }
    return { newDocs };
}

/**
 * Ask the case's Referrer (or the B2B partner project) to send us the
 * consumer's credit report. Respects a cooldown so repeat readiness runs
 * don't spam the partner.
 */
async function requestCreditReportFromReferrer(
    caseData: {
        id: string;
        fileNumber: string;
        client: { firstName: string; lastName: string; idNumber: string | null };
        referrer: { firstName: string; lastName: string; email: string | null } | null;
        projects: Array<{ project: { name: string; billingEmail: string | null } }>;
    },
    userId: string | undefined,
    result: DrrReadinessResult,
): Promise<void> {
    const caseId = caseData.id;

    // Cooldown: has a request already gone out recently?
    const since = new Date(Date.now() - CREDIT_REPORT_REQUEST_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
    const recent = await prisma.caseComment.findFirst({
        where: { caseId, activityType: 'DRR_CREDIT_REPORT_REQUESTED', createdAt: { gt: since } },
    });
    if (recent) {
        result.actionsPerformed.push(
            `Credit report already requested from the referrer/partner within the last ${CREDIT_REPORT_REQUEST_COOLDOWN_DAYS} days — not re-sent.`,
        );
        return;
    }

    const referrerEmail = caseData.referrer?.email?.trim() || null;
    const partnerProject = caseData.projects.map((cp) => cp.project).find((p) => p.billingEmail?.trim());
    const recipient = referrerEmail || partnerProject?.billingEmail?.trim() || null;
    const recipientName = referrerEmail
        ? `${caseData.referrer!.firstName} ${caseData.referrer!.lastName}`.trim()
        : partnerProject?.name || null;

    if (!recipient) {
        await addComment(
            caseId,
            userId,
            `[SYSTEM] DRR Readiness: The credit report is missing and could not be recovered from the combined document, ` +
            `and this case has no referrer or B2B partner email on file to request it from. ` +
            `Please obtain the consumer's credit report manually before running Manage Consumers.`,
            'DRR_CREDIT_REPORT_MISSING',
        );
        result.errors.push('Credit report missing and no referrer/B2B partner email on file to request it from.');
        return;
    }

    const clientName = `${caseData.client.firstName} ${caseData.client.lastName}`.trim();
    const idLine = caseData.client.idNumber ? `\n  ID Number:    ${caseData.client.idNumber}` : '';
    const subject = `Credit report needed — ${clientName} (File: ${caseData.fileNumber})`;
    const body = `Dear ${recipientName || 'Partner'},

We are busy processing the debt review removal for the consumer below, whom you referred to Zenowethu Debt Management. To proceed we need a copy of the consumer's credit report, which is not on the file you sent us.

  Consumer:     ${clientName}${idLine}
  File Number:  ${caseData.fileNumber}

Kindly reply to this email with the consumer's most recent credit report (PDF) at your earliest convenience — the file cannot move to the next step until it is received.

Thank you for your assistance.

Yours sincerely,

Zenowethu Debt Management
NCRDC3693
Suite 2, 2nd Floor, Central House, 17 Central Road, Mabopane, 0190
Tel: +27 81 747 7616 | Cell: 082 363 8207
notifications@zenowethu.co.za | www.zenowethu.co.za
Member of DCASA`;

    const sendResult = await sendManualMessage(caseId, 'EMAIL', recipient, body, subject);
    if (sendResult.emailSuccess) {
        result.creditReportRequestedFrom = recipient;
        result.actionsPerformed.push(`Credit report requested from ${recipientName || 'partner'} (${recipient}).`);
        await addComment(
            caseId,
            userId,
            `[SYSTEM] DRR Readiness: Credit report is missing — a request has been emailed to ` +
            `${recipientName || 'the partner'} (${recipient}). The file cannot proceed to Manage Consumers until it is received.`,
            'DRR_CREDIT_REPORT_REQUESTED',
        );
    } else {
        result.errors.push(`Credit report request email to ${recipient} FAILED: ${sendResult.errors.join(', ') || 'unknown'}`);
        await addComment(
            caseId,
            userId,
            `[SYSTEM] DRR Readiness: Credit report is missing and the request email to ${recipient} FAILED to send ` +
            `(${sendResult.errors.join(', ') || 'unknown'}). Please follow up with the referrer/partner manually.`,
            'DRR_CREDIT_REPORT_REQUEST_FAILED',
        );
    }
}

/** Open Credo DocumentRequests so the consumer is asked to upload what only they can supply. */
async function openConsumerDocumentRequests(
    caseId: string,
    clientId: string,
    kinds: Array<'PAYSLIP' | 'BANK_STATEMENT'>,
    userId: string | undefined,
    result: DrrReadinessResult,
): Promise<void> {
    const consumer = await prisma.consumerAccount.findUnique({
        where: { linkedClientId: clientId },
        select: { id: true },
    });
    if (!consumer) {
        result.actionsPerformed.push(
            `No Credo profile linked to this client — could not open upload requests for: ${kinds.map((k) => KIND_LABELS[k]).join(', ')}.`,
        );
        return;
    }

    const REQUEST_SPECS: Record<'PAYSLIP' | 'BANK_STATEMENT', { category: string; label: string }> = {
        PAYSLIP: { category: 'INCOME', label: 'Latest payslip' },
        BANK_STATEMENT: { category: 'INCOME', label: "Latest 3 months' bank statements" },
    };

    for (const kind of kinds) {
        const spec = REQUEST_SPECS[kind];
        const open = await prisma.documentRequest.findFirst({
            where: { consumerId: consumer.id, caseId, label: spec.label, status: 'REQUESTED' },
        });
        if (open) continue; // already asked — don't duplicate

        await prisma.documentRequest.create({
            data: {
                consumerId: consumer.id,
                caseId,
                category: spec.category,
                label: spec.label,
                notes: 'Needed to complete your debt review removal. Please upload it in your Crediva portal.',
                requestedById: userId ?? null,
            },
        });
        result.documentRequestsCreated.push(spec.label);
        result.actionsPerformed.push(`Crediva upload request opened for the consumer: ${spec.label}.`);
    }
}

/** Post the final readiness verdict to the case timeline. */
async function postReadinessComment(
    caseId: string,
    userId: string | undefined,
    result: DrrReadinessResult,
): Promise<void> {
    const checklist = REQUIRED_DOC_KINDS.map((k) => {
        const have = !result.missingAfter.includes(k);
        const recovered = result.recoveredBySplit.includes(k) ? ' (recovered from combined document)' : '';
        return `  ${have ? '✓' : '✗'} ${KIND_LABELS[k]}${recovered}`;
    }).join('\n');

    const lines: string[] = [
        `[SYSTEM] DRR Readiness check (post-consent):`,
        checklist,
    ];
    if (result.ready) {
        const optionalMissing = result.optionalMissingAfter.length > 0
            ? ` Optional documents not found: ${result.optionalMissingAfter.map((k) => KIND_LABELS[k]).join(', ')}.`
            : '';
        lines.push('', `Required credit report is on file.${optionalMissing} Continuing with DRR readiness.`);
    } else {
        lines.push('', `Still missing required document: ${result.requiredMissingAfter.map((k) => KIND_LABELS[k]).join(', ')}. The case cannot proceed to Manage Consumers yet - parked at Awaiting DRR Documents.`);
    }
    if (result.actionsPerformed.length) lines.push('', `Actions: ${result.actionsPerformed.join(' ')}`);
    if (result.errors.length) lines.push('', `Errors: ${result.errors.join(' | ')}`);

    await addComment(caseId, userId, lines.join('\n'), result.ready ? 'DRR_READY_FOR_MANAGE_CONSUMERS' : 'DRR_READINESS_INCOMPLETE');
}

async function addComment(
    caseId: string,
    userId: string | undefined,
    content: string,
    activityType?: string,
): Promise<void> {
    if (!userId) return;
    await prisma.caseComment
        .create({ data: { caseId, userId, content, ...(activityType ? { activityType } : {}) } })
        .catch((err) => logger.error(`[DRR Readiness] Failed to add comment for ${caseId}:`, err));
}
