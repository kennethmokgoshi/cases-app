/**
 * Bureau-specific document types (CREDIT_REPORT_EXPERIAN, CREDIT_REPORT_XDS, etc.) all use
 * the same underlying AI prompts as the generic CREDIT_REPORT / CREDIT_REPORT_OTHER keys —
 * there is no separate prompt per bureau. This maps a document's stored `type` onto the
 * prompt key `analyzeDocument()` understands, without renaming the document itself.
 */
export function resolveCreditReportPromptType(docType: string): 'CREDIT_REPORT' | 'CREDIT_REPORT_OTHER' {
    const t = (docType || '').toUpperCase();
    if (t === 'CREDIT_REPORT_OTHER' || t === 'CLEAR_SCORE' || t === 'KUDOUGH') {
        return 'CREDIT_REPORT_OTHER';
    }
    return 'CREDIT_REPORT';
}
