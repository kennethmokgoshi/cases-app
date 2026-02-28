'use server';

import { NextResponse } from 'next/server';
import { auth, logger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { invalidateDHSCredentialsCache } from '@zenowethu/shared-lib';
import { DhsSettingsSchema, parseBody } from '@/lib/schemas';

// GET /api/admin/settings/dhs - Get DHS credentials
export async function GET() {
    try {
        const session = await auth();

        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get DHS settings from database
        const dhsSettings = await prisma.systemSettings.findMany({
            where: { category: 'dhs' },
            select: {
                key: true,
                value: true,
                description: true,
                updatedAt: true }
        });

        // Convert to object
        const settings: Record<string, string> = {};
        let lastUpdated: Date | null = null;

        for (const setting of dhsSettings) {
            // Mask password for display
            if (setting.key === 'dhs_password') {
                settings[setting.key] = setting.value ? '••••••••' : '';
            } else {
                settings[setting.key] = setting.value;
            }
            if (!lastUpdated || setting.updatedAt > lastUpdated) {
                lastUpdated = setting.updatedAt;
            }
        }

        // If no settings in DB, return defaults from env
        if (Object.keys(settings).length === 0) {
            settings.dhs_username = process.env.DHS_USERNAME || 'NCRDC3693';
            settings.dhs_password = '••••••••';
        }

        return NextResponse.json({
            settings,
            lastUpdated });
    } catch (error) {
        logger.error('Error fetching DHS settings:', error);
        return NextResponse.json(
            { error: 'Failed to fetch DHS settings' },
            { status: 500 }
        );
    }
}

// POST /api/admin/settings/dhs - Update DHS credentials
export async function POST(request: Request) {
    try {
        const session = await auth();

        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const parsed = parseBody(DhsSettingsSchema, await request.json());
        if (!parsed.success) return parsed.response;
        const { username, password } = parsed.data;

        // Update or create username setting
        await prisma.systemSettings.upsert({
            where: { key: 'dhs_username' },
            update: {
                value: username,
                updatedAt: new Date()
            },
            create: {
                key: 'dhs_username',
                value: username,
                category: 'dhs',
                description: 'DHS Portal Username (NCRDC Number)',
                isEncrypted: false }
        });

        // Only update password if a new one is provided (not the masked value)
        if (password && !password.includes('•')) {
            await prisma.systemSettings.upsert({
                where: { key: 'dhs_password' },
                update: {
                    value: password,
                    updatedAt: new Date()
                },
                create: {
                    key: 'dhs_password',
                    value: password,
                    category: 'dhs',
                    description: 'DHS Portal Password',
                    isEncrypted: false, // In production, should encrypt this
                }
            });
        }

        // Invalidate the credentials cache so new values are used immediately
        invalidateDHSCredentialsCache();

        return NextResponse.json({
            success: true,
            message: 'DHS credentials updated successfully' });
    } catch (error) {
        logger.error('Error updating DHS settings:', error);
        return NextResponse.json(
            { error: 'Failed to update DHS settings' },
            { status: 500 }
        );
    }
}

// DELETE /api/admin/settings/dhs - Reset to defaults (remove from DB)
export async function DELETE() {
    try {
        const session = await auth();

        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Delete DHS settings from database
        await prisma.systemSettings.deleteMany({
            where: { category: 'dhs' }
        });

        // Invalidate the credentials cache
        invalidateDHSCredentialsCache();

        return NextResponse.json({
            success: true,
            message: 'DHS credentials reset to defaults' });
    } catch (error) {
        logger.error('Error resetting DHS settings:', error);
        return NextResponse.json(
            { error: 'Failed to reset DHS settings' },
            { status: 500 }
        );
    }
}

