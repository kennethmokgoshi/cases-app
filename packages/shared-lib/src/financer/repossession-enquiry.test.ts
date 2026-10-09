import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDb = vi.hoisted(() => ({
    case: { findUnique: vi.fn() },
    caseComment: { create: vi.fn() },
    document: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
    creditProvider: { update: vi.fn() },
}));
const mockSend = vi.hoisted(() => vi.fn());

vi.mock('@zenowethu/database', () => ({ prisma: mockDb }));
vi.mock('../notifications/service', () => ({ sendManualMessage: mockSend }));
vi.mock('../automation/automation-user', () => ({
    getAutomationUserId: vi.fn().mockResolvedValue('automation-1'),
}));
vi.mock('../company/company-profile-service', async () => {
    const { ZENOWETHU_COMPANY_PROFILE } = await import('../company/profile');
    return { getCompanyProfile: vi.fn().mockResolvedValue(ZENOWETHU_COMPANY_PROFILE) };
});

import {
    RepossessionEnquiryInputSchema,
    prepareRepossessionEnquiry,
    processRepossessionEnquiry,
    type RepossessionEnquiryInput,
} from './repossession-enquiry';

const POA = { type: 'POA', fileName: 'poa.pdf', fileUrl: '/uploads/poa.pdf', uploadedAt: new Date('2026-01-01'), verificationStatus: 'VERIFIED', isAdminOnly: false };
const ID  = { type: 'ID',  fileName: 'id.pdf',  fileUrl: '/uploads/id.pdf',  uploadedAt: new Date('2026-01-01'), verificationStatus: 'VERIFIED', isAdminOnly: false };

const CAR_ACCOUNT = {
    id: 'acc-car',
    creditorName: 'WesBank',
    accountNumber: '1234-5678',
    accountType: 'Vehicle Finance',
    outstandingBalance: 180000,
    status: 'ACTIVE',
    creditProvider: { id: 'prov-1', email: null, attorneyEmail: 'legal@wesbank.example' },
};
const LOAN_ACCOUNT = {
    id: 'acc-loan',
    creditorName: 'Capitec',
    accountNumber: '8765-4321',
    accountType: 'Personal Loan',
    outstandingBalance: 25000,
    status: 'ACTIVE',
    creditProvider: null,
};

const CASE = {
    id: 'case-1',
    client: { firstName: 'Thabo', lastName: 'Mokoena', idNumber: '8001015009087' },
    creditAccounts: [LOAN_ACCOUNT, CAR_ACCOUNT],
};

const INPUT: RepossessionEnquiryInput = {
    action: 'send',
    creditAccountId: 'acc-car',
    vehicleDescription: 'Toyota Hilux 2021',
    registrationNumber: 'ABC123GP',
    recipientEmail: 'collections@wesbank.example',
    replyWithinBusinessDays: 5,
    pauseBusinessDays: 10,
    saveContact: false,
};

beforeEach(() => {
    vi.clearAllMocks();
    mockDb.case.findUnique.mockResolvedValue({ ...CASE, creditAccounts: [CAR_ACCOUNT] });
    mockDb.document.findMany.mockResolvedValue([POA, ID]);
    mockDb.user.findUnique.mockResolvedValue({ firstName: 'Aaron', lastName: 'Nzotho' });
    mockDb.caseComment.create.mockResolvedValue({});
    mockDb.creditProvider.update.mockResolvedValue({});
    mockSend.mockResolvedValue({ emailSuccess: true, errors: [] });
});

describe('prepareRepossessionEnquiry', () => {
    beforeEach(() => {
        mockDb.case.findUnique.mockResolvedValue(CASE);
    });

    it('lists accounts with the likely vehicle account first and pre-selected', async () => {
        const ctx = await prepareRepossessionEnquiry('case-1');

        expect(ctx?.accounts.map(a => a.id)).toEqual(['acc-car', 'acc-loan']);
        expect(ctx?.preselectedAccountId).toBe('acc-car');
        expect(ctx?.accounts[0].providerAttorneyEmail).toBe('legal@wesbank.example');
        expect(ctx?.mandate.complete).toBe(true);
    });

    it('does not pre-select when more than one account looks like a vehicle', async () => {
        mockDb.case.findUnique.mockResolvedValue({
            ...CASE,
            creditAccounts: [CAR_ACCOUNT, { ...LOAN_ACCOUNT, id: 'acc-2', accountType: 'Instalment Sale' }],
        });

        const ctx = await prepareRepossessionEnquiry('case-1');
        expect(ctx?.preselectedAccountId).toBeNull();
    });

    it('reports a missing mandate so the modal can block the send', async () => {
        mockDb.document.findMany.mockResolvedValue([ID]);

        const ctx = await prepareRepossessionEnquiry('case-1');
        expect(ctx?.mandate.complete).toBe(false);
        expect(ctx?.mandate.missing).toEqual(['POA']);
    });

    it('returns null for an unknown case', async () => {
        mockDb.case.findUnique.mockResolvedValue(null);
        expect(await prepareRepossessionEnquiry('nope')).toBeNull();
    });
});

