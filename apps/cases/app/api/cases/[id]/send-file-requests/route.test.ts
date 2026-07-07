import { beforeEach, describe, expect, it, vi } from 'vitest';
import { auth, sendFileRequestEmails } from '@zenowethu/shared-lib';
import { POST } from './route';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        systemSettings: {
            findMany: vi.fn(),
        },
        case: {
            findUnique: vi.fn(),
        },
        caseComment: {
            create: vi.fn(),
        },
    },
}));

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    })),
    sendFileRequestEmails: vi.fn(),
    GhlService: {
        applyTags: vi.fn(),
    },
}));

describe('POST /api/cases/[id]/send-file-requests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(auth).mockResolvedValue({ user: { id: 'user-123' } } as any);
    });

    it('is paused and does not send bureau or provider emails', async () => {
        const res = await POST(
            new Request('http://localhost/api/cases/case-123/send-file-requests', {
                method: 'POST',
                body: JSON.stringify({ useAiDraft: true }),
            }),
            { params: Promise.resolve({ id: 'case-123' }) }
        );
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.paused).toBe(true);
        expect(body.summary).toEqual({
            bureausSent: 0,
            providersSent: 0,
            totalFailures: 0,
        });
        expect(sendFileRequestEmails).not.toHaveBeenCalled();
    });
});
