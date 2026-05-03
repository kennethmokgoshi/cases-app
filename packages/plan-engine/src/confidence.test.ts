import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/database', () => ({ prisma: { document: { findMany: vi.fn() } } }));
vi.mock('@zenowethu/shared-lib', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

import { checkConfidence } from './confidence';
import { prisma } from '@zenowethu/database';

describe('checkConfidence', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns score=0 and canProceed=false when no documents', async () => {
    (prisma.document.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const result = await checkConfidence('case-1');
    expect(result.score).toBe(0);
    expect(result.canProceed).toBe(false);
    expect(result.missingRequired).toHaveLength(3);
  });

  it('returns canProceed=true when all required docs present', async () => {
    (prisma.document.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { type: 'CREDIT_REPORT' },
      { type: 'ID' },
      { type: 'POA' },
    ]);
    const result = await checkConfidence('case-1');
    expect(result.canProceed).toBe(true);
    expect(result.score).toBe(90); // 100 - 5 (payslip) - 5 (bank statement)
  });

  it('returns score=100 with all docs including payslip and bank statement', async () => {
    (prisma.document.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { type: 'CREDIT_REPORT' },
      { type: 'ID' },
      { type: 'POA' },
      { type: 'PAYSLIP' },
      { type: 'BANK_STATEMENT' },
    ]);
    const result = await checkConfidence('case-1');
    expect(result.score).toBe(100);
  });

  it('detects Experian credit report (CREDIT_REPORT_EXPERIAN)', async () => {
    (prisma.document.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { type: 'CREDIT_REPORT_EXPERIAN' },
      { type: 'ID' },
      { type: 'POA' },
    ]);
    const result = await checkConfidence('case-1');
    expect(result.canProceed).toBe(true);
    expect(result.presentItems).toContain('CREDIT_REPORT');
  });

  it('detects Experian credit report (CREDIT_REPORT_OTHER)', async () => {
    (prisma.document.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { type: 'CREDIT_REPORT_OTHER' },
      { type: 'ID' },
      { type: 'POA' },
    ]);
    const result = await checkConfidence('case-1');
    expect(result.canProceed).toBe(true);
    expect(result.presentItems).toContain('CREDIT_REPORT');
  });

  it('returns canProceed=false when only ID and POA present (missing credit report)', async () => {
    (prisma.document.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { type: 'ID' },
      { type: 'POA' },
    ]);
    const result = await checkConfidence('case-1');
    expect(result.canProceed).toBe(false);
    expect(result.score).toBe(50); // 100 - 40 (credit report) - 5 (payslip) - 5 (bank statement)
    expect(result.missingRequired).toHaveLength(1);
    expect(result.missingRequired[0].type).toBe('CREDIT_REPORT');
  });

  it('correctly identifies presentItems', async () => {
    (prisma.document.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { type: 'CREDIT_REPORT' },
      { type: 'PASSPORT' },
    ]);
    const result = await checkConfidence('case-1');
    expect(result.presentItems).toContain('CREDIT_REPORT');
    expect(result.presentItems).toContain('ID_DOCUMENT');
  });
});
