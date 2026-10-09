// Filesystem helpers for case uploads stored under `<cwd>/storage/uploads`.
// Node-only, but free of auth/Next imports so the email providers can use them
// to attach our own files without going through the signed-in /uploads route.

import { readFile, stat } from 'fs/promises';
import { resolve, sep } from 'path';

/**
 * Base URL that stored document paths ("/uploads/…") are resolved against —
 * the running app's own public origin.
 */
export function appBaseUrl(): string {
    return (
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.APP_URL ||
        'https://cases.zenowethu.co.za'
    ).replace(/\/$/, '');
}

const CONTENT_TYPES: Record<string, string> = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
};

/** Absolute uploads root for the running app. */
export function uploadsRoot(cwd: string = process.cwd()): string {
    return resolve(cwd, 'storage', 'uploads');
}

/**
 * Resolve URL path segments to a file inside `root`, or `null` when the result
 * would escape it. Rejects empty, `.`/`..`, NUL and separator-bearing segments
 * outright, then double-checks the resolved path as defence in depth.
 */
export function resolveUploadPath(root: string, parts: string[]): string | null {
    if (parts.length === 0) return null;
    for (const part of parts) {
        if (!part || part === '.' || part === '..') return null;
        if (/[\\/\0]/.test(part) || part.includes('..')) return null;
    }
    const target = resolve(root, ...parts);
    return target.startsWith(root + sep) ? target : null;
}

export function contentTypeFor(fileName: string): string {
    const ext = fileName.toLowerCase().split('.').pop() ?? '';
    return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

/**
 * Read one of our own uploads straight from disk when `url` points at this app's
 * `/uploads/...` route (relative, or absolute on `ownOrigin`). Returns null for
 * any other URL, a path that would escape the uploads root, or a missing file —
 * the caller then falls back to fetching the URL.
 *
 * Needed because /uploads requires a signed-in session: a server-side fetch of
 * it for an email attachment gets 401.
 */
export async function readOwnUpload(
    url: string,
    ownOrigin: string = appBaseUrl(),
    cwd: string = process.cwd(),
): Promise<Buffer | null> {
    let pathname: string;
    try {
        const parsed = new URL(url, ownOrigin);
        if (parsed.origin !== new URL(ownOrigin).origin) return null;
        pathname = parsed.pathname;
    } catch {
        return null;
    }
    if (!pathname.startsWith('/uploads/')) return null;

    let parts: string[];
    try {
        parts = pathname.slice('/uploads/'.length).split('/').map(decodeURIComponent);
    } catch {
        return null;
    }
    const filePath = resolveUploadPath(uploadsRoot(cwd), parts);
    if (!filePath) return null;

    const info = await stat(filePath).catch(() => null);
    if (!info?.isFile()) return null;
    return readFile(filePath);
}
