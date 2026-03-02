import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger, ApiKeyPatchSchema, parseBody  } from '@zenowethu/shared-lib';

// GET - Get single API key details
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        const apiKey = await prisma.apiKey.findUnique({
            where: { id },
            include: {
                project: { select: { id: true, name: true } }
            }
        });

        if (!apiKey) {
            return NextResponse.json({ error: 'API key not found' }, { status: 404 });
        }

        return NextResponse.json({
            ...apiKey,
            key: apiKey.keyPrefix + '...' // Hide full key
        });
    } catch (error) {
        logger.error('Error fetching API key:', error);
        return NextResponse.json({ error: 'Failed to fetch API key' }, { status: 500 });
    }
}

// PATCH - Update API key (toggle active, update permissions, etc.)
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
        const parsed = parseBody(ApiKeyPatchSchema, await request.json());
        if (!parsed.success) return parsed.response;
        const body = parsed.data;
        const { name, description, isActive, permissions, rateLimit, expiresAt } = body;

        const updateData: Record<string, unknown> = {};
        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (isActive !== undefined) updateData.isActive = isActive;
        if (permissions !== undefined) updateData.permissions = permissions;
        if (rateLimit !== undefined) updateData.rateLimit = rateLimit;
        if (expiresAt !== undefined) updateData.expiresAt = expiresAt ? new Date(expiresAt) : null;

        const apiKey = await prisma.apiKey.update({
            where: { id },
            data: updateData,
            include: {
                project: { select: { id: true, name: true } }
            }
        });

        return NextResponse.json({
            ...apiKey,
            key: apiKey.keyPrefix + '...'
        });
    } catch (error) {
        logger.error('Error updating API key:', error);
        return NextResponse.json({ error: 'Failed to update API key' }, { status: 500 });
    }
}

// DELETE - Delete API key
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        await prisma.apiKey.delete({
            where: { id }
        });

        return NextResponse.json({ success: true, message: 'API key deleted' });
    } catch (error) {
        logger.error('Error deleting API key:', error);
        return NextResponse.json({ error: 'Failed to delete API key' }, { status: 500 });
    }
}

