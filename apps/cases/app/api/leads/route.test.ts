import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@zenowethu/shared-lib', () => ({
    auth:         vi.fn(),
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
    calculateSlaDeadline: vi.fn().mockReturnValue(new Date('2026-06-01')),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        lead: {
            findMany:  vi.fn(),
            findUnique: vi.fn(),
            count:     vi.fn(),
            groupBy:   vi.fn(),
            create:    vi.fn(),
            update:    vi.fn(),
        },
        client: {
            findUnique: vi.fn(),
        },
        case: {
            count: vi.fn(),
            create: vi.fn(),
        },
        $transaction: vi.fn(),
    },
}));

import { auth } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { GET } from './route';
import { GET as GET_ID, PATCH } from './[id]/route';
import { POST as POST_CONVERT } from './[id]/convert/route';

// ── Session fixtures ───────────────────────────────────────────────────────

const admin  = { user: { id: 'u1', isAdmin: true,  isExecutive: false, isSeniorManager: false, isManager: false, role: 'ADMIN',  userType: 'STAFF' } };
const member = { user: { id: 'u3', isAdmin: false, isExecutive: false, isSeniorManager: false, isManager: false, role: 'MEMBER', userType: 'B2B_PARTNER' } };

// ── Fixtures ───────────────────────────────────────────────────────────────

const sampleLead = {
    id:              'lead-1',
    firstName:       'Jane',
    lastName:        'Doe',
    idNumber:        '9001015009083',
    phone:           '0821234567',
    email:           'jane@example.com',
    service:         'debt-review-removal',
    status:          'NEW',
    source:          'WEBSITE_ASSESSMENT',
    popiaConsent:    true,
    notes:           null,
    convertedCaseId: null,
    assignedToId:    null,
    createdAt:       new Date(),
    updatedAt:       new Date(),
    assignedTo:      null,
};

function makeReq(url: string, method = 'GET', body?: unknown) {
    return new Request(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body:    body ? JSON.stringify(body) : undefined,
    });
}

// ── GET /api/leads ─────────────────────────────────────────────────────────

describe('GET /api/leads', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns 401 for unauthenticated requests', async () => {
        vi.mocked(auth).mockResolvedValueOnce(null as never);
        const res = await GET(makeReq('http://localhost/api/leads'));
        expect(res.status).toBe(401);
    });

    it('returns 403 for B2B partner role', async () => {
        vi.mocked(auth).mockResolvedValueOnce(member as never);
        const res = await GET(makeReq('http://localhost/api/leads'));
        expect(res.status).toBe(403);
    });

    it('returns paginated leads for admin', async () => {
        vi.mocked(auth).mockResolvedValueOnce(admin as never);
        vi.mocked(prisma.lead.findMany).mockResolvedValueOnce([sampleLead] as never);
        vi.mocked(prisma.lead.count).mockResolvedValueOnce(1);
        vi.mocked(prisma.lead.groupBy as any).mockResolvedValueOnce([
            { status: 'NEW', _count: { _all: 1 } },
        ] as never);

        const res  = await GET(makeReq('http://localhost/api/leads'));
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.leads).toHaveLength(1);
        expect(body.meta.total).toBe(1);
        expect(body.counts.NEW).toBe(1);
    });

    it('passes status filter to Prisma where clause', async () => {
        vi.mocked(auth).mockResolvedValueOnce(admin as never);
        vi.mocked(prisma.lead.findMany).mockResolvedValueOnce([] as never);
        vi.mocked(prisma.lead.count).mockResolvedValueOnce(0);
        vi.mocked(prisma.lead.groupBy as any).mockResolvedValueOnce([] as never);

        await GET(makeReq('http://localhost/api/leads?status=CONTACTED'));
        const [call] = vi.mocked(prisma.lead.findMany).mock.calls;
        expect((call[0] as any).where.status).toBe('CONTACTED');
    });

    it('does not filter by status when ALL is requested', async () => {
        vi.mocked(auth).mockResolvedValueOnce(admin as never);
        vi.mocked(prisma.lead.findMany).mockResolvedValueOnce([] as never);
        vi.mocked(prisma.lead.count).mockResolvedValueOnce(0);
        vi.mocked(prisma.lead.groupBy as any).mockResolvedValueOnce([] as never);

        await GET(makeReq('http://localhost/api/leads?status=ALL'));
        const [call] = vi.mocked(prisma.lead.findMany).mock.calls;
        expect((call[0] as any).where.status).toBeUndefined();
    });
});

// ── GET /api/leads/[id] ────────────────────────────────────────────────────

describe('GET /api/leads/[id]', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns 401 for unauthenticated requests', async () => {
        vi.mocked(auth).mockResolvedValueOnce(null as never);
        const res = await GET_ID(makeReq('http://localhost/api/leads/lead-1'), {
            params: Promise.resolve({ id: 'lead-1' }),
        });
        expect(res.status).toBe(401);
    });

    it('returns 404 when lead does not exist', async () => {
        vi.mocked(auth).mockResolvedValueOnce(admin as never);
        vi.mocked(prisma.lead.findUnique).mockResolvedValueOnce(null);
        const res = await GET_ID(makeReq('http://localhost/api/leads/bad-id'), {
            params: Promise.resolve({ id: 'bad-id' }),
        });
        expect(res.status).toBe(404);
    });

    it('returns lead for admin', async () => {
        vi.mocked(auth).mockResolvedValueOnce(admin as never);
        vi.mocked(prisma.lead.findUnique).mockResolvedValueOnce(sampleLead as never);
        const res  = await GET_ID(makeReq('http://localhost/api/leads/lead-1'), {
            params: Promise.resolve({ id: 'lead-1' }),
        });
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.lead.id).toBe('lead-1');
    });
});

