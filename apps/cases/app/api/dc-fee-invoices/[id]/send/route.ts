/**
 * POST /api/dc-fee-invoices/[id]/send
 *
 * Email a debt-counsellor fee invoice (as a PDF attachment) to the requesting
 * debt counsellor. Defaults the recipient to the DC email captured on the
 * invoice; the send is logged on the linked case timeline when present.
 *
 * Body: { to?: string; message?: string }
 */

import { auth, logger, renderBrandedEmail } from '@zenowethu/shared-lib';
import { formatSignatureBlock, type CompanyProfile } from '@zenowethu/shared-lib/src/company/profile';
import { getCompanyProfile } from '@zenowethu/shared-lib/src/company/company-profile-service';
import { loadMandateFiles, type MandateFiles } from '@zenowethu/shared-lib/src/documents/mandate-attachments';
import { prisma } from '@zenowethu/database';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateDcFeeInvoicePdf } from '@/lib/dc-fee-invoice-pdf';
import { sendEmailWithAttachments } from '@/lib/email-with-attachments';
import { applyFeeDocumentStatus } from '@zenowethu/shared-lib/src/finance/fee-document-status';

const SendSchema = z.object({
  to: z.string().email().optional(),
  message: z.string().max(2000).optional(),
});

function buildEmailHtml(
  invoiceNumber: string,
  total: number,
  dcName: string,
  documentType: 'INVOICE' | 'QUOTE',
  message: string | undefined,
  company: CompanyProfile,
  mandateLabel: string | null = null,
): string {
  const totalFormatted = new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 2,
  }).format(total);

  const isQuote = documentType === 'QUOTE';
  const docLabel = isQuote ? 'Quotation' : 'Invoice';
  const totalLabel = isQuote ? 'Quoted Total' : 'Total Due';
  const defaultBody = isQuote
    ? 'Please find attached our quotation for the fees owed by the consumer in respect of the debt review transfer request. Once you are ready to proceed, kindly settle the amount to the banking details on the quotation, after which we will action the transfer on the NCR Debt Help System.'
    : 'Please find attached our invoice for the outstanding fees owed by the consumer in respect of the debt review transfer request. Kindly settle the amount due to the banking details on the invoice, after which we will action the transfer on the NCR Debt Help System.';

  const content = `
    <h2 style="margin: 0 0 15px; color: #0d3870; font-size: 22px;">${docLabel} ${invoiceNumber}</h2>
    <p style="margin: 0 0 20px; color: #444; line-height: 1.6;">Dear ${dcName},</p>
    ${
      message
        ? `<p style="margin: 0 0 20px; color: #444; line-height: 1.6;">${message.replace(/\n/g, '<br/>')}</p>`
        : `<p style="margin: 0 0 20px; color: #444; line-height: 1.6;">${defaultBody}</p>`
    }
    ${
      // Only claim documents that are actually attached.
      mandateLabel
        ? `<p style="margin: 0 0 20px; color: #444; line-height: 1.6;">For your reference and as proof of our authority to act on the consumer's behalf, please find attached our client's ${mandateLabel}.</p>`
        : ''
    }
    <div style="background-color: #f4f7f9; border-radius: 8px; padding: 25px; margin: 25px 0; border: 1px solid #e1e8ed; display: inline-block; min-width: 200px;">
        <p style="margin: 0; font-size: 13px; color: #888; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">${totalLabel}</p>
        <p style="margin: 5px 0 0; font-size: 28px; font-weight: bold; color: #0d3870;">${totalFormatted}</p>
    </div>
    <p style="margin-top: 20px; font-size: 14px; color: #666;">
        ${formatSignatureBlock(company).replace(/\n/g, '<br/>')}
    </p>
  `;

  return renderBrandedEmail(content, {
    title: `${docLabel} ${invoiceNumber}`,
    previewText: `${docLabel} ${invoiceNumber} for outstanding fees from ${company.shortName}.`,
    company,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = SendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  try {
    const result = await generateDcFeeInvoicePdf(id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const { invoice, bytes } = result;

    const to = parsed.data.to ?? invoice.dcEmail ?? undefined;
    if (!to) {
      return NextResponse.json(
        { error: 'No debt counsellor email on the invoice — provide a recipient address.' },
        { status: 400 },
      );
    }
    if (invoice.status === 'CANCELLED') {
      return NextResponse.json({ error: 'Cannot send a cancelled invoice' }, { status: 409 });
    }

    const total = Number(invoice.total);
    const docLabel = invoice.documentType === 'QUOTE' ? 'Quotation' : 'Invoice';
    const company = await getCompanyProfile();
    // Sent on the consumer's behalf — the signed POA and ID travel with it.
    const mandate: MandateFiles = invoice.caseId
      ? await loadMandateFiles(invoice.caseId)
      : { files: [], label: null, summary: 'No case linked — no POA/ID attached', missing: ['POA', 'ID'] };
    const emailResult = await sendEmailWithAttachments({
      to,
      fromName: session.user.name || undefined,
      fromEmail: session.user.email || undefined,
      subject: `${docLabel} ${invoice.invoiceNumber} — Outstanding Fees | ${company.tradingName}`,
      html: buildEmailHtml(invoice.invoiceNumber, total, invoice.dcName ?? 'Debt Counsellor', invoice.documentType, parsed.data.message, company, mandate.label),
      attachments: [
        {
          filename: `${invoice.invoiceNumber}.pdf`,
          content: Buffer.from(bytes),
          contentType: 'application/pdf',
        },
        ...mandate.files,
      ],
    });

    if (!emailResult.success) {
      logger.error(`[dc-fee-invoice send] ${invoice.invoiceNumber} email failed: ${emailResult.error}`);
      return NextResponse.json({ error: 'Email delivery failed: ' + emailResult.error }, { status: 502 });
    }

    const sentAt = new Date();
    await prisma.invoice.update({
      where: { id },
      data: { status: 'SENT', sentAt, sentTo: to },
    });

    // Log on the linked case timeline so staff see the send.
    if (invoice.caseId) {
      const totalFormatted = new Intl.NumberFormat('en-ZA', {
        style: 'currency',
        currency: 'ZAR',
        minimumFractionDigits: 2,
      }).format(total);
      await prisma.notificationLog
        .create({
          data: {
            caseId: invoice.caseId,
            channel: 'EMAIL',
            recipient: to,
            recipientType: 'DEBT_COUNSELLOR',
            message: `Fee ${docLabel.toLowerCase()} ${invoice.invoiceNumber} (${totalFormatted}) emailed to debt counsellor ${to} — sent by ${session.user.name ?? session.user.email ?? session.user.id}. ${mandate.summary}`,
            success: true,
            provider: 'SMTP',
            senderId: session.user.id,
          },
        })
        .catch(() => {});

      // An invoice (not a quote) to the requesting DC moves the case to
      // "Fee Invoice Sent to Requesting DC". Never fails the send itself.
      if (invoice.documentType === 'INVOICE') {
        await applyFeeDocumentStatus({
          caseId: invoice.caseId,
          docType: 'INVOICE_TO_DC',
          event: 'SENT',
          userId: session.user.id,
          notes: `Fee invoice ${invoice.invoiceNumber} emailed to ${to}`,
        }).catch((error) => logger.error('[dc-fee-invoice send] status update failed', error));
      }
    }

    logger.info(`[dc-fee-invoice send] ${invoice.invoiceNumber} sent to ${to} by ${session.user.id}`);
    return NextResponse.json({ success: true, sentTo: to, mandateSummary: mandate.summary, missingMandate: mandate.missing });
  } catch (err) {
    logger.error('[POST /api/dc-fee-invoices/[id]/send]', err);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
