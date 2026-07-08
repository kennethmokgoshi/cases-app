import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { createLogger } from '@zenowethu/shared-lib';

import { auth } from '@/auth';
import { buildConsumerCaseView, type ConsumerCaseRecord } from '@/lib/consumer-cases';

const logger = createLogger('credo/api/consumer/cases');

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const consumer = await prisma.consumerAccount.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        linkedClient: {
          select: {
            id: true,
            cases: {
              where: { deletedAt: null },
              orderBy: { updatedAt: 'desc' },
              select: {
                id: true,
                fileNumber: true,
                description: true,
                status: true,
                category: true,
                services: true,
                serviceFee: true,
                nextUpdate: true,
                deadline: true,
                createdAt: true,
                updatedAt: true,
                consumerDhsStatus: true,
                requestedDhsStatus: true,
                invoices: {
                  orderBy: { issuedAt: 'desc' },
                  select: {
                    id: true,
                    invoiceNumber: true,
                    type: true,
                    status: true,
                    total: true,
                    subtotal: true,
                    vatAmount: true,
                    issuedAt: true,
                    dueAt: true,
                    acceptedAt: true,
                    rejectedAt: true,
                    publicToken: true,
                    notes: true,
                    lineItems: true,
                    convertedToInvoiceId: true,
                  },
                },
                payments: {
                  orderBy: { date: 'desc' },
                  select: {
                    id: true,
                    amount: true,
                    date: true,
                    method: true,
                    reference: true,
                    category: true,
                    status: true,
                    notes: true,
                  },
                },
                workflowLogs: {
                  orderBy: { timestamp: 'desc' },
                  take: 12,
                  select: {
                    id: true,
                    fromStatus: true,
                    toStatus: true,
                    action: true,
                    timestamp: true,
                    notes: true,
                  },
                },
                comments: {
                  where: { isInternal: false },
                  orderBy: { createdAt: 'desc' },
                  take: 20,
                  select: {
                    id: true,
                    content: true,
                    activityType: true,
                    createdAt: true,
                  },
                },
                notifications: {
                  where: { recipientType: 'CLIENT', success: true },
                  orderBy: { sentAt: 'desc' },
                  take: 20,
                  select: {
                    id: true,
                    channel: true,
                    message: true,
                    sentAt: true,
                    statusCode: true,
                  },
                },
                documentRequests: {
                  orderBy: { createdAt: 'desc' },
                  select: {
                    id: true,
                    category: true,
                    label: true,
                    notes: true,
                    status: true,
                    createdAt: true,
                    reviewedAt: true,
                  },
                },
                drrConsents: {
                  orderBy: { createdAt: 'desc' },
                  take: 3,
                  select: {
                    id: true,
                    status: true,
                    channel: true,
                    createdAt: true,
                    consentedAt: true,
                    expiresAt: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const client = consumer?.linkedClient;
    if (!client) {
      return NextResponse.json({ cases: [] });
    }

    const financeBaseUrl = process.env.FINANCE_APP_URL || 'https://finance.zenowethu.co.za';
    const cases = client.cases.map(caseRecord =>
      buildConsumerCaseView(caseRecord as unknown as ConsumerCaseRecord, financeBaseUrl)
    );

    return NextResponse.json({ cases });
  } catch (error) {
    logger.error('Failed to fetch consumer cases', error);
    return NextResponse.json({ error: 'Failed to fetch cases' }, { status: 500 });
  }
}
