import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: { findUnique: vi.fn(), update: vi.fn() },
        caseComment: { create: vi.fn() },
        documentResource: { findFirst: vi.fn() },
        notificationLog: { findFirst: vi.fn() },
    },
}));

vi.mock('../notifications/service', () => ({
    sendManualMessage: vi.fn(),
}));

vi.mock('../automation/automation-user', () => ({
    getAutomationUserId: vi.fn().mockResolvedValue('auto-user'),
}));

import { prisma } from '@zenowethu/database';
import { sendManualMessage } from '../notifications/service';
import { handleDHSDecline } from './decline-handler';

const db = prisma as unknown as {
    case: {
        findUnique: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
    };
    caseComment: { create: ReturnType<typeof vi.fn> };
    documentResource: { findFirst: ReturnType<typeof vi.fn> };
    notificationLog: { findFirst: ReturnType<typeof vi.fn> };
};

const sendMsg = sendManualMessage as unknown as ReturnType<typeof vi.fn>;

const baseCase = {
    id: 'case1',
    fileNumber: 'ZDM-2026-001',
    status: 'REQUESTED_VIA_DHS',
    statusEntryDate: new Date('2026-07-01T08:00:00.000Z'),
    createdAt: new Date('2026-07-01T08:00:00.000Z'),
    dhsApplicationDate: new Date('2026-07-02T08:00:00.000Z'),
    declineFirstDetectedAt: null,
    client: {
        firstName: 'Sipho',
        lastName: 'Dlamini',
        idNumber: '8001015009087',
        email: null,
        phone: null,
        whatsappNumber: null,
    },
    documents: [
        { id: 'doc1', type: 'ID', fileUrl: '/uploads/case1/id.pdf' },
        { id: 'doc2', type: 'POA', fileUrl: '/uploads/case1/poa.pdf' },
    ],
    preferredDcEmail: null,
    lastKnownEmail: null,
    dcEmail: null,
    debtCounsellorName: 'Example DC',
    dcTradingName: null,
};

beforeEach(() => {
    vi.clearAllMocks();
    db.case.findUnique.mockResolvedValue(baseCase);
    db.case.update.mockResolvedValue({});
    db.caseComment.create.mockResolvedValue({});
    db.documentResource.findFirst.mockResolvedValue(null);
    // Default: no prior document email on record → guard lets the send proceed.
    db.notificationLog.findFirst.mockResolvedValue(null);
    process.env.NEXT_PUBLIC_APP_URL = 'https://cases.zenowethu.co.za';
});

describe('handleDHSDecline last-used DC email persistence', () => {
    it('stores the successful document recipient as the case last known email', async () => {
        sendMsg.mockResolvedValue({ emailSuccess: true, errors: [] });

        const result = await handleDHSDecline({
            caseId: 'case1',
            declineReason: 'Please send transfer documents to transfers@example.co.za',
            triggeredByUserId: 'staff1',
        });

        expect(result.statusUpdatedTo).toBe('DOCUMENTS_EMAILED');
        const documentsEmailedUpdate = db.case.update.mock.calls.find(
            ([args]) => args.data.status === 'DOCUMENTS_EMAILED'
        );
        expect(documentsEmailedUpdate?.[0].data.lastKnownEmail).toBe('transfers@example.co.za');
    });

    it('does not store last known email when the document email fails', async () => {
        sendMsg.mockResolvedValue({ emailSuccess: false, errors: ['SMTP rejected recipient'] });

        const result = await handleDHSDecline({
            caseId: 'case1',
            declineReason: 'Please send transfer documents to transfers@example.co.za',
            triggeredByUserId: 'staff1',
        });

        expect(result.statusUpdatedTo).toBe('REJECTED_EMAIL_DOCS');
        expect(
            db.case.update.mock.calls.some(([args]) => args.data.lastKnownEmail === 'transfers@example.co.za')
        ).toBe(false);
    });
});

