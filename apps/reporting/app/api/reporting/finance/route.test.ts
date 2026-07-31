import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';
import { auth } from '@/lib/auth';
import { prisma } from '@zenowethu/database';

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@zenowethu/database', () => ({
  prisma: {
    payment: {
      aggregate: vi.fn(),
      count: vi.fn(),
    },
    paymentBatch: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    invoice: {
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    case: {
      count: vi.fn(),
    },
    consumerAccount: {
      count: vi.fn(),
    },
  },
}));

vi.mock('@zenowethu/shared-lib/src/finance/overpayments', () => ({
  getOverpaymentSummary: vi.fn().mockResolvedValue({
    count: 1,
    totalOverpaid: 1500,
    items: [
      {
        invoiceId: 'inv-1',
        number: 'INV-001',
        clientName: 'John Doe',
        caseFileNumber: 'CASE-101',
        expected: 5000,
        captured: 6500,
        overpaidBy: 1500,
      },
    ],
  }),
}));

describe('GET /api/reporting/finance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 if user is not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const response = await GET(new Request('http://localhost/api/reporting/finance'));
    expect(response.status).toBe(401);
  });

  it('should return 403 if user lacks finance reporting permission', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'user-1', email: 'staff@zenowethu.co.za', userType: 'STAFF', reportingRole: 'staff' },
    } as any);

    const response = await GET(new Request('http://localhost/api/reporting/finance'));
    expect(response.status).toBe(403);
  });

  it('should return financial metrics for authorized finance user', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'user-2', email: 'finance@zenowethu.co.za', userType: 'STAFF', reportingRole: 'finance', isAdmin: true, role: 'ADMIN' },
    } as any);

    vi.mocked(prisma.payment.aggregate)
      .mockResolvedValueOnce({ _sum: { amount: 5500 } } as any) // this month
      .mockResolvedValueOnce({ _sum: { amount: 5000 } } as any) // last month
      .mockResolvedValueOnce({ _sum: { amount: 200 } } as any); // unallocated sum

    vi.mocked(prisma.paymentBatch.count).mockResolvedValue(2);
    vi.mocked(prisma.payment.count).mockResolvedValue(1);
    vi.mocked(prisma.paymentBatch.findMany).mockResolvedValue([
      {
        id: 'b-1',
        fileName: 'bank_statement.xlsx',
        uploadedAt: new Date('2026-07-25'),
        totalAmount: 10000,
        matchCount: 8,
        unmatchCount: 2,
        status: 'MATCHED',
        uploadedBy: { firstName: 'Rose', lastName: 'Finance' },
      },
    ] as any);

    vi.mocked(prisma.invoice.count)
      .mockResolvedValueOnce(15) // quotes total
      .mockResolvedValueOnce(10); // accepted quotes

    vi.mocked(prisma.invoice.aggregate).mockResolvedValue({
      _sum: { amount: 50000, paidAmount: 35000 },
      _count: { id: 25 },
    } as any);

    vi.mocked(prisma.case.count).mockResolvedValue(120);
    vi.mocked(prisma.consumerAccount.count).mockResolvedValue(85);

    const response = await GET(new Request('http://localhost/api/reporting/finance'));
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.metrics.totalCollected).toBe(5500);
    expect(data.metrics.lastMonthCollected).toBe(5000);
    expect(data.metrics.percentChange).toBe(10);
    expect(data.metrics.pendingBatches).toBe(2);
    expect(data.metrics.unallocatedCount).toBe(1);
    expect(data.recentBatches.length).toBe(1);
    expect(data.recentBatches[0].fileName).toBe('bank_statement.xlsx');
    expect(data.overpayments).not.toBeNull();
    expect(data.overpayments.totalOverpaid).toBe(1500);
  });
});
