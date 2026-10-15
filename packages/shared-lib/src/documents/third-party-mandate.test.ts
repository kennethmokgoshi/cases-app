import { describe, it, expect, vi, beforeEach } from 'vitest';

const findManyDocs = vi.fn();
const createComment = vi.fn().mockResolvedValue({});
const findUniqueCase = vi.fn();
const sendSpy = vi.fn().mockResolvedValue({ success: true, messageId: 'm1', provider: 'mock' });

vi.mock('@zenowethu/database', () => ({
    prisma: {
        document: { findMany: (...a: unknown[]) => findManyDocs(...a) },
        caseComment: { create: (...a: unknown[]) => createComment(...a) },
        case: { findUnique: (...a: unknown[]) => findUniqueCase(...a) },
        notificationLog: { create: vi.fn().mockResolvedValue({}) },
        systemSettings: { findMany: vi.fn().mockResolvedValue([]) },
        user: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(null) },
    },
}));
vi.mock('../logger', () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));
vi.mock('../automation/automation-user', () => ({ getAutomationUserId: vi.fn().mockResolvedValue('sys-user') }));
vi.mock('../integrations', () => ({
    getGHLCredentials: vi.fn().mockResolvedValue({ apiKey: null, locationId: null }),
    getSMTPCredentials: vi.fn().mockResolvedValue({ host: '', port: 587, secure: false, username: '', password: '', fromEmail: '' }),
    isGhlEnabled: () => false,
}));
vi.mock('../notifications/providers', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../notifications/providers')>();
    return {
        ...actual,
        FallbackEmailProvider: vi.fn().mockImplementation(() => ({ name: 'mock', send: sendSpy })),
        SmtpEmailProvider: vi.fn().mockImplementation(() => ({ name: 'mock', send: sendSpy })),
        MockEmailProvider: vi.fn().mockImplementation(() => ({ name: 'mock', send: sendSpy })),
        ResendEmailProvider: vi.fn().mockImplementation(() => ({ name: 'mock', send: sendSpy })),
    };
});

import { prepareThirdPartyMandate } from './mandate-attachments';
import { sendManualMessage } from '../notifications/service';

const POA = { type: 'POA', fileName: 'poa.pdf', fileUrl: '/uploads/poa.pdf', verificationStatus: 'VERIFIED' };
const ID = { type: 'ID', fileName: 'id.jpg', fileUrl: '/uploads/id.jpg', verificationStatus: 'VERIFIED' };

beforeEach(() => {
    vi.clearAllMocks();
    findUniqueCase.mockResolvedValue({ dcEmail: 'dc@counsel.co.za' });
});

describe('prepareThirdPartyMandate', () => {
    it('attaches POA then ID and adds the authority sentence', async () => {
        findManyDocs.mockResolvedValue([ID, POA]);
        const tp = await prepareThirdPartyMandate('case1', 'debt counsellor');
        expect(tp.urls).toHaveLength(2);
        expect(tp.urls[0]).toContain('poa.pdf');
        expect(tp.urls[1]).toContain('id.jpg');
        expect(tp.withAuthority('Hello\n\nKind regards,\nZ')).toContain('proof of our authority');
        expect(createComment).not.toHaveBeenCalled();
    });

    it('records a visible case comment when the POA is missing', async () => {
        findManyDocs.mockResolvedValue([ID]);
        const tp = await prepareThirdPartyMandate('case1', 'debt counsellor');
        expect(tp.urls).toHaveLength(1);
        expect(createComment).toHaveBeenCalledTimes(1);
        expect(createComment.mock.calls[0][0].data.content).toContain('incomplete mandate');
    });
});

describe('sendManualMessage to the case debt counsellor', () => {
    it('auto-attaches the mandate even when the caller passed no attachments', async () => {
        findManyDocs.mockResolvedValue([POA, ID]);
        await sendManualMessage('case1', 'EMAIL', 'DC@counsel.co.za', 'Please send the file', 'File request');
        const opts = sendSpy.mock.calls[0]?.[4];
        expect(opts?.attachments).toHaveLength(2);
        expect(sendSpy.mock.calls[0][3]).toContain('proof of our authority');
    });

    it('does not attach to the consumer themselves', async () => {
        findManyDocs.mockResolvedValue([POA, ID]);
        await sendManualMessage('case1', 'EMAIL', 'client@example.com', 'Your update', 'Update');
        expect(sendSpy.mock.calls[0]?.[4]?.attachments).toBeUndefined();
    });
});
