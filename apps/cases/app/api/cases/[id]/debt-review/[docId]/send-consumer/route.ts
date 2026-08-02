import { NextResponse } from 'next/server';
import { auth, createLogger, renderBrandedEmail } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { sendEmailWithAttachments } from '@/lib/email-with-attachments';

const logger = createLogger('api/cases/[id]/debt-review/[docId]/send-consumer');

type RouteContext = { params: Promise<{ id: string; docId: string }> };

const DOC_LABELS: Record<string, string> = {
    FORM_16:                     'Form 16 — Application for Debt Review',
    FORM_17_1:                   'Form 17.1 — Notification to Credit Providers',
    SECTION_86_NOTICE:           'Section 86(2) Notice',
    DEBT_RESTRUCTURING_PROPOSAL: 'Debt Restructuring Proposal',
};

// POST /api/cases/[id]/debt-review/[docId]/send-consumer
// Emails the generated PDF to the consumer.
// Updates status → SENT_FOR_SIGNING and records sentToConsumerAt.
export async function POST(_req: Request, { params }: RouteContext) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: caseId, docId } = await params;

        // Load document + case + client in one query
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
                acquisitionType: true,
                client: { select: { firstName: true, lastName: true, email: true } },
            },
        });

        if (!caseRecord) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        // B2B clients must NOT be emailed clearance certificates directly
        const isClearanceDoc = doc.documentType === 'CERTIFIED_FORM_19' || doc.documentType === 'FORM_17_W';
        if (isClearanceDoc && caseRecord.acquisitionType === 'B2B') {
            return NextResponse.json(
                { error: 'Clearance certificates cannot be emailed directly to B2B clients' },
                { status: 403 }
            );
        }

        const consumerEmail = caseRecord.client.email;
        if (!consumerEmail) {
            return NextResponse.json(
                { error: 'Consumer has no email address on record' },
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
        const fullName  = `${caseRecord.client.firstName} ${caseRecord.client.lastName}`;

        const htmlContent = `
            <p>Dear ${fullName},</p>
            <p>Please find attached your <strong>${docLabel}</strong> (File No: ${caseRecord.fileNumber}) for your debt review application with Zenowethu.</p>
            <p>Kindly review the document carefully. If you have any questions, please do not hesitate to contact us.</p>
            <p>Kind regards,<br/><strong>Zenowethu Debt Counselling Team</strong></p>
        `.trim();

        const html = renderBrandedEmail(htmlContent, {
            title: docLabel,
            previewText: `Important document attached: ${docLabel} for File No. ${caseRecord.fileNumber}`
        });

        const result = await sendEmailWithAttachments({
            to:      consumerEmail,
            subject: `${docLabel} — File No. ${caseRecord.fileNumber}`,
            html,
            attachments: [{ filename: fileName, content: pdfBuffer, contentType: 'application/pdf' }],
        });

        if (!result.success) {
            logger.error(`Failed to send consumer email for doc ${docId}:`, result.error);
            return NextResponse.json({ error: `Email delivery failed: ${result.error}` }, { status: 502 });
        }

        // Update document record
        const now = new Date();
        const updated = await prisma.debtReviewDocument.update({
            where: { id: docId },
            data: {
                status:          'SENT_FOR_SIGNING',
                sentToConsumerAt: now,
            },
        });

        logger.info(
            `Document ${docId} (${doc.documentType}) sent to consumer ${consumerEmail} ` +
            `for case ${caseId} by user ${(session.user as { id: string }).id}`
        );

        return NextResponse.json({
            success:    true,
            document:   updated,
            sentTo:     consumerEmail,
            messageId:  result.messageId,
        });
    } catch (error) {
        logger.error('Error sending document to consumer:', error);
        return NextResponse.json({ error: 'Failed to send document to consumer' }, { status: 500 });
    }
}
