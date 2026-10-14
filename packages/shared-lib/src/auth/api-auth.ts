import { prisma } from '@zenowethu/database';
import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { logger } from '../logger';

/** SHA-256 hex digest used to store and look up API keys. */
export function hashApiKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
}

export type ApiKeyData = {
    id: string;
    name: string;
    permissions: string[];
    projectId: string | null;
    rateLimit: number;
    createdBy?: string | null;
};

export async function validateApiKey(request: Request): Promise<{
    valid: boolean;
    apiKey: ApiKeyData;
    error: string;
    status: number;
}> {
    const authHeader = request.headers.get('Authorization');
    const apiKeyHeader = request.headers.get('X-API-Key');

    let key: string | null = null;

    if (authHeader?.startsWith('Bearer ')) {
        key = authHeader.substring(7);
    } else if (apiKeyHeader) {
        key = apiKeyHeader;
    }

    if (!key) {
        return {
            valid: false,
            apiKey: null as any,
            error: 'API key required. Provide via Authorization: Bearer <key> or X-API-Key header.',
            status: 401
        };
    }

    // Keys are stored as SHA-256 hashes. Fall back to a plaintext match for keys
    // issued before hashing, and upgrade them to a hash on first successful use.
    const keyHash = hashApiKey(key);
    const include = { project: { select: { id: true, name: true } } };
    let apiKeyRecord = await prisma.apiKey.findUnique({ where: { key: keyHash }, include });
    if (!apiKeyRecord) {
        apiKeyRecord = await prisma.apiKey.findUnique({ where: { key }, include });
        if (apiKeyRecord && apiKeyRecord.isActive) {
            await prisma.apiKey
                .update({ where: { id: apiKeyRecord.id }, data: { key: keyHash } })
                .catch((err: unknown) => logger.error({ err }, 'Failed to upgrade legacy API key to hash'));
        }
    }

    if (!apiKeyRecord) {
        return { valid: false, apiKey: null as any, error: 'Invalid API key.', status: 401 };
    }

    if (!apiKeyRecord.isActive) {
        return { valid: false, apiKey: null as any, error: 'API key has been revoked.', status: 401 };
    }

    if (apiKeyRecord.expiresAt && new Date(apiKeyRecord.expiresAt) < new Date()) {
        return { valid: false, apiKey: null as any, error: 'API key has expired.', status: 401 };
    }

    await prisma.apiKey.update({
        where: { id: apiKeyRecord.id },
        data: {
            lastUsedAt: new Date(),
            usageCount: { increment: 1 }
        }
    }).catch(logger.error);

    const permissions = apiKeyRecord.permissions.split(',').map(p => p.trim());

    return {
        valid: true,
        apiKey: {
            id: apiKeyRecord.id,
            name: apiKeyRecord.name,
            permissions,
            projectId: apiKeyRecord.projectId,
            rateLimit: apiKeyRecord.rateLimit,
            createdBy: apiKeyRecord.createdBy ?? null,
        },
        error: null as any,
        status: 200
    };
}

export function hasPermission(apiKey: ApiKeyData, required: 'read' | 'write' | 'delete'): boolean {
    return apiKey.permissions.includes(required) || apiKey.permissions.includes('full');
}

export function apiError(message: string, status: number = 400) {
    return NextResponse.json({ error: message, success: false }, { status });
}

export function apiSuccess<T>(data: T, status: number = 200) {
    return NextResponse.json({ data, success: true }, { status });
}