describe('handleDHSDecline SEND_DOCS idempotency guard', () => {
    const docsReason = 'Please send transfer documents to transfers@example.co.za';

    it('skips the resend when the docs email was already sent and the file is not overdue', async () => {
        // Future next-update → not overdue.
        db.case.findUnique.mockResolvedValue({
            ...baseCase,
            nextUpdate: new Date('2099-01-01T00:00:00.000Z'),
        });
        db.notificationLog.findFirst.mockResolvedValue({
            sentAt: new Date('2026-07-05T10:00:00.000Z'),
            recipient: 'transfers@example.co.za',
        });
        sendMsg.mockResolvedValue({ emailSuccess: true, errors: [] });

        const result = await handleDHSDecline({
            caseId: 'case1',
            declineReason: docsReason,
            triggeredByUserId: 'staff1',
        });

        expect(result.skippedAsDuplicate).toBe(true);
        expect(result.alreadyHandledAt).toEqual(new Date('2026-07-05T10:00:00.000Z'));
        expect(sendMsg).not.toHaveBeenCalled();
        // No status regression on a skip.
        expect(result.statusUpdatedTo).toBeNull();
    });

    it('resends when a prior email exists but the file is overdue', async () => {
        db.case.findUnique.mockResolvedValue({
            ...baseCase,
            nextUpdate: new Date('2020-01-01T00:00:00.000Z'), // past → overdue
        });
        db.notificationLog.findFirst.mockResolvedValue({
            sentAt: new Date('2026-07-05T10:00:00.000Z'),
            recipient: 'transfers@example.co.za',
        });
        sendMsg.mockResolvedValue({ emailSuccess: true, errors: [] });

        const result = await handleDHSDecline({
            caseId: 'case1',
            declineReason: docsReason,
            triggeredByUserId: 'staff1',
        });

        expect(result.skippedAsDuplicate).toBe(false);
        expect(sendMsg).toHaveBeenCalled();
        expect(result.statusUpdatedTo).toBe('DOCUMENTS_EMAILED');
    });

    it('resends when forceResend is set despite a prior email and no overdue', async () => {
        db.case.findUnique.mockResolvedValue({
            ...baseCase,
            nextUpdate: new Date('2099-01-01T00:00:00.000Z'),
        });
        db.notificationLog.findFirst.mockResolvedValue({
            sentAt: new Date('2026-07-05T10:00:00.000Z'),
            recipient: 'transfers@example.co.za',
        });
        sendMsg.mockResolvedValue({ emailSuccess: true, errors: [] });

        const result = await handleDHSDecline({
            caseId: 'case1',
            declineReason: docsReason,
            triggeredByUserId: 'staff1',
            forceResend: true,
        });

        expect(result.skippedAsDuplicate).toBe(false);
        expect(sendMsg).toHaveBeenCalled();
        expect(result.statusUpdatedTo).toBe('DOCUMENTS_EMAILED');
    });
});

describe('handleDHSDecline OUTSTANDING_FEES automated dc invoice request', () => {
    const feesReason = 'Client has outstanding fees to the current DC.';

    it('sends email to DC and client when DC email is available', async () => {
        db.case.findUnique.mockResolvedValue({
            ...baseCase,
            preferredDcEmail: 'dc@example.co.za',
            client: {
                ...baseCase.client,
                email: 'john@example.com',
            },
        });
        sendMsg.mockResolvedValue({ emailSuccess: true, errors: [] });

        const result = await handleDHSDecline({
            caseId: 'case1',
            declineReason: feesReason,
            triggeredByUserId: 'staff1',
        });

        expect(result.statusUpdatedTo).toBe('REJECTED_OWES_FEES');
        // Two emails sent: one to DC (cc client) and one to client
        expect(sendMsg).toHaveBeenCalledTimes(2);
        
        // Verify first email call (to DC)
        const firstCall = sendMsg.mock.calls[0];
        expect(firstCall[1]).toBe('EMAIL');
        expect(firstCall[2]).toBe('dc@example.co.za');
        expect(firstCall[5]?.cc).toEqual(['john@example.com']);

        // Verify second email call (to client)
        const secondCall = sendMsg.mock.calls[1];
        expect(secondCall[1]).toBe('EMAIL');
        expect(secondCall[2]).toBe('john@example.com');

        expect(result.actionsPerformed).toContain('Invoice request emailed to DC at dc@example.co.za (client CC\'d)');
        expect(result.actionsPerformed).toContain('Outstanding fees email sent to consumer (john@example.com)');
    });

    it('emails client only and logs warning when DC email is missing', async () => {
        db.case.findUnique.mockResolvedValue({
            ...baseCase,
            preferredDcEmail: null,
            client: {
                ...baseCase.client,
                email: 'john@example.com',
            },
        });
        sendMsg.mockResolvedValue({ emailSuccess: true, errors: [] });

        const result = await handleDHSDecline({
            caseId: 'case1',
            declineReason: feesReason,
            triggeredByUserId: 'staff1',
        });

        expect(result.statusUpdatedTo).toBe('REJECTED_OWES_FEES');
        // Only 1 email sent (to client)
        expect(sendMsg).toHaveBeenCalledTimes(1);
        expect(sendMsg.mock.calls[0][2]).toBe('john@example.com');

        expect(result.errors).toContain(
            'No DC email address available to request invoice. Please set the preferred DC email on this case.'
        );
        expect(result.actionsPerformed).toContain('Outstanding fees email sent to consumer (john@example.com)');
    });
});
