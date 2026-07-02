import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

vi.mock('@zenowethu/database', () => ({
  prisma: {
    case: { findUnique: vi.fn(), update: vi.fn() },
    invoice: { findUnique: vi.fn(), update: vi.fn() },
    notificationLog: { create: vi.fn() },
    workflowLog: { create: vi.fn() },
  },
}));

vi.mock('@zenowethu/shared-lib', () => ({
  auth: vi.fn(),
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
  renderBrandedEmail: (content: string) => `<html>${content}</html>`,
}));

vi.mock('@zenowethu/shared-lib/src/finance/banking-details', () => ({
  resolveInvoiceBankingDetails: vi.fn().mockResolvedValue({
    bankName: 'FNB', accountHolder: 'Zenowethu Trading Debt Management (PTY) LTD', accountNumber: '62867268635', branchCode: '250655',
  }),
}));

vi.mock('@zenowethu/shared-lib/src/finance/r350-admin-fee-invoice', () => ({
  createR350AdminFeeInvoice: vi.fn(),
}));

vi.mock('@/lib/invoice-pdf', () => ({
  generateInvoicePdf: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
}));

vi.mock('@/lib/email-with-attachments', () => ({
  sendEmailWithAttachments: vi.fn().mockResolvedValue({ success: true }),
}));

import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';
import { createR350AdminFeeInvoice } from '@zenowethu/shared-lib/src/finance/r350-admin-fee-invoice';
import { sendEmailWithAttachments } from '@/lib/email-with-attachments';

const mockAuth = vi.mocked(auth);
const mockCaseFindUnique = vi.mocked(prisma.case.findUnique);
const mockCaseUpdate = vi.mocked(prisma.case.update);
const mockInvoiceFindUnique = vi.mocked(prisma.invoice.findUnique);
const mockInvoiceUpdate = vi.mocked(prisma.invoice.update);
const mockCreateR350Invoice = vi.mocked(createR350AdminFeeInvoice);
const mockSendEmail = vi.mocked(sendEmailWithAttachments);

