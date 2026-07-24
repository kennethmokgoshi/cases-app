import { describe, expect, it } from 'vitest';
import { formatImapConnectionError, mapEnvelopeToMatch, classifyDocumentByFilename, isDocTypeInGroup, getEmailBodyText, classifyScannedFolders } from './imap';
import { vi } from 'vitest';

describe('formatImapConnectionError', () => {
    it('adds the Gmail app-password guidance when ImapFlow only reports Command failed', () => {
        const error = Object.assign(new Error('Command failed'), {
            responseText: 'Application-specific password required',
        });

        expect(formatImapConnectionError(error, { host: 'imap.gmail.com', username: 'zenowethu@gmail.com' }))
            .toContain('Gmail IMAP does not accept the normal Gmail login password here');
    });

    it('keeps useful provider details for non-Gmail authentication failures', () => {
        const error = Object.assign(new Error('Authentication failed'), {
            responseText: 'Invalid mailbox credentials',
        });

        expect(formatImapConnectionError(error, { host: 'mail.zenowethu.co.za', username: 'transfers@zenowethu.co.za' }))
            .toBe('Authentication failed - Invalid mailbox credentials - Check the mailbox email address and saved password.');
    });
});

describe('mapEnvelopeToMatch', () => {
    it('flattens envelope address lists and flags', () => {
        const match = mapEnvelopeToMatch(
            'ops@zenowethu.co.za',
            {
                uid: 42,
                flags: new Set(['\\Seen']),
                envelope: {
                    messageId: '<abc@mail>',
                    subject: 'Re: Transfer request',
                    date: new Date('2026-07-10T08:30:00.000Z'),
                    from: [{ name: 'Debt Counsellor', address: 'dc@firm.co.za' }],
                    to: [{ address: 'ops@zenowethu.co.za' }],
                },
            },
            ['ID_NUMBER'],
        );

        expect(match.uid).toBe(42);
        expect(match.from).toBe('Debt Counsellor <dc@firm.co.za>');
        expect(match.to).toBe('ops@zenowethu.co.za');
        expect(match.subject).toBe('Re: Transfer request');
        expect(match.seen).toBe(true);
        expect(match.date).toBe('2026-07-10T08:30:00.000Z');
        expect(match.matchedOn).toEqual(['ID_NUMBER']);
        expect(match.mailbox).toBe('ops@zenowethu.co.za');
    });

    it('falls back gracefully when envelope fields are missing', () => {
        const match = mapEnvelopeToMatch('ops@zenowethu.co.za', { uid: 7 }, ['NAME']);
        expect(match.subject).toBe('(no subject)');
        expect(match.from).toBe('');
        expect(match.seen).toBe(false);
        expect(match.date).toBeNull();
        expect(match.messageId).toBeNull();
    });

    it('marks unseen messages as new', () => {
        const match = mapEnvelopeToMatch(
            'ops@zenowethu.co.za',
            { uid: 9, flags: new Set(), envelope: { subject: 'New mail' } },
            ['ID_NUMBER', 'NAME'],
        );
        expect(match.seen).toBe(false);
        expect(match.matchedOn).toEqual(['ID_NUMBER', 'NAME']);
    });
});

