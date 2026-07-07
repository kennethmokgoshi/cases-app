import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: { findUnique: vi.fn(), update: vi.fn() },
        caseComment: { create: vi.fn() },
        documentResource: { findFirst: vi.fn() },
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
