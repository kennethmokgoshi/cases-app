import { describe, it, expect } from 'vitest';
import {
    classifyDocumentByFilename,
    mapEnvelopeToMatch,
    classifyScannedFolders,
} from './imap';

describe('IMAP Integration - Document Classification & Match Mapping', () => {
    describe('classifyDocumentByFilename', () => {
        it('classifies Form 17.1 files correctly', () => {
            const result = classifyDocumentByFilename({ filename: 'Form_17.1_Client.pdf' });
            expect(result).toBe('FORM_17_1');
        });

        it('classifies Fee Invoices correctly when filename contains invoice', () => {
            const result = classifyDocumentByFilename({
                filename: 'DC_Fee_Invoice_123.pdf',
                isInvoice: true,
            });
            expect(result).toBe('FEE_INVOICE');
        });

        it('classifies Proof of Payment correctly when filename contains pop', () => {
            const result = classifyDocumentByFilename({
                filename: 'proof_of_payment_bank.pdf',
                isPoP: true,
            });
            expect(result).toBe('PROOF_OF_PAYMENT');
        });

        it('does not classify generic consumer emails as invoices', () => {
            // "consumer" in subject should NOT force an invoice classification
            const result = classifyDocumentByFilename({
                filename: 'Client_Statement_Notice.pdf',
                subject: 'Consumer query regarding account status',
                isInvoice: false,
                isPoP: false,
            });
            expect(result).not.toBe('FEE_INVOICE');
        });

        it('defaults to OTHER for unknown document types', () => {
            const result = classifyDocumentByFilename({ filename: 'random_document.pdf' });
            expect(result).toBe('OTHER');
        });
    });

    describe('mapEnvelopeToMatch', () => {
        it('maps imapflow envelope object to ConsumerEmailMatch format', () => {
            const match = mapEnvelopeToMatch(
                'inbox@zenowethu.co.za',
                {
                    uid: 101,
                    flags: new Set(['\\Seen']),
                    envelope: {
                        messageId: '<msg-123@dc.co.za>',
                        subject: 'DC Fee Invoice for 8501015000088',
                        date: new Date('2026-07-30T10:00:00Z'),
                        from: [{ name: 'Debt Counsellor', address: 'dc@finance.co.za' }],
                        to: [{ name: 'Zenowethu', address: 'inbox@zenowethu.co.za' }],
                    },
                },
                ['ID_NUMBER']
            );

            expect(match.mailbox).toBe('inbox@zenowethu.co.za');
            expect(match.uid).toBe(101);
            expect(match.messageId).toBe('<msg-123@dc.co.za>');
            expect(match.subject).toBe('DC Fee Invoice for 8501015000088');
            expect(match.from).toBe('Debt Counsellor <dc@finance.co.za>');
            expect(match.to).toBe('Zenowethu <inbox@zenowethu.co.za>');
            expect(match.seen).toBe(true);
            expect(match.matchedOn).toEqual(['ID_NUMBER']);
        });
    });

    describe('classifyScannedFolders', () => {
        it('correctly detects inbox and sent folders', () => {
            const result = classifyScannedFolders(['INBOX', 'Sent Items', 'Archive']);
            expect(result.scannedInbox).toBe(true);
            expect(result.scannedSent).toBe(true);
        });

        it('returns false when inbox or sent items are absent', () => {
            const result = classifyScannedFolders(['Junk', 'Trash']);
            expect(result.scannedInbox).toBe(false);
            expect(result.scannedSent).toBe(false);
        });
    });
});
