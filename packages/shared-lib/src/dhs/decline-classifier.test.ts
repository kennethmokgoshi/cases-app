import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// decline-handler (imported transitively for the rules fallback) touches these.
vi.mock('@zenowethu/database', () => ({
    prisma: { aiProvider: { count: vi.fn() } },
}));
vi.mock('../notifications/service', () => ({
    sendManualMessage: vi.fn(),
}));
vi.mock('../ai/provider-client', () => ({
    getAiClientChainForTask: vi.fn(),
    describeAiError: vi.fn(() => 'ai error'),
}));

import { prisma } from '@zenowethu/database';
import { getAiClientChainForTask } from '../ai/provider-client';
import { classifyDeclineReasonSmart } from './decline-classifier';

const mockedChain = getAiClientChainForTask as unknown as ReturnType<typeof vi.fn>;
const mockedCount = (prisma as unknown as { aiProvider: { count: ReturnType<typeof vi.fn> } }).aiProvider.count;

// The real-world boilerplate that used to be mis-read as OUTSTANDING_FEES.
const UNDER_REVIEW_BOILERPLATE =
    'Transfer Under Review: Kindly allow the standard turnaround time of 3-7 business days, as the Form 17.7 documents have been received and acknowledged. Please note that a transfer request may be declined if there are any outstanding fees payable to the current Debt Counsellor.';

function chainWith(createImpl: (...args: unknown[]) => unknown) {
    return [
        {
            client: { chat: { completions: { create: vi.fn(createImpl) } } },
            model: 'gpt-4o-mini',
            providerName: 'Test Provider',
        },
    ];
}

function aiJson(payload: object) {
    return { choices: [{ message: { content: JSON.stringify(payload) } }] };
}

const ORIGINAL_KEY = process.env.OPENAI_API_KEY;

beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = 'test-key'; // AI path enabled by default
});

afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = ORIGINAL_KEY;
});

describe('classifyDeclineReasonSmart', () => {
    it('trusts a confident AI interpretation over keyword matching', async () => {
        mockedChain.mockResolvedValue(
            chainWith(() =>
                aiJson({
                    category: 'RESUBMIT_LATER',
                    confidence: 0.95,
                    reasoning: 'Transfer is under review; the fee mention is generic policy, not a demand.',
                })
            )
        );

        const result = await classifyDeclineReasonSmart(UNDER_REVIEW_BOILERPLATE);

        expect(result.category).toBe('RESUBMIT_LATER');
        expect(result.source).toBe('ai');
        expect(result.confidence).toBe(0.95);
    });

    it('falls back to deterministic rules when AI confidence is low', async () => {
        mockedChain.mockResolvedValue(
            chainWith(() =>
                aiJson({ category: 'OUTSTANDING_FEES', confidence: 0.2, reasoning: 'unsure' })
            )
        );

        const result = await classifyDeclineReasonSmart(UNDER_REVIEW_BOILERPLATE);

        // Rules now read the boilerplate correctly as a pending/under-review case.
        expect(result.category).toBe('RESUBMIT_LATER');
        expect(result.source).toBe('rules');
    });

    it('falls back to rules when the AI provider throws', async () => {
        mockedChain.mockResolvedValue(
            chainWith(() => {
                throw new Error('provider down');
            })
        );

        const result = await classifyDeclineReasonSmart('Client owes R1500 in after-care fees');

        expect(result.category).toBe('OUTSTANDING_FEES');
        expect(result.source).toBe('rules');
    });

    it('falls back to rules when the AI returns an invalid category', async () => {
        mockedChain.mockResolvedValue(
            chainWith(() => aiJson({ category: 'NONSENSE', confidence: 0.99, reasoning: 'x' }))
        );

        const result = await classifyDeclineReasonSmart('Please send POA and ID');

        expect(result.category).toBe('SEND_DOCS');
        expect(result.source).toBe('rules');
    });

    it('skips the AI call entirely when no provider is configured', async () => {
        delete process.env.OPENAI_API_KEY;
        mockedCount.mockResolvedValue(0);

        const result = await classifyDeclineReasonSmart('Please send POA and ID');

        expect(result.source).toBe('rules');
        expect(result.category).toBe('SEND_DOCS');
        expect(mockedChain).not.toHaveBeenCalled();
    });

    it('returns UNKNOWN (rules) for an empty reason without calling AI', async () => {
        const result = await classifyDeclineReasonSmart('   ');

        expect(result.category).toBe('UNKNOWN');
        expect(result.source).toBe('rules');
        expect(mockedChain).not.toHaveBeenCalled();
    });
});
