import { prisma } from '@zenowethu/database';
import { NextResponse } from 'next/server';
import { logger } from '../logger';

export type ApiKeyData = {
    id: string;
    name: string;
    permissions: string[];
    projectId: string | null;
    rateLimit: number;
};

type ValidationResult =
    | { valid: true; apiKey: ApiKeyData }
    | { valid: false; error: string; status: number };

export async function validateApiKey(request: Request): Promise<ValidationResult> {
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
            error: 'API key required. Provide via Authorization: Bearer <key> or X-API-Key header.',
            status: 401
        };
    }

    const apiKeyRecord = await prisma.apiKey.findUnique({
        where: { key },
        include: {
            project: { select: { id: true, name: true } }
        }
    });

    if (!apiKeyRecord) {
        return { valid: false, error: 'Invalid API key.', status: 401 };
    }

    if (!apiKeyRecord.isActive) {
        return { valid: false, error: 'API key has been revoked.', status: 401 };
    }

    if (apiKeyRecord.expiresAt && new Date(apiKeyRecord.expiresAt) < new Date()) {
        return { valid: false, error: 'API key has expired.', status: 401 };
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
            rateLimit: apiKeyRecord.rateLimit
        }
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
