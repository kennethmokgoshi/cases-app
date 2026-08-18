import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from './route';

vi.mock('@zenowethu/database', () => ({
  prisma: {
    payment: { findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
    client: { findUnique: vi.fn() },
    case: { findUnique: vi.fn() },
    paymentArrangement: { findMany: vi.fn() },
    paymentArrangementInstalment: { findUnique: vi.fn() },
  },
}));

vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@zenowethu/shared-lib', () => ({
  auth: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { auth } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { writeFile } from 'fs/promises';

const mockAuth = vi.mocked(auth);
const mockFindMany = vi.mocked(prisma.payment.findMany);
const mockCount = vi.mocked(prisma.payment.count);
const mockCreate = vi.mocked(prisma.payment.create);
const mockUpdate = vi.mocked(prisma.payment.update);
const mockWriteFile = vi.mocked(writeFile);
const mockCaseFindUnique = vi.mocked(prisma.case.findUnique);
const mockInstalmentFindUnique = vi.mocked(prisma.paymentArrangementInstalment.findUnique);
const mockArrangementFindMany = vi.mocked(prisma.paymentArrangement.findMany);

function makeMultipartRequest(fields: Record<string, string>, file?: { name: string; type: string; content?: string }): Request {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  if (file) form.set('proofOfPayment', new File([file.content ?? 'proof-bytes'], file.name, { type: file.type }));
  return new Request('http://localhost/api/finance/payments', { method: 'POST', body: form });
}

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

  it('accepts multipart with a proof of payment and stores its URL', async () => {
    mockCreate.mockResolvedValueOnce({ id: 'pay-9' } as never);
    mockUpdate.mockResolvedValueOnce({ id: 'pay-9', proofOfPaymentUrl: '/uploads/payments/pay-9/x.pdf' } as never);
    const res = await POST(makeMultipartRequest(
      { amount: '200', date: '2026-07-01', method: 'EFT' },
      { name: 'pop.pdf', type: 'application/pdf' }
    ));
    expect(res.status).toBe(201);
    expect(mockWriteFile).toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'pay-9' },
      data: { proofOfPaymentUrl: expect.stringMatching(/^\/uploads\/payments\/pay-9\/\d+-pop\.pdf$/) },
    }));
  });

  it('accepts multipart without a proof file', async () => {
    mockCreate.mockResolvedValueOnce({ id: 'pay-10' } as never);
    const res = await POST(makeMultipartRequest({ amount: '200', date: '2026-07-01', method: 'EFT' }));
    expect(res.status).toBe(201);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects a disallowed proof file type with 400 before creating the payment', async () => {
    const res = await POST(makeMultipartRequest(
      { amount: '200', date: '2026-07-01', method: 'EFT' },
      { name: 'macro.xlsm', type: 'application/vnd.ms-excel.sheet.macroEnabled.12' }
    ));
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('still records the payment when the proof file write fails (returns proofUploadError)', async () => {
    mockCreate.mockResolvedValueOnce({ id: 'pay-11' } as never);
    mockWriteFile.mockRejectedValueOnce(new Error('disk full'));
    const res = await POST(makeMultipartRequest(
      { amount: '200', date: '2026-07-01', method: 'EFT' },
      { name: 'pop.pdf', type: 'application/pdf' }
    ));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.proofUploadError).toBeTruthy();
  });
});

describe('POST /api/finance/payments — case and instalment allocation', () => {
  beforeEach(() => {
    mockArrangementFindMany.mockResolvedValue([] as never);
    mockCreate.mockResolvedValue({ id: 'pay-1', caseId: 'case-1', amount: 500 } as never);
  });

  it('pins the payment to the case the staff member was looking at', async () => {
    // Without an explicit caseId we guess the client's newest open case, which is
    // wrong when a consumer has more than one file.
    mockCaseFindUnique.mockResolvedValue({ id: 'case-1', clientId: 'client-1' } as never);

    const res = await POST(makePostRequest({ caseId: 'case-1', amount: '500', date: '2026-08-18', method: 'EFT' }));

    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ caseId: 'case-1', clientId: 'client-1' }),
      })
    );
    // The ID-number fallback must not run when a case is given.
    expect(vi.mocked(prisma.client.findUnique)).not.toHaveBeenCalled();
  });

  it('returns 404 when the given case does not exist', async () => {
    mockCaseFindUnique.mockResolvedValue(null as never);
    const res = await POST(makePostRequest({ caseId: 'nope', amount: '500', date: '2026-08-18', method: 'EFT' }));
    expect(res.status).toBe(404);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('stores the instalment a back-dated payment settles', async () => {
    mockCaseFindUnique.mockResolvedValue({ id: 'case-1', clientId: 'client-1' } as never);
    mockInstalmentFindUnique.mockResolvedValue({
      arrangement: { caseId: 'case-1', clientId: 'client-1' },
    } as never);

    const res = await POST(
      makePostRequest({ caseId: 'case-1', instalmentId: 'inst-3', amount: '500', date: '2026-10-01', method: 'EFT' })
    );

    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ instalmentId: 'inst-3' }) })
    );
  });

  it('rejects an instalment belonging to a different case', async () => {
    mockCaseFindUnique.mockResolvedValue({ id: 'case-1', clientId: 'client-1' } as never);
    mockInstalmentFindUnique.mockResolvedValue({
      arrangement: { caseId: 'other-case', clientId: 'other-client' },
    } as never);

    const res = await POST(
      makePostRequest({ caseId: 'case-1', instalmentId: 'inst-x', amount: '500', date: '2026-10-01', method: 'EFT' })
    );

    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('leaves instalmentId null when no month is chosen, so it falls to FIFO matching', async () => {
    mockCaseFindUnique.mockResolvedValue({ id: 'case-1', clientId: 'client-1' } as never);

    const res = await POST(makePostRequest({ caseId: 'case-1', amount: '500', date: '2026-08-18', method: 'EFT' }));

    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ instalmentId: null }) })
    );
  });
});
