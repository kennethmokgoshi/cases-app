import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const queueFindUnique = vi.fn();
const queueUpdate = vi.fn();

vi.mock('@zenowethu/database', () => ({
    prisma: {
        notificationQueue: {
            findUnique: (...a: unknown[]) => queueFindUnique(...a),
            update: (...a: unknown[]) => queueUpdate(...a),
        },
        notificationLog: { create: vi.fn().mockResolvedValue({ id: 'log-1' }) },
        systemSettings: { findMany: vi.fn().mockResolvedValue([]) },
    },
}));

vi.mock('../logger', () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../integrations', () => ({
    getGHLCredentials: vi.fn().mockResolvedValue({ apiKey: null, locationId: null }),
    getSMTPCredentials: vi.fn().mockResolvedValue({ host: '', port: 587, secure: false, username: '', password: '', fromEmail: '' }),
    isGhlEnabled: vi.fn(() => false),
}));

const emailSend = vi.fn();
vi.mock('./providers', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./providers')>()),
    MockEmailProvider: vi.fn().mockImplementation(() => ({ name: 'mock', send: emailSend })),
}));

const applyFeeDocumentStatus = vi.fn();
vi.mock('../finance/fee-document-status', () => ({
    applyFeeDocumentStatus: (...a: unknown[]) => applyFeeDocumentStatus(...a),
}));

import { executeNotificationRetry } from './service';

const queued = (options: Record<string, unknown>) => ({
    id: 'q-1', caseId: 'case-1', channel: 'EMAIL', recipient: 'jane@dc.test',
    subject: 'Proof of payment', body: 'Dear Jane', htmlBody: null, retryCount: 1,
    optionsJson: JSON.stringify(options),
});

describe('executeNotificationRetry — fee documents', () => {
    const prevProvider = process.env.EMAIL_PROVIDER;
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.EMAIL_PROVIDER = 'mock';
        applyFeeDocumentStatus.mockResolvedValue({ moved: true });
    });
    afterEach(() => {
        process.env.EMAIL_PROVIDER = prevProvider;
    });

    it('moves the case to the sent status once a queued fee document finally goes out', async () => {
        queueFindUnique.mockResolvedValue(queued({
            attachments: ['https://cases.test/uploads/case-1/pop.pdf'],
            feeDocument: { documentId: 'doc-1', docType: 'PROOF_OF_PAYMENT' },
        }));
        emailSend.mockResolvedValue({ success: true, provider: 'mock' });

        await executeNotificationRetry('q-1');

        expect(applyFeeDocumentStatus).toHaveBeenCalledWith(expect.objectContaining({
            caseId: 'case-1', docType: 'PROOF_OF_PAYMENT', event: 'SENT', documentId: 'doc-1',
        }));
    });

    it('leaves the status alone when an attachment still failed', async () => {
        queueFindUnique.mockResolvedValue(queued({ feeDocument: { documentId: 'doc-1', docType: 'PROOF_OF_PAYMENT' } }));
        emailSend.mockResolvedValue({ success: true, provider: 'mock', attachmentErrors: ['pop.pdf (HTTP 404)'] });

        await executeNotificationRetry('q-1');

        expect(applyFeeDocumentStatus).not.toHaveBeenCalled();
    });

    it('does nothing for an ordinary queued email or a failed retry', async () => {
        queueFindUnique.mockResolvedValue(queued({ cc: [] }));
        emailSend.mockResolvedValue({ success: true, provider: 'mock' });
        await executeNotificationRetry('q-1');

        queueFindUnique.mockResolvedValue(queued({ feeDocument: { documentId: 'doc-1', docType: 'PROOF_OF_PAYMENT' } }));
        emailSend.mockResolvedValue({ success: false, provider: 'mock', error: 'still down' });
        await executeNotificationRetry('q-1');

        expect(applyFeeDocumentStatus).not.toHaveBeenCalled();
    });
});