function makeRequest(body?: unknown): Request {
  return new Request('http://localhost/api/cases/case-1/r350-admin-invoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: 'case-1' });

const creatorSession = { user: { id: 'user-1', isAdmin: false, isExecutive: false } };
const adminSession = { user: { id: 'admin-1', isAdmin: true, isExecutive: false } };
const otherStaffSession = { user: { id: 'user-2', isAdmin: false, isExecutive: false } };

const b2cCase = {
  id: 'case-1',
  fileNumber: 'ZDM0001',
  clientId: 'client-1',
  acquisitionType: 'B2C',
  createdById: 'user-1',
  r350InvoiceId: null,
  r350InvoiceSentAt: null,
  client: { firstName: 'John', lastName: 'Doe', email: 'john@example.com', idNumber: '8001015009087' },
};

const invoiceRow = {
  id: 'inv-1',
  invoiceNumber: 'INV-2026-0001',
  publicToken: 'tok-1',
  status: 'DRAFT',
  issuedAt: new Date(),
  dueAt: new Date(),
  lineItems: [{ description: 'R350 Admin Fee (Debt Review Administration Levy)', quantity: 1, unitPrice: 350 }],
  subtotal: 350,
  vatRate: 0,
  vatAmount: 0,
  total: 350,
  reference: '8001015009087',
  client: { firstName: 'John', lastName: 'Doe', email: 'john@example.com', phone: null, idNumber: '8001015009087' },
  case: { fileNumber: 'ZDM0001' },
  bankAccount: null,
  createdBy: { firstName: 'Jane', lastName: 'Staff' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateR350Invoice.mockResolvedValue({ ok: true, invoice: { id: 'inv-1' } } as never);
  mockInvoiceFindUnique.mockResolvedValue(invoiceRow as never);
  mockInvoiceUpdate.mockResolvedValue({} as never);
  mockCaseUpdate.mockResolvedValue({} as never);
});

describe('POST /api/cases/[id]/r350-admin-invoice', () => {
  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValueOnce(null as never);
    const res = await POST(makeRequest(), { params });
    expect(res.status).toBe(401);
  });

  it('returns 404 when case does not exist', async () => {
    mockAuth.mockResolvedValueOnce(creatorSession as never);
    mockCaseFindUnique.mockResolvedValueOnce(null as never);
    const res = await POST(makeRequest(), { params });
    expect(res.status).toBe(404);
  });

  it('returns 422 for B2B cases', async () => {
    mockAuth.mockResolvedValueOnce(creatorSession as never);
    mockCaseFindUnique.mockResolvedValueOnce({ ...b2cCase, acquisitionType: 'B2B' } as never);
    const res = await POST(makeRequest(), { params });
    expect(res.status).toBe(422);
  });

  it('rejects a staff member who neither created the case nor is Admin/Executive', async () => {
    mockAuth.mockResolvedValueOnce(otherStaffSession as never);
    mockCaseFindUnique.mockResolvedValueOnce(b2cCase as never);
    const res = await POST(makeRequest(), { params });
    expect(res.status).toBe(403);
  });

  it('returns 422 when the client has no email on file', async () => {
    mockAuth.mockResolvedValueOnce(creatorSession as never);
    mockCaseFindUnique.mockResolvedValueOnce({ ...b2cCase, client: { ...b2cCase.client, email: null } } as never);
    const res = await POST(makeRequest(), { params });
    expect(res.status).toBe(422);
  });

  it('defaults to Zenowethu banking (useOwnBanking: false) when no body is sent', async () => {
    mockAuth.mockResolvedValueOnce(creatorSession as never);
    mockCaseFindUnique.mockResolvedValueOnce(b2cCase as never);

    const res = await POST(makeRequest(), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.resent).toBe(false);

    expect(mockCreateR350Invoice).toHaveBeenCalledWith({
      caseId: 'case-1', clientId: 'client-1', reference: '8001015009087', createdById: 'user-1', useOwnBanking: false,
    });
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockInvoiceUpdate).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
      data: { status: 'SENT', sentAt: expect.any(Date), sentTo: 'john@example.com' },
    });
    expect(mockCaseUpdate).toHaveBeenCalledWith({
      where: { id: 'case-1' },
      data: { r350InvoiceId: 'inv-1', r350InvoiceSentAt: expect.any(Date) },
    });
  });

  it('passes useOwnBanking: true through to the invoice creator when explicitly chosen', async () => {
    mockAuth.mockResolvedValueOnce(creatorSession as never);
    mockCaseFindUnique.mockResolvedValueOnce(b2cCase as never);

    const res = await POST(makeRequest({ useOwnBanking: true }), { params });
    expect(res.status).toBe(200);
    expect(mockCreateR350Invoice).toHaveBeenCalledWith({
      caseId: 'case-1', clientId: 'client-1', reference: '8001015009087', createdById: 'user-1', useOwnBanking: true,
    });
  });

  it('bubbles up the 422 error when useOwnBanking is chosen but the creator has no personal banking', async () => {
    mockAuth.mockResolvedValueOnce(creatorSession as never);
    mockCaseFindUnique.mockResolvedValueOnce(b2cCase as never);
    mockCreateR350Invoice.mockResolvedValueOnce({ ok: false, status: 422, error: 'no personal banking' } as never);

    const res = await POST(makeRequest({ useOwnBanking: true }), { params });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('no personal banking');
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('resends the existing invoice without creating a new one when r350InvoiceId is already set', async () => {
    mockAuth.mockResolvedValueOnce(adminSession as never);
    mockCaseFindUnique.mockResolvedValueOnce({ ...b2cCase, r350InvoiceId: 'inv-1', r350InvoiceSentAt: new Date() } as never);

    const res = await POST(makeRequest(), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resent).toBe(true);
    expect(mockCreateR350Invoice).not.toHaveBeenCalled();
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it('returns 502 when email delivery fails', async () => {
    mockAuth.mockResolvedValueOnce(creatorSession as never);
    mockCaseFindUnique.mockResolvedValueOnce(b2cCase as never);
    mockSendEmail.mockResolvedValueOnce({ success: false, error: 'smtp down' } as never);

    const res = await POST(makeRequest(), { params });
    expect(res.status).toBe(502);
    expect(mockInvoiceUpdate).not.toHaveBeenCalled();
    expect(mockCaseUpdate).not.toHaveBeenCalled();
  });
});
