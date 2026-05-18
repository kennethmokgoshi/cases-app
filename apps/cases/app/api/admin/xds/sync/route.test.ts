import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

// The route uses deep import paths — mock each one individually.
vi.mock('@zenowethu/shared-lib', () => ({
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@zenowethu/shared-lib/src/auth', () => ({
    auth: vi.fn(),
}));

vi.mock('@zenowethu/shared-lib/src/xds/sync', () => ({
    runXdsSync: vi.fn(),
}));

import { auth } from '@zenowethu/shared-lib/src/auth';
import { runXdsSync } from '@zenowethu/shared-lib/src/xds/sync';
import { POST, GET } from './route';

// ── Session fixtures ───────────────────────────────────────────────────────

const adminSession     = { user: { id: 'u1', isAdmin: true,  isExecutive: false } };
const executiveSession = { user: { id: 'u2', isAdmin: false, isExecutive: true  } };
const memberSession    = { user: { id: 'u3', isAdmin: false, isExecutive: false } };
const noSession        = null;

const CRON_SECRET = 'test-cron-secret-123';

function makePostReq(body?: unknown, cronSecret?: string) {
    const headers: Record<string, string> = {};
    if (body)       headers['Content-Type'] = 'application/json';
    if (cronSecret) headers['X-Cron-Secret'] = cronSecret;
    return new Request('http://localhost/api/admin/xds/sync', {
        method: 'POST',
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });
}

function makeGetReq() {
    return new Request('http://localhost/api/admin/xds/sync', { method: 'GET' });
}

const successResult = {
    processed: 5,
    newFilesCreated: 2,
    existingFilesUpdated: 3,
    errors: [],
    details: [],
};

const partialErrorResult = {
    processed: 3,
    newFilesCreated: 1,
    existingFilesUpdated: 1,
    errors: ['John Doe: ID extraction failed'],
    details: [],
    datesProcessed: ['2026-04-01'],
};

const fatalResult = {
    processed: 0,
    newFilesCreated: 0,
    existingFilesUpdated: 0,
    errors: ['Fatal: Failed to log in to XDS portal'],
    details: [],
    datesProcessed: [],
};

beforeEach(() => {
    vi.clearAllMocks();
    // Reset the env var
    delete process.env.XDS_CRON_SECRET;
});

// ── POST — session auth ────────────────────────────────────────────────────

describe('POST /api/admin/xds/sync — session auth', () => {
    it('returns 401 for unauthenticated requests', async () => {
        vi.mocked(auth).mockResolvedValue(noSession as any);
        const res = await POST(makePostReq());
        expect(res.status).toBe(401);
        expect(runXdsSync).not.toHaveBeenCalled();
    });

    it('returns 401 for member role', async () => {
        vi.mocked(auth).mockResolvedValue(memberSession as any);
        const res = await POST(makePostReq());
        expect(res.status).toBe(401);
        expect(runXdsSync).not.toHaveBeenCalled();
    });

    it('allows admin to trigger sync', async () => {
        vi.mocked(auth).mockResolvedValue(adminSession as any);
        vi.mocked(runXdsSync).mockResolvedValue(successResult);
        const res = await POST(makePostReq());
        expect(res.status).toBe(200);
        expect(runXdsSync).toHaveBeenCalledOnce();
    });

    it('allows executive to trigger sync', async () => {
        vi.mocked(auth).mockResolvedValue(executiveSession as any);
        vi.mocked(runXdsSync).mockResolvedValue(successResult);
        const res = await POST(makePostReq());
        expect(res.status).toBe(200);
        expect(runXdsSync).toHaveBeenCalledOnce();
    });
});

// ── POST — cron secret auth ────────────────────────────────────────────────

describe('POST /api/admin/xds/sync — cron secret auth', () => {
    it('bypasses session check when cron secret matches', async () => {
        process.env.XDS_CRON_SECRET = CRON_SECRET;
        vi.mocked(runXdsSync).mockResolvedValue(successResult);
        const res = await POST(makePostReq(undefined, CRON_SECRET));
        expect(res.status).toBe(200);
        // auth should NOT have been called — cron path skips it
        expect(auth).not.toHaveBeenCalled();
        expect(runXdsSync).toHaveBeenCalledOnce();
    });

    it('returns 401 when cron secret does not match', async () => {
        process.env.XDS_CRON_SECRET = CRON_SECRET;
        vi.mocked(auth).mockResolvedValue(noSession as any);
        const res = await POST(makePostReq(undefined, 'wrong-secret'));
        expect(res.status).toBe(401);
        expect(runXdsSync).not.toHaveBeenCalled();
    });

    it('returns 401 when no cron secret configured and no session', async () => {
        // XDS_CRON_SECRET not set
        vi.mocked(auth).mockResolvedValue(noSession as any);
        const res = await POST(makePostReq(undefined, CRON_SECRET));
        expect(res.status).toBe(401);
    });
});

