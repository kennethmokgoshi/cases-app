import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';
import { writeFile, mkdir } from 'fs/promises';
import { prisma } from '@zenowethu/database';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { generateStandardPoa, generateWesbankPoa } from '@zenowethu/shared-lib/src/poa/poa-generator';
import { sendEmailWithAttachments } from '@/lib/email-with-attachments';
import { GhlService } from '@zenowethu/shared-lib/src/integrations/ghl-service';

const logger = createLogger('api/cases/[id]/poa');

/**
 * POST /api/cases/[id]/poa
 *
 * Body:
 * {
 *   type: 'STANDARD' | 'WESBANK'
 *   channel: 'EMAIL' | 'WHATSAPP'
 * }
 *
 * - STANDARD: pre-fills all client details from the case record.
 * - WESBANK:  also requires the requesting staff member to have idNumber
 *             and address set in their profile. Returns 422 + missingFields
 *             if they do not.
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
        const { type, channel } = await request.json() as { type: string; channel: string };

        if (!['STANDARD', 'WESBANK'].includes(type)) {
            return NextResponse.json({ error: 'Invalid POA type. Must be STANDARD or WESBANK.' }, { status: 400 });
        }
        if (!['EMAIL', 'WHATSAPP'].includes(channel)) {
            return NextResponse.json({ error: 'Invalid channel. Must be EMAIL or WHATSAPP.' }, { status: 400 });
        }

        // ---------------------------------------------------------------
        // Fetch case + client
        // ---------------------------------------------------------------
        const caseRecord = await prisma.case.findUnique({
            where: { id: caseId },
            include: { client: true },
        });

        if (!caseRecord) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        const { client } = caseRecord;

        // ---------------------------------------------------------------
        // Validate delivery address
        // ---------------------------------------------------------------
        if (channel === 'EMAIL' && !client.email) {
            return NextResponse.json({ error: 'Client has no email address on file. Please update the client record first.' }, { status: 422 });
        }
        if (channel === 'WHATSAPP' && !client.whatsappNumber && !client.phone) {
            return NextResponse.json({ error: 'Client has no WhatsApp/phone number on file. Please update the client record first.' }, { status: 422 });
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

        // ---------------------------------------------------------------
        // Generate PDF
        // ---------------------------------------------------------------
        const clientFullName = `${client.firstName} ${client.lastName}`;
        const today = new Date().toLocaleDateString('en-ZA', { day: '2-digit', month: '2-digit', year: 'numeric' });

        let pdfBuffer: Buffer;
        let fileName: string;

        if (type === 'STANDARD') {
            pdfBuffer = await generateStandardPoa({
                fullName:    clientFullName,
                idNumber:    client.idNumber ?? '',
                dateOfBirth: client.idNumber ? idToDateOfBirth(client.idNumber) : '',
                address:     client.address ?? '',
                phone:       client.phone ?? '',
                email:       client.email ?? '',
                signedCity:  'Pretoria',
                signedDate:  today,
                dcName,
                dcNcrdcNo,
                dcPhone,
            });
            fileName = `ZDM_POA_${client.idNumber}_${Date.now()}.pdf`;
        } else {
            pdfBuffer = await generateWesbankPoa({
                clientFullName: clientFullName,
                clientIdNumber: client.idNumber ?? '',
                clientAddress:  client.address ?? '',
                agentFullName:  `${staffUser!.firstName} ${staffUser!.lastName}`,
                agentIdNumber:  staffUser!.idNumber!,
                agentAddress:   staffUser!.address!,
                signedAtCity:   'Pretoria',
                signedDate:     today,
            });
            fileName = `ZDM_Wesbank_POA_${client.idNumber}_${Date.now()}.pdf`;
        }

        // ---------------------------------------------------------------
        // Save PDF for download link (Fallback for GHL / WhatsApp)
        // ---------------------------------------------------------------
        const uploadDir = '/tmp/poa';
        await mkdir(uploadDir, { recursive: true });
        await writeFile(join(uploadDir, fileName), pdfBuffer);

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'https://cases.zenowethu.co.za';
        const downloadUrl = `${baseUrl}/api/poa/download/${fileName}`;

        // ---------------------------------------------------------------
        // Send PDF
        // ---------------------------------------------------------------
        if (channel === 'EMAIL') {
            const emailResult = await sendEmailWithAttachments({
                to: client.email!,
                fromName:    session.user.name || undefined,
                fromEmail:   session.user.email || undefined,
                subject: type === 'WESBANK'
                    ? `Wesbank Power of Attorney — Please Sign and Return | ${clientFullName}`
                    : `Power of Attorney — Please Sign and Return | Zenowethu Debt Management`,
                html: buildEmailHtml(clientFullName, type, downloadUrl),
                attachments: [{
                    filename:    fileName,
                    content:     pdfBuffer,
                    contentType: 'application/pdf',
                }],
            });

            if (!emailResult.success) {
                logger.error('[POA] Email send failed', emailResult.error);
                return NextResponse.json({ error: 'Failed to send email: ' + emailResult.error }, { status: 500 });
            }

            await logActivity(caseId, session.user.id, type, 'EMAIL', client.email!);
            return NextResponse.json({ success: true, channel: 'EMAIL', messageId: emailResult.messageId, downloadUrl });
        }

        const waMessage = buildWhatsAppMessage(clientFullName, downloadUrl, type);

        try {
            await GhlService.sendMessage(caseId, 'WHATSAPP', waMessage);
        } catch (ghlErr) {
            // Try SMS fallback if WhatsApp fails
            logger.warn('[POA] WhatsApp send failed, attempting SMS', ghlErr);
            await GhlService.sendMessage(caseId, 'SMS', waMessage);
        }

        await logActivity(caseId, session.user.id, type, 'WHATSAPP', client.whatsappNumber ?? client.phone ?? '');
        return NextResponse.json({ success: true, channel: 'WHATSAPP', downloadUrl });

    } catch (error) {
        logger.error('[POA] Unexpected error', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract DD/MM/YYYY date of birth from a 13-digit SA ID number */
