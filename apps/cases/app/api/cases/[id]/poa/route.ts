import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';
import { writeFile, mkdir } from 'fs/promises';
import { z } from 'zod';
import { prisma } from '@zenowethu/database';
import { auth, createLogger, renderBrandedEmail, touchCaseAction } from '@zenowethu/shared-lib';
import { generateStandardPoa, generateWesbankPoa } from '@zenowethu/shared-lib/src/poa/poa-generator';
import { createPoaSigningToken } from '@zenowethu/shared-lib/src/poa/signing-service';
import { sendEmailWithAttachments } from '@/lib/email-with-attachments';
import { GhlService } from '@zenowethu/shared-lib/src/integrations/ghl-service';

const logger = createLogger('api/cases/[id]/poa');

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------

const poaRequestSchema = z.object({
    /** Which POA template to generate. */
    type: z.enum(['STANDARD', 'WESBANK']),
    /**
     * What to do with the generated POA:
     *   SEND          — deliver to the client only (previous behaviour)
     *   SAVE          — generate and file it under case Documents only
     *   SEND_AND_SAVE — do both
     */
    mode: z.enum(['SEND', 'SAVE', 'SEND_AND_SAVE']).default('SEND'),
    /** Delivery channel — required unless mode is SAVE. */
    channel: z.enum(['EMAIL', 'WHATSAPP']).optional(),
    includeJointClient: z.coerce.boolean().optional().default(false),
}).superRefine((val, ctx) => {
    if (val.mode !== 'SAVE' && !val.channel) {
        ctx.addIssue({
            code: 'custom',
            path: ['channel'],
            message: 'Channel is required when sending. Must be EMAIL or WHATSAPP.',
        });
    }
});

interface SavedDocument {
    name:     string;
    fileName: string;
    fileUrl:  string;
}

interface DeliveryFailure {
    name:   string;
    reason: string;
}

