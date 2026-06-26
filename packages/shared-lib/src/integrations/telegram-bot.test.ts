import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@zenowethu/database', () => ({
    prisma: {
        telegramSession: {
            findUnique: vi.fn(),
            create: vi.fn().mockResolvedValue({}),
            update: vi.fn().mockResolvedValue({}),
        },
        client: {
            findUnique: vi.fn(),
            update: vi.fn().mockResolvedValue({}),
        },
        case: {
            findFirst: vi.fn(),
        },
    },
}));

vi.mock('../logger', () => ({
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../notifications/otp-service', () => ({
    generateOtpCode: vi.fn(() => '123456'),
    isValidOtpFormat: (c: string) => /^\d{6}$/.test(c),
    sendOtpEmail: vi.fn().mockResolvedValue(true),
}));

vi.mock('../ai/auto-reply', () => ({
    generateAutoReply: vi.fn(),
}));

import { handleTelegramMessage } from './telegram-bot';
import { prisma } from '@zenowethu/database';
import { sendOtpEmail } from '../notifications/otp-service';
import { generateAutoReply } from '../ai/auto-reply';

const session = (overrides: Record<string, any> = {}) => ({
    chatId: '555',
    state: 'AWAITING_ID',
    clientId: null,
    candidateClientId: null,
    otpCode: null,
    otpExpiresAt: null,
    attempts: 0,
    ...overrides,
});

beforeEach(() => {
    vi.clearAllMocks();
    (prisma.telegramSession.update as any).mockResolvedValue({});
    (prisma.client.update as any).mockResolvedValue({});
});

