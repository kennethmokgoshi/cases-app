import { describe, expect, it } from 'vitest';

import { buildConsumerCaseView, type ConsumerCaseRecord } from './consumer-cases';

const baseCase: ConsumerCaseRecord = {
  id: 'case1',
  fileNumber: 'ZDM-2026-001',
  description: 'Debt review removal',
  status: 'READY_TO_CONSENT',
  category: 'DHS',
  services: null,
  serviceFee: null,
  nextUpdate: null,
  deadline: null,
  createdAt: new Date('2026-07-01T00:00:00Z'),
  updatedAt: new Date('2026-07-02T00:00:00Z'),
  consumerDhsStatus: 'A',
  requestedDhsStatus: null,
  invoices: [
    {
      id: 'quote1',
      invoiceNumber: 'QUO-2026-0001',
      type: 'QUOTE',
      status: 'ACCEPTED',
      total: '4500',
      subtotal: '3913.04',
      vatAmount: '586.96',
      issuedAt: new Date('2026-07-01T00:00:00Z'),
      dueAt: new Date('2026-07-10T00:00:00Z'),
      acceptedAt: new Date('2026-07-02T00:00:00Z'),
      rejectedAt: null,
      publicToken: 'quote-token',
      notes: null,
      lineItems: [],
      convertedToInvoiceId: null,
    },
  ],
  payments: [
    {
      id: 'pay1',
      amount: '2250',
      date: new Date('2026-07-03T00:00:00Z'),
      method: 'EFT',
      reference: 'REF123',
      category: 'INSTALLMENT',
      status: 'COMPLETED',
      notes: null,
    },
  ],
  workflowLogs: [
    {
      id: 'log1',
      fromStatus: 'ACCEPTED_VIA_DHS',
      toStatus: 'READY_TO_CONSENT',
      action: 'STATUS_CHANGE',
      timestamp: new Date('2026-07-02T00:00:00Z'),
      notes: 'Consent requested',
    },
  ],
  comments: [
    {
      id: 'comment1',
      content: '[CLIENT COMMENT] Test User: Please call me.',
      activityType: 'CLIENT_COMMENT',
      createdAt: new Date('2026-07-04T00:00:00Z'),
    },
  ],
  notifications: [
    {
      id: 'note1',
      channel: 'EMAIL',
      message: 'Consent link sent',
      sentAt: new Date('2026-07-01T00:00:00Z'),
      statusCode: 'MANUAL',
    },
  ],
  documentRequests: [],
  drrConsents: [
    {
      id: 'consent1',
      status: 'PENDING',
      channel: 'CREDO',
      createdAt: new Date('2026-07-01T00:00:00Z'),
      consentedAt: null,
      expiresAt: new Date('2026-07-31T00:00:00Z'),
    },
  ],
};

describe('buildConsumerCaseView', () => {
  it('shows consent as the current step and computes quote balance', () => {
    const view = buildConsumerCaseView(baseCase, 'https://finance.zenowethu.co.za');

    expect(view.currentStep).toBe('Consent');
    expect(view.nextAction).toContain('consent link');
    expect(view.financials.acceptedQuotesTotal).toBe(4500);
    expect(view.financials.totalPaid).toBe(2250);
    expect(view.financials.outstanding).toBe(2250);
    expect(view.quotes[0].viewUrl).toBe('/quote/quote-token');
    expect(view.quotes[0].downloadUrl).toBe('https://finance.zenowethu.co.za/api/public/quotes/quote-token/pdf');
  });

  it('prioritises open document requests as the next consumer action', () => {
    const view = buildConsumerCaseView({
      ...baseCase,
      status: 'AWAITING_DRR_DOCS',
      documentRequests: [{
        id: 'doc1',
        category: 'BUREAU',
        label: 'Credit report',
        notes: null,
        status: 'REQUESTED',
        createdAt: new Date('2026-07-05T00:00:00Z'),
        reviewedAt: null,
      }],
    }, 'https://finance.zenowethu.co.za');

    expect(view.currentStep).toBe('Documents');
    expect(view.nextAction).toBe('Upload 1 requested document in Document Vault.');
  });
});
