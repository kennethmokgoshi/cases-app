import { describe, it, expect } from 'vitest';
import { getMissingDocsStatus } from './ConfidenceReport';
import type { ConfidenceReport as ConfidenceReportType } from '@zenowethu/plan-engine';

describe('getMissingDocsStatus', () => {
  const mockConfidenceBase: ConfidenceReportType = {
    score: 100,
    canProceed: true,
    missingRequired: [],
    missingOptional: [],
    presentItems: [],
  };

  describe('with confidence presentItems (fallback)', () => {
    it('returns missing when ID or POA or Credit Report is missing from presentItems', () => {
      const confidence: ConfidenceReportType = {
        ...mockConfidenceBase,
        presentItems: ['ID_DOCUMENT'], // missing POA and CREDIT_REPORT
      };

      const status = getMissingDocsStatus(confidence);
      expect(status.isMissingIdPoa).toBe(true);
      expect(status.isMissingCreditReport).toBe(true);
    });

    it('returns not missing when all are present in presentItems', () => {
      const confidence: ConfidenceReportType = {
        ...mockConfidenceBase,
        presentItems: ['ID_DOCUMENT', 'POA', 'CREDIT_REPORT'],
      };

      const status = getMissingDocsStatus(confidence);
      expect(status.isMissingIdPoa).toBe(false);
      expect(status.isMissingCreditReport).toBe(false);
    });

    it('identifies variant document types in presentItems', () => {
      const confidence: ConfidenceReportType = {
        ...mockConfidenceBase,
        presentItems: ['ID', 'ZENOWETHU_POA', 'CREDIT_REPORT_TRANSUNION'],
      };

      const status = getMissingDocsStatus(confidence);
      expect(status.isMissingIdPoa).toBe(false);
      expect(status.isMissingCreditReport).toBe(false);
    });
  });

  describe('with uploadedDocTypes overrides', () => {
    it('ignores presentItems and checks uploadedDocTypes list directly', () => {
      const confidence: ConfidenceReportType = {
        ...mockConfidenceBase,
        presentItems: [], // empty presentItems
      };

      const uploadedDocTypes = ['PASSPORT', 'ZENOWETHU_POA', 'CREDIT_REPORT_EXPERIAN'];
      const status = getMissingDocsStatus(confidence, uploadedDocTypes);
      expect(status.isMissingIdPoa).toBe(false);
      expect(status.isMissingCreditReport).toBe(false);
    });

    it('returns missing when document type is missing from uploadedDocTypes', () => {
      const confidence: ConfidenceReportType = {
        ...mockConfidenceBase,
        presentItems: ['ID_DOCUMENT', 'POA', 'CREDIT_REPORT'], // present in fallback
      };

      // but overridden as empty in uploadedDocTypes
      const status = getMissingDocsStatus(confidence, []);
      expect(status.isMissingIdPoa).toBe(true);
      expect(status.isMissingCreditReport).toBe(true);
    });
  });
});
