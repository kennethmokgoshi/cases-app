/**
 * Staff-initiated requests to a debt counsellor ("DC: Request File" and
 * "DC: Request Invoice").
 *
 * This used to live inline in each app's /api/cases/[id]/dc-notification route.
 * Five copies drifted: only the Cases copy had Zod validation, the hardened DC
 * email picker, and the client CC — and none of them attached anything. Since
 * every one of these emails is sent ON BEHALF OF the consumer, all five must
 * carry the signed POA and ID copy (see documents/mandate-attachments), so the
 * logic lives here once and the routes are thin.
 *
 * A missing POA or ID does not block the send — the DC still needs the request,
 * and stalling it silently is worse. Instead the gap is returned to the caller,
 * written into the case comment, and surfaced to staff so it can be chased.
 */

import { prisma } from '@zenowethu/database';
import { createLogger } from '../logger';
import { sendStatusChangeNotification } from '../notifications/service';
import { getAutomationUserId } from '../automation/automation-user';
import {
    resolveMandateAttachments,
    mandateAttachedLabel,
    type MandateAttachments,
    type MandateKind,
} from '../documents/mandate-attachments';

const logger = createLogger('dc/dc-request-notification');

export type DcRequestType = 'FILE_REQUEST' | 'INVOICE_REQUEST';

export type DcRequestFailure = 'CASE_NOT_FOUND' | 'NO_DC_EMAIL' | 'SEND_FAILED';

export interface DcRequestResult {
    ok: boolean;
    /** Set when ok is false — lets the route pick the right HTTP status. */
    failure?: DcRequestFailure;
    error?: string;
    dcEmail: string | null;
    /** Consumer addresses copied on the DC email. */
    ccEmails: string[];
    /** What was attached, and what the case could not supply. */
    mandateSummary: string;
    missingMandate: MandateKind[];
}

interface DcEmailSource {
    preferredDcEmail?: string | null;
    lastKnownEmail?: string | null;
    dcEmail?: string | null;
    debtCounsellor?: {
        preferredEmail?: string | null;
        lastKnownEmail?: string | null;
        email?: string | null;
    } | null;
}

/**
 * Preferred DC address first, then the last address we actually reached, then
 * the legacy per-case and per-DC fields.
 */
export function pickDebtCounsellorEmail(currentCase: DcEmailSource): string | null {
    return (
        currentCase.preferredDcEmail?.trim() ||
        currentCase.debtCounsellor?.preferredEmail?.trim() ||
        currentCase.lastKnownEmail?.trim() ||
        currentCase.debtCounsellor?.lastKnownEmail?.trim() ||
        currentCase.dcEmail?.trim() ||
        currentCase.debtCounsellor?.email?.trim() ||
        null
    );
}

const STATUS_CODE_BY_TYPE: Record<DcRequestType, string> = {
    FILE_REQUEST:    'REQUEST_FILE_DC',
    INVOICE_REQUEST: 'REQUEST_INVOICE_DC',
};

/**
 * Send a file or invoice request to the case's debt counsellor, with the
 * consumer's signed POA and ID attached, and record it on the case timeline.
 */
export async function sendDcRequestNotification(params: {
    caseId: string;
    type: DcRequestType;
    /** Staff member who clicked the button — attributed on the case comment. */
    actorUserId?: string | null;
}): Promise<DcRequestResult> {
    const { caseId, type, actorUserId } = params;

    const empty = { dcEmail: null, ccEmails: [], mandateSummary: '', missingMandate: [] as MandateKind[] };

    const currentCase = await prisma.case.findUnique({
        where: { id: caseId },
        include: { client: true, debtCounsellor: true },
    });

    if (!currentCase) {
        return { ok: false, failure: 'CASE_NOT_FOUND', error: 'Case not found', ...empty };
    }

    const dcEmail = pickDebtCounsellorEmail(currentCase);
    if (!dcEmail) {
        return { ok: false, failure: 'NO_DC_EMAIL', error: 'Debt counsellor email not found', ...empty };
    }

    // Acting on the consumer's behalf — the mandate travels with the request.
    const mandate: MandateAttachments = await resolveMandateAttachments(caseId);
    if (!mandate.complete) {
        logger.warn(
            { caseId, type, missing: mandate.missing },
            `[DC Request] Sending ${type} without a complete mandate: ${mandate.summary}`
        );
    }

    // Existing behaviour, preserved deliberately: the consumer is copied on a
    // file request but not on an invoice request. (The automated DHS-decline
    // invoice request in dhs/decline-handler DOES copy them and says so in the
    // body — worth aligning, but that is an operations decision, not a refactor.)
    const ccEmails =
        type === 'FILE_REQUEST' && currentCase.client.email ? [currentCase.client.email] : [];

    const result = await sendStatusChangeNotification({
        caseId,
        clientName: `${currentCase.client.firstName} ${currentCase.client.lastName}`,
        fileNumber: currentCase.fileNumber,
        statusCode: STATUS_CODE_BY_TYPE[type],
        dcName: currentCase.debtCounsellorName || 'Debt Counsellor',
        dcEmail,
        clientEmail: currentCase.client.email,
        dcCcEmails: ccEmails,
        attachments: mandate.attachments,
        attachmentsLabel: mandateAttachedLabel(mandate),
        idNumber: currentCase.client.idNumber,
        isB2B: currentCase.acquisitionType === 'B2B',
    });

    if (!result.emailSuccess) {
        return {
            ok: false,
            failure: 'SEND_FAILED',
            error: result.errors.join(', ') || 'Email provider reported a failure',
            dcEmail,
            ccEmails,
            mandateSummary: mandate.summary,
            missingMandate: mandate.missing,
        };
    }

    const label = type === 'FILE_REQUEST' ? 'file request' : 'invoice request';
    const ccNote = ccEmails.length ? `, consumer CC'd (${ccEmails[0]})` : '';
    // An attachment the provider could not fetch must not be reported as sent —
    // the case comment is the audit trail for what the DC actually received.
    const attachmentNote = result.attachmentErrors?.length
        ? `. ⚠ Attachment delivery failed: ${result.attachmentErrors.join('; ')}`
        : '';

    // CaseComment.userId is required — an unattended send is attributed to the
    // system automation user, the same way the DHS decline handler does it.
    const commentUserId = actorUserId ?? (await getAutomationUserId().catch(() => null));
    const commentContent = `Sent ${label} to DC (${dcEmail})${ccNote}. ${mandate.summary}${attachmentNote}`;

    if (commentUserId) {
        // The email is already out; losing the comment must not fail the request.
        await prisma.caseComment.create({
            data: {
                caseId,
                userId: commentUserId,
                content: commentContent,
                type: 'SYSTEM',
                isInternal: true,
            },
        }).catch(error => {
            logger.error({ error, caseId }, '[DC Request] Could not record case comment');
        });
    } else {
        logger.warn({ caseId }, `[DC Request] No user to attribute the case comment to: ${commentContent}`);
    }

    return {
        ok: true,
        dcEmail,
        ccEmails,
        mandateSummary: mandate.summary,
        missingMandate: mandate.missing,
    };
}
