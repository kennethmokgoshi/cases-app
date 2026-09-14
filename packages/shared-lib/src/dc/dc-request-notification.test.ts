import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDb = vi.hoisted(() => ({
    case: { findUnique: vi.fn() },
    caseComment: { create: vi.fn() },
    document: { findMany: vi.fn() },
}));

const mockSend = vi.hoisted(() => vi.fn());

vi.mock('@zenowethu/database', () => ({ prisma: mockDb }));
vi.mock('../notifications/service', () => ({ sendStatusChangeNotification: mockSend }));
vi.mock('../automation/automation-user', () => ({
    getAutomationUserId: vi.fn().mockResolvedValue('automation-1'),
}));

import { sendDcRequestNotification, pickDebtCounsellorEmail } from './dc-request-notification';

const CASE = {
    id: 'case-1',
    fileNumber: 'ZW1234',
    acquisitionType: 'B2C',
    preferredDcEmail: 'dc@firm.co.za',
    lastKnownEmail: null,
    dcEmail: null,
    debtCounsellorName: 'Jane Ndlovu',
    debtCounsellor: null,
    client: {
        firstName: 'Thabo',
        lastName: 'Mokoena',
        idNumber: '8001015009087',
        email: 'thabo@example.co.za',
    },
};

const POA = { type: 'POA', fileName: 'poa.pdf', fileUrl: '/uploads/poa.pdf', uploadedAt: new Date('2026-01-01'), verificationStatus: 'VERIFIED', isAdminOnly: false };
const ID  = { type: 'ID',  fileName: 'id.pdf',  fileUrl: '/uploads/id.pdf',  uploadedAt: new Date('2026-01-01'), verificationStatus: 'VERIFIED', isAdminOnly: false };

beforeEach(() => {
    vi.clearAllMocks();
    mockDb.case.findUnique.mockResolvedValue(CASE);
    mockDb.caseComment.create.mockResolvedValue({});
    mockDb.document.findMany.mockResolvedValue([POA, ID]);
    mockSend.mockResolvedValue({ emailSuccess: true, errors: [] });
});

describe('sendDcRequestNotification', () => {
    it('attaches the signed POA and ID to an invoice request', async () => {
        const result = await sendDcRequestNotification({
            caseId: 'case-1',
            type: 'INVOICE_REQUEST',
            actorUserId: 'user-1',
        });

        expect(result.ok).toBe(true);
        const payload = mockSend.mock.calls[0][0];
        expect(payload.statusCode).toBe('REQUEST_INVOICE_DC');
        expect(payload.attachments).toHaveLength(2);
        expect(payload.attachments[0]).toContain('/uploads/poa.pdf');
        expect(payload.attachments[1]).toContain('/uploads/id.pdf');
        expect(payload.attachmentsLabel).toBe('signed Power of Attorney and identity document');
        expect(result.missingMandate).toEqual([]);
    });

    it('attaches the signed POA and ID to a file request too', async () => {
        await sendDcRequestNotification({ caseId: 'case-1', type: 'FILE_REQUEST' });

        const payload = mockSend.mock.calls[0][0];
        expect(payload.statusCode).toBe('REQUEST_FILE_DC');
        expect(payload.attachments).toHaveLength(2);
    });

    it('copies the consumer on a file request only', async () => {
        await sendDcRequestNotification({ caseId: 'case-1', type: 'FILE_REQUEST' });
        expect(mockSend.mock.calls[0][0].dcCcEmails).toEqual(['thabo@example.co.za']);

        mockSend.mockClear();
        await sendDcRequestNotification({ caseId: 'case-1', type: 'INVOICE_REQUEST' });
        expect(mockSend.mock.calls[0][0].dcCcEmails).toEqual([]);
    });

    it('still sends when the POA is missing, and reports the gap', async () => {
        mockDb.document.findMany.mockResolvedValue([ID]);

        const result = await sendDcRequestNotification({ caseId: 'case-1', type: 'INVOICE_REQUEST' });

        expect(result.ok).toBe(true);
        expect(mockSend).toHaveBeenCalled();
        expect(result.missingMandate).toEqual(['POA']);
        expect(result.mandateSummary).toContain('signed POA MISSING');
        expect(mockDb.caseComment.create.mock.calls[0][0].data.content).toContain('signed POA MISSING');
    });

    it('never claims an attachment the provider failed to deliver', async () => {
        mockSend.mockResolvedValue({
            emailSuccess: true,
            errors: [],
            attachmentErrors: ['poa.pdf (HTTP 404)'],
        });

        await sendDcRequestNotification({ caseId: 'case-1', type: 'INVOICE_REQUEST' });

        expect(mockDb.caseComment.create.mock.calls[0][0].data.content).toContain('Attachment delivery failed: poa.pdf (HTTP 404)');
    });

    it('records what was attached on the case timeline', async () => {
        await sendDcRequestNotification({ caseId: 'case-1', type: 'INVOICE_REQUEST', actorUserId: 'user-1' });

        const comment = mockDb.caseComment.create.mock.calls[0][0].data;
        expect(comment.caseId).toBe('case-1');
        expect(comment.userId).toBe('user-1');
        expect(comment.content).toContain('signed POA + ID copy attached');
    });

    it('attributes an unattended send to the automation user', async () => {
        await sendDcRequestNotification({ caseId: 'case-1', type: 'INVOICE_REQUEST' });

        expect(mockDb.caseComment.create.mock.calls[0][0].data.userId).toBe('automation-1');
    });

    it('does not send when the case has no DC email', async () => {
        mockDb.case.findUnique.mockResolvedValue({ ...CASE, preferredDcEmail: null });

        const result = await sendDcRequestNotification({ caseId: 'case-1', type: 'INVOICE_REQUEST' });

        expect(result.ok).toBe(false);
        expect(result.failure).toBe('NO_DC_EMAIL');
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('reports a missing case', async () => {
        mockDb.case.findUnique.mockResolvedValue(null);

        const result = await sendDcRequestNotification({ caseId: 'nope', type: 'FILE_REQUEST' });

        expect(result.failure).toBe('CASE_NOT_FOUND');
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('surfaces a provider failure without writing a sent comment', async () => {
        mockSend.mockResolvedValue({ emailSuccess: false, errors: ['SMTP 550'] });

        const result = await sendDcRequestNotification({ caseId: 'case-1', type: 'INVOICE_REQUEST' });

        expect(result.ok).toBe(false);
        expect(result.failure).toBe('SEND_FAILED');
        expect(result.error).toContain('SMTP 550');
        expect(mockDb.caseComment.create).not.toHaveBeenCalled();
    });

    it('does not fail the send when the case comment cannot be written', async () => {
        mockDb.caseComment.create.mockRejectedValue(new Error('db down'));

        const result = await sendDcRequestNotification({ caseId: 'case-1', type: 'INVOICE_REQUEST' });

        expect(result.ok).toBe(true);
    });
});

describe('pickDebtCounsellorEmail', () => {
    it('prefers the case preferred address', () => {
        expect(
            pickDebtCounsellorEmail({
                preferredDcEmail: ' a@dc.co.za ',
                dcEmail: 'b@dc.co.za',
            })
        ).toBe('a@dc.co.za');
    });

    it('falls back through the DC record and legacy fields', () => {
        expect(
            pickDebtCounsellorEmail({
                preferredDcEmail: null,
                debtCounsellor: { preferredEmail: null, lastKnownEmail: null, email: 'legacy@dc.co.za' },
            })
        ).toBe('legacy@dc.co.za');
    });

    it('returns null when the case has no DC address at all', () => {
        expect(pickDebtCounsellorEmail({})).toBeNull();
    });
});
