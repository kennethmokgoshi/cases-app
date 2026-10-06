import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

vi.mock('../auth', () => ({ auth: vi.fn() }));
vi.mock('../logger', () => ({
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { auth } from '../auth';
import { GET, resolveUploadPath, contentTypeFor, uploadsRoot } from './serve-uploads-route';

const mockedAuth = vi.mocked(auth) as unknown as ReturnType<typeof vi.fn>;

// A throwaway app directory: <tmp>/storage/uploads/case-1/doc.pdf plus a
// secret file next to storage/ that traversal must never reach.
const appDir = mkdtempSync(join(tmpdir(), 'uploads-route-'));
mkdirSync(join(appDir, 'storage', 'uploads', 'case-1'), { recursive: true });
writeFileSync(join(appDir, 'storage', 'uploads', 'case-1', 'doc.pdf'), '%PDF-test');
writeFileSync(join(appDir, '.env'), 'SECRET=1');

const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(appDir);

afterAll(() => {
    cwdSpy.mockRestore();
    rmSync(appDir, { recursive: true, force: true });
});

function call(parts: string[]) {
    return GET({} as never, { params: Promise.resolve({ path: parts }) });
}

beforeEach(() => {
    mockedAuth.mockReset();
    mockedAuth.mockResolvedValue({ user: { id: 'u1' } });
});

describe('resolveUploadPath', () => {
    const root = resolve('/srv/app/storage/uploads');

    it('resolves normal segments inside the root', () => {
        expect(resolveUploadPath(root, ['case-1', 'doc.pdf'])).toBe(resolve(root, 'case-1', 'doc.pdf'));
    });

    it.each([
        [['..', '.env']],
        [['case-1', '..', '..', '.env']],
        [['..%2F.env'.replace('%2F', '/')]],
        [['case-1\\..\\..\\.env']],
        [['/etc/passwd']],
        [['doc\0.pdf']],
        [['.']],
        [['']],
        [[]],
    ])('rejects %j', parts => {
        expect(resolveUploadPath(root, parts)).toBeNull();
    });
});

describe('contentTypeFor', () => {
    it('maps known extensions case-insensitively and defaults to octet-stream', () => {
        expect(contentTypeFor('A.PDF')).toBe('application/pdf');
        expect(contentTypeFor('x.jpeg')).toBe('image/jpeg');
        expect(contentTypeFor('x.exe')).toBe('application/octet-stream');
    });
});

describe('GET /uploads/[...path]', () => {
    it('serves a file to a signed-in user with private caching', async () => {
        const res = await call(['case-1', 'doc.pdf']);

        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('application/pdf');
        expect(res.headers.get('Cache-Control')).toContain('private');
        expect(await res.text()).toBe('%PDF-test');
    });

    it('returns 401 without a session', async () => {
        mockedAuth.mockResolvedValue(null);
        expect((await call(['case-1', 'doc.pdf'])).status).toBe(401);
    });

    it('returns 400 for traversal attempts and never reads outside the root', async () => {
        const res = await call(['..', '..', '.env']);
        expect(res.status).toBe(400);
    });

    it('returns 404 for a missing file and for a directory', async () => {
        expect((await call(['case-1', 'missing.pdf'])).status).toBe(404);
        expect((await call(['case-1'])).status).toBe(404);
    });

    it('uses <cwd>/storage/uploads as the root', () => {
        expect(uploadsRoot()).toBe(resolve(appDir, 'storage', 'uploads'));
    });
});
