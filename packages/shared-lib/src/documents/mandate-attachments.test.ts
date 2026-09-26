import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDb = vi.hoisted(() => ({
    document: {
        findMany: vi.fn(),
    },
}));

vi.mock('@zenowethu/database', () => ({ prisma: mockDb }));

const mockReadOwnUpload = vi.hoisted(() => vi.fn());
vi.mock('./upload-paths', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./upload-paths')>()),
    readOwnUpload: mockReadOwnUpload,
}));

import {
    buildMandateAttachments,
    pickMandateDocument,
    mandateAttachedLabel,
    describeMandateOutcome,
    withAuthorityLine,
    resolveMandateAttachments,
    loadMandateFiles,
    MANDATE_POA_TYPES,
    MANDATE_ID_TYPES,
    type MandateDocument,
} from './mandate-attachments';

const BASE = 'https://cases.zenowethu.co.za';

const doc = (over: Partial<MandateDocument> = {}): MandateDocument => ({
    type: 'POA',
    fileName: 'poa.pdf',
    fileUrl: '/uploads/poa.pdf',
    uploadedAt: new Date('2026-01-01'),
    verificationStatus: 'NOT_CHECKED',
    isAdminOnly: false,
    ...over,
});

describe('buildMandateAttachments', () => {
    it('attaches the signed POA and the ID copy, POA first', () => {
        const result = buildMandateAttachments(
            [
                doc({ type: 'ID', fileUrl: '/uploads/id.pdf' }),
                doc({ type: 'POA', fileUrl: '/uploads/poa.pdf' }),
            ],
            BASE
        );

        expect(result.attachments).toEqual([
            'https://cases.zenowethu.co.za/uploads/poa.pdf',
            'https://cases.zenowethu.co.za/uploads/id.pdf',
        ]);
        expect(result.complete).toBe(true);
        expect(result.missing).toEqual([]);
        expect(result.summary).toBe('signed POA + ID copy attached');
    });

    it('reports the gap when the case has no POA', () => {
        const result = buildMandateAttachments([doc({ type: 'ID', fileUrl: '/uploads/id.pdf' })], BASE);

        expect(result.attachments).toEqual(['https://cases.zenowethu.co.za/uploads/id.pdf']);
        expect(result.complete).toBe(false);
        expect(result.missing).toEqual(['POA']);
        expect(result.summary).toContain('signed POA MISSING');
    });

    it('reports both gaps and attaches nothing for a case with neither', () => {
        const result = buildMandateAttachments([doc({ type: 'PAYSLIP' })], BASE);

        expect(result.attachments).toEqual([]);
        expect(result.missing).toEqual(['POA', 'ID']);
        expect(result.summary).toBe('No signed POA or ID copy on file — nothing attached');
    });

    it('recognises the referrer portal document labels', () => {
        const result = buildMandateAttachments(
            [
                doc({ type: 'POWER_OF_ATTORNEY', fileUrl: '/uploads/portal-poa.pdf' }),
                doc({ type: 'ID_DOCUMENT', fileUrl: '/uploads/portal-id.pdf' }),
            ],
            BASE
        );

        expect(result.complete).toBe(true);
        expect(result.attachments).toHaveLength(2);
    });

    it('leaves an already-absolute URL alone', () => {
        const result = buildMandateAttachments(
            [doc({ fileUrl: 'https://cdn.example.com/poa.pdf' })],
            BASE
        );

        expect(result.attachments).toEqual(['https://cdn.example.com/poa.pdf']);
    });

    it('does not double the slash when the base URL has a trailing one', () => {
        const result = buildMandateAttachments([doc()], 'https://cases.zenowethu.co.za/');

        expect(result.attachments).toEqual(['https://cases.zenowethu.co.za/uploads/poa.pdf']);
    });
});

