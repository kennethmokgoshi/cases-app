import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        user: {
            findUnique: vi.fn(),
            findFirst:  vi.fn(),
            update:     vi.fn(),
        },
    },
}));
vi.mock('../logger', () => ({
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('../company/company-profile-service', () => ({
    getCompanyProfile: vi.fn().mockResolvedValue({ tradingName: 'Acme Debt Counselling' }),
}));
vi.mock('../notifications/templates', () => ({
    renderBrandedEmail: vi.fn((content: string, opts: { button: { url: string } }) => `${content}|${opts.button.url}`),
}));
vi.mock('../notifications/service', () => ({
    sendTransactionalEmail: vi.fn(),
}));

import { prisma } from '@zenowethu/database';
import { sendTransactionalEmail } from '../notifications/service';
import {
    hashStaffResetToken,
    requestStaffPasswordReset,
    resetStaffPassword,
} from './staff-password-reset';
import { forgotPasswordPOST, resetPasswordPOST } from './staff-password-reset-routes';
import { __resetRateLimiter } from './rate-limit';

const findUnique = vi.mocked(prisma.user.findUnique);
const findFirst  = vi.mocked(prisma.user.findFirst);
const update     = vi.mocked(prisma.user.update);
const sendEmail  = vi.mocked(sendTransactionalEmail);

beforeEach(() => {
    vi.clearAllMocks();
    __resetRateLimiter();
    sendEmail.mockResolvedValue({ smsSuccess: false, emailSuccess: true, errors: [] } as never);
    update.mockResolvedValue({} as never);
});

function req(path: string, body: unknown, ip = '10.0.0.1') {
    return new Request(`https://cases.example.com${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
        body: JSON.stringify(body),
    }) as never;
}

describe('requestStaffPasswordReset', () => {
    it('stores only the token hash and emails the raw token link', async () => {
        findUnique.mockResolvedValue({ id: 'u1', email: 'jane@acme.test', firstName: 'Jane' } as never);

        const res = await requestStaffPasswordReset('  Jane@Acme.test ', 'https://cases.example.com/');

        expect(res.emailSent).toBe(true);
        expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { email: 'jane@acme.test' } }));

        const html = sendEmail.mock.calls[0][0].html;
        const rawToken = /token=([a-f0-9]{64})/.exec(html)?.[1];
        expect(rawToken).toBeDefined();
        expect(html).toContain('https://cases.example.com/reset-password?token=');

        const stored = update.mock.calls[0][0].data as { resetPasswordToken: string };
        expect(stored.resetPasswordToken).toBe(hashStaffResetToken(rawToken!));
        expect(stored.resetPasswordToken).not.toBe(rawToken);
    });

    it('does nothing for an unknown email', async () => {
        findUnique.mockResolvedValue(null);

        expect(await requestStaffPasswordReset('nobody@acme.test', 'https://x')).toEqual({ emailSent: false });
        expect(update).not.toHaveBeenCalled();
        expect(sendEmail).not.toHaveBeenCalled();
    });
});

describe('resetStaffPassword', () => {
    it('looks up by hash, sets a bcrypt password and clears the token', async () => {
        findFirst.mockResolvedValue({ id: 'u1' } as never);

        expect(await resetStaffPassword('raw-token', 'NewPassw0rd!')).toBe(true);
        expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ resetPasswordToken: hashStaffResetToken('raw-token') }),
        }));
        const data = update.mock.calls[0][0].data as Record<string, unknown>;
        expect(String(data.password)).toMatch(/^\$2[aby]\$/);
        expect(data.resetPasswordToken).toBeNull();
    });

    it('returns false for an unknown or expired token', async () => {
        findFirst.mockResolvedValue(null);
        expect(await resetStaffPassword('bad', 'NewPassw0rd!')).toBe(false);
        expect(update).not.toHaveBeenCalled();
    });
});

describe('forgotPasswordPOST', () => {
    it('returns the generic message and no token for existing and unknown users', async () => {
        findUnique.mockResolvedValueOnce({ id: 'u1', email: 'a@acme.test', firstName: 'A' } as never);
        const a = await (await forgotPasswordPOST(req('/api/auth/forgot-password', { email: 'a@acme.test' }))).json();
        findUnique.mockResolvedValueOnce(null);
        const b = await (await forgotPasswordPOST(req('/api/auth/forgot-password', { email: 'b@acme.test' }))).json();

        expect(a).toEqual(b);
        expect(JSON.stringify(a)).not.toMatch(/token/i);
    });

    it('rejects an invalid email with 400', async () => {
        const res = await forgotPasswordPOST(req('/api/auth/forgot-password', { email: 'nope' }));
        expect(res.status).toBe(400);
    });

    it('rate limits after 5 requests per IP', async () => {
        findUnique.mockResolvedValue(null);
        for (let i = 0; i < 5; i++) {
            await forgotPasswordPOST(req('/api/auth/forgot-password', { email: 'x@acme.test' }, '1.1.1.1'));
        }
        const res = await forgotPasswordPOST(req('/api/auth/forgot-password', { email: 'x@acme.test' }, '1.1.1.1'));
        expect(res.status).toBe(429);
    });
});

describe('resetPasswordPOST', () => {
    it('returns 400 for an invalid token', async () => {
        findFirst.mockResolvedValue(null);
        const res = await resetPasswordPOST(req('/api/auth/reset-password', { token: 't', password: 'LongEnough1' }));
        expect(res.status).toBe(400);
    });

    it('returns 400 when the password is too short', async () => {
        const res = await resetPasswordPOST(req('/api/auth/reset-password', { token: 't', password: 'short' }));
        expect(res.status).toBe(400);
        expect(findFirst).not.toHaveBeenCalled();
    });

    it('returns 200 on success', async () => {
        findFirst.mockResolvedValue({ id: 'u1' } as never);
        const res = await resetPasswordPOST(req('/api/auth/reset-password', { token: 't', password: 'LongEnough1' }));
        expect(res.status).toBe(200);
    });
});
