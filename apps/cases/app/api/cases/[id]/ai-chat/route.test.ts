import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: {
            findUnique: vi.fn(),
        },
    },
}));

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: () => ({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    }),
}));

vi.mock('@zenowethu/shared-lib/src/ai/provider-client', () => ({
    getAiClientChainForTask: vi.fn(),
    describeAiError: vi.fn((err: any) => err?.message || 'AI provider error'),
}));

import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';
import { getAiClientChainForTask } from '@zenowethu/shared-lib/src/ai/provider-client';

const mockAuth = vi.mocked(auth);
const mockFindUnique = vi.mocked(prisma.case.findUnique);
const mockGetAiClientChainForTask = vi.mocked(getAiClientChainForTask);

function makeRequest(body: unknown): Request {
    return new Request('http://localhost/api/cases/case-1/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

const params = Promise.resolve({ id: 'case-1' });

const mockCaseRecord = {
    id: 'case-1',
    fileNumber: 'ZDM-001',
    status: 'ACTIVE',
    category: 'General',
    services: 'Debt Review',
    createdAt: new Date('2026-01-01'),
    description: 'Test case description',
    acquisitionType: 'B2C',
    partnerName: null,
    ncrdcNo: 'NCRDC123',
    dhsStatus: 'LINKED',
    consumerDhsStatus: 'ACTIVE',
    dhsApplicationDate: new Date('2026-01-02'),
    debtCounsellorName: 'John Counsellor',
    dcTradingName: 'DC Inc',
    dcEmail: 'dc@example.com',
    dcTel: '0111234567',
    nctCaseNumber: null,
    nctStatus: null,
    totalDebtAmount: 50000,
    totalMonthlyInstallment: 2000,
    serviceFee: 500,
    client: {
        firstName: 'Eunice',
        lastName: 'Ramokgadi',
        idNumber: '8501130742082',
        email: 'eunishka@gmail.com',
        phone: '0760413369',
        whatsappNumber: '0760413369',
        employer: 'Test Employer',
    },
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe('POST /api/cases/[id]/ai-chat', () => {
    it('returns 401 when user is unauthenticated', async () => {
        mockAuth.mockResolvedValueOnce(null as never);
        const res = await POST(makeRequest({ messages: [{ role: 'user', content: 'Hello' }] }), { params });
        expect(res.status).toBe(401);
    });

    it('returns 400 when request body is invalid', async () => {
        mockAuth.mockResolvedValueOnce({ user: { id: 'u1' } } as never);
        const res = await POST(makeRequest({ messages: [] }), { params });
        expect(res.status).toBe(400);
    });

    it('returns 404 when case is not found', async () => {
        mockAuth.mockResolvedValueOnce({ user: { id: 'u1' } } as never);
        mockFindUnique.mockResolvedValueOnce(null as never);
        const res = await POST(makeRequest({ messages: [{ role: 'user', content: 'Hello' }] }), { params });
        expect(res.status).toBe(404);
    });

    it('returns 502 when all AI providers in the fallback chain fail', async () => {
        mockAuth.mockResolvedValueOnce({ user: { id: 'u1' } } as never);
        mockFindUnique.mockResolvedValueOnce(mockCaseRecord as never);

        const mockFailingClient = {
            chat: {
                completions: {
                    create: vi.fn().mockRejectedValue(new Error('400 status code (no body)')),
                },
            },
        };

        mockGetAiClientChainForTask.mockResolvedValueOnce([
            { client: mockFailingClient as any, model: 'gpt-4o', providerName: 'OpenAI (Env)' },
        ]);

        const res = await POST(makeRequest({ messages: [{ role: 'user', content: 'Help with transfer request' }] }), { params });
        expect(res.status).toBe(502);
        const body = await res.json();
        expect(body.error).toBe('400 status code (no body)');
    });

    it('streams response successfully when AI provider succeeds', async () => {
        mockAuth.mockResolvedValueOnce({ user: { id: 'u1' } } as never);
        mockFindUnique.mockResolvedValueOnce(mockCaseRecord as never);

        async function* mockStream() {
            yield { choices: [{ delta: { content: 'Hello ' } }] };
            yield { choices: [{ delta: { content: 'there!' } }] };
        }

        const mockSuccessClient = {
            chat: {
                completions: {
                    create: vi.fn().mockResolvedValue(mockStream()),
                },
            },
        };

        mockGetAiClientChainForTask.mockResolvedValueOnce([
            { client: mockSuccessClient as any, model: 'gpt-4o', providerName: 'OpenAI (Env)' },
        ]);

        const res = await POST(makeRequest({ messages: [{ role: 'user', content: 'Help with transfer' }] }), { params });
        expect(res.status).toBe(200);

        const reader = res.body?.getReader();
        expect(reader).toBeDefined();

        let text = '';
        const decoder = new TextDecoder();
        while (true) {
            const { done, value } = await reader!.read();
            if (done) break;
            text += decoder.decode(value);
        }

        expect(text).toBe('Hello there!');
    });
});