/**
 * POST /api/cases/[id]/poa
 *
 * Body:
 * {
 *   type: 'STANDARD' | 'WESBANK'
 *   mode?: 'SEND' | 'SAVE' | 'SEND_AND_SAVE'   (default 'SEND')
 *   channel?: 'EMAIL' | 'WHATSAPP'             (required unless mode is 'SAVE')
 *   includeJointClient?: boolean
 * }
 *
 * - STANDARD: pre-fills all client details from the case record.
 * - WESBANK:  also requires the requesting staff member to have idNumber
 *             and address set in their profile. Returns 422 + missingFields
 *             if they do not.
 * - includeJointClient: if true and a joint client exists, they get their own
 *   personalised POA. When sending, they are only included if they have contact
 *   details for the chosen channel.
 *
 * Responds 502 when every recipient failed, so the UI never reports a send that
 * did not happen.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: caseId } = await params;
        const parsed = poaRequestSchema.safeParse(await request.json());

        if (!parsed.success) {
            return NextResponse.json({
                error: parsed.error.issues[0]?.message ?? 'Invalid request body.',
            }, { status: 400 });
        }

        const { type, mode, channel, includeJointClient } = parsed.data;
        const wantsSend = mode === 'SEND' || mode === 'SEND_AND_SAVE';
        const wantsSave = mode === 'SAVE' || mode === 'SEND_AND_SAVE';

        // ---------------------------------------------------------------
        // Fetch case + client
        // ---------------------------------------------------------------
        const caseRecord = await prisma.case.findUnique({
            where: { id: caseId },
            include: { client: true, jointClient: true },
        });

        if (!caseRecord) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        const { client } = caseRecord;

        // ---------------------------------------------------------------
        // Validate delivery address (only when we are actually sending)
        // ---------------------------------------------------------------
        if (wantsSend && channel === 'EMAIL' && !client.email) {
            return NextResponse.json({ error: 'Client has no email address on file. Please update the client record first, or save the POA to Documents instead.' }, { status: 422 });
        }
        if (wantsSend && channel === 'WHATSAPP' && !client.whatsappNumber && !client.phone) {
            return NextResponse.json({ error: 'Client has no WhatsApp/phone number on file. Please update the client record first, or save the POA to Documents instead.' }, { status: 422 });
        }

        // ---------------------------------------------------------------
        // WESBANK — validate staff profile
        // ---------------------------------------------------------------
        let staffUser: { firstName: string; lastName: string; phone: string | null; idNumber: string | null; address: string | null } | null = null;

        if (type === 'WESBANK') {
            staffUser = await prisma.user.findUnique({
                where: { id: session.user.id },
                select: { firstName: true, lastName: true, phone: true, idNumber: true, address: true },
            });

            const missing: string[] = [];
            if (!staffUser?.firstName || !staffUser?.lastName) missing.push('Full Name');
            if (!staffUser?.idNumber)  missing.push('ID Number');
            if (!staffUser?.address)   missing.push('Residential Address');
            if (!staffUser?.phone)     missing.push('Phone Number');

            if (missing.length > 0) {
                return NextResponse.json({
                    error: 'incomplete_staff_profile',
                    message: 'Your staff profile is incomplete. Please update your profile before sending a Wesbank POA.',
                    missingFields: missing,
                }, { status: 422 });
            }
        }

        // ---------------------------------------------------------------
        // DC details for section 4 — use whatever is already stored on the case.
        // If service is "Debt Review Flag Removal" and DC details are missing,
        // the UI blocks the send and directs staff to run DHS Auto-Fill first.
        // ---------------------------------------------------------------
        const dcName    = caseRecord.debtCounsellorName ?? '';
        const dcNcrdcNo = caseRecord.ncrdcNo ?? '';
        const dcPhone   = caseRecord.dcMobile ?? '';

        const clientFullName = `${client.firstName} ${client.lastName}`;
        const today = new Date().toLocaleDateString('en-ZA', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const cleanIdNumber = client.idNumber ? client.idNumber.replace(/\D/g, '') : '';

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'https://cases.zenowethu.co.za';

        // ---------------------------------------------------------------
        // Determine recipients
        // ---------------------------------------------------------------
        interface Recipient {
            name: string;
            email?: string;
            phone?: string;
            idNumber: string;
            clientObj: typeof client;
        }

        const recipients: Recipient[] = [{
            name: clientFullName,
            email: client.email ?? undefined,
            phone: client.whatsappNumber ?? client.phone ?? undefined,
            idNumber: cleanIdNumber,
            clientObj: client,
        }];

        if (includeJointClient && caseRecord.jointClient) {
            const jointClientEmail = caseRecord.jointClient.email ?? undefined;
            const jointClientPhone = caseRecord.jointClient.whatsappNumber ?? caseRecord.jointClient.phone ?? undefined;

            // When saving only, the joint client needs no contact details.
            const reachable = !wantsSend
                || (channel === 'EMAIL' && !!jointClientEmail)
                || (channel === 'WHATSAPP' && !!jointClientPhone);

            if (reachable) {
                recipients.push({
                    name: `${caseRecord.jointClient.firstName} ${caseRecord.jointClient.lastName}`,
                    email: jointClientEmail,
                    phone: jointClientPhone,
                    idNumber: caseRecord.jointClient.idNumber.replace(/\D/g, ''),
                    clientObj: caseRecord.jointClient,
                });
            }
        }

        /** Build the personalised POA PDF for one recipient. */
        const buildPoaFor = async (recipient: Recipient): Promise<Buffer> => {
            if (type === 'STANDARD') {
                return generateStandardPoa({
                    fullName:    recipient.name,
                    idNumber:    recipient.idNumber,
                    dateOfBirth: recipient.idNumber ? idToDateOfBirth(recipient.idNumber) : '',
                    address:     recipient.clientObj.address ?? '',
                    phone:       recipient.clientObj.phone ?? '',
                    email:       recipient.clientObj.email ?? '',
                    signedCity:  'Pretoria',
                    signedDate:  today,
                    dcName,
                    dcNcrdcNo,
                    dcPhone,
                });
            }
            return generateWesbankPoa({
                clientFullName: recipient.name,
                clientIdNumber: recipient.idNumber,
                clientAddress:  recipient.clientObj.address ?? '',
                agentFullName:  `${staffUser!.firstName} ${staffUser!.lastName}`,
                agentIdNumber:  staffUser!.idNumber!,
                agentAddress:   staffUser!.address!,
                signedAtCity:   'Pretoria',
                signedDate:     today,
            });
        };

        const sentTo:          string[]         = [];
        const skippedClients:  string[]         = [];
        const savedDocuments:  SavedDocument[]  = [];
        const failures:        DeliveryFailure[] = [];
        let primaryDownloadUrl: string | undefined;
        let primarySignUrl:     string | undefined;

        // ---------------------------------------------------------------
        // Generate → optionally save → optionally send, per recipient
        // ---------------------------------------------------------------
        for (const recipient of recipients) {
            const isJoint  = recipient.clientObj.id !== client.id;
            const filePrefix = type === 'WESBANK' ? 'ZDM_Wesbank_POA' : 'ZDM_POA';
            const fileName = `${filePrefix}_${recipient.idNumber || 'client'}_${Date.now()}.pdf`;

            let pdfBuffer: Buffer;
            try {
                pdfBuffer = await buildPoaFor(recipient);
            } catch (genErr) {
                logger.error('[POA] PDF generation failed', { recipient: recipient.name, error: genErr });
                failures.push({ name: recipient.name, reason: 'The POA document could not be generated.' });
                continue;
            }

            // ── Save to case Documents ──────────────────────────────────
            if (wantsSave) {
                try {
                    const saved = await savePoaToCaseDocuments({
                        caseId,
                        fileName,
                        pdfBuffer,
                        uploadedById: session.user.id,
                    });
                    savedDocuments.push({ name: recipient.name, fileName: saved.fileName, fileUrl: saved.fileUrl });
                    await logActivity(caseId, session.user.id, type, 'SAVED', saved.fileName, isJoint);
                } catch (saveErr) {
                    logger.error('[POA] Save to case documents failed', { recipient: recipient.name, error: saveErr });
                    failures.push({ name: recipient.name, reason: 'Could not save the POA to case Documents.' });
                }
            }

            if (!wantsSend || !channel) continue;

            // ── Signing link + downloadable copy ────────────────────────
            const signingToken = await createPoaSigningToken({
                poaType:  type,
                channel,
                caseId,
                clientId: recipient.clientObj.id,
            });
            const signUrl = `${baseUrl}/sign/poa/${signingToken}`;

            const tmpDir = '/tmp/poa';
            await mkdir(tmpDir, { recursive: true });
            await writeFile(join(tmpDir, fileName), pdfBuffer);
            const downloadUrl = `${baseUrl}/api/poa/download/${fileName}`;

            if (!isJoint) {
                primaryDownloadUrl = downloadUrl;
                primarySignUrl     = signUrl;
            }

            // ── Deliver ─────────────────────────────────────────────────
            if (channel === 'EMAIL') {
                if (!recipient.email) {
                    skippedClients.push(recipient.name);
                    continue;
                }

                const emailResult = await sendEmailWithAttachments({
                    to: recipient.email,
                    fromName: session.user.name || undefined,
                    subject: type === 'WESBANK'
                        ? `Wesbank Power of Attorney — Please Sign Online | ${recipient.name}`
                        : `Power of Attorney — Sign Online | Zenowethu Debt Management`,
                    html: buildEmailHtml(recipient.name, type, downloadUrl, signUrl),
                    attachments: [{
                        filename:    fileName,
                        content:     pdfBuffer,
                        contentType: 'application/pdf',
                    }],
                });

                if (!emailResult.success) {
                    logger.error('[POA] Email send failed for recipient', { recipient: recipient.name, error: emailResult.error });
                    failures.push({
                        name: recipient.name,
                        reason: emailResult.error
                            ? `Email delivery failed: ${emailResult.error}`
                            : 'Email delivery failed.',
                    });
                    continue;
                }

                sentTo.push(recipient.name);
                await logActivity(caseId, session.user.id, type, 'EMAIL', recipient.email, isJoint);
            } else {
                if (!recipient.phone) {
                    skippedClients.push(recipient.name);
                    continue;
                }

                const waMessage = buildWhatsAppMessage(recipient.name, downloadUrl, signUrl, type);

                try {
                    await GhlService.sendMessage(caseId, 'WHATSAPP', waMessage);
                    sentTo.push(recipient.name);
                } catch (ghlErr) {
                    // Try SMS fallback if WhatsApp fails
                    logger.warn('[POA] WhatsApp send failed for recipient, attempting SMS', { recipient: recipient.name, error: ghlErr });
                    try {
                        await GhlService.sendMessage(caseId, 'SMS', waMessage);
                        sentTo.push(recipient.name);
                    } catch (smsErr) {
                        logger.error('[POA] SMS fallback also failed for recipient', { recipient: recipient.name, error: smsErr });
                        failures.push({
                            name: recipient.name,
                            reason: smsErr instanceof Error
                                ? `WhatsApp and SMS delivery failed: ${smsErr.message}`
                                : 'WhatsApp and SMS delivery failed.',
                        });
                        continue;
                    }
                }

                await logActivity(caseId, session.user.id, type, 'WHATSAPP', recipient.phone, isJoint);
            }
        }

        if (savedDocuments.length > 0) {
            await touchCaseAction(caseId, 'DOCUMENT_UPLOAD', { userId: session.user.id }).catch(() => null);
        }

        const succeeded = sentTo.length > 0 || savedDocuments.length > 0;

        // Nothing worked — say so instead of letting the UI report a false success.
        if (!succeeded) {
            const reason = failures[0]?.reason
                ?? (skippedClients.length > 0
                    ? 'No contact details on file for the selected channel.'
                    : 'The POA could not be delivered.');

            return NextResponse.json({
                success: false,
                error: reason,
                mode,
                channel,
                failures,
                skippedClients: skippedClients.length > 0 ? skippedClients : undefined,
            }, { status: 502 });
        }

        return NextResponse.json({
            success: true,
            mode,
            channel,
            downloadUrl: primaryDownloadUrl,
            signUrl:     primarySignUrl,
            sentTo:          sentTo.length > 0 ? sentTo : undefined,
            savedDocuments:  savedDocuments.length > 0 ? savedDocuments : undefined,
            skippedClients:  skippedClients.length > 0 ? skippedClients : undefined,
            failures:        failures.length > 0 ? failures : undefined,
        });

    } catch (error) {
        logger.error('[POA] Unexpected error', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Write a generated POA into the case document vault, matching the layout used
 * by the manual upload route so `/uploads/...` serves it unchanged.
 */
async function savePoaToCaseDocuments(opts: {
    caseId:       string;
    fileName:     string;
    pdfBuffer:    Buffer;
    uploadedById: string;
}): Promise<{ fileName: string; fileUrl: string }> {
    const { caseId, pdfBuffer, uploadedById } = opts;

    const uploadsDir    = join(process.cwd(), 'storage', 'uploads', caseId);
    await mkdir(uploadsDir, { recursive: true });

    const safeFileName  = opts.fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storedName    = `${Date.now()}-${safeFileName}`;
    await writeFile(join(uploadsDir, storedName), pdfBuffer);

    const fileUrl = `/uploads/${caseId}/${storedName}`;

    await prisma.document.create({
        data: {
            caseId,
            type:        'ZENOWETHU_POA',
            fileName:    opts.fileName,
            fileUrl,
            fileSize:    pdfBuffer.length,
            mimeType:    'application/pdf',
            uploadedById,
            isAdminOnly: false,
        },
    });

    return { fileName: opts.fileName, fileUrl };
}

/** Extract DD/MM/YYYY date of birth from a 13-digit SA ID number */
function idToDateOfBirth(idNumber: string): string {
    if (idNumber.length < 6) return '';
    const yy = idNumber.substring(0, 2);
    const mm = idNumber.substring(2, 4);
    const dd = idNumber.substring(4, 6);
    const year = parseInt(yy) > 30 ? `19${yy}` : `20${yy}`;
    return `${dd}/${mm}/${year}`;
}

async function logActivity(caseId: string, userId: string, type: string, channel: string, recipient: string, isJointClient?: boolean) {
    const label = type === 'WESBANK' ? 'Wesbank POA' : 'Standard POA';
    const clientNote = isJointClient ? ' (joint client)' : '';
    const content = channel === 'SAVED'
        ? `Generated ${label} for client${clientNote} and saved it to case documents (${recipient}).`
        : `Sent ${label} to client${clientNote} via ${channel} (${recipient}) for signature.`;

    await prisma.caseComment.create({
        data: {
            caseId,
            userId,
            content,
            type: 'SYSTEM',
            isInternal: true,
        },
    });
}

function buildEmailHtml(clientName: string, type: string, downloadUrl: string, signUrl: string): string {
    const docLabel = type === 'WESBANK' ? 'Wesbank Power of Attorney' : 'Power of Attorney';

    const content = `
        <p>Dear <strong>${clientName}</strong>,</p>
        <p>Your personalised <strong>${docLabel}</strong> from Zenowethu Debt Management is ready and waiting for your signature.</p>

        <div style="background-color: #e8f5e9; border-left: 4px solid #2e7d32; padding: 20px; border-radius: 4px; margin: 25px 0;">
            <strong style="color: #1b5e20; display: block; margin-bottom: 10px;">✅ Easiest option — Sign Online (recommended):</strong>
            <p style="margin: 0 0 12px; color: #1b5e20;">Click the button below to sign directly in your browser — no printing or scanning required. Takes less than 1 minute.</p>
            <a href="${signUrl}" style="display: inline-block; background-color: #0d3870; color: white; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 15px;">Sign Online Now →</a>
            <p style="margin: 10px 0 0; font-size: 12px; color: #388e3c;">This link is valid for 72 hours and can only be used once.</p>
        </div>

        <div style="background-color: #f0f6ff; border-left: 4px solid #0d3870; padding: 20px; border-radius: 4px; margin: 25px 0;">
            <strong style="color: #0d3870; display: block; margin-bottom: 10px;">Alternative — Sign manually:</strong>
            <ol style="margin: 0; padding-left: 20px;">
                <li style="margin-bottom: 8px;">Download and open the attached PDF.</li>
                <li style="margin-bottom: 8px;">Print it or use a PDF signing app (like Adobe Fill &amp; Sign).</li>
                <li style="margin-bottom: 8px;">Sign where indicated and fill in the date.</li>
                <li style="margin-bottom: 0;">Scan or photograph the signed document and send it back to us at <a href="mailto:notifications@zenowethu.co.za" style="color: #d9701a; text-decoration: none; font-weight: bold;">notifications@zenowethu.co.za</a>.</li>
            </ol>
        </div>

        <p style="font-size: 12px; color: #888;">Your digital signature is legally binding under the Electronic Communications and Transactions Act (ECTA, Act 25 of 2002). Your IP address and timestamp will be recorded.</p>
        <p>Questions? Call us at <strong>081 747 7616</strong> or reply to this email.</p>
        <p>Kind regards,<br/><strong>Zenowethu Debt Management Team</strong></p>
    `;

    return renderBrandedEmail(content, {
        title: `${docLabel} — Sign Online`,
        previewText: `Your personalised ${docLabel} is ready — sign it online in under 1 minute.`,
        button: {
            text: `Sign Online Now`,
            url:  signUrl,
        },
    });
}

function buildWhatsAppMessage(clientName: string, downloadUrl: string, signUrl: string, type: string): string {
    const docLabel = type === 'WESBANK' ? 'Wesbank Power of Attorney' : 'Power of Attorney';
    const firstName = clientName.split(' ')[0];
    return `Hello ${firstName},

Zenowethu Debt Management has sent you a *${docLabel}* — ready for your signature. 📝

✅ *Sign Online (easiest — takes 1 min):*
${signUrl}

Just tap the link, draw your signature, and submit. Done! No printing needed.

_Link valid for 72 hours._

📄 *Or download the PDF manually:*
${downloadUrl}

Questions? Call us: *081 747 7616*

_Your signature is legally valid under the Electronic Communications and Transactions Act (ECTA)._

— Zenowethu Debt Management`;
}
