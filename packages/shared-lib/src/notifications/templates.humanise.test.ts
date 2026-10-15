import { describe, it, expect } from 'vitest';
import { humaniseServices, emailTextToHtml, stripMarkdownBold, renderTemplate, getTemplateByStatus } from './templates';

describe('humaniseServices', () => {
    it('turns snake_case keys into plain lowercase wording', () => {
        expect(humaniseServices('debt_review_flag_removal')).toBe('debt review flag removal');
    });
    it('title-cases for labels', () => {
        expect(humaniseServices('debt_review_flag_removal', true)).toBe('Debt Review Flag Removal');
    });
    it('joins several services naturally and handles empty input', () => {
        expect(humaniseServices('paid_defaults, paid_judgments, legal_fees')).toBe('paid defaults, paid judgments and legal fees');
        expect(humaniseServices('')).toBe('');
    });
});

describe('email bold handling', () => {
    it('converts **bold** to <strong> in HTML and strips it in text', () => {
        expect(emailTextToHtml('a **b**\nc')).toBe('a <strong>b</strong><br>c');
        expect(stripMarkdownBold('a **b**')).toBe('a b');
    });
});

describe('NEW_LEAD_B2B template', () => {
    it('reads naturally with no raw service key or markdown', () => {
        const t = getTemplateByStatus('NEW_LEAD_B2B')!;
        const body = renderTemplate(t.emailTemplate, {
            clientName: 'Maria', partnerUserName: 'Lesego', mainSource: 'Letsatsi', companyName: 'Zenowethu Debt Management',
            companyShortName: 'Zenowethu', fileNumber: 'ZDM-1', phone: '081 747 7616',
            servicesLower: 'debt review flag removal', servicesTitle: 'Debt Review Flag Removal' });
        expect(body).not.toContain('_');
        expect(body).toContain('application for debt review flag removal');
    });
});

describe('humaniseServices on shouty document types', () => {
    it('cleans BANK_STATEMENT style values', () => {
        expect(humaniseServices('ID, BANK_STATEMENT', true)).toBe('Id and Bank Statement');
    });
});
