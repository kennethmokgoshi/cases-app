import { describe, it, expect } from 'vitest';
import { generateCourtDoc, COURT_DOC_LABELS, COURT_DOC_DESCRIPTIONS, type CourtDocInput } from './court-doc-pdf';

describe('Court Documents PDF Generator', () => {
  const mockInput: CourtDocInput = {
    fileNumber: 'ZEN-2026-001',
    courtName: 'High Court of South Africa',
    courtCaseNumber: '12345/2026',
    clientFullName: 'John Doe',
    clientIdNumber: '1234567890123',
    clientAddress: '123 Main Street, Pretoria, 0001',
    clientPhone: '+27 12 345 6789',
    clientEmail: 'john@example.com',
    creditAccounts: [
      {
        creditorName: 'Bank A',
        accountNumber: 'ACC001',
        accountType: 'Loan',
        outstandingBalance: 50000,
        monthlyInstalment: 1500,
        status: 'ACTIVE',
        isPrescribed: false,
        hasPaidUpLetter: false,
      },
      {
        creditorName: 'Bank B',
        accountNumber: 'ACC002',
        accountType: 'Credit Card',
        outstandingBalance: 25000,
        monthlyInstalment: 500,
        status: 'CLOSED',
        isPrescribed: false,
        hasPaidUpLetter: true,
        paidUpDate: '2026-01-15',
      },
    ],
    generatedBy: 'Test User',
  };

  it('should generate Notice of Motion', async () => {
    const pdf = await generateCourtDoc('NOTICE_OF_MOTION', mockInput);
    expect(pdf).toBeInstanceOf(Uint8Array);
    expect(pdf.length).toBeGreaterThan(0);
    // PDF magic number check
    expect(pdf[0]).toBe(0x25); // %
    expect(pdf[1]).toBe(0x50); // P
    expect(pdf[2]).toBe(0x44); // D
    expect(pdf[3]).toBe(0x46); // F
  });

  it('should generate Founding Affidavit', async () => {
    const pdf = await generateCourtDoc('FOUNDING_AFFIDAVIT', mockInput);
    expect(pdf).toBeInstanceOf(Uint8Array);
    expect(pdf.length).toBeGreaterThan(0);
    expect(pdf[0]).toBe(0x25); // PDF magic
  });

  it('should generate Notice of Set Down', async () => {
    const pdf = await generateCourtDoc('NOTICE_OF_SET_DOWN', mockInput);
    expect(pdf).toBeInstanceOf(Uint8Array);
    expect(pdf.length).toBeGreaterThan(0);
    expect(pdf[0]).toBe(0x25); // PDF magic
  });

  it('should generate Notice of Motion Rescission', async () => {
    const pdf = await generateCourtDoc('NOTICE_OF_MOTION_RESCISSION', mockInput);
    expect(pdf).toBeInstanceOf(Uint8Array);
    expect(pdf.length).toBeGreaterThan(0);
    expect(pdf[0]).toBe(0x25); // PDF magic
  });

  it('should generate Court Order Granted', async () => {
    const pdf = await generateCourtDoc('COURT_ORDER_GRANTED', mockInput);
    expect(pdf).toBeInstanceOf(Uint8Array);
    expect(pdf.length).toBeGreaterThan(0);
    expect(pdf[0]).toBe(0x25); // PDF magic
  });

  it('should generate Proof of Service', async () => {
    const pdf = await generateCourtDoc('PROOF_OF_SERVICE', mockInput);
    expect(pdf).toBeInstanceOf(Uint8Array);
    expect(pdf.length).toBeGreaterThan(0);
    expect(pdf[0]).toBe(0x25); // PDF magic
  });

  it('should handle minimal input (no optional fields)', async () => {
    const minimalInput: CourtDocInput = {
      fileNumber: 'ZEN-2026-MIN',
      clientFullName: 'Jane Smith',
      clientIdNumber: '9876543210987',
    };
    const pdf = await generateCourtDoc('NOTICE_OF_MOTION', minimalInput);
    expect(pdf).toBeInstanceOf(Uint8Array);
    expect(pdf.length).toBeGreaterThan(0);
  });

  it('should handle joint client', async () => {
    const jointInput: CourtDocInput = {
      ...mockInput,
      jointClientFullName: 'Mary Doe',
      jointClientIdNumber: '1111111111111',
    };
    const pdf = await generateCourtDoc('FOUNDING_AFFIDAVIT', jointInput);
    expect(pdf).toBeInstanceOf(Uint8Array);
    expect(pdf.length).toBeGreaterThan(0);
  });

  it('should have correct labels for all document types', () => {
    expect(COURT_DOC_LABELS.NOTICE_OF_MOTION).toBe('Notice of Motion');
    expect(COURT_DOC_LABELS.FOUNDING_AFFIDAVIT).toBe('Founding Affidavit');
    expect(COURT_DOC_LABELS.NOTICE_OF_SET_DOWN).toBe('Notice of Set Down');
    expect(COURT_DOC_LABELS.NOTICE_OF_MOTION_RESCISSION).toBe('Notice of Motion — Rescission');
    expect(COURT_DOC_LABELS.COURT_ORDER_GRANTED).toBe('Court Order Granted');
    expect(COURT_DOC_LABELS.PROOF_OF_SERVICE).toBe('Proof of Service');
  });

  it('should have descriptions for all document types', () => {
    expect(COURT_DOC_DESCRIPTIONS.NOTICE_OF_MOTION).toBeDefined();
    expect(COURT_DOC_DESCRIPTIONS.FOUNDING_AFFIDAVIT).toBeDefined();
    expect(COURT_DOC_DESCRIPTIONS.NOTICE_OF_SET_DOWN).toBeDefined();
    expect(COURT_DOC_DESCRIPTIONS.NOTICE_OF_MOTION_RESCISSION).toBeDefined();
    expect(COURT_DOC_DESCRIPTIONS.COURT_ORDER_GRANTED).toBeDefined();
    expect(COURT_DOC_DESCRIPTIONS.PROOF_OF_SERVICE).toBeDefined();
  });

  it('should throw error for unknown document type', async () => {
    await expect(
      generateCourtDoc('UNKNOWN_TYPE' as any, mockInput)
    ).rejects.toThrow('Unknown court document type');
  });

  it('should generate valid PDFs with prescribed accounts', async () => {
    const prescribedInput: CourtDocInput = {
      ...mockInput,
      creditAccounts: [
        {
          creditorName: 'Old Creditor',
          accountNumber: 'OLD001',
          accountType: 'Personal Loan',
          outstandingBalance: 10000,
          status: 'ACTIVE',
          isPrescribed: true,
          hasPaidUpLetter: false,
        },
      ],
    };
    const pdf = await generateCourtDoc('NOTICE_OF_MOTION', prescribedInput);
    expect(pdf).toBeInstanceOf(Uint8Array);
    expect(pdf.length).toBeGreaterThan(0);
  });
});
