import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from './route';

vi.mock('@zenowethu/database', () => ({
  prisma: {
    payment: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
    client: { findUnique: vi.fn() },
  },
}));

vi.mock('@zenowethu/shared-lib', () => ({
  auth: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { auth } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';

const mockAuth = vi.mocked(auth);
const mockFindMany = vi.mocked(prisma.payment.findMany);
const mockCount = vi.mocked(prisma.payment.count);
const mockCreate = vi.mocked(prisma.payment.create);

function makeGetRequest(query = ''): Request {
  return new Request(`http://localhost/api/finance/payments${query ? `?${query}` : ''}`);
}

function makePostRequest(body: unknown): Request {
  return new Request('http://localhost/api/finance/payments', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: 'user-1' } } as never);
  mockFindMany.mockResolvedValue([] as never);
  mockCount.mockResolvedValue(0 as never);
});

describe('GET /api/finance/payments', () => {
  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValueOnce(null as never);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it('applies defaults when page/limit are absent (regression: null must not fail min(1))', async () => {
    // The Payments page sends only ?page=1 — never limit. searchParams.get('limit')
    // returns null, which z.coerce.number() turned into 0, failing min(1) with a 400.
    const res = await GET(makeGetRequest('page=1'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ payments: [], total: 0, page: 1 });
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 50 }));
  });

  it('returns 200 with defaults when no query params at all', async () => {
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
  });

  it('filters by method and date range', async () => {
    const res = await GET(makeGetRequest('page=1&method=EFT&from=2026-01-01&to=2026-01-31'));
    expect(res.status).toBe(200);
    const where = mockFindMany.mock.calls[0][0]?.where as Record<string, unknown>;
    expect(where.method).toBe('EFT');
    expect(where.date).toMatchObject({ gte: expect.any(Date), lte: expect.any(Date) });
  });

  it('rejects an invalid explicit limit with 400', async () => {
    const res = await GET(makeGetRequest('limit=0'));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/finance/payments', () => {
  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValueOnce(null as never);
    const res = await POST(makePostRequest({ amount: 100, date: '2026-07-01', method: 'EFT' }));
    expect(res.status).toBe(401);
  });

  it('creates a payment without a client link', async () => {
    mockCreate.mockResolvedValueOnce({ id: 'pay-1' } as never);
    const res = await POST(makePostRequest({ amount: '150.00', date: '2026-07-01', method: 'EFT' }));
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ amount: 150, clientId: null, recordedById: 'user-1' }),
    }));
  });

  it('rejects a non-positive amount with 400', async () => {
    const res = await POST(makePostRequest({ amount: 0, date: '2026-07-01', method: 'EFT' }));
    expect(res.status).toBe(400);
  });
});