describe('pickMandateDocument', () => {
    it('never attaches a document belonging to another consumer', () => {
        const picked = pickMandateDocument(
            [doc({ verificationStatus: 'MISMATCH', fileUrl: '/uploads/someone-else.pdf' })],
            MANDATE_POA_TYPES
        );

        expect(picked).toBeNull();
    });

    it('prefers a verified copy over an unverified one', () => {
        const picked = pickMandateDocument(
            [
                doc({ verificationStatus: 'UNVERIFIED', fileUrl: '/uploads/scan.pdf', uploadedAt: new Date('2026-06-01') }),
                doc({ verificationStatus: 'VERIFIED', fileUrl: '/uploads/verified.pdf', uploadedAt: new Date('2026-01-01') }),
            ],
            MANDATE_POA_TYPES
        );

        expect(picked?.fileUrl).toBe('/uploads/verified.pdf');
    });

    it('still attaches an unverified copy when it is the only one', () => {
        const picked = pickMandateDocument(
            [doc({ verificationStatus: 'UNVERIFIED', fileUrl: '/uploads/only.pdf' })],
            MANDATE_POA_TYPES
        );

        expect(picked?.fileUrl).toBe('/uploads/only.pdf');
    });

    it('prefers the newest copy when verification is equal', () => {
        const picked = pickMandateDocument(
            [
                doc({ fileUrl: '/uploads/old.pdf', uploadedAt: new Date('2026-01-01') }),
                doc({ fileUrl: '/uploads/new.pdf', uploadedAt: new Date('2026-08-01') }),
            ],
            MANDATE_POA_TYPES
        );

        expect(picked?.fileUrl).toBe('/uploads/new.pdf');
    });

    it('prefers a staff-visible copy over an admin-only one', () => {
        const picked = pickMandateDocument(
            [
                doc({ isAdminOnly: true, fileUrl: '/uploads/admin.pdf', uploadedAt: new Date('2026-08-01') }),
                doc({ isAdminOnly: false, fileUrl: '/uploads/normal.pdf', uploadedAt: new Date('2026-01-01') }),
            ],
            MANDATE_POA_TYPES
        );

        expect(picked?.fileUrl).toBe('/uploads/normal.pdf');
    });

    it('ignores a row with no file URL', () => {
        expect(pickMandateDocument([doc({ fileUrl: '' })], MANDATE_POA_TYPES)).toBeNull();
    });

    it('matches only the requested kind', () => {
        expect(pickMandateDocument([doc({ type: 'POA' })], MANDATE_ID_TYPES)).toBeNull();
    });
});

describe('mandateAttachedLabel', () => {
    it('names both documents when both attached', () => {
        expect(mandateAttachedLabel({ poa: doc(), id: doc({ type: 'ID' }) })).toBe(
            'signed Power of Attorney and identity document'
        );
    });

    it('names only what actually attached', () => {
        expect(mandateAttachedLabel({ poa: doc(), id: null })).toBe('signed Power of Attorney');
        expect(mandateAttachedLabel({ poa: null, id: doc({ type: 'ID' }) })).toBe('identity document');
    });

    it('claims nothing when nothing attached', () => {
        expect(mandateAttachedLabel({ poa: null, id: null })).toBeNull();
    });
});

describe('withAuthorityLine', () => {
    it('inserts the authority sentence ahead of the sign-off', () => {
        const body = withAuthorityLine('Dear DC,\n\nPlease send the invoice.\n\nThank you,\nZenowethu', 'signed Power of Attorney');

        expect(body).toContain('please find attached our client\'s signed Power of Attorney.');
        expect(body.indexOf('please find attached')).toBeLessThan(body.indexOf('Thank you,'));
    });

    it('appends when there is no recognisable sign-off', () => {
        const body = withAuthorityLine('Dear DC,\n\nPlease send the invoice.', 'identity document');

        expect(body.endsWith('please find attached our client\'s identity document.')).toBe(true);
    });

    it('leaves the body untouched when nothing attached', () => {
        const original = 'Dear DC,\n\nPlease send the invoice.\n\nThank you,\nZenowethu';

        expect(withAuthorityLine(original, null)).toBe(original);
    });
});