describe('classifyDocumentByFilename', () => {
    it('classifies documents correctly based on filename keywords', () => {
        expect(classifyDocumentByFilename({ filename: 'Form 17.1 (Signed).pdf' })).toBe('FORM_17_1');
        expect(classifyDocumentByFilename({ filename: 'Form 17.2 Transfer.pdf' })).toBe('FORM_17_2');
        expect(classifyDocumentByFilename({ filename: 'Form_17_7_transfer.pdf' })).toBe('FORM_17_7');
        expect(classifyDocumentByFilename({ filename: 'Form-17-7.pdf' })).toBe('FORM_17_7');
        expect(classifyDocumentByFilename({ filename: 'Client_Form17W.pdf' })).toBe('FORM_17W');
        expect(classifyDocumentByFilename({ filename: 'Form 16 Application.pdf' })).toBe('FORM_16');
        expect(classifyDocumentByFilename({ filename: 'Court Order Granted.pdf' })).toBe('COURT_ORDER');
        expect(classifyDocumentByFilename({ filename: 'TransUnion_CreditReport.pdf' })).toBe('CREDIT_REPORT_TRANSUNION');
        expect(classifyDocumentByFilename({ filename: 'Experian_report_client.pdf' })).toBe('CREDIT_REPORT_EXPERIAN');
        expect(classifyDocumentByFilename({ filename: 'XDS Credit Profile.pdf' })).toBe('CREDIT_REPORT_XDS');
        expect(classifyDocumentByFilename({ filename: 'Lightstone_valuation_report.pdf' })).toBe('CREDIT_REPORT_LIGHTSTONE');
        expect(classifyDocumentByFilename({ filename: 'CreditReport.pdf' })).toBe('CREDIT_REPORT');
        expect(classifyDocumentByFilename({ filename: 'Identity Document copy.pdf' })).toBe('ID');
        expect(classifyDocumentByFilename({ filename: 'signed-poa.pdf' })).toBe('ZENOWETHU_POA');
        expect(classifyDocumentByFilename({ filename: 'June_Payslip.pdf' })).toBe('PAYSLIP');
        expect(classifyDocumentByFilename({ filename: 'bank statement 3 months.pdf' })).toBe('BANK_STATEMENT');
        expect(classifyDocumentByFilename({ filename: 'utility_municipal_bill.pdf' })).toBe('PROOF_OF_RESIDENCE');
        expect(classifyDocumentByFilename({ filename: 'Paid_up_letter_ABSA.pdf' })).toBe('PAID_UP_LETTER');
        expect(classifyDocumentByFilename({ filename: 'fees-invoice.pdf', isInvoice: true })).toBe('FEE_INVOICE');
        expect(classifyDocumentByFilename({ filename: 'proof-of-payment.pdf', isPoP: true })).toBe('PROOF_OF_PAYMENT');
        expect(classifyDocumentByFilename({ filename: 'arbitrary_doc.pdf' })).toBe('OTHER');
    });

    it('falls back to isInvoice or isPoP when keywords do not match', () => {
        expect(classifyDocumentByFilename({ filename: 'arbitrary_doc.pdf', isInvoice: true })).toBe('FEE_INVOICE');
        expect(classifyDocumentByFilename({ filename: 'arbitrary_doc.pdf', isPoP: true })).toBe('PROOF_OF_PAYMENT');
    });
});

describe('classifyScannedFolders', () => {
    it('detects inbox and sent folders across common naming conventions', () => {
        expect(classifyScannedFolders(['INBOX', '[Gmail]/Sent Mail'])).toEqual({
            scannedInbox: true,
            scannedSent: true,
            folders: ['INBOX', '[Gmail]/Sent Mail'],
        });
        expect(classifyScannedFolders(['Inbox', 'Sent Items'])).toMatchObject({ scannedInbox: true, scannedSent: true });
        expect(classifyScannedFolders(['INBOX'])).toMatchObject({ scannedInbox: true, scannedSent: false });
        expect(classifyScannedFolders(['Archive', 'Drafts'])).toMatchObject({ scannedInbox: false, scannedSent: false });
        expect(classifyScannedFolders([])).toMatchObject({ scannedInbox: false, scannedSent: false });
    });
});

