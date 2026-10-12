import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs/promises', () => ({ writeFile: vi.fn(), mkdir: vi.fn() }));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: { findUnique: vi.fn() },
        document: { create: vi.fn() },
    },
}));

vi.mock('@zenowethu/shared-lib/src/auth/auth', () => ({ auth: vi.fn() }));

vi.mock('@zenowethu/shared-lib', () => ({
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
    touchCaseAction: vi.fn(),
}));

import { POST } from './route';
import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib/src/auth/auth';

const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
);
const ctx = { params: Promise.resolve({ id: 'case-1' }) };
const png = (name: string) => new File([PNG], name, { type: 'image/png' });

function req(build: (f: FormData) => void) {
    const form = new FormData();
    build(form);
    return new Request('http://localhost/api/cases/case-1/documents/images-to-pdf', { method: 'POST', body: form });
}

describe('POST /api/cases/[id]/documents/images-to-pdf', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(auth).mockResolvedValue({ user: { id: 'u1', userType: 'STAFF' } } as never);
        vi.mocked(prisma.case.findUnique).mockResolvedValue({ id: 'case-1' } as never);
        vi.mocked(prisma.document.create).mockImplementation((async ({ data }: { data: object }) => ({ id: 'd', ...data })) as never);
    });

    it('saves one PDF plus the originals for an ID front/back', async () => {
        const res = await POST(req((f) => {
            f.set('type', 'ID'); f.set('layout', 'ID_SHEET');
            f.append('pages', png('front.png')); f.append('pages', png('back.png'));
            f.append('originals', png('front.png')); f.append('originals', png('back.png'));
        }), ctx);

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.document).toMatchObject({ type: 'ID', mimeType: 'application/pdf' });
        expect(body.originals).toHaveLength(2);
        expect(body.originals[0]).toMatchObject({ type: 'OTHER', fileName: 'ID Document - front (original).png' });
        expect(prisma.document.create).toHaveBeenCalledTimes(3);
    });

    it('rejects unauthenticated requests', async () => {
        vi.mocked(auth).mockResolvedValue(null as never);
        const res = await POST(req(() => {}), ctx);
        expect(res.status).toBe(401);
    });

    it.each(['B2B_PARTNER', 'REFERRER', undefined])('rejects portal user type %s with 403', async (userType) => {
        vi.mocked(auth).mockResolvedValue({ user: { id: 'p1', userType } } as never);
        const res = await POST(req((f) => {
            f.set('type', 'ID'); f.set('layout', 'PAGES');
            f.append('pages', png('1.png')); f.append('originals', png('1.png'));
        }), ctx);
        expect(res.status).toBe(403);
        expect(prisma.case.findUnique).not.toHaveBeenCalled();
        expect(prisma.document.create).not.toHaveBeenCalled();
    });

    it('rejects a page count that does not match the originals', async () => {
        const res = await POST(req((f) => {
            f.set('type', 'POA'); f.set('layout', 'PAGES');
            f.append('pages', png('1.png')); f.append('pages', png('2.png'));
            f.append('originals', png('1.png'));
        }), ctx);
        expect(res.status).toBe(400);
        expect(prisma.document.create).not.toHaveBeenCalled();
    });

    it('rejects files that are not JPEG/PNG images', async () => {
        const fake = new File(['%PDF-1.4 not an image'], 'x.png', { type: 'image/png' });
        const res = await POST(req((f) => {
            f.set('type', 'POA'); f.set('layout', 'PAGES');
            f.append('pages', fake); f.append('originals', fake);
        }), ctx);
        expect(res.status).toBe(400);
        expect(prisma.document.create).not.toHaveBeenCalled();
    });
});
