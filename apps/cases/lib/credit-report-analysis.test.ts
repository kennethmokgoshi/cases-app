import { describe, expect, it } from 'vitest';
import { resolveCreditReportPromptType } from './credit-report-analysis';

describe('resolveCreditReportPromptType', () => {
    it('maps major bureau types to CREDIT_REPORT', () => {
        expect(resolveCreditReportPromptType('CREDIT_REPORT')).toBe('CREDIT_REPORT');
        expect(resolveCreditReportPromptType('CREDIT_REPORT_EXPERIAN')).toBe('CREDIT_REPORT');
        expect(resolveCreditReportPromptType('CREDIT_REPORT_XDS')).toBe('CREDIT_REPORT');
        expect(resolveCreditReportPromptType('CREDIT_REPORT_TRANSUNION')).toBe('CREDIT_REPORT');
        expect(resolveCreditReportPromptType('CREDIT_REPORT_LIGHTSTONE')).toBe('CREDIT_REPORT');
    });

    it('maps alternative bureau types to CREDIT_REPORT_OTHER', () => {
        expect(resolveCreditReportPromptType('CREDIT_REPORT_OTHER')).toBe('CREDIT_REPORT_OTHER');
        expect(resolveCreditReportPromptType('CLEAR_SCORE')).toBe('CREDIT_REPORT_OTHER');
        expect(resolveCreditReportPromptType('KUDOUGH')).toBe('CREDIT_REPORT_OTHER');
    });

    it('is case-insensitive', () => {
        expect(resolveCreditReportPromptType('credit_report_experian')).toBe('CREDIT_REPORT');
        expect(resolveCreditReportPromptType('clear_score')).toBe('CREDIT_REPORT_OTHER');
    });

    it('defaults unknown/empty types to CREDIT_REPORT', () => {
        expect(resolveCreditReportPromptType('')).toBe('CREDIT_REPORT');
        expect(resolveCreditReportPromptType('SOMETHING_ELSE')).toBe('CREDIT_REPORT');
    });
});
