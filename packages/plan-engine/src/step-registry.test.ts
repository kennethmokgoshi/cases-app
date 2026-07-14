import { describe, it, expect, vi } from 'vitest';

// The action modules pull in heavy runtime deps (Prisma, GHL, Puppeteer DHS) —
// mock them so this test only exercises registration wiring.
vi.mock('@zenowethu/database', () => ({ prisma: {} }));
vi.mock('@zenowethu/shared-lib', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  sendManualMessage: vi.fn(),
  getTemplateByStatus: vi.fn(),
  renderTemplate: vi.fn(),
  getGHLCredentials: vi.fn(),
  GhlSmsProvider: vi.fn(),
  GhlEmailProvider: vi.fn(),
  GhlWhatsAppProvider: vi.fn(),
}));
vi.mock('@zenowethu/shared-lib/src/dhs', () => ({
  requestTransfer: vi.fn(),
  closeBrowser: vi.fn(),
}));

import { stepRegistry } from './step-registry';

/** Every actionType the planner prompt tells the AI it may emit (see planner.ts). */
const PLANNER_VALID_ACTION_TYPES = [
  'DHS_SEARCH',
  'DHS_TRANSFER_REQUEST',
  'REQUEST_FILE_FROM_DC',
  'STATUS_UPDATE',
  'DOCUMENT_REQUEST_CLIENT',
  'PRESCRIPTION_CHECK',
  'DRAFT_PRESCRIPTION_LETTER',
  'SEND_PRESCRIPTION_LETTER',
  'DRAFT_LEGAL_LETTER',
  'SEND_LEGAL_LETTER',
  'BUREAU_DISPUTE',
  'INSURANCE_ASSESSMENT',
  'DRAFT_CANCELLATION_LETTER',
  'SEND_CANCELLATION_LETTER',
  'OPEN_FORENSIC_AUDIT',
  'RECKLESS_LENDING_ASSESSMENT',
  'GENERATE_INVOICE',
  'GHL_SEND_SMS',
  'GHL_SEND_EMAIL',
  'GHL_SEND_WHATSAPP',
  'GHL_WAIT_DOCUMENT',
  'GHL_WAIT_REPLY',
  'NCT_STATUS_CHECK',
] as const;

describe('stepRegistry action registration', () => {
  // Regression: "sideEffects": false let bundlers drop the old side-effect-only
  // action imports, shipping an empty registry — every plan step then failed
  // with "No handler for: <actionType>". Registration is now explicit.
  it.each(PLANNER_VALID_ACTION_TYPES)('registers a handler for %s', (actionType) => {
    expect(stepRegistry.isRegistered(actionType)).toBe(true);
  });

  it('returns a failing fallback handler (not a throw) for unknown action types', async () => {
    const handler = stepRegistry.getAction('NOT_A_REAL_ACTION' as never);
    const result = await handler({} as never);
    expect(result.success).toBe(false);
    expect(result.error).toContain('No handler for');
  });
});
