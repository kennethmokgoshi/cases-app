import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { readOwnUpload } from './upload-paths';

const ORIGIN = 'https://cases.example.test';
let cwd: string;

beforeAll(async () => {
    cwd = await mkdtemp(join(tmpdir(), 'uploads-'));
    await mkdir(join(cwd, 'storage', 'uploads', 'case-1'), { recursive: true });
    await writeFile(join(cwd, 'storage', 'uploads', 'case-1', 'my poa.pdf'), 'POA-BYTES');
    await writeFile(join(cwd, 'secret.env'), 'SECRET');
});

afterAll(async () => {
    await rm(cwd, { recursive: true, force: true });
});

describe('readOwnUpload', () => {
    it('reads our own upload from disk for an absolute or relative URL', async () => {
        const abs = await readOwnUpload(`${ORIGIN}/uploads/case-1/my%20poa.pdf`, ORIGIN, cwd);
        expect(abs?.toString()).toBe('POA-BYTES');
        const rel = await readOwnUpload('/uploads/case-1/my%20poa.pdf', ORIGIN, cwd);
        expect(rel?.toString()).toBe('POA-BYTES');
    });

    it('ignores other origins and non-upload paths', async () => {
        expect(await readOwnUpload('https://evil.test/uploads/case-1/my%20poa.pdf', ORIGIN, cwd)).toBeNull();
        expect(await readOwnUpload(`${ORIGIN}/api/cases/case-1`, ORIGIN, cwd)).toBeNull();
    });

    it('refuses to escape the uploads root', async () => {
        expect(await readOwnUpload(`${ORIGIN}/uploads/..%2F..%2Fsecret.env`, ORIGIN, cwd)).toBeNull();
        expect(await readOwnUpload(`${ORIGIN}/uploads/case-1/%2E%2E/%2E%2E/%2E%2E/secret.env`, ORIGIN, cwd)).toBeNull();
    });

    it('returns null for a missing file or a malformed URL', async () => {
        expect(await readOwnUpload(`${ORIGIN}/uploads/case-1/nope.pdf`, ORIGIN, cwd)).toBeNull();
        expect(await readOwnUpload(`${ORIGIN}/uploads/case-1/%E0%A4%A.pdf`, ORIGIN, cwd)).toBeNull();
    });
});
