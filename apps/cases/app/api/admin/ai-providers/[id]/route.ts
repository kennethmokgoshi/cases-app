import { NextResponse } from 'next/server';
import { auth, createLogger, invalidateAiProviderCache, maskApiKey } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { z } from 'zod';
import { parseBody } from '@/lib/schemas';

const logger = createLogger('api/admin/ai-providers/[id]');

const AiProviderUpdateSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    provider: z.enum(['openai', 'openrouter', 'anthropic', 'google', 'other']).optional(),
    apiKey: z.string().min(1).optional(),
    baseUrl: z.string().url().optional().nullable(),
    isActive: z.boolean().optional(),
    isDefault: z.boolean().optional(),
    taskAssignments: z.record(z.string(), z.string()).optional(),
    models: z.array(z.string()).optional(),
});

// PATCH /api/admin/ai-providers/[id]
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const parsed = parseBody<z.infer<typeof AiProviderUpdateSchema>>(AiProviderUpdateSchema, await request.json());
        if (!parsed.success) return parsed.response;
        const body = parsed.data;

        const existing = await prisma.aiProvider.findUnique({ where: { id } });
        if (!existing) {
            return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
        }

        if (body.isDefault) {
            await prisma.aiProvider.updateMany({
                where: { id: { not: id } },
                data: { isDefault: false },
            });
        }

        // If key is still masked, keep existing
        const apiKeyToSave = body.apiKey && !body.apiKey.includes('•') ? body.apiKey : undefined;

        const provider = await prisma.aiProvider.update({
            where: { id },
            data: {
                ...(body.name !== undefined && { name: body.name }),
                ...(body.provider !== undefined && { provider: body.provider }),
                ...(apiKeyToSave !== undefined && { apiKey: apiKeyToSave }),
                ...(body.baseUrl !== undefined && { baseUrl: body.baseUrl }),
                ...(body.isActive !== undefined && { isActive: body.isActive }),
                ...(body.isDefault !== undefined && { isDefault: body.isDefault }),
                ...(body.taskAssignments !== undefined && { taskAssignments: body.taskAssignments }),
                ...(body.models !== undefined && { models: body.models }),
            },
        });

        invalidateAiProviderCache();

        return NextResponse.json({
            success: true,
            provider: { ...provider, apiKey: maskApiKey(provider.apiKey) },
        });
    } catch (error) {
        logger.error('Error updating AI provider:', error);
        return NextResponse.json({ error: 'Failed to update AI provider' }, { status: 500 });
    }
}

// DELETE /api/admin/ai-providers/[id]
export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        await prisma.aiProvider.delete({ where: { id } });

        invalidateAiProviderCache();

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error('Error deleting AI provider:', error);
        return NextResponse.json({ error: 'Failed to delete AI provider' }, { status: 500 });
    }
}
