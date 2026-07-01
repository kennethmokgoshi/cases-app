import { NextResponse } from 'next/server';
import { auth, createLogger, renderBrandedEmail } from '@zenowethu/shared-lib';
import { resolveInvoiceBankingDetails } from '@zenowethu/shared-lib/src/finance/banking-details';
import { createR350AdminFeeInvoice } from '@zenowethu/shared-lib/src/finance/r350-admin-fee-invoice';
import { prisma } from '@zenowethu/database';
import { generateInvoicePdf, InvoiceLineItem, InvoiceData } from '@/lib/invoice-pdf';
import { sendEmailWithAttachments } from '@/lib/email-with-attachments';

const logger = createLogger('api/cases/[id]/r350-admin-invoice');

function formatZAR(n: number): string {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2 }).format(n);
}

function buildEmailHtml(invoiceNumber: string, total: number, publicToken: string | null): string {
  const totalFormatted = formatZAR(total);
  const credoUrl = process.env.CREDO_APP_URL || 'https://credo.zenowethu.co.za';
  const viewLink = publicToken ? `${credoUrl}/quote/${publicToken}` : null;

  const content = `
    <h2 style="margin: 0 0 15px; color: #0d3870; font-size: 22px;">Invoice ${invoiceNumber}</h2>
    <p style="margin: 0 0 15px; color: #666; font-size: 14px;">Please find your R350 admin fee invoice attached to this email.</p>
    <div style="background-color: #f4f7f9; border-radius: 8px; padding: 25px; margin: 25px 0; border: 1px solid #e1e8ed; display: inline-block; min-width: 200px;">
      <p style="margin: 0; font-size: 13px; color: #888; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Total Due</p>
      <p style="margin: 5px 0 0; font-size: 28px; font-weight: bold; color: #0d3870;">${totalFormatted}</p>
    </div>
    <p style="margin-top: 20px; font-size: 14px; color: #666;">This is an automated financial notification from Zenowethu Debt Management.</p>
  `;

  return renderBrandedEmail(content, {
    title: `Invoice ${invoiceNumber}`,
    previewText: 'Your R350 admin fee invoice from Zenowethu is ready for review.',
    button: viewLink ? { text: 'View & Download Invoice Online', url: viewLink } : undefined,
  });
}

