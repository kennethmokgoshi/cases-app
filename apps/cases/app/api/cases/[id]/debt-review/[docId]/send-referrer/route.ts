import { NextResponse } from 'next/server';
import { auth, createLogger, renderBrandedEmail } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { sendEmailWithAttachments } from '@/lib/email-with-attachments';

const logger = createLogger('api/cases/[id]/debt-review/[docId]/send-referrer');

type RouteContext = { params: Promise<{ id: string; docId: string }> };

const DOC_LABELS: Record<string, string> = {
    CERTIFIED_FORM_19: 'Clearance Certificate (Form 19)',
    FORM_17_W:         'Notice of Withdrawal from Debt Review (Form 17.W)',
    FORM_16:           'Form 16 — Application for Debt Review',
    FORM_17_1:         'Form 17.1 — Notification to Credit Providers',
};

// POST /api/cases/[id]/debt-review/[docId]/send-referrer
// Emails the generated clearance or NCA document PDF to the case's registered Referrer.
export async function POST(_req: Request, { params }: RouteContext) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: caseId, docId } = await params;

        const doc = await prisma.debtReviewDocument.findFirst({
            where: { id: docId, caseId },
        });

        if (!doc) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 });
        }

        if (!doc.fileUrl) {
            return NextResponse.json(
                { error: 'Document has not been generated yet' },
                { status: 422 }
            );
        }

        const caseRecord = await prisma.case.findUnique({
            where: { id: caseId },
            select: {
                fileNumber: true,
                client: { select: { firstName: true, lastName: true } },
                referrer: { select: { id: true, firstName: true, lastName: true, email: true } },
            },
        });

        if (!caseRecord) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        const referrer = caseRecord.referrer;
        if (!referrer || !referrer.email) {
            return NextResponse.json(
                { error: 'No registered referrer with an email address is linked to this case' },
                { status: 422 }
            );
        }

        // Read PDF from disk
        const filePath = path.join(process.cwd(), 'public', doc.fileUrl);
        if (!existsSync(filePath)) {
            return NextResponse.json(
                { error: 'PDF file not found on server — please regenerate the document' },
                { status: 422 }
            );
        }

        const pdfBuffer = await readFile(filePath);
        const fileName  = path.basename(filePath);
        const docLabel  = DOC_LABELS[doc.documentType] ?? doc.documentType;
        const clientFullName = `${caseRecord.client.firstName} ${caseRecord.client.lastName}`;
        const referrerFullName = `${referrer.firstName} ${referrer.lastName}`;

        const htmlContent = `
            <p>Dear ${referrerFullName},</p>
            <p>Please find attached the <strong>${docLabel}</strong> for your referred client <strong>${clientFullName}</strong> (File No: ${caseRecord.fileNumber}).</p>
            <p>Thank you for partnering with Zenowethu Debt Counselling.</p>
            <p>Kind regards,<br/><strong>Zenowethu Debt Counselling Team</strong></p>
        `.trim();

        const html = renderBrandedEmail(htmlContent, {
            title: docLabel,
            previewText: `Document attached: ${docLabel} for client ${clientFullName} (File No. ${caseRecord.fileNumber})`
        });

        const result = await sendEmailWithAttachments({
            to:      referrer.email,
            subject: `[Referral Update] ${docLabel} — Client: ${clientFullName} (File No. ${caseRecord.fileNumber})`,
            html,
            attachments: [{ filename: fileName, content: pdfBuffer, contentType: 'application/pdf' }],
        });

        if (!result.success) {
            logger.error(`Failed to send referrer email for doc ${docId}:`, result.error);
            return NextResponse.json({ error: `Email delivery failed: ${result.error}` }, { status: 502 });
        }

        logger.info(
            `Document ${docId} (${doc.documentType}) sent to referrer ${referrer.email} ` +
            `for case ${caseId} by user ${(session.user as { id: string }).id}`
        );

        return NextResponse.json({
            success:    true,
            sentTo:     referrer.email,
            referrerName: referrerFullName,
            messageId:  result.messageId,
        });
    } catch (error) {
        logger.error('Error sending document to referrer:', error);
        return NextResponse.json({ error: 'Failed to send document to referrer' }, { status: 500 });
    }
}
