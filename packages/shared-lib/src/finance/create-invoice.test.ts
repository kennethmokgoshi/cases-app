import { describe, it, expect, vi, beforeEach } from 'vitest';

const createMock = vi.fn();
const upsertMock = vi.fn();
const findFirstMock = vi.fn();

vi.mock('@zenowethu/database', () => ({
  Prisma: {},
  prisma: {
    bankAccount: { findFirst: (...a: unknown[]) => findFirstMock(...a) },
    $transaction: async (cb: (tx: unknown) => unknown) =>
      cb({
        documentSequence: { upsert: (...a: unknown[]) => upsertMock(...a) },
        invoice: {
          create: (...a: unknown[]) => createMock(...a),
          findFirst: async () => null,
          findMany: async () => [],
        },
      }),
  },
}));

import { computeInvoiceActorRoles, createInvoiceForUser } from './create-invoice';

const baseInput = {
  type: 'QUOTE' as const,
  lineItems: [{ description: 'Debt review setup', quantity: 1, unitPrice: 500 }],
  dueAt: new Date().toISOString(),
  vatRate: 0.15,
};

describe('computeInvoiceActorRoles', () => {
  it('derives roles from booleans and role/userType strings', () => {
    expect(computeInvoiceActorRoles({ isAdmin: true })).toMatchObject({ isAdmin: true });
    expect(computeInvoiceActorRoles({ role: 'executive' })).toMatchObject({ isExecutive: true });
    expect(computeInvoiceActorRoles({ role: 'finance' })).toMatchObject({ isFinance: true });
    expect(computeInvoiceActorRoles({ userType: 'FINANCE' })).toMatchObject({ isFinance: true });
    expect(computeInvoiceActorRoles({ role: 'manager' })).toMatchObject({ isManager: true });
    expect(computeInvoiceActorRoles({ isSeniorManager: true })).toMatchObject({ isSeniorManager: true });
    expect(computeInvoiceActorRoles({})).toEqual({
      isAdmin: false, isExecutive: false, isFinance: false, isManager: false, isSeniorManager: false,
    });
  });
});

describe('createInvoiceForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findFirstMock.mockResolvedValue({ id: 'bank-default' });
    upsertMock.mockResolvedValue({ prefix: 'QUO', year: new Date().getFullYear(), nextSeq: 2 });
    createMock.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'inv-1', ...data }));
  });

  const noRoles = { isAdmin: false, isExecutive: false, isFinance: false, isManager: false, isSeniorManager: false };
  const adminRoles = { ...noRoles, isAdmin: true };
  const managerRoles = { ...noRoles, isManager: true };

  it('rejects a regular staff member creating an INVOICE (must use QUOTE)', async () => {
    const result = await createInvoiceForUser({ ...baseInput, type: 'INVOICE' }, noRoles, 'user-1');
    expect(result).toEqual({ ok: false, status: 403, error: expect.stringContaining('not permitted to create invoices') });
  });

  it('forces regular staff onto the org default bank account regardless of input', async () => {
    const result = await createInvoiceForUser({ ...baseInput, bankAccountId: 'some-other-bank' }, noRoles, 'user-1');
    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toContain('Staff and Managers can only use default banking details');
  });

  it('allows regular staff to create a QUOTE on the default bank when no override is requested', async () => {
    const result = await createInvoiceForUser(baseInput, noRoles, 'user-1');
    expect(result.ok).toBe(true);
    expect(createMock.mock.calls[0][0].data.bankAccountId).toBe('bank-default');
  });

  it('lets a Manager choose a specific org bank account', async () => {
    const result = await createInvoiceForUser({ ...baseInput, bankAccountId: 'bank-capitec' }, managerRoles, 'user-2');
    expect(result.ok).toBe(true);
    expect(createMock.mock.calls[0][0].data.bankAccountId).toBe('bank-capitec');
  });

  it('rejects useOwnBanking from a non-Admin actor', async () => {
    const result = await createInvoiceForUser({ ...baseInput, useOwnBanking: true }, managerRoles, 'user-2');
    expect(result).toEqual({ ok: false, status: 403, error: expect.stringContaining('Only Admin') });
  });

  it('lets Admin use their own personal banking via useOwnBanking', async () => {
    const result = await createInvoiceForUser({ ...baseInput, useOwnBanking: true }, adminRoles, 'admin-1');
    expect(result.ok).toBe(true);
    expect(createMock.mock.calls[0][0].data.personalBankingUserId).toBe('admin-1');
    expect(createMock.mock.calls[0][0].data.bankAccountId).toBeNull();
  });

  it('fails with 500 when no default bank exists and a regular staff member has no override', async () => {
    findFirstMock.mockResolvedValue(null);
    const result = await createInvoiceForUser(baseInput, noRoles, 'user-1');
    expect(result).toEqual({ ok: false, status: 500, error: expect.stringContaining('No default banking details') });
  });

  it('requires banking details for an INVOICE even when Admin omits everything and no default bank exists', async () => {
    findFirstMock.mockResolvedValue(null);
    const result = await createInvoiceForUser({ ...baseInput, type: 'INVOICE' }, adminRoles, 'admin-1');
    expect(result).toEqual({ ok: false, status: 422, error: expect.stringContaining('Banking details are required') });
  });

  it('computes subtotal/vat/total from line items, applying discounts', async () => {
    await createInvoiceForUser(
      { ...baseInput, lineItems: [{ description: 'A', quantity: 2, unitPrice: 100, discount: 20 }] },
      adminRoles,
      'admin-1',
    );
    const data = createMock.mock.calls[0][0].data;
    expect(Number(data.subtotal)).toBe(180);
    expect(Number(data.vatAmount)).toBeCloseTo(27);
    expect(Number(data.total)).toBeCloseTo(207);
  });
});