/**
 * POST /api/cases/[id]/r350-admin-invoice
 *
 * Generates (first call) or re-sends (subsequent calls) the R350 admin fee
 * invoice for a direct (B2C) case, emailed to the consumer. Banking details
 * come from the case creator's own StaffBankingDetail if set, else Zenowethu's
 * default org account.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const existing = await prisma.case.findUnique({
      where: { id },
      select: {
        id: true,
        fileNumber: true,
        clientId: true,
        acquisitionType: true,
        createdById: true,
        r350InvoiceId: true,
        r350InvoiceSentAt: true,
        client: { select: { firstName: true, lastName: true, email: true, idNumber: true } },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    if (existing.acquisitionType === 'B2B') {
      return NextResponse.json({ error: 'R350 is not applicable for B2B cases' }, { status: 422 });
    }

    const canSend = existing.createdById === session.user.id
      || session.user.isAdmin
      || session.user.isExecutive;
    if (!canSend) {
      return NextResponse.json(
        { error: 'Only the staff member who created this case (or Admin/Executive) may send the R350 admin invoice.' },
        { status: 403 },
      );
    }

    if (!existing.client?.email) {
      return NextResponse.json({ error: 'This client has no email address on file.' }, { status: 422 });
    }

    let invoiceId = existing.r350InvoiceId;

    if (!invoiceId) {
      if (!existing.createdById) {
        return NextResponse.json({ error: 'This case has no recorded creator — cannot determine banking details.' }, { status: 422 });
      }
      const created = await createR350AdminFeeInvoice({
        caseId: existing.id,
        clientId: existing.clientId,
        reference: existing.client.idNumber,
        createdById: existing.createdById,
      });
      invoiceId = created.id;
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        client: { select: { firstName: true, lastName: true, email: true, phone: true, idNumber: true } },
        case: { select: { fileNumber: true } },
        bankAccount: { select: { bankName: true, accountName: true, accountNumber: true, branchCode: true } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice could not be created' }, { status: 500 });
    }

    const bankingDetails = await resolveInvoiceBankingDetails(invoice);
    const lineItems = invoice.lineItems as unknown as InvoiceLineItem[];

    const invoiceData: InvoiceData = {
      documentType: 'INVOICE',
      invoiceNumber: invoice.invoiceNumber,
      issuedAt: invoice.issuedAt,
      dueAt: invoice.dueAt,
      status: invoice.status,
      clientName: `${invoice.client!.firstName} ${invoice.client!.lastName}`,
      clientEmail: invoice.client!.email ?? undefined,
      clientPhone: invoice.client!.phone ?? undefined,
      clientIdNumber: invoice.client!.idNumber ?? undefined,
      caseFileNumber: invoice.case?.fileNumber ?? undefined,
      lineItems,
      subtotal: Number(invoice.subtotal),
      vatRate: Number(invoice.vatRate),
      vatAmount: Number(invoice.vatAmount),
      total: Number(invoice.total),
      reference: invoice.reference ?? undefined,
      createdByName: invoice.createdBy ? `${invoice.createdBy.firstName} ${invoice.createdBy.lastName}` : undefined,
      bankName: bankingDetails.bankName,
      bankAccountName: bankingDetails.accountHolder,
      bankAccountNumber: bankingDetails.accountNumber,
      branchCode: bankingDetails.branchCode,
    };

    const pdfBytes = await generateInvoicePdf(invoiceData);

    const emailResult = await sendEmailWithAttachments({
      to: invoice.client!.email!,
      subject: `Invoice ${invoice.invoiceNumber} — R350 Admin Fee — Zenowethu`,
      html: buildEmailHtml(invoice.invoiceNumber, Number(invoice.total), invoice.publicToken),
      attachments: [{
        filename: `${invoice.invoiceNumber}.pdf`,
        content: Buffer.from(pdfBytes),
        contentType: 'application/pdf',
      }],
    });

    if (!emailResult.success) {
      logger.error(`Failed to send R350 admin invoice ${invoice.invoiceNumber}:`, emailResult.error);
      return NextResponse.json({ error: 'Email delivery failed: ' + emailResult.error }, { status: 502 });
    }

    const now = new Date();

    await Promise.all([
      prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: 'SENT', sentAt: now, sentTo: invoice.client!.email! },
      }),
      prisma.case.update({
        where: { id: existing.id },
        data: { r350InvoiceId: invoice.id, r350InvoiceSentAt: now },
      }),
    ]);

    const logMsg = `R350 admin fee invoice ${invoice.invoiceNumber} sent via email to ${invoice.client!.email}` +
      ` — sent by ${session.user.name ?? session.user.email ?? session.user.id}`;

    await Promise.allSettled([
      prisma.notificationLog.create({
        data: {
          caseId: existing.id,
          channel: 'EMAIL',
          recipient: invoice.client!.email!,
          recipientType: 'CLIENT',
          message: logMsg,
          success: true,
          provider: 'SMTP',
          senderId: session.user.id,
          htmlBody: `Invoice ${invoice.invoiceNumber} — total: ${formatZAR(Number(invoice.total))}`,
        },
      }),
      prisma.workflowLog.create({
        data: {
          caseId: existing.id,
          action: 'R350_ADMIN_INVOICE_SENT',
          toStatus: 'SENT',
          notes: logMsg,
          userId: session.user.id,
        },
      }),
    ]);

    logger.info(`R350 admin invoice ${invoice.invoiceNumber} sent for case ${existing.fileNumber} by ${session.user.id}`);

    return NextResponse.json({
      success: true,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      sentTo: invoice.client!.email,
      resent: Boolean(existing.r350InvoiceId),
    });
  } catch (err) {
    logger.error('Error sending R350 admin invoice:', err);
    return NextResponse.json({ error: 'Failed to send R350 admin invoice' }, { status: 500 });
  }
}
