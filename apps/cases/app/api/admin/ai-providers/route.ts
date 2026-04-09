import { NextResponse } from 'next/server';
import { auth, createLogger, invalidateAiProviderCache, maskApiKey } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { z } from 'zod';
import { parseBody } from '@/lib/schemas';

const logger = createLogger('api/admin/ai-providers');

const AiProviderSchema = z.object({
    name: z.string().min(1).max(100),
    provider: z.enum(['openai', 'openrouter', 'anthropic', 'google', 'other']),
    apiKey: z.string().min(1),
    baseUrl: z.string().url().optional().nullable(),
    isActive: z.boolean().optional().default(true),
    isDefault: z.boolean().optional().default(false),
    taskAssignments: z.record(z.string(), z.string()).optional().default({}),
    models: z.array(z.string()).optional().default([]),
});

// GET /api/admin/ai-providers — list all providers
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const providers = await prisma.aiProvider.findMany({
            orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        });

        const masked = providers.map(p => ({
            ...p,
            apiKey: maskApiKey(p.apiKey),
        }));

        return NextResponse.json({ providers: masked });
    } catch (error) {
        logger.error('Error fetching AI providers:', error);
        return NextResponse.json({ error: 'Failed to fetch AI providers' }, { status: 500 });
    }
}

// POST /api/admin/ai-providers — create a new provider
export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const parsed = parseBody<z.infer<typeof AiProviderSchema>>(AiProviderSchema, await request.json());
        if (!parsed.success) return parsed.response;
        const body = parsed.data;

        if (body.isDefault) {
            await prisma.aiProvider.updateMany({ data: { isDefault: false } });
        }

        const provider = await prisma.aiProvider.create({
            data: {
                name: body.name,
                provider: body.provider,
                apiKey: body.apiKey,
                baseUrl: body.baseUrl ?? null,
                isActive: body.isActive ?? true,
                isDefault: body.isDefault ?? false,
                taskAssignments: body.taskAssignments ?? {},
                models: body.models ?? [],
            },
        });

        invalidateAiProviderCache();

        return NextResponse.json({
            success: true,
            provider: { ...provider, apiKey: maskApiKey(provider.apiKey) },
        });
    } catch (error) {
        logger.error('Error creating AI provider:', error);
        return NextResponse.json({ error: 'Failed to create AI provider' }, { status: 500 });
    }
}
