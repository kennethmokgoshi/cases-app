import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@zenowethu/shared-lib', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@zenowethu/database', () => ({
  prisma: {
    consumerAccount: { findUnique: vi.fn() },
  },
}));

import { auth } from '@/auth';
import { prisma } from '@zenowethu/database';
import { GET } from './route';

const db = prisma as unknown as {
  consumerAccount: { findUnique: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue({ user: { id: 'consumer1' } } as never);
});

describe('GET /api/consumer/cases', () => {
  it('returns 401 when the consumer is not signed in', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const res = await GET();

    expect(res.status).toBe(401);
  });

  it('returns the linked consumer cases with progress and financials', async () => {
    db.consumerAccount.findUnique.mockResolvedValue({
      id: 'consumer1',
      linkedClient: {
        id: 'client1',
        cases: [{
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
          invoices: [{
            id: 'quote1',
            invoiceNumber: 'QUO-1',
            type: 'QUOTE',
            status: 'ACCEPTED',
            total: '4500',
            subtotal: '3913.04',
            vatAmount: '586.96',
            issuedAt: new Date('2026-07-01T00:00:00Z'),
            dueAt: new Date('2026-07-10T00:00:00Z'),
            acceptedAt: new Date('2026-07-02T00:00:00Z'),
            rejectedAt: null,
            publicToken: 'token1',
            notes: null,
            lineItems: [],
            convertedToInvoiceId: null,
          }],
          payments: [{
            id: 'pay1',
            amount: '1000',
            date: new Date('2026-07-03T00:00:00Z'),
            method: 'EFT',
            reference: 'REF',
            category: 'INSTALLMENT',
            status: 'COMPLETED',
            notes: null,
          }],
          workflowLogs: [],
          comments: [],
          notifications: [],
          documentRequests: [],
          drrConsents: [],
        }],
      },
    });

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.cases[0]).toMatchObject({
      id: 'case1',
      statusLabel: 'Ready to Consent',
      currentStep: 'Consent',
    });
    expect(json.cases[0].financials.outstanding).toBe(3500);
  });
});
