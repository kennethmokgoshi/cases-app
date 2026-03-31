import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { z } from 'zod';
import { sendEmailWithAttachments } from '@/lib/email-with-attachments';

const logger = createLogger('api/cases/[id]/debt-review/send-creditors');

type RouteContext = { params: Promise<{ id: string }> };

const SendCreditorsSchema = z.object({
    // Optional: only send specific document IDs; default = all APPROVED docs
    documentIds: z.array(z.string()).optional(),
});

const DOC_LABELS: Record<string, string> = {
    FORM_16:                     'Form 16 — Application for Debt Review',
    FORM_17_1:                   'Form 17.1 — Notification to Credit Providers',
    SECTION_86_NOTICE:           'Section 86(2) Notice',
    DEBT_RESTRUCTURING_PROPOSAL: 'Debt Restructuring Proposal',
};

// POST /api/cases/[id]/debt-review/send-creditors
// Emails APPROVED debt review documents to each linked credit provider.
// Returns a list of missing-email providers if any are detected before sending.
// Body (optional): { documentIds: string[] }
export async function POST(request: Request, { params }: RouteContext) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: caseId } = await params;

        const body = await request.json().catch(() => ({}));
        const parsed = SendCreditorsSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid request body', issues: parsed.error.issues }, { status: 422 });
        }
        const { documentIds } = parsed.data;

        // ── Load case + client + credit accounts with providers ───────────────
        const caseRecord = await prisma.case.findUnique({
            where: { id: caseId },
            select: {
                fileNumber: true,
                client:     { select: { firstName: true, lastName: true } },
                creditAccounts: {
                    where:   { isIncluded: true },
                    select: {
                        id:             true,
                        creditorName:   true,
                        creditProvider: {
                            select: { id: true, name: true, email: true },
                        },
                    },
                },
            },
        });

        if (!caseRecord) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        // ── Detect missing provider emails ────────────────────────────────────
        const missingEmails = caseRecord.creditAccounts
            .filter(a => !a.creditProvider?.email)
            .map(a => ({
                accountId:    a.id,
                creditorName: a.creditorName,
                providerName: a.creditProvider?.name ?? null,
            }));

        if (missingEmails.length > 0) {
            return NextResponse.json(
                {
                    error:  'Some credit providers are missing email addresses. Please update them before sending.',
                    missingEmails,
                },
                { status: 422 }
            );
        }

        // ── Load approved documents ───────────────────────────────────────────
        const docsWhere = documentIds?.length
            ? { caseId, id: { in: documentIds }, status: 'APPROVED' }
            : { caseId, status: 'APPROVED' };

        const documents = await prisma.debtReviewDocument.findMany({
            where:   docsWhere,
            orderBy: { createdAt: 'asc' },
        });

        if (documents.length === 0) {
            return NextResponse.json(
                { error: 'No approved documents found to send. Approve documents before sending to creditors.' },
                { status: 422 }
            );
        }

        // ── Read PDF buffers ──────────────────────────────────────────────────
        const attachments: { filename: string; content: Buffer; contentType: string }[] = [];

        for (const doc of documents) {
            if (!doc.fileUrl) continue;
            const filePath = path.join(process.cwd(), 'public', doc.fileUrl);
            if (!existsSync(filePath)) {
                logger.warn(`PDF not found on disk, skipping: ${doc.fileUrl}`);
                continue;
            }
            const content = await readFile(filePath);
            attachments.push({
                filename:    path.basename(filePath),
                content,
                contentType: 'application/pdf',
            });
        }

        if (attachments.length === 0) {
            return NextResponse.json(
                { error: 'PDF files for approved documents were not found on the server. Please regenerate.' },
                { status: 422 }
            );
        }

        // ── Collect unique provider emails ────────────────────────────────────
        const providerEmailSet = new Map<string, string>(); // email → name
        for (const account of caseRecord.creditAccounts) {
            if (account.creditProvider?.email) {
                providerEmailSet.set(
                    account.creditProvider.email,
                    account.creditProvider.name
                );
            }
        }

        const fullName    = `${caseRecord.client.firstName} ${caseRecord.client.lastName}`;
        const docLabelStr = documents.map(d => DOC_LABELS[d.documentType] ?? d.documentType).join(', ');
        const now         = new Date();
        const sentEmails: string[] = [];

        // ── Send email to each provider ───────────────────────────────────────
        for (const [email, providerName] of providerEmailSet) {
            const html = `
<p>Dear ${providerName},</p>
<p>Please find attached the following debt review documents for consumer <strong>${fullName}</strong> (File No: ${caseRecord.fileNumber}):</p>
<ul>${documents.map(d => `<li>${DOC_LABELS[d.documentType] ?? d.documentType}</li>`).join('')}</ul>
<p>This notification is issued in terms of the National Credit Act 34 of 2005.</p>
<p>Kind regards,<br/>Zenowethu Debt Counselling Team</p>
            `.trim();

            const result = await sendEmailWithAttachments({
                to:          email,
                subject:     `Debt Review Notification — ${fullName} — File No. ${caseRecord.fileNumber}`,
                html,
                attachments,
            });

            if (result.success) {
                sentEmails.push(email);
                logger.info(`Debt review docs sent to creditor ${email} for case ${caseId}`);
            } else {
                logger.error(`Failed to send to creditor ${email}:`, result.error);
            }
        }

        if (sentEmails.length === 0) {
            return NextResponse.json(
                { error: 'All email deliveries failed. Check SMTP configuration.' },
                { status: 502 }
            );
        }

        // ── Update documents: mark as SENT_TO_CREDITORS ───────────────────────
        await prisma.debtReviewDocument.updateMany({
            where: { id: { in: documents.map(d => d.id) } },
            data: {
                sentToCreditors:  true,
                sentToCreditorAt: now,
                status:           'SENT_TO_CREDITORS',
                emailsSentTo:     JSON.stringify(sentEmails),
            },
        });

        logger.info(
            `Sent ${documents.length} debt review docs to ${sentEmails.length} creditors ` +
            `for case ${caseId} by user ${(session.user as { id: string }).id}: ${sentEmails.join(', ')}`
        );

        return NextResponse.json({
            success:      true,
            sentTo:       sentEmails,
            docsSent:     documents.length,
            documentTypes: documents.map(d => d.documentType),
        });
    } catch (error) {
        logger.error('Error sending documents to creditors:', error);
        return NextResponse.json({ error: 'Failed to send documents to creditors' }, { status: 500 });
    }
}