describe('handleTelegramMessage', () => {
    it('greets and asks for an ID number on /start', async () => {
        (prisma.telegramSession.findUnique as any).mockResolvedValue(session());
        const res = await handleTelegramMessage({ chatId: '555', text: '/start' });
        expect(res.state).toBe('AWAITING_ID');
        expect(res.reply).toMatch(/ID number/i);
    });

    it('creates a session when the chat is new', async () => {
        (prisma.telegramSession.findUnique as any).mockResolvedValue(null);
        (prisma.telegramSession.create as any).mockResolvedValue(session());
        await handleTelegramMessage({ chatId: '999', text: 'hi' });
        expect(prisma.telegramSession.create).toHaveBeenCalledOnce();
    });

    it('re-prompts when the ID is not 13 digits', async () => {
        (prisma.telegramSession.findUnique as any).mockResolvedValue(session());
        const res = await handleTelegramMessage({ chatId: '555', text: '12345' });
        expect(res.state).toBe('AWAITING_ID');
        expect(prisma.client.findUnique).not.toHaveBeenCalled();
    });

    it('emails an OTP and moves to AWAITING_OTP when the ID matches a client with an email', async () => {
        (prisma.telegramSession.findUnique as any).mockResolvedValue(session());
        (prisma.client.findUnique as any).mockResolvedValue({ id: 'c1', email: 'thabo@example.com', firstName: 'Thabo' });

        const res = await handleTelegramMessage({ chatId: '555', text: '8001015009087' });

        expect(sendOtpEmail).toHaveBeenCalledWith(expect.objectContaining({ email: 'thabo@example.com', otpCode: '123456' }));
        expect(res.state).toBe('AWAITING_OTP');
        expect(res.reply).toMatch(/t\*\*\*@example\.com/);
        expect(prisma.telegramSession.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ state: 'AWAITING_OTP', candidateClientId: 'c1', otpCode: '123456' }) }),
        );
    });

    it('refuses to send a code when the matched client has no email on file', async () => {
        (prisma.telegramSession.findUnique as any).mockResolvedValue(session());
        (prisma.client.findUnique as any).mockResolvedValue({ id: 'c1', email: null, firstName: 'Thabo' });

        const res = await handleTelegramMessage({ chatId: '555', text: '8001015009087' });

        expect(sendOtpEmail).not.toHaveBeenCalled();
        expect(res.state).toBe('AWAITING_ID');
        expect(res.reply).toMatch(/no email address on record/i);
    });

    it('tells the user when no file matches the ID', async () => {
        (prisma.telegramSession.findUnique as any).mockResolvedValue(session());
        (prisma.client.findUnique as any).mockResolvedValue(null);

        const res = await handleTelegramMessage({ chatId: '555', text: '8001015009087' });
        expect(res.reply).toMatch(/couldn't find a file/i);
        expect(res.state).toBe('AWAITING_ID');
    });

    it('verifies and binds the client when the OTP matches', async () => {
        (prisma.telegramSession.findUnique as any).mockResolvedValue(
            session({ state: 'AWAITING_OTP', otpCode: '123456', otpExpiresAt: new Date(Date.now() + 60000), candidateClientId: 'c1' }),
        );
        (prisma.client.findUnique as any).mockResolvedValue({ id: 'c1', firstName: 'Thabo' });

        const res = await handleTelegramMessage({ chatId: '555', text: '123456' });

        expect(res.state).toBe('VERIFIED');
        expect(res.clientId).toBe('c1');
        expect(res.reply).toMatch(/verified/i);
        // mirrors the chat id onto the Client for outbound notifications
        expect(prisma.client.update).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 'c1' }, data: { telegramNumber: '555' } }),
        );
    });

    it('rejects an incorrect OTP without verifying', async () => {
        (prisma.telegramSession.findUnique as any).mockResolvedValue(
            session({ state: 'AWAITING_OTP', otpCode: '123456', otpExpiresAt: new Date(Date.now() + 60000), candidateClientId: 'c1' }),
        );

        const res = await handleTelegramMessage({ chatId: '555', text: '000000' });

        expect(res.state).toBe('AWAITING_OTP');
        expect(res.reply).toMatch(/doesn't match/i);
        expect(prisma.client.update).not.toHaveBeenCalled();
    });

    it('treats an expired OTP as needing re-verification', async () => {
        (prisma.telegramSession.findUnique as any).mockResolvedValue(
            session({ state: 'AWAITING_OTP', otpCode: '123456', otpExpiresAt: new Date(Date.now() - 1000), candidateClientId: 'c1' }),
        );

        const res = await handleTelegramMessage({ chatId: '555', text: '123456' });
        expect(res.state).toBe('AWAITING_ID');
        expect(res.reply).toMatch(/expired/i);
    });

    it('answers a verified consumer with the AI reply grounded in their case', async () => {
        (prisma.telegramSession.findUnique as any).mockResolvedValue(session({ state: 'VERIFIED', clientId: 'c1' }));
        (prisma.case.findFirst as any).mockResolvedValue({
            fileNumber: 'ZDM-2026-001',
            status: 'NEW_LEAD',
            nextUpdate: null,
            debtCounsellorName: null,
            client: { firstName: 'Thabo', lastName: 'Mokoena' },
        });
        (generateAutoReply as any).mockResolvedValue({ shouldSend: true, subject: '', body: 'Your file is being reviewed.', reasoning: 'status query' });

        const res = await handleTelegramMessage({ chatId: '555', text: 'whats my status?' });

        expect(generateAutoReply).toHaveBeenCalledWith(expect.objectContaining({ channel: 'TELEGRAM', senderType: 'CLIENT' }));
        expect(res.reply).toBe('Your file is being reviewed.');
        expect(res.state).toBe('VERIFIED');
    });

    it('escalates to staff when the AI declines to answer', async () => {
        (prisma.telegramSession.findUnique as any).mockResolvedValue(session({ state: 'VERIFIED', clientId: 'c1' }));
        (prisma.case.findFirst as any).mockResolvedValue({
            fileNumber: 'ZDM-2026-001',
            status: 'NEW_LEAD',
            nextUpdate: null,
            debtCounsellorName: null,
            client: { firstName: 'Thabo', lastName: 'Mokoena' },
        });
        (generateAutoReply as any).mockResolvedValue({ shouldSend: false, subject: '', body: '', reasoning: 'needs human' });

        const res = await handleTelegramMessage({ chatId: '555', text: 'I want to sue my creditor' });

        expect(res.escalated).toBe(true);
        expect(res.reply).toMatch(/team member/i);
    });

    it('unbinds the chat on /logout', async () => {
        (prisma.telegramSession.findUnique as any).mockResolvedValue(session({ state: 'VERIFIED', clientId: 'c1' }));
        const res = await handleTelegramMessage({ chatId: '555', text: '/logout' });
        expect(res.state).toBe('AWAITING_ID');
        expect(prisma.client.update).toHaveBeenCalledWith(expect.objectContaining({ data: { telegramNumber: null } }));
    });
});
