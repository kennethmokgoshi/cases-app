import { describe, it, expect } from 'vitest';
import {
    FEE_DOCUMENT_TYPES,
    buildFeeDocumentEmail,
    describeFeeTransitionSkip,
    feePaymentCategory,
    getFeeDocumentInfo,
    isFeeDocumentType,
    resolveFeeDocumentTransition,
} from './fee-document-workflow';
import { getStatusByCode } from '../statuses/statuses';

describe('fee document catalogue', () => {
    it('every target status exists in WORKFLOW_STATUSES', () => {
        const codes = [
            'DC_FEE_INVOICE_ISSUED', 'DC_FEE_INVOICE_SENT', 'DC_FEE_PAID_READY_TRANSFER',
            'LEGAL_FEE_INVOICE_ISSUED', 'LEGAL_FEE_INVOICE_SENT', 'LEGAL_FEE_PAID',
            'DC_INVOICE_RECEIVED', 'INVOICE_SENT_CONSUMER',
            'POP_RECEIVED', 'POP_SENT_TO_DC', 'AWAITING_DC_TRANSFER_CONFIRMATION',
        ];
        for (const code of codes) expect(getStatusByCode(code), code).toBeDefined();
    });

    it('recognises only the four fee document types', () => {
        expect(FEE_DOCUMENT_TYPES.map(d => d.type)).toEqual([
            'INVOICE_TO_DC', 'LEGAL_FEE_INVOICE', 'DC_INVOICE_RECEIVED', 'PROOF_OF_PAYMENT',
        ]);
        expect(isFeeDocumentType('PROOF_OF_PAYMENT')).toBe(true);
        expect(isFeeDocumentType('ID')).toBe(false);
        expect(isFeeDocumentType(undefined)).toBe(false);
    });

    it('sends our DC invoice and the proof of payment to the DC, the rest to the consumer', () => {
        expect(getFeeDocumentInfo('INVOICE_TO_DC')?.sendTo).toBe('DC');
        expect(getFeeDocumentInfo('PROOF_OF_PAYMENT')?.sendTo).toBe('DC');
        expect(getFeeDocumentInfo('LEGAL_FEE_INVOICE')?.sendTo).toBe('CONSUMER');
        expect(getFeeDocumentInfo('DC_INVOICE_RECEIVED')?.sendTo).toBe('CONSUMER');
    });

    it('maps payment categories', () => {
        expect(feePaymentCategory('LEGAL_FEE_INVOICE')).toBe('LEGAL_FEE');
        expect(feePaymentCategory('INVOICE_TO_DC')).toBe('DC_FEE_RECOVERY');
    });
});

