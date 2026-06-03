import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { createLogger } from '@zenowethu/shared-lib';
import { generateCourtDoc, CourtDocType, COURT_DOC_LABELS } from '@zenowethu/shared-lib/src/court-docs';
import { SmtpEmailProvider, ResendEmailProvider } from '@zenowethu/shared-lib';

const logger = createLogger('court-docs-api');
const FIRM_NAME = 'Zenowethu Debt Management (PTY) LTD';

const GenerateSchema = z.object({
    docType: z.enum([
        'NOTICE_OF_MOTION',
        'FOUNDING_AFFIDAVIT',
        'NOTICE_OF_SET_DOWN',
        'NOTICE_OF_MOTION_RESCISSION',
        'COURT_ORDER_GRANTED',
        'PROOF_OF_SERVICE',
    ]),
    courtName:       z.string().optional(),
    courtCaseNumber: z.string().optional(),
    emailTo:         z.string().email().optional(),
});

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { id: caseId } = await params;

    const body = await req.json().catch(() => null);
    const parsed = GenerateSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
    }

    const { docType, courtName, courtCaseNumber, emailTo } = parsed.data;

    // ── Fetch case + client + accounts ────────────────────────────────────────
    const caseData = await prisma.case.findUnique({
        where: { id: caseId },
        select: {
            id:         true,
            fileNumber: true,
            client: {
                select: {
                    firstName:  true,
                    lastName:   true,
                    idNumber:   true,
                    address:    true,
                    phone:      true,
                    email:      true,
                },
            },
            jointClient: {
                select: {
                    firstName: true,
                    lastName:  true,
                    idNumber:  true,
                },
            },
            creditAccounts: {
                where: { isIncluded: true },
                select: {
                    creditorName:       true,
                    accountNumber:      true,
                    accountType:        true,
                    outstandingBalance: true,
                    monthlyInstalment:  true,
                    status:             true,
                    isPrescribed:       true,
                    lastPaymentDate:    true,
                    documents: {
                        where: { documentType: 'PAID_UP_LETTER' },
                        select: {
                            documentType: true,
                            uploadedAt:   true,
                            fileName:     true,
                        },
                        take: 1,
                    },
                },
                orderBy: { creditorName: 'asc' },
            },
        },
    });

    if (!caseData) {
        return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    // ── Build input ───────────────────────────────────────────────────────────
    const client = caseData.client;
    const joint  = caseData.jointClient;

    const creditAccounts = caseData.creditAccounts.map(acc => {
        const hasPaidUpLetter = acc.documents.length > 0 || acc.status === 'CLOSED';
        const paidUpDoc       = acc.documents[0];
        return {
            creditorName:       acc.creditorName,
            accountNumber:      acc.accountNumber ?? undefined,
            accountType:        acc.accountType,
            outstandingBalance: Number(acc.outstandingBalance),
            monthlyInstalment:  acc.monthlyInstalment ? Number(acc.monthlyInstalment) : undefined,
            status:             acc.status,
            isPrescribed:       acc.isPrescribed,
            hasPaidUpLetter,
            paidUpDate:         paidUpDoc?.uploadedAt?.toISOString() ?? undefined,
            letterReference:    paidUpDoc?.fileName ?? undefined,
        };
    });

    const input = {
        fileNumber:           caseData.fileNumber,
        courtName:            courtName,
        courtCaseNumber:      courtCaseNumber,
        clientFullName:       `${client.firstName} ${client.lastName}`,
        clientIdNumber:       client.idNumber,
        clientAddress:        client.address ?? undefined,
        clientPhone:          client.phone ?? undefined,
        clientEmail:          client.email ?? undefined,
        jointClientFullName:  joint ? `${joint.firstName} ${joint.lastName}` : undefined,
        jointClientIdNumber:  joint?.idNumber ?? undefined,
        creditAccounts:       creditAccounts.length > 0 ? creditAccounts : undefined,
        generatedBy:          `${session.user.firstName ?? ''} ${session.user.lastName ?? ''}`.trim() || session.user.email,
    };

    // ── Generate PDF ──────────────────────────────────────────────────────────
    logger.info({ caseId, docType, generatedBy: session.user.id }, 'Generating court document');

    let pdfBytes: Uint8Array;
    try {
        pdfBytes = await generateCourtDoc(docType as CourtDocType, input);
    } catch (err) {
        logger.error({ err, caseId, docType }, 'Court doc generation failed');
        return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 });
    }

    // ── Email mode ────────────────────────────────────────────────────────────
    if (emailTo) {
        const docLabel   = COURT_DOC_LABELS[docType as CourtDocType];
        const filename   = `${docType.toLowerCase().replace(/_/g, '-')}-${caseData.fileNumber}.pdf`;
        const subject    = `${docLabel} — File ${caseData.fileNumber}`;
        const htmlBody   = `<p>Dear ${input.clientFullName},</p><p>Please find attached the <strong>${docLabel}</strong> for your debt review removal matter (File: ${caseData.fileNumber}).</p><p>Please review the document and contact us if you have any queries.</p><p>Kind regards,<br>${FIRM_NAME}</p>`;
        const textBody   = `Dear ${input.clientFullName},\n\nPlease find attached the ${docLabel} for file ${caseData.fileNumber}.\n\nKind regards,\n${FIRM_NAME}`;
        const attachment = { filename, content: Buffer.from(pdfBytes), contentType: 'application/pdf' as const };

        // Use SMTP if configured, otherwise Resend
        const smtpHost = process.env.SMTP_HOST;
        let emailResult: { success: boolean; error?: string };
        if (smtpHost) {
            const provider = new SmtpEmailProvider({
                host: smtpHost,
                port: Number(process.env.SMTP_PORT ?? 587),
                secure: Number(process.env.SMTP_PORT ?? 587) === 465,
                auth: { user: process.env.SMTP_USER ?? '', pass: process.env.SMTP_PASS ?? '' },
                fromEmail: process.env.SMTP_FROM ?? process.env.SMTP_USER ?? '',
            });
            emailResult = await provider.send(emailTo, subject, htmlBody, textBody, { attachments: [attachment] });
        } else if (process.env.RESEND_API_KEY) {
            const provider = new ResendEmailProvider(process.env.RESEND_API_KEY, process.env.RESEND_FROM ?? 'info@zenowethu.co.za');
            emailResult = await provider.send(emailTo, subject, htmlBody, textBody, { attachments: [attachment] });
        } else {
            logger.warn({ emailTo }, 'No email provider configured — cannot send court doc');
            return NextResponse.json({ error: 'No email provider configured' }, { status: 503 });
        }

        if (!emailResult.success) {
            logger.error({ err: emailResult.error, emailTo }, 'Failed to email court document');
            return NextResponse.json({ error: 'Email delivery failed', detail: emailResult.error }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: `Document emailed to ${emailTo}` });
    }

    // ── Download mode ─────────────────────────────────────────────────────────
    const filename = `${docType.toLowerCase().replace(/_/g, '-')}-${caseData.fileNumber}.pdf`;
    return new NextResponse(pdfBytes, {
        status: 200,
        headers: {
            'Content-Type':        'application/pdf',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Length':      String(pdfBytes.length),
        },
    });
}
