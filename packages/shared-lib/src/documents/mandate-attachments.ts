/**
 * Mandate attachments — the consumer's signed Power of Attorney and ID copy.
 *
 * Operating rule (Sep 2026): every communication we send to a debt counsellor
 * ON BEHALF OF a consumer must carry that consumer's signed POA and ID copy.
 * The DC has no other proof that we are mandated to act on the file, so a
 * request without them is routinely ignored, refused, or answered with "send us
 * your authority first". The attachments are part of the message, not an
 * optional extra — every DC-facing send path resolves them through here.
 *
 * Which document counts:
 *   • Type codes cover both the staff upload surfaces (ID, POA, ZENOWETHU_POA)
 *     and the referrer self-service portal's more granular labels (ID_DOCUMENT,
 *     POWER_OF_ATTORNEY, CONSENT_FORM). Missing either set is how referral cases
 *     end up emailing a DC with no mandate attached.
 *   • A MISMATCH document is never attached. Ownership verification found a
 *     DIFFERENT consumer's ID inside the file, and emailing it to a third party
 *     is a POPIA disclosure. (Those normally live in QuarantinedDocument and
 *     never reach the Document table at all — this is the belt-and-braces.)
 *   • Otherwise the best available copy wins: VERIFIED ahead of NOT_CHECKED
 *     ahead of UNVERIFIED, staff-visible ahead of admin-only, newest first.
 *     UNVERIFIED is excluded from automation elsewhere, but here the rule is
 *     "always attach" — an unverified POA still evidences the mandate far better
 *     than sending nothing, and it is only reached when no better copy exists.
 *
 * `missing` is deliberately loud. A DC request that goes out with no POA costs a
 * week of turnaround, so callers surface it to staff rather than discarding it.
 */

import { prisma } from '@zenowethu/database';
import { createLogger } from '../logger';
import { appBaseUrl, contentTypeFor, readOwnUpload } from './upload-paths';

const logger = createLogger('documents/mandate-attachments');

/** Document.type codes that count as the consumer's identity document. */
export const MANDATE_ID_TYPES = ['ID', 'ID_DOCUMENT'];

/** Document.type codes that count as the consumer's signed mandate. */
export const MANDATE_POA_TYPES = ['POA', 'ZENOWETHU_POA', 'POWER_OF_ATTORNEY', 'CONSENT_FORM'];

/** The minimum a caller must supply per document. Extra fields sharpen ranking. */
export interface MandateDocument {
    type: string;
    fileName: string;
    fileUrl: string;
    uploadedAt?: Date | string | null;
    verificationStatus?: string | null;
    isAdminOnly?: boolean | null;
}

export type MandateKind = 'POA' | 'ID';

export interface MandateAttachments {
    /** Absolute URLs to attach, POA first then ID. Empty when the case has neither. */
    attachments: string[];
    poa: MandateDocument | null;
    id: MandateDocument | null;
    /** What the case could not supply — drives the staff warning. */
    missing: MandateKind[];
    /** True only when BOTH the signed POA and the ID copy are attached. */
    complete: boolean;
    /** One line for case comments and API responses. */
    summary: string;
}

/**
 * Base URL that document paths are resolved against. Document.fileUrl is stored
 * as a site-relative path ("/uploads/…"), and an email attachment needs an
 * absolute URL the sending provider can fetch.
 */
export function mandateBaseUrl(): string {
    return appBaseUrl();
}