describe('resolveFeeDocumentTransition', () => {
    const resolve = (docType: string, event: 'UPLOADED' | 'SENT' | 'PAID', currentStatus: string | null) =>
        resolveFeeDocumentTransition({ docType, event, currentStatus });

    it('upload sets the issued/received step for each type', () => {
        expect(resolve('INVOICE_TO_DC', 'UPLOADED', 'REQUESTED_VIA_DHS')).toEqual({ move: true, toStatus: 'DC_FEE_INVOICE_ISSUED' });
        expect(resolve('LEGAL_FEE_INVOICE', 'UPLOADED', 'IN_PROGRESS')).toEqual({ move: true, toStatus: 'LEGAL_FEE_INVOICE_ISSUED' });
        expect(resolve('DC_INVOICE_RECEIVED', 'UPLOADED', 'INVOICE_REQUESTED_DC')).toEqual({ move: true, toStatus: 'DC_INVOICE_RECEIVED' });
        expect(resolve('PROOF_OF_PAYMENT', 'UPLOADED', 'INVOICE_SENT_CONSUMER')).toEqual({ move: true, toStatus: 'POP_RECEIVED' });
    });

    it('send and paid move to the next steps', () => {
        expect(resolve('INVOICE_TO_DC', 'SENT', 'DC_FEE_INVOICE_ISSUED')).toEqual({ move: true, toStatus: 'DC_FEE_INVOICE_SENT' });
        expect(resolve('INVOICE_TO_DC', 'PAID', 'DC_FEE_INVOICE_SENT')).toEqual({ move: true, toStatus: 'DC_FEE_PAID_READY_TRANSFER' });
        expect(resolve('LEGAL_FEE_INVOICE', 'PAID', 'LEGAL_FEE_INVOICE_SENT')).toEqual({ move: true, toStatus: 'LEGAL_FEE_PAID' });
        expect(resolve('DC_INVOICE_RECEIVED', 'SENT', 'DC_INVOICE_RECEIVED')).toEqual({ move: true, toStatus: 'INVOICE_SENT_CONSUMER' });
        expect(resolve('PROOF_OF_PAYMENT', 'SENT', 'POP_RECEIVED')).toEqual({ move: true, toStatus: 'POP_SENT_TO_DC' });
    });

    it('never moves backwards within the same workflow', () => {
        expect(resolve('INVOICE_TO_DC', 'UPLOADED', 'DC_FEE_INVOICE_SENT')).toMatchObject({ move: false, reason: 'ALREADY_AHEAD' });
        expect(resolve('DC_INVOICE_RECEIVED', 'UPLOADED', 'INVSNT_2M')).toMatchObject({ move: false, reason: 'ALREADY_AHEAD' });
        expect(resolve('PROOF_OF_PAYMENT', 'UPLOADED', 'POP_SENT_TO_DC')).toMatchObject({ move: false, reason: 'ALREADY_AHEAD' });
    });

    it('lets an aged invoice-to-consumer case move on when proof of payment arrives', () => {
        expect(resolve('PROOF_OF_PAYMENT', 'UPLOADED', 'INVSNT_3M')).toEqual({ move: true, toStatus: 'POP_RECEIVED' });
    });

    it('never pulls a finished case out of completed/settled/lost', () => {
        expect(resolve('LEGAL_FEE_INVOICE', 'UPLOADED', 'COMPLETED')).toMatchObject({ move: false, reason: 'CASE_FINISHED' });
        expect(resolve('PROOF_OF_PAYMENT', 'UPLOADED', 'SETTLED_SUCCESS')).toMatchObject({ move: false, reason: 'CASE_FINISHED' });
        expect(resolve('INVOICE_TO_DC', 'PAID', 'CANCELLED')).toMatchObject({ move: false, reason: 'CASE_FINISHED' });
    });

    it('reports no-ops and unsupported events', () => {
        expect(resolve('POP_RECEIVED', 'UPLOADED', 'NEW_LEAD')).toMatchObject({ move: false, reason: 'NOT_FEE_DOCUMENT' });
        expect(resolve('PROOF_OF_PAYMENT', 'PAID', 'POP_SENT_TO_DC')).toMatchObject({ move: false, reason: 'EVENT_NOT_ALLOWED' });
        expect(resolve('PROOF_OF_PAYMENT', 'UPLOADED', 'POP_RECEIVED')).toMatchObject({ move: false, reason: 'ALREADY_THERE' });
    });

    it('does not block on an unknown or empty current status', () => {
        expect(resolve('LEGAL_FEE_INVOICE', 'UPLOADED', 'SOME_LEGACY_CODE')).toEqual({ move: true, toStatus: 'LEGAL_FEE_INVOICE_ISSUED' });
        expect(resolve('LEGAL_FEE_INVOICE', 'UPLOADED', null)).toEqual({ move: true, toStatus: 'LEGAL_FEE_INVOICE_ISSUED' });
    });

    it('has a message for every skip reason', () => {
        for (const reason of ['NOT_FEE_DOCUMENT', 'EVENT_NOT_ALLOWED', 'ALREADY_THERE', 'ALREADY_AHEAD', 'CASE_FINISHED'] as const) {
            expect(describeFeeTransitionSkip(reason)).toBeTruthy();
        }
    });
});

describe('buildFeeDocumentEmail', () => {
    const ctx = {
        consumerName: 'John Dlamini',
        consumerIdNumber: '8001015009087',
        fileNumber: 'ZDM-001',
        dcName: 'Jane DC',
        signature: 'Test Co\nNCRDC0000',
    };

    it('addresses DC emails to the DC and includes the consumer reference', () => {
        const { subject, body } = buildFeeDocumentEmail('PROOF_OF_PAYMENT', ctx);
        expect(subject).toContain('8001015009087');
        expect(body.startsWith('Dear Jane DC,')).toBe(true);
        expect(body).toContain('release');
        expect(body).toContain('Kind regards,\n\nTest Co');
    });

    it('addresses consumer emails to the consumer and places the staff note first', () => {
        const { body } = buildFeeDocumentEmail('DC_INVOICE_RECEIVED', { ...ctx, note: 'Please pay by Friday.' });
        expect(body.startsWith('Dear John Dlamini,\n\nPlease pay by Friday.')).toBe(true);
        expect(body).toContain('Jane DC');
    });

    it('falls back to a generic DC greeting', () => {
        const { body } = buildFeeDocumentEmail('INVOICE_TO_DC', { ...ctx, dcName: null });
        expect(body.startsWith('Dear Debt Counsellor,')).toBe(true);
    });
});
