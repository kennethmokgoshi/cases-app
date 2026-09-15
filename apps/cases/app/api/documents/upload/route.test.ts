import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@zenowethu/shared-lib', () => ({
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
    sendStatusChangeNotification: vi.fn(),
    getStatusByCode: vi.fn(),
}));

vi.mock('@zenowethu/shared-lib/src/auth', () => ({
    auth: vi.fn(),
}));

vi.mock('@zenowethu/shared-lib/src/openai', () => ({
    analyzeDocument: vi.fn(),
    analyzeCombinedDocument: vi.fn(),
    batchAnalyzeDocuments: vi.fn(),
    extractDocumentsFromCombinedPdf: vi.fn(),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: { findUnique: vi.fn() },
        document: { findFirst: vi.fn(), create: vi.fn() },
    },
}));

vi.mock('fs/promises', () => ({ writeFile: vi.fn(), mkdir: vi.fn() }));
vi.mock('fs', () => ({ existsSync: vi.fn(() => true) }));

import { auth } from '@zenowethu/shared-lib/src/auth';
import { prisma } from '@zenowethu/database';
import { analyzeDocument } from '@zenowethu/shared-lib/src/openai';
import { POST } from './route';

const db = prisma as unknown as {
    case: { findUnique: ReturnType<typeof vi.fn> };
    document: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
};

function multipartRequest(fields: Record<string, string>) {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    form.append('file_ID', new Blob(['fake-id-bytes'], { type: 'image/png' }), 'id.png');
    return new Request('http://localhost/api/documents/upload', { method: 'POST', body: form });
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('POST /api/documents/upload — authentication', () => {
    it('rejects an anonymous caller before reading the body or touching the database', async () => {
        vi.mocked(auth).mockResolvedValue(null as never);

        const res = await POST(multipartRequest({ caseId: 'case1' }));

        expect(res.status).toBe(401);
        expect(db.case.findUnique).not.toHaveBeenCalled();
        expect(db.document.create).not.toHaveBeenCalled();
        expect(analyzeDocument).not.toHaveBeenCalled();
    });

    it('rejects a session with no user id', async () => {
        vi.mocked(auth).mockResolvedValue({ user: {} } as never);

        const res = await POST(multipartRequest({ caseId: 'case1' }));

        expect(res.status).toBe(401);
        expect(db.document.create).not.toHaveBeenCalled();
    });

    it('still validates the case id for a signed-in user', async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: 'staff1', userType: 'STAFF' } } as never);

        const res = await POST(multipartRequest({}));

        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: 'Case ID is required' });
    });

    it('does not echo internal error details to the client', async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: 'staff1', userType: 'STAFF' } } as never);
        db.case.findUnique.mockResolvedValue({ id: 'case1', client: null, projects: [] });
        db.document.findFirst.mockResolvedValue(null);
        db.document.create.mockRejectedValue(new Error('Foreign key constraint violated: Document_caseId_fkey'));

        const res = await POST(multipartRequest({ caseId: 'case1', skipAnalysis: 'true' }));

        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body).toEqual({ error: 'Failed to upload documents' });
        expect(JSON.stringify(body)).not.toContain('Foreign key');
    });
});
