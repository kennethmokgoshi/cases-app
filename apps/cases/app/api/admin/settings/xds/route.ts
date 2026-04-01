'use server';

import { NextResponse } from 'next/server';
import { auth, createLogger, invalidateXDSCredentialsCache } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { z } from 'zod';
import { parseBody } from '@/lib/schemas';

const logger = createLogger('api/admin/settings/xds');

const XdsSettingsSchema = z.object({
    username: z.string().min(1, 'Username is required').max(100),
    password: z.string().min(1, 'Password is required').max(200),
    portalUrl: z
        .string()
        .url('Must be a valid URL')
        .default('https://portal.xds.co.za'),
});

// GET /api/admin/settings/xds — Retrieve current XDS credentials
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const xdsSettings = await prisma.systemSettings.findMany({
            where: { category: 'xds' },
            select: { key: true, value: true, description: true, updatedAt: true },
        });

        const settings: Record<string, string> = {};
        let lastUpdated: Date | null = null;

        for (const s of xdsSettings) {
            if (s.key === 'xds_password') {
                settings[s.key] = s.value ? '••••••••' : '';
            } else {
                settings[s.key] = s.value;
            }
            if (!lastUpdated || s.updatedAt > lastUpdated) {
                lastUpdated = s.updatedAt;
            }
        }

        // Fallback to environment defaults if nothing stored yet
        if (Object.keys(settings).length === 0) {
            settings.xds_username = process.env.XDS_USERNAME || '';
            settings.xds_password = process.env.XDS_PASSWORD ? '••••••••' : '';
            settings.xds_portal_url = process.env.XDS_PORTAL_URL || 'https://portal.xds.co.za';
        }

        return NextResponse.json({ settings, lastUpdated });
    } catch (error) {
        logger.error('Error fetching XDS settings:', error);
        return NextResponse.json({ error: 'Failed to fetch XDS settings' }, { status: 500 });
    }
}

// POST /api/admin/settings/xds — Save XDS credentials
export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const parsed = parseBody(XdsSettingsSchema, await request.json());
        if (!parsed.success) return parsed.response;
        const { username, password, portalUrl } = parsed.data as z.infer<typeof XdsSettingsSchema>;

        // Upsert username
        await prisma.systemSettings.upsert({
            where: { key: 'xds_username' },
            update: { value: username, updatedAt: new Date() },
            create: {
                key: 'xds_username',
                value: username,
                category: 'xds',
                description: 'XDS Portal Username',
                isEncrypted: false,
            },
        });

        // Upsert portal URL
        await prisma.systemSettings.upsert({
            where: { key: 'xds_portal_url' },
            update: { value: portalUrl, updatedAt: new Date() },
            create: {
                key: 'xds_portal_url',
                value: portalUrl,
                category: 'xds',
                description: 'XDS Portal Base URL',
                isEncrypted: false,
            },
        });

        // Only update password if a real value is provided (not the masked placeholder)
        if (password && !password.includes('•')) {
            await prisma.systemSettings.upsert({
                where: { key: 'xds_password' },
                update: { value: password, updatedAt: new Date() },
                create: {
                    key: 'xds_password',
                    value: password,
                    category: 'xds',
                    description: 'XDS Portal Password',
                    isEncrypted: false,
                },
            });
        }

        // Invalidate the cache so the new password is picked up immediately
        invalidateXDSCredentialsCache();

        logger.info(`XDS credentials updated by admin ${session.user.id}`);
        return NextResponse.json({ success: true, message: 'XDS credentials updated successfully' });
    } catch (error) {
        logger.error('Error updating XDS settings:', error);
        return NextResponse.json({ error: 'Failed to update XDS settings' }, { status: 500 });
    }
}

// DELETE /api/admin/settings/xds — Reset to environment defaults
export async function DELETE() {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await prisma.systemSettings.deleteMany({ where: { category: 'xds' } });

        // Invalidate the cache so the next request re-reads from env
        invalidateXDSCredentialsCache();

        logger.info(`XDS credentials reset by admin ${session?.user?.id}`);
        return NextResponse.json({ success: true, message: 'XDS credentials reset to defaults' });
    } catch (error) {
        logger.error('Error resetting XDS settings:', error);
        return NextResponse.json({ error: 'Failed to reset XDS settings' }, { status: 500 });
    }
}