// ── PATCH /api/leads/[id] ──────────────────────────────────────────────────

describe('PATCH /api/leads/[id]', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns 401 when not authenticated', async () => {
        vi.mocked(auth).mockResolvedValueOnce(null as never);
        const res = await PATCH(makeReq('http://localhost/api/leads/lead-1', 'PATCH', { status: 'CONTACTED' }), {
            params: Promise.resolve({ id: 'lead-1' }),
        });
        expect(res.status).toBe(401);
    });

    it('returns 422 for invalid status value', async () => {
        vi.mocked(auth).mockResolvedValueOnce(admin as never);
        // No findUnique mock needed — route validates body before fetching lead
        const res = await PATCH(makeReq('http://localhost/api/leads/lead-1', 'PATCH', { status: 'INVALID' }), {
            params: Promise.resolve({ id: 'lead-1' }),
        });
        expect(res.status).toBe(422);
    });

    it('returns 404 when lead does not exist', async () => {
        vi.mocked(auth).mockResolvedValueOnce(admin as never);
        vi.mocked(prisma.lead.findUnique).mockResolvedValueOnce(null);
        const res = await PATCH(makeReq('http://localhost/api/leads/bad-id', 'PATCH', { status: 'CONTACTED' }), {
            params: Promise.resolve({ id: 'bad-id' }),
        });
        expect(res.status).toBe(404);
    });

    it('updates lead status for admin', async () => {
        vi.mocked(auth).mockResolvedValueOnce(admin as never);
        vi.mocked(prisma.lead.findUnique).mockResolvedValueOnce(sampleLead as never);
        vi.mocked(prisma.lead.update).mockResolvedValueOnce({ ...sampleLead, status: 'CONTACTED' } as never);

        const res  = await PATCH(makeReq('http://localhost/api/leads/lead-1', 'PATCH', { status: 'CONTACTED' }), {
            params: Promise.resolve({ id: 'lead-1' }),
        });
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.lead.status).toBe('CONTACTED');
    });
});

// ── POST /api/leads/[id]/convert ───────────────────────────────────────────

describe('POST /api/leads/[id]/convert', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns 401 for unauthenticated requests', async () => {
        vi.mocked(auth).mockResolvedValueOnce(null as never);
        const res = await POST_CONVERT(
            makeReq('http://localhost/api/leads/lead-1/convert', 'POST', { projectId: 'proj-1' }),
            { params: Promise.resolve({ id: 'lead-1' }) },
        );
        expect(res.status).toBe(401);
    });

    it('returns 422 when projectId is missing', async () => {
        vi.mocked(auth).mockResolvedValueOnce(admin as never);
        // No findUnique mock needed — route validates body before fetching lead
        const res = await POST_CONVERT(
            makeReq('http://localhost/api/leads/lead-1/convert', 'POST', {}),
            { params: Promise.resolve({ id: 'lead-1' }) },
        );
        expect(res.status).toBe(422);
    });

    it('returns 404 when lead does not exist', async () => {
        vi.mocked(auth).mockResolvedValueOnce(admin as never);
        vi.mocked(prisma.lead.findUnique).mockResolvedValueOnce(null);
        const res = await POST_CONVERT(
            makeReq('http://localhost/api/leads/bad-id/convert', 'POST', { projectId: 'proj-1' }),
            { params: Promise.resolve({ id: 'bad-id' }) },
        );
        expect(res.status).toBe(404);
    });

    it('returns 409 when lead is already converted', async () => {
        vi.mocked(auth).mockResolvedValueOnce(admin as never);
        vi.mocked(prisma.lead.findUnique).mockResolvedValueOnce({
            ...sampleLead, status: 'CONVERTED', convertedCaseId: 'case-99',
        } as never);
        const res = await POST_CONVERT(
            makeReq('http://localhost/api/leads/lead-1/convert', 'POST', { projectId: 'proj-1' }),
            { params: Promise.resolve({ id: 'lead-1' }) },
        );
        expect(res.status).toBe(409);
    });

    it('creates a case and returns caseId on success', async () => {
        vi.mocked(auth).mockResolvedValueOnce(admin as never);
        vi.mocked(prisma.lead.findUnique).mockResolvedValueOnce(sampleLead as never);
        vi.mocked(prisma.client.findUnique).mockResolvedValueOnce(null);
        vi.mocked(prisma.case.count).mockResolvedValueOnce(42);
        vi.mocked(prisma.$transaction).mockImplementationOnce(async (fn: any) => {
            return fn({
                client: {
                    findUnique: vi.fn().mockResolvedValue(null),
                    create:     vi.fn().mockResolvedValue({ id: 'client-1' }),
                },
                case: {
                    create: vi.fn().mockResolvedValue({ id: 'case-1', fileNumber: 'ZEN-00043' }),
                },
                lead: { update: vi.fn().mockResolvedValue({ ...sampleLead, status: 'CONVERTED' }) },
            });
        });

        const res  = await POST_CONVERT(
            makeReq('http://localhost/api/leads/lead-1/convert', 'POST', { projectId: 'proj-1' }),
            { params: Promise.resolve({ id: 'lead-1' }) },
        );
        const body = await res.json();
        expect(res.status).toBe(201);
        expect(body.caseId).toBe('case-1');
    });
});