function idToDateOfBirth(idNumber: string): string {
    if (idNumber.length < 6) return '';
    const yy = idNumber.substring(0, 2);
    const mm = idNumber.substring(2, 4);
    const dd = idNumber.substring(4, 6);
    const year = parseInt(yy) > 30 ? `19${yy}` : `20${yy}`;
    return `${dd}/${mm}/${year}`;
}

async function logActivity(caseId: string, userId: string, type: string, channel: string, recipient: string) {
    const label = type === 'WESBANK' ? 'Wesbank POA' : 'Standard POA';
    await prisma.caseComment.create({
        data: {
            caseId,
            userId,
            content: `Sent ${label} to client via ${channel} (${recipient}) for signature.`,
            type: 'SYSTEM',
            isInternal: true,
        },
    });
}

function buildEmailHtml(clientName: string, type: string, downloadUrl: string): string {
    const docLabel = type === 'WESBANK' ? 'Wesbank Power of Attorney' : 'Power of Attorney';
    return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: Arial, sans-serif; color: #222; background: #f5f5f5; margin: 0; padding: 20px; }
  .container { background: #fff; max-width: 600px; margin: auto; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.1); }
  .header { background: #003d6b; color: #fff; padding: 28px 32px; }
  .header h1 { margin: 0; font-size: 22px; }
  .header p { margin: 4px 0 0; font-size: 13px; opacity: .8; }
  .body { padding: 28px 32px; }
  .body p { line-height: 1.6; font-size: 14px; }
  .steps { background: #f0f6ff; border-left: 4px solid #003d6b; padding: 16px 20px; border-radius: 4px; margin: 16px 0; }
  .steps ol { margin: 8px 0; padding-left: 20px; }
  .steps li { margin-bottom: 6px; font-size: 13px; }
  .cta-button { display: inline-block; background: #003d6b; color: #ffffff !important; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; margin: 16px 0; font-size: 14px; }
  .footer { background: #f0f0f0; padding: 16px 32px; font-size: 11px; color: #888; text-align: center; }
</style></head>
<body>
<div class="container">
  <div class="header">
    <h1>Zenowethu Debt Management</h1>
    <p>NCRDC3693 | DCASA 0863 | 012 035 1824</p>
  </div>
  <div class="body">
    <p>Dear <strong>${clientName}</strong>,</p>
    <p>Please find attached your personalised <strong>${docLabel}</strong> from Zenowethu Debt Management.</p>
    
    <div style="text-align: center;">
      <a href="${downloadUrl}" class="cta-button">Download ${docLabel} (PDF)</a>
    </div>

    <div class="steps">
      <strong>What you need to do:</strong>
      <ol>
        <li>Download and open the PDF.</li>
        <li>Print it or use a PDF signing app.</li>
        <li>Sign where indicated and fill in the date.</li>
        <li>Scan or photograph the signed document and send it back to us at <a href="mailto:info@zenowethu.co.za">info@zenowethu.co.za</a>.</li>
      </ol>
    </div>
    <p>If you have any questions, please contact us at <strong>012 035 1824</strong> or reply to this email.</p>
    <p>Kind regards,<br><strong>Zenowethu Debt Management Team</strong></p>
  </div>
  <div class="footer">
    Suite 2, Second Floor, Central House, 17 Central Road, Mabopane, 0199<br>
    012 035 1824 | www.zenowethu.co.za | info@zenowethu.co.za
  </div>
</div>
</body>
</html>`;
}

function buildWhatsAppMessage(clientName: string, downloadUrl: string, type: string): string {
    const docLabel = type === 'WESBANK' ? 'Wesbank Power of Attorney' : 'Power of Attorney';
    return `Hello ${clientName.split(' ')[0]},

Zenowethu Debt Management has sent you a personalised *${docLabel}* document.

📄 Download & sign here:
${downloadUrl}

*Steps:*
1. Open the link and download the PDF.
2. Sign where indicated and fill in today's date.
3. Send the signed copy back to us on WhatsApp or email info@zenowethu.co.za

Questions? Call us: 012 035 1824

— Zenowethu Debt Management`;
}