function toAbsoluteUrl(fileUrl: string, baseUrl: string): string {
    if (/^https?:\/\//i.test(fileUrl)) return fileUrl;
    return `${baseUrl}${fileUrl.startsWith('/') ? '' : '/'}${fileUrl}`;
}

/** VERIFIED beats NOT_CHECKED beats UNVERIFIED. MISMATCH is filtered before ranking. */
function verificationRank(status: string | null | undefined): number {
    switch (status) {
        case 'VERIFIED':    return 0;
        case 'NOT_CHECKED': return 1;
        case 'UNVERIFIED':  return 2;
        default:            return 1;  // legacy rows predate the column
    }
}

function uploadedTime(doc: MandateDocument): number {
    if (!doc.uploadedAt) return 0;
    const t = new Date(doc.uploadedAt).getTime();
    return Number.isNaN(t) ? 0 : t;
}

/**
 * Pick the single best document of the given kind, or null when the case has none.
 */
export function pickMandateDocument(
    documents: MandateDocument[],
    types: string[]
): MandateDocument | null {
    const candidates = documents.filter(
        d => types.includes(d.type) && d.verificationStatus !== 'MISMATCH' && !!d.fileUrl
    );
    if (candidates.length === 0) return null;

    return [...candidates].sort((a, b) => {
        const byVerification = verificationRank(a.verificationStatus) - verificationRank(b.verificationStatus);
        if (byVerification !== 0) return byVerification;

        const byVisibility = Number(!!a.isAdminOnly) - Number(!!b.isAdminOnly);
        if (byVisibility !== 0) return byVisibility;

        return uploadedTime(b) - uploadedTime(a);
    })[0];
}

/**
 * Build the mandate attachment set from documents already loaded by the caller.
 * Pure — no database access — so a decline preview and the live send agree.
 */
export function buildMandateAttachments(
    documents: MandateDocument[],
    baseUrl: string = mandateBaseUrl()
): MandateAttachments {
    const base = baseUrl.replace(/\/$/, '');
    const poa = pickMandateDocument(documents, MANDATE_POA_TYPES);
    const id  = pickMandateDocument(documents, MANDATE_ID_TYPES);

    const attachments: string[] = [];
    if (poa) attachments.push(toAbsoluteUrl(poa.fileUrl, base));
    if (id)  attachments.push(toAbsoluteUrl(id.fileUrl, base));

    const missing: MandateKind[] = [];
    if (!poa) missing.push('POA');
    if (!id)  missing.push('ID');

    return {
        attachments,
        poa,
        id,
        missing,
        complete: missing.length === 0,
        summary: describeMandateAttachments(poa, id, missing),
    };
}

function describeMandateAttachments(
    poa: MandateDocument | null,
    id: MandateDocument | null,
    missing: MandateKind[]
): string {
    const attached = [poa ? 'signed POA' : null, id ? 'ID copy' : null].filter(Boolean);
    if (attached.length === 0) return 'No signed POA or ID copy on file — nothing attached';

    const attachedPart = `${attached.join(' + ')} attached`;
    if (missing.length === 0) return attachedPart;

    const missingPart = missing.map(m => (m === 'POA' ? 'signed POA' : 'ID copy')).join(' + ');
    return `${attachedPart}; ${missingPart} MISSING from the case`;
}

/**
 * How the attachments should be named in the body of an outbound email, or null
 * when there is nothing to claim. Keeps "please find attached…" honest when only
 * one of the two documents exists.
 */
export function mandateAttachedLabel(m: Pick<MandateAttachments, 'poa' | 'id'>): string | null {
    if (m.poa && m.id) return 'signed Power of Attorney and identity document';
    if (m.poa) return 'signed Power of Attorney';
    if (m.id) return 'identity document';
    return null;
}

/**
 * Insert the "proof of our authority" sentence ahead of an email's sign-off, or
 * append it when there is no recognisable sign-off. `label` is null when nothing
 * attached, in which case the body is returned untouched — an email must never
 * claim a document the recipient did not receive.
 */
export function withAuthorityLine(body: string, label: string | null): string {
    if (!label) return body;

    const sentence = `For your reference and as proof of our authority to act on the consumer's behalf, please find attached our client's ${label}.`;
    const signOff = /\n\n(Thank you,|Kind regards,|Yours sincerely,|Regards,)/;

    return signOff.test(body)
        ? body.replace(signOff, `\n\n${sentence}\n\n$1`)
        : `${body}\n\n${sentence}`;
}

/**
 * One line for the case timeline describing what the recipient actually got —
 * `attachmentErrors` comes back from the send when a file could not be fetched.
 */
export function describeMandateOutcome(
    m: MandateAttachments,
    attachmentErrors?: string[]
): string {
    if (!attachmentErrors?.length) return m.summary;
    return `${m.summary}. ⚠ NOT delivered: ${attachmentErrors.join('; ')}`;
}

/**
 * Load a case's documents and resolve its mandate attachments.
 * Never throws — a database failure returns an empty set with the reason in
 * `summary`, so a DC email carries a visible missing-mandate warning rather than
 * dying on an unhandled error.
 */
export async function resolveMandateAttachments(
    caseId: string,
    baseUrl: string = mandateBaseUrl()
): Promise<MandateAttachments> {
    try {
        const documents = await prisma.document.findMany({
            where: {
                caseId,
                type: { in: [...MANDATE_POA_TYPES, ...MANDATE_ID_TYPES] },
            },
            select: {
                type: true,
                fileName: true,
                fileUrl: true,
                uploadedAt: true,
                verificationStatus: true,
                isAdminOnly: true,
            },
        });
        return buildMandateAttachments(documents, baseUrl);
    } catch (error) {
        logger.error({ error, caseId }, '[Mandate] Could not load POA/ID documents for case');
        return {
            attachments: [],
            poa: null,
            id: null,
            missing: ['POA', 'ID'],
            complete: false,
            summary: 'POA/ID lookup failed — nothing attached',
        };
    }
}

export interface MandateFile {
    filename: string;
    content: Buffer;
    contentType: string;
}

export interface MandateFiles {
    files: MandateFile[];
    /** How the attached files should be named in the email body, or null when none. */
    label: string | null;
    /** One line for the case timeline / API response — honest about what is attached. */
    summary: string;
    missing: MandateKind[];
}

/**
 * The case's signed POA and ID copy as file bytes, for senders that attach
 * buffers rather than URLs (e.g. the DC fee invoice email). Files are read from
 * this app's uploads on disk. A document that is on the case but whose file
 * cannot be read counts as missing, so the email never claims it.
 */
export async function loadMandateFiles(caseId: string): Promise<MandateFiles> {
    const mandate = await resolveMandateAttachments(caseId);
    const files: MandateFile[] = [];
    const loaded: { poa: MandateDocument | null; id: MandateDocument | null } = { poa: null, id: null };

    for (const kind of ['poa', 'id'] as const) {
        const doc = mandate[kind];
        if (!doc) continue;
        const content = await readOwnUpload(doc.fileUrl).catch(() => null);
        if (!content) {
            logger.warn({ caseId, fileUrl: doc.fileUrl }, `[Mandate] ${kind.toUpperCase()} file could not be read from disk`);
            continue;
        }
        files.push({ filename: doc.fileName, content, contentType: contentTypeFor(doc.fileName) });
        loaded[kind] = doc;
    }

    const missing: MandateKind[] = [];
    if (!loaded.poa) missing.push('POA');
    if (!loaded.id) missing.push('ID');

    return {
        files,
        label: mandateAttachedLabel(loaded),
        summary: describeMandateAttachments(loaded.poa, loaded.id, missing),
        missing,
    };
}