describe('describeMandateOutcome', () => {
    it('reports the summary when every attachment delivered', () => {
        const mandate = buildMandateAttachments([doc(), doc({ type: 'ID', fileUrl: '/uploads/id.pdf' })], BASE);

        expect(describeMandateOutcome(mandate)).toBe('signed POA + ID copy attached');
    });

    it('flags an attachment the provider could not deliver', () => {
        const mandate = buildMandateAttachments([doc()], BASE);

        expect(describeMandateOutcome(mandate, ['poa.pdf (HTTP 404)'])).toContain('NOT delivered: poa.pdf (HTTP 404)');
    });
});

describe('resolveMandateAttachments', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('queries only mandate document types and builds the attachment set', async () => {
        mockDb.document.findMany.mockResolvedValue([
            doc({ type: 'ZENOWETHU_POA', fileUrl: '/uploads/signed-poa.pdf' }),
            doc({ type: 'ID', fileUrl: '/uploads/id.pdf' }),
        ]);

        const result = await resolveMandateAttachments('case-1', BASE);

        expect(result.complete).toBe(true);
        expect(result.attachments).toEqual([
            'https://cases.zenowethu.co.za/uploads/signed-poa.pdf',
            'https://cases.zenowethu.co.za/uploads/id.pdf',
        ]);

        const where = mockDb.document.findMany.mock.calls[0][0].where;
        expect(where.caseId).toBe('case-1');
        expect(where.type.in).toEqual(expect.arrayContaining([...MANDATE_POA_TYPES, ...MANDATE_ID_TYPES]));
    });

    it('degrades to an empty set rather than throwing when the lookup fails', async () => {
        mockDb.document.findMany.mockRejectedValue(new Error('db down'));

        const result = await resolveMandateAttachments('case-1', BASE);

        expect(result.attachments).toEqual([]);
        expect(result.complete).toBe(false);
        expect(result.missing).toEqual(['POA', 'ID']);
        expect(result.summary).toContain('lookup failed');
    });
});

describe('loadMandateFiles', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns the POA and ID bytes read from disk', async () => {
        mockDb.document.findMany.mockResolvedValue([
            doc({ type: 'POA', fileName: 'poa.pdf', fileUrl: '/uploads/c/poa.pdf' }),
            doc({ type: 'ID', fileName: 'id.jpg', fileUrl: '/uploads/c/id.jpg' }),
        ]);
        mockReadOwnUpload.mockImplementation(async (url: string) => Buffer.from(url));

        const result = await loadMandateFiles('case-1');

        expect(result.files.map(f => [f.filename, f.contentType])).toEqual([
            ['poa.pdf', 'application/pdf'],
            ['id.jpg', 'image/jpeg'],
        ]);
        expect(result.missing).toEqual([]);
        expect(result.label).toBe('signed Power of Attorney and identity document');
    });

    it('treats an unreadable file as missing so the email never claims it', async () => {
        mockDb.document.findMany.mockResolvedValue([
            doc({ type: 'POA', fileUrl: '/uploads/c/poa.pdf' }),
            doc({ type: 'ID', fileUrl: '/uploads/c/id.pdf' }),
        ]);
        mockReadOwnUpload.mockImplementation(async (url: string) => (url.includes('poa') ? Buffer.from('x') : null));

        const result = await loadMandateFiles('case-1');

        expect(result.files).toHaveLength(1);
        expect(result.missing).toEqual(['ID']);
        expect(result.label).toBe('signed Power of Attorney');
        expect(result.summary).toContain('MISSING');
    });

    it('returns nothing to attach when the case has no mandate', async () => {
        mockDb.document.findMany.mockResolvedValue([]);
        const result = await loadMandateFiles('case-1');
        expect(result).toMatchObject({ files: [], label: null, missing: ['POA', 'ID'] });
        expect(mockReadOwnUpload).not.toHaveBeenCalled();
    });
});