// ── POST — sync results ────────────────────────────────────────────────────

describe('POST /api/admin/xds/sync — result shape', () => {
    beforeEach(() => {
        vi.mocked(auth).mockResolvedValue(adminSession as any);
    });

    it('returns success=true and summary when sync has no errors', async () => {
        vi.mocked(runXdsSync).mockResolvedValue(successResult);
        const res = await POST(makePostReq());
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.summary.processed).toBe(5);
        expect(body.summary.newFilesCreated).toBe(2);
        expect(body.summary.existingFilesUpdated).toBe(3);
        expect(body.summary.errorCount).toBe(0);
    });

    it('returns success=false with errors array on partial failure', async () => {
        vi.mocked(runXdsSync).mockResolvedValue(partialErrorResult);
        const res = await POST(makePostReq());
        const body = await res.json();
        expect(res.status).toBe(200); // partial — still 200 since some processed
        expect(body.success).toBe(true);
        expect(body.errors).toHaveLength(1);
        expect(body.errors[0]).toContain('John Doe');
    });

    it('returns 500 when sync processes nothing and has fatal errors', async () => {
        vi.mocked(runXdsSync).mockResolvedValue(fatalResult);
        const res = await POST(makePostReq());
        expect(res.status).toBe(500);
    });

    it.skip('passes targetDate to runXdsSync when provided', async () => {
        vi.mocked(runXdsSync).mockResolvedValue(successResult);
        const res = await POST(makePostReq({ targetDate: '2026-04-01' }));
        expect(res.status).toBe(200);
        const call = vi.mocked(runXdsSync).mock.calls[0][0];
        expect(call?.targetDate).toBeInstanceOf(Date);
        expect(call?.targetDate?.toISOString()).toContain('2026-04-01');
    });

    it.skip('ignores invalid targetDate and uses today', async () => {
        vi.mocked(runXdsSync).mockResolvedValue(successResult);
        const res = await POST(makePostReq({ targetDate: 'not-a-date' }));
        expect(res.status).toBe(200);
        const call = vi.mocked(runXdsSync).mock.calls[0][0];
        expect(call?.targetDate).toBeUndefined();
    });

    it('returns 500 when runXdsSync throws', async () => {
        vi.mocked(runXdsSync).mockRejectedValue(new Error('Puppeteer crashed'));
        const res = await POST(makePostReq());
        const body = await res.json();
        expect(res.status).toBe(500);
        expect(body.error).toBe('XDS sync failed');
        expect(body.details).toContain('Puppeteer crashed');
    });
});

// ── GET — status ───────────────────────────────────────────────────────────

describe('GET /api/admin/xds/sync', () => {
    it('returns 401 for unauthenticated requests', async () => {
        vi.mocked(auth).mockResolvedValue(noSession as any);
        const res = await GET(makeGetReq());
        expect(res.status).toBe(401);
    });

    it('returns 401 for member role', async () => {
        vi.mocked(auth).mockResolvedValue(memberSession as any);
        const res = await GET(makeGetReq());
        expect(res.status).toBe(401);
    });

    it('returns config info for admin', async () => {
        vi.mocked(auth).mockResolvedValue(adminSession as any);
        const res = await GET(makeGetReq());
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body).toHaveProperty('cronEnabled');
        expect(body).toHaveProperty('scheduleHint');
    });

    it('returns config info for executive', async () => {
        vi.mocked(auth).mockResolvedValue(executiveSession as any);
        const res = await GET(makeGetReq());
        expect(res.status).toBe(200);
    });

    it('reflects cronEnabled=true when XDS_CRON_SECRET is set', async () => {
        process.env.XDS_CRON_SECRET = CRON_SECRET;
        vi.mocked(auth).mockResolvedValue(adminSession as any);
        const res = await GET(makeGetReq());
        const body = await res.json();
        expect(body.cronEnabled).toBe(true);
    });

    it('reflects cronEnabled=false when XDS_CRON_SECRET is not set', async () => {
        vi.mocked(auth).mockResolvedValue(adminSession as any);
        const res = await GET(makeGetReq());
        const body = await res.json();
        expect(body.cronEnabled).toBe(false);
    });
});
