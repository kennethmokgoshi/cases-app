import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@zenowethu/database', () => ({
    prisma: {
        lead: {
            findFirst: vi.fn(),
            create:    vi.fn(),
        },
    },
}));

vi.mock('@zenowethu/shared-lib/src/notifications/service', () => ({
    sendInternalNotification: vi.fn(),
}));

vi.mock('@zenowethu/shared-lib/src/company/company-profile-service', () => ({
    getCompanyProfile: vi.fn().mockResolvedValue({ phone: '012 345 6789' }),
}));

vi.mock('@zenowethu/shared-lib/src/logger', () => ({
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

import { prisma } from '@zenowethu/database';
import { sendInternalNotification } from '@zenowethu/shared-lib/src/notifications/service';
import { __resetRateLimiter } from '@zenowethu/shared-lib/src/auth/rate-limit';
import { POST } from './route';

// ── Helpers ────────────────────────────────────────────────────────────────

const validBody = {
    firstName:    'Jane',
    lastName:     'Doe',
    idNumber:     '9001015009083',
    phone:        '+27 82 123 4567',
    email:        'jane@example.com',
    service:      'debt-review-removal',
    popiaConsent: true,
};

function post(body: unknown, ip = '10.0.0.1'): Request {
    return new Request('http://localhost/api/leads', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
        body:    typeof body === 'string' ? body : JSON.stringify(body),
    });
}

const findFirst = vi.mocked(prisma.lead.findFirst);
const create    = vi.mocked(prisma.lead.create);
const notify    = vi.mocked(sendInternalNotification);

beforeEach(() => {
    vi.clearAllMocks();
    __resetRateLimiter();
    findFirst.mockResolvedValue(null);
    create.mockResolvedValue({ id: 'lead-1' } as Awaited<ReturnType<typeof prisma.lead.create>>);
    notify.mockResolvedValue(undefined);
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('POST /api/leads', () => {
    it('links the staff email to CASES_APP_URL without a double slash', async () => {
        process.env.CASES_APP_URL = 'https://cases.acme.test/';
        await POST(post(validBody));
        expect(notify.mock.calls[0][0].variables.leadsUrl).toBe('https://cases.acme.test/leads');
        delete process.env.CASES_APP_URL;
    });

    it('saves a new lead with a normalised phone and notifies admins', async () => {
        const res = await POST(post(validBody));

        expect(res.status).toBe(201);
        expect(await res.json()).toEqual({ success: true, id: 'lead-1' });
        expect(create).toHaveBeenCalledWith({
            data: expect.objectContaining({ phone: '0821234567', status: 'NEW', notes: null, popiaConsent: true }),
        });
        expect(notify).toHaveBeenCalledWith(expect.objectContaining({
            role:       'ADMIN',
            statusCode: 'WEBSITE_LEAD',
            variables:  expect.objectContaining({ phone: '0821234567', clientName: 'Jane Doe' }),
        }));
    });

    it('matches duplicates against every stored phone format', async () => {
        await POST(post(validBody));

        expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                phone:  { in: ['0821234567', '+27821234567', '27821234567'] },
                status: { notIn: ['REJECTED', 'CLOSED'] },
            }),
        }));
    });

    it('saves a repeat submission as DUPLICATE without notifying admins', async () => {
        findFirst.mockResolvedValue({ id: 'lead-0' } as Awaited<ReturnType<typeof prisma.lead.findFirst>>);

        const res = await POST(post(validBody));

        expect(res.status).toBe(201);
        expect(create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                status: 'DUPLICATE',
                notes:  expect.stringContaining('lead-0'),
            }),
        });
        expect(notify).not.toHaveBeenCalled();
    });

    it('silently drops a submission with the honeypot filled', async () => {
        const res = await POST(post({ ...validBody, website: 'http://spam.example' }));

        expect(res.status).toBe(201);
        expect(await res.json()).toEqual({ success: true });
        expect(create).not.toHaveBeenCalled();
        expect(notify).not.toHaveBeenCalled();
    });

    it('rejects a submission without POPIA consent', async () => {
        const res = await POST(post({ ...validBody, popiaConsent: false }));

        expect(res.status).toBe(422);
        expect(create).not.toHaveBeenCalled();
    });

    it('rejects an unparseable body', async () => {
        const res = await POST(post('not json'));
        expect(res.status).toBe(400);
    });

    it('rate limits after 5 submissions from the same IP', async () => {
        for (let i = 0; i < 5; i++) {
            expect((await POST(post(validBody, '10.0.0.9'))).status).toBe(201);
        }
        const blocked = await POST(post(validBody, '10.0.0.9'));

        expect(blocked.status).toBe(429);
        expect(blocked.headers.get('Retry-After')).toBeTruthy();
        expect((await blocked.json()).error).toContain('012 345 6789');
        // A different IP is unaffected.
        expect((await POST(post(validBody, '10.0.0.10'))).status).toBe(201);
    });

    it('still returns 201 when the admin notification fails', async () => {
        notify.mockRejectedValue(new Error('SMTP down'));

        const res = await POST(post(validBody));
        expect(res.status).toBe(201);
    });

    it('returns 500 with a friendly message when the database fails', async () => {
        create.mockRejectedValue(new Error('db down'));

        const res = await POST(post(validBody));

        expect(res.status).toBe(500);
        // Tenant phone from the Company Profile, never a hard-coded number.
        expect((await res.json()).error).toContain('012 345 6789');
    });
});