describe('isDocTypeInGroup', () => {
    it('verifies doc type membership in groups correctly', () => {
        expect(isDocTypeInGroup('ID', 'ID_POA')).toBe(true);
        expect(isDocTypeInGroup('ZENOWETHU_POA', 'ID_POA')).toBe(true);
        expect(isDocTypeInGroup('FORM_17_1', 'ID_POA')).toBe(false);

        expect(isDocTypeInGroup('CREDIT_REPORT_TRANSUNION', 'CREDIT_REPORT')).toBe(true);
        expect(isDocTypeInGroup('CREDIT_REPORT', 'CREDIT_REPORT')).toBe(true);
        expect(isDocTypeInGroup('ID', 'CREDIT_REPORT')).toBe(false);

        expect(isDocTypeInGroup('FEE_INVOICE', 'DC_INVOICE')).toBe(true);
        expect(isDocTypeInGroup('DC_FEE_INVOICE', 'DC_INVOICE')).toBe(true);
        expect(isDocTypeInGroup('PROOF_OF_PAYMENT', 'DC_INVOICE')).toBe(false);

        expect(isDocTypeInGroup('PROOF_OF_PAYMENT', 'POP')).toBe(true);
        expect(isDocTypeInGroup('PAID_UP_LETTER', 'PAID_UP')).toBe(true);

        expect(isDocTypeInGroup('FORM_16', 'DEBT_REVIEW_FORMS')).toBe(true);
        expect(isDocTypeInGroup('FORM_17_1', 'DEBT_REVIEW_FORMS')).toBe(true);
        expect(isDocTypeInGroup('FORM_17_2', 'DEBT_REVIEW_FORMS')).toBe(true);
        expect(isDocTypeInGroup('FORM_17_7', 'DEBT_REVIEW_FORMS')).toBe(true);
        expect(isDocTypeInGroup('FORM_17W', 'DEBT_REVIEW_FORMS')).toBe(true);
        expect(isDocTypeInGroup('COURT_ORDER', 'DEBT_REVIEW_FORMS')).toBe(true);
        expect(isDocTypeInGroup('ID', 'DEBT_REVIEW_FORMS')).toBe(false);

        expect(isDocTypeInGroup('ANYTHING', 'ALL')).toBe(true);
        expect(isDocTypeInGroup('ANYTHING', undefined)).toBe(true);
    });
});

describe('getEmailBodyText', () => {
    it('downloads and returns text/plain part content', async () => {
        const mockClient = {
            download: vi.fn().mockResolvedValue({
                content: (async function* () {
                    yield 'Hello World';
                })()
            })
        } as any;

        const bodyStructure = {
            part: '1',
            contentType: 'text/plain'
        };

        const result = await getEmailBodyText(mockClient, 42, bodyStructure);
        expect(result).toBe('Hello World');
        expect(mockClient.download).toHaveBeenCalledWith(42, '1', { uid: true });
    });

    it('prefers text/plain over text/html and strips html tags', async () => {
        const mockClient = {
            download: vi.fn().mockImplementation((uid, part) => {
                if (part === '1.2') {
                    return {
                        content: (async function* () {
                            yield '<p>HTML Content</p>';
                        })()
                    };
                }
                return {
                    content: (async function* () {
                        yield 'Plain text content';
                    })()
                };
            })
        } as any;

        const bodyStructure = {
            part: '1',
            contentType: 'multipart/alternative',
            childNodes: [
                { part: '1.1', contentType: 'text/plain' },
                { part: '1.2', contentType: 'text/html' }
            ]
        };

        const result = await getEmailBodyText(mockClient, 42, bodyStructure);
        expect(result).toBe('Plain text content');
        expect(mockClient.download).toHaveBeenCalledWith(42, '1.1', { uid: true });
    });

    it('falls back to text/html and strips tags if no plain text part is found', async () => {
        const mockClient = {
            download: vi.fn().mockResolvedValue({
                content: (async function* () {
                    yield '<div><p>Hello <b>World</b></p><style>body {color: red;}</style></div>';
                })()
            })
        } as any;

        const bodyStructure = {
            part: '1',
            contentType: 'text/html'
        };

        const result = await getEmailBodyText(mockClient, 42, bodyStructure);
        expect(result).toBe('Hello World');
        expect(mockClient.download).toHaveBeenCalledWith(42, '1', { uid: true });
    });
});
