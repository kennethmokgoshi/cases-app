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
    case: { findFirst: vi.fn() },
  },
}));

import { auth } from '@/auth';
import { prisma } from '@zenowethu/database';
import { GET } from './route';

const db = prisma as unknown as {
  consumerAccount: { findUnique: ReturnType<typeof vi.fn> };
  case: { findFirst: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue({ user: { id: 'consumer1' } } as never);
  db.consumerAccount.findUnique.mockResolvedValue({ linkedClientId: 'client1' });
  db.case.findFirst.mockResolvedValue({
    id: 'case1',
    fileNumber: 'ZDM-2026-001',
    description: 'Debt review removal',
    serviceFee: null,
    invoices: [{
      invoiceNumber: 'QUO-1',
      type: 'QUOTE',
      status: 'ACCEPTED',
      total: '4500',
      issuedAt: new Date('2026-07-01T00:00:00Z'),
      dueAt: new Date('2026-07-10T00:00:00Z'),
      acceptedAt: new Date('2026-07-02T00:00:00Z'),
      convertedToInvoiceId: null,
    }],
    payments: [{
      amount: '1000',
      date: new Date('2026-07-03T00:00:00Z'),
      method: 'EFT',
      reference: 'REF',
      status: 'COMPLETED',
    }],
  });
});

describe('GET /api/consumer/cases/[id]/statement', () => {
  it('returns 401 when not signed in', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const res = await GET(new Request('https://credo.zenowethu.co.za/api/consumer/cases/case1/statement'), {
      params: Promise.resolve({ id: 'case1' }),
    });

    expect(res.status).toBe(401);
  });

  it('returns a downloadable payment statement for the linked case', async () => {
    const res = await GET(new Request('https://credo.zenowethu.co.za/api/consumer/cases/case1/statement'), {
      params: Promise.resolve({ id: 'case1' }),
    });
    const csv = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toContain('payment-statement-ZDM-2026-001.csv');
    expect(csv).toContain('"Balance","3500"');
    expect(csv).toContain('"QUO-1","QUOTE","ACCEPTED"');
  });
});