describe('processRepossessionEnquiry', () => {
    it('sends the letter with the signed POA and ID attached, and logs it on the case', async () => {
        const result = await processRepossessionEnquiry({ caseId: 'case-1', input: INPUT, actorUserId: 'user-1' });

        expect(result.ok).toBe(true);
        expect(result.sent).toBe(true);

        const [caseId, channel, to, body, subject, options] = mockSend.mock.calls[0];
        expect(caseId).toBe('case-1');
        expect(channel).toBe('EMAIL');
        expect(to).toBe('collections@wesbank.example');
        expect(subject).toContain('1234-5678');
        expect(body).toContain('Toyota Hilux 2021, Reg ABC123GP');
        expect(body).toContain('Aaron Nzotho');
        expect(options.attachments).toHaveLength(2);

        const comment = mockDb.caseComment.create.mock.calls[0][0].data;
        expect(comment.type).toBe('SYSTEM');
        expect(comment.content).toContain('WesBank');
        expect(comment.content).toContain('signed POA + ID copy attached');
    });

    it('refuses to send without a complete mandate', async () => {
        mockDb.document.findMany.mockResolvedValue([ID]);

        const result = await processRepossessionEnquiry({ caseId: 'case-1', input: INPUT, actorUserId: 'user-1' });

        expect(result.ok).toBe(false);
        expect(result.failure).toBe('MANDATE_INCOMPLETE');
        expect(result.missingMandate).toEqual(['POA']);
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('refuses an account that is not on this case', async () => {
        mockDb.case.findUnique.mockResolvedValue({ ...CASE, creditAccounts: [] });

        const result = await processRepossessionEnquiry({ caseId: 'case-1', input: INPUT, actorUserId: 'user-1' });

        expect(result.failure).toBe('ACCOUNT_NOT_FOUND');
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('returns the case-not-found failure', async () => {
        mockDb.case.findUnique.mockResolvedValue(null);

        const result = await processRepossessionEnquiry({ caseId: 'x', input: INPUT, actorUserId: 'user-1' });
        expect(result.failure).toBe('CASE_NOT_FOUND');
    });

    it('previews without sending or logging anything', async () => {
        const result = await processRepossessionEnquiry({
            caseId: 'case-1',
            input: { ...INPUT, action: 'preview' },
            actorUserId: 'user-1',
        });

        expect(result.ok).toBe(true);
        expect(result.sent).toBe(false);
        expect(result.letter?.body).toContain('No application for debt review has been lodged');
        expect(mockSend).not.toHaveBeenCalled();
        expect(mockDb.caseComment.create).not.toHaveBeenCalled();
    });

    it('reports a failed send and writes no timeline entry', async () => {
        mockSend.mockResolvedValue({ emailSuccess: false, errors: ['SMTP down'] });

        const result = await processRepossessionEnquiry({ caseId: 'case-1', input: INPUT, actorUserId: 'user-1' });

        expect(result.ok).toBe(false);
        expect(result.failure).toBe('SEND_FAILED');
        expect(result.error).toContain('SMTP down');
        expect(mockDb.caseComment.create).not.toHaveBeenCalled();
    });

    it('saves the typed email on the financer only when asked and none is stored', async () => {
        await processRepossessionEnquiry({
            caseId: 'case-1',
            input: { ...INPUT, saveContact: true },
            actorUserId: 'user-1',
        });
        expect(mockDb.creditProvider.update).toHaveBeenCalledWith({
            where: { id: 'prov-1' },
            data: { email: 'collections@wesbank.example' },
        });

        mockDb.creditProvider.update.mockClear();
        await processRepossessionEnquiry({ caseId: 'case-1', input: INPUT, actorUserId: 'user-1' });
        expect(mockDb.creditProvider.update).not.toHaveBeenCalled();
    });

    it('does not overwrite an email already stored on the financer', async () => {
        mockDb.case.findUnique.mockResolvedValue({
            ...CASE,
            creditAccounts: [{ ...CAR_ACCOUNT, creditProvider: { id: 'prov-1', email: 'existing@wesbank.example' } }],
        });

        await processRepossessionEnquiry({
            caseId: 'case-1',
            input: { ...INPUT, saveContact: true },
            actorUserId: 'user-1',
        });
        expect(mockDb.creditProvider.update).not.toHaveBeenCalled();
    });

    it('still reports success if the timeline comment cannot be saved', async () => {
        mockDb.caseComment.create.mockRejectedValue(new Error('db'));

        const result = await processRepossessionEnquiry({ caseId: 'case-1', input: INPUT, actorUserId: 'user-1' });
        expect(result.ok).toBe(true);
        expect(result.sent).toBe(true);
    });
});

describe('RepossessionEnquiryInputSchema', () => {
    it('applies the default reply and pause periods', () => {
        const parsed = RepossessionEnquiryInputSchema.parse({
            action: 'preview',
            creditAccountId: 'acc-car',
            recipientEmail: 'a@b.co.za',
        });
        expect(parsed.replyWithinBusinessDays).toBe(5);
        expect(parsed.pauseBusinessDays).toBe(10);
        expect(parsed.saveContact).toBe(false);
    });

    it('rejects a bad email or missing account', () => {
        expect(
            RepossessionEnquiryInputSchema.safeParse({ action: 'send', creditAccountId: 'a', recipientEmail: 'nope' }).success
        ).toBe(false);
        expect(
            RepossessionEnquiryInputSchema.safeParse({ action: 'send', creditAccountId: '', recipientEmail: 'a@b.co.za' }).success
        ).toBe(false);
    });
});
