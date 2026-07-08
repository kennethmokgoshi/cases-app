import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { createLogger } from '@zenowethu/shared-lib';
import { summariseCaseFinancials } from '@zenowethu/shared-lib/src/finance/case-financials';

import { auth } from '@/auth';

const logger = createLogger('credo/api/consumer/cases/statement');

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const consumer = await prisma.consumerAccount.findUnique({
      where: { id: session.user.id },
      select: { linkedClientId: true },
    });
    if (!consumer?.linkedClientId) {
      return NextResponse.json({ error: 'Your Credo profile is not linked to a case yet.' }, { status: 404 });
    }

    const caseRecord = await prisma.case.findFirst({
      where: { id, clientId: consumer.linkedClientId, deletedAt: null },
      select: {
        id: true,
        fileNumber: true,
        description: true,
        serviceFee: true,
        invoices: {
          orderBy: { issuedAt: 'desc' },
          select: {
            invoiceNumber: true,
            type: true,
            status: true,
            total: true,
            issuedAt: true,
            dueAt: true,
            acceptedAt: true,
            convertedToInvoiceId: true,
          },
        },
        payments: {
          orderBy: { date: 'desc' },
          select: {
            amount: true,
            date: true,
            method: true,
            reference: true,
            status: true,
          },
        },
      },
    });
    if (!caseRecord) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    const statementCase = {
      ...caseRecord,
      serviceFee: caseRecord.serviceFee === null ? null : Number(caseRecord.serviceFee),
      invoices: caseRecord.invoices.map(invoice => ({
        ...invoice,
        type: String(invoice.type),
        status: String(invoice.status),
        total: Number(invoice.total),
      })),
      payments: caseRecord.payments.map(payment => ({
        ...payment,
        amount: Number(payment.amount),
      })),
    };

    const summary = summariseCaseFinancials({
      serviceFee: statementCase.serviceFee,
      invoices: statementCase.invoices,
      payments: statementCase.payments,
    });
    const csv = buildStatementCsv(statementCase, summary);
    const filename = `payment-statement-${caseRecord.fileNumber}.csv`;

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    logger.error('Failed to generate consumer statement', error);
    return NextResponse.json({ error: 'Failed to generate statement' }, { status: 500 });
  }
}

function buildStatementCsv(
  caseRecord: {
    fileNumber: string;
    description: string | null;
    invoices: Array<{
      invoiceNumber: string;
      type: string;
      status: string;
      total: number | string;
      issuedAt: Date | string;
      dueAt: Date | string;
      acceptedAt: Date | string | null;
    }>;
    payments: Array<{
      amount: number | string;
      date: Date | string;
      method: string;
      reference: string | null;
      status: string;
    }>;
  },
  summary: ReturnType<typeof summariseCaseFinancials>,
): string {
  const rows: string[][] = [
    ['Zenowethu Payment Statement'],
    ['Case', caseRecord.fileNumber],
    ['Description', caseRecord.description ?? ''],
    ['Generated', new Date().toISOString()],
    [],
    ['Summary'],
    ['Expected', String(summary.feeBasisTotal ?? summary.invoicedTotal)],
    ['Paid', String(summary.totalPaid)],
    ['Balance', String(summary.outstanding ?? 0)],
    ['Overpaid', String(summary.quoteOverpaid || summary.overCollected)],
    [],
    ['Quotes and Invoices'],
    ['Number', 'Type', 'Status', 'Issued', 'Due', 'Accepted', 'Total'],
    ...caseRecord.invoices.map(invoice => [
      invoice.invoiceNumber,
      invoice.type,
      invoice.status,
      toDate(invoice.issuedAt),
      toDate(invoice.dueAt),
      toDate(invoice.acceptedAt),
      String(invoice.total),
    ]),
    [],
    ['Payments'],
    ['Date', 'Method', 'Reference', 'Status', 'Amount'],
    ...caseRecord.payments.map(payment => [
      toDate(payment.date),
      payment.method,
      payment.reference ?? '',
      payment.status,
      String(payment.amount),
    ]),
  ];
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function toDate(value: Date | string | null): string {
  if (!value) return '';
  return (value instanceof Date ? value : new Date(value)).toISOString().slice(0, 10);
}
