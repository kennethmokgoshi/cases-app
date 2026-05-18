import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted stubs ────────────────────────────────────────────────────────────

const mockCreate = vi.hoisted(() => vi.fn());

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../openai/client', () => ({
    getOpenAI: () => ({
        chat: {
            completions: { create: mockCreate },
        },
    }),
}));

vi.mock('../logger', () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { generateAutoReply, AutoReplyRequest } from './auto-reply';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const baseRequest: AutoReplyRequest = {
    inboundMessage: 'Hi, what is the status of my case?',
    channel: 'EMAIL',
    senderType: 'CLIENT',
    caseContext: {
        fileNumber: 'ZEN-001',
        statusLabel: 'Under Debt Review',
        nextUpdate: '2026-06-01T00:00:00Z',
        clientFirstName: 'Sipho',
        clientFullName: 'Sipho Dlamini',
        dcName: 'Thabo Nkosi',
    },
};

function makeOpenAIResponse(content: object) {
    return {
        choices: [{ message: { content: JSON.stringify(content) } }],
    };
}

// ─── generateAutoReply ────────────────────────────────────────────────────────

describe('generateAutoReply', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns parsed AI response when shouldSend is true', async () => {
        mockCreate.mockResolvedValue(
            makeOpenAIResponse({
                shouldSend: true,
                subject: 'Re: Your Debt Review Enquiry — ZEN-001',
                body: 'Dear Sipho, your case is currently under debt review. A team member will follow up within 1–2 business days. Zenowethu Debt Management — 012 035 1824.',
                reasoning: 'Status query with sufficient context to respond.',
            })
        );

        const result = await generateAutoReply(baseRequest);

        expect(result.shouldSend).toBe(true);
        expect(result.subject).toContain('ZEN-001');
        expect(result.body).toContain('Sipho');
        expect(result.reasoning).toBeTruthy();
    });

    it('returns shouldSend false when AI decides not to reply', async () => {
        mockCreate.mockResolvedValue(
            makeOpenAIResponse({
                shouldSend: false,
                subject: '',
                body: '',
                reasoning: 'Message requires legal advice — escalate to human.',
            })
        );

        const result = await generateAutoReply({ ...baseRequest, inboundMessage: 'Can you reduce my debt legally?' });

        expect(result.shouldSend).toBe(false);
        expect(result.body).toBe('');
    });

    it('truncates SMS body to 160 characters', async () => {
        const longBody = 'A'.repeat(200);
        mockCreate.mockResolvedValue(
            makeOpenAIResponse({
                shouldSend: true,
                subject: '',
                body: longBody,
                reasoning: 'Status acknowledgement.',
            })
        );

        const result = await generateAutoReply({ ...baseRequest, channel: 'SMS' });

        expect(result.body.length).toBeLessThanOrEqual(160);
        expect(result.body.endsWith('...')).toBe(true);
    });

    it('does not truncate WhatsApp body within 400 chars', async () => {
        const body = 'B'.repeat(300);
        mockCreate.mockResolvedValue(
            makeOpenAIResponse({ shouldSend: true, subject: '', body, reasoning: 'ok' })
        );

        const result = await generateAutoReply({ ...baseRequest, channel: 'WHATSAPP' });

        expect(result.body.length).toBe(300);
    });

    it('returns fallback when OpenAI throws', async () => {
        mockCreate.mockRejectedValue(new Error('OpenAI unavailable'));

        const result = await generateAutoReply(baseRequest);

        expect(result.shouldSend).toBe(false);
        expect(result.body).toBe('');
        expect(result.reasoning).toContain('failed');
    });

    it('returns fallback when response content is null', async () => {
        mockCreate.mockResolvedValue({ choices: [{ message: { content: null } }] });

        const result = await generateAutoReply(baseRequest);

        expect(result.shouldSend).toBe(false);
    });

    it('returns fallback when shouldSend is not boolean', async () => {
        mockCreate.mockResolvedValue(
            makeOpenAIResponse({ shouldSend: 'yes', subject: '', body: 'Hi', reasoning: 'ok' })
        );

        const result = await generateAutoReply(baseRequest);

        expect(result.shouldSend).toBe(false);
    });

    it('returns fallback when shouldSend is true but body is empty', async () => {
        mockCreate.mockResolvedValue(
            makeOpenAIResponse({ shouldSend: true, subject: '', body: '   ', reasoning: 'ok' })
        );

        const result = await generateAutoReply(baseRequest);

        expect(result.shouldSend).toBe(false);
    });

    it('uses companyName and companyPhone from request when provided', async () => {
        mockCreate.mockResolvedValue(
            makeOpenAIResponse({ shouldSend: true, subject: '', body: 'Hello', reasoning: 'ok' })
        );

        await generateAutoReply({
            ...baseRequest,
            companyName: 'Custom DC Firm',
            companyPhone: '011 123 4567',
        });

        const calledPrompt = mockCreate.mock.calls[0][0].messages[1].content as string;
        expect(calledPrompt).toContain('Custom DC Firm');
        expect(calledPrompt).toContain('011 123 4567');
    });

    it('includes senderType DEBT_COUNSELLOR in prompt', async () => {
        mockCreate.mockResolvedValue(
            makeOpenAIResponse({ shouldSend: true, subject: '', body: 'Noted', reasoning: 'ok' })
        );

        await generateAutoReply({ ...baseRequest, senderType: 'DEBT_COUNSELLOR' });

        const calledPrompt = mockCreate.mock.calls[0][0].messages[1].content as string;
        expect(calledPrompt).toContain('Debt Counsellor');
    });

    it('sets subject to empty string for SMS channel', async () => {
        mockCreate.mockResolvedValue(
            makeOpenAIResponse({ shouldSend: true, subject: '', body: 'OK noted.', reasoning: 'ok' })
        );

        const result = await generateAutoReply({ ...baseRequest, channel: 'SMS' });

        expect(result.subject).toBe('');
    });
});
