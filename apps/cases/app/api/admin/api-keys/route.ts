import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger } from '@zenowethu/shared-lib';
import crypto from 'crypto';
import { ApiKeyCreateSchema, parseBody } from '@/lib/schemas';
import { z } from 'zod';

const logger = createLogger('api/admin/api-keys');

// Generate a secure, random API key
function generateApiKey(): string {
    const prefix = 'zeno_';
    const randomBytes = crypto.randomBytes(32).toString('hex');
    return prefix + randomBytes;
}

/**
 * Hash an API key with SHA-256 before storing in the database.
 * This means a DB breach does not expose usable plaintext keys.
 * The plaintext key is returned ONCE at creation time and never persisted.
 */
export function hashApiKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
}

// GET - List all API keys (returns display prefix only — hash is never returned)
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const apiKeys = await prisma.apiKey.findMany({
            include: {
                project: {
                    select: { id: true, name: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Never return the stored hash — show only the display prefix
        const safeKeys = apiKeys.map(key => ({
            ...key,
            key: key.keyPrefix + '...' }));

        return NextResponse.json(safeKeys);
    } catch (error) {
        logger.error('Error fetching API keys:', error);
        return NextResponse.json({ error: 'Failed to fetch API keys' }, { status: 500 });
    }
}

// POST - Create new API key
export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const parsed = parseBody(ApiKeyCreateSchema, await request.json());
        if (!parsed.success) return parsed.response;
        const body = parsed.data as z.infer<typeof ApiKeyCreateSchema>;
        const { name, description, projectId, permissions, rateLimit, expiresAt } = body;

        // Generate the plaintext key — this is the ONLY moment it exists in plaintext
        const fullKey = generateApiKey();
        const keyPrefix = fullKey.substring(0, 12); // "zeno_" + first 7 chars
        const keyHash = hashApiKey(fullKey);         // Only the hash is stored in the DB

        const apiKey = await prisma.apiKey.create({
            data: {
                name,
                key: keyHash,   // SHA-256 hash — plaintext is never persisted
                keyPrefix,
                description: description ?? null,
                projectId: projectId ?? null,
                permissions: permissions ?? 'read',
                rateLimit: rateLimit ?? 1000,
                expiresAt: expiresAt ? new Date(expiresAt) : null,
                createdBy: session.user.id },
            include: {
                project: { select: { id: true, name: true } }
            }
        });

        // Return the plaintext key ONLY on creation — the user must save it now.
        // It cannot be recovered later (only the SHA-256 hash is in the DB).
        return NextResponse.json({
            ...apiKey,
            key: apiKey.keyPrefix + '...',  // Mask the stored hash in the response
            fullKey,                         // One-time plaintext key — user must copy this
            message: "API key created successfully. Save this key now — it cannot be shown again." }, { status: 201 });
    } catch (error) {
        logger.error('Error creating API key:', error);
        return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 });
    }
}

