'use server';

import { NextResponse } from 'next/server';
import { auth, logger, GhlSettingsSchema, parseBody  } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { invalidateGHLCredentialsCache } from '@zenowethu/shared-lib';

// GET /api/admin/settings/ghl - Get GHL credentials
export async function GET() {
    try {
        const session = await auth();

        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get GHL settings from database
        const ghlSettings = await prisma.systemSettings.findMany({
            where: { category: 'ghl' },
            select: {
                key: true,
                value: true,
                description: true,
                updatedAt: true }
        });

        // Convert to object
        const settings: Record<string, string> = {};
        let lastUpdated: Date | null = null;

        for (const setting of ghlSettings) {
            // Mask password and API key for display
            if (setting.key === 'ghl_password' || setting.key === 'ghl_api_key') {
                settings[setting.key] = setting.value ? '••••••••' : '';
            } else {
                settings[setting.key] = setting.value;
            }
            if (!lastUpdated || setting.updatedAt > lastUpdated) {
                lastUpdated = setting.updatedAt;
            }
        }

        // Default empty settings if none in DB
        if (Object.keys(settings).length === 0) {
            settings.ghl_api_key = '';
            settings.ghl_location_id = '';
            settings.ghl_email = '';
            settings.ghl_password = '';
        }

        return NextResponse.json({
            settings,
            lastUpdated });
    } catch (error) {
        logger.error('Error fetching GHL settings:', error);
        return NextResponse.json(
            { error: 'Failed to fetch GHL settings' },
            { status: 500 }
        );
    }
}

// POST /api/admin/settings/ghl - Update GHL credentials
export async function POST(request: Request) {
    try {
        const session = await auth();

        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const parsed = parseBody(GhlSettingsSchema, await request.json());
        if (!parsed.success) return parsed.response;
        const body = parsed.data;
        const { apiKey, locationId, email, password } = body;

        // Update settings in database
        const updates = [
            { key: 'ghl_location_id', value: locationId, description: 'GHL Location ID', isEncrypted: false },
            { key: 'ghl_email', value: email, description: 'GHL Login Email', isEncrypted: false },
        ];

        for (const update of updates) {
            if (update.value !== undefined) {
                await prisma.systemSettings.upsert({
                    where: { key: update.key },
                    update: { value: update.value, updatedAt: new Date() },
                    create: {
                        key: update.key,
                        value: update.value,
                        category: 'ghl',
                        description: update.description,
                        isEncrypted: update.isEncrypted }
                });
            }
        }

        // Handle masked values for sensitive fields
        if (apiKey && !apiKey.includes('•')) {
            await prisma.systemSettings.upsert({
                where: { key: 'ghl_api_key' },
                update: { value: apiKey, updatedAt: new Date() },
                create: {
                    key: 'ghl_api_key',
                    value: apiKey,
                    category: 'ghl',
                    description: 'GHL API Key',
                    isEncrypted: true }
            });
        }

        if (password && !password.includes('•')) {
            await prisma.systemSettings.upsert({
                where: { key: 'ghl_password' },
                update: { value: password, updatedAt: new Date() },
                create: {
                    key: 'ghl_password',
                    value: password,
                    category: 'ghl',
                    description: 'GHL Login Password',
                    isEncrypted: true }
            });
        }

        // Invalidate cache
        invalidateGHLCredentialsCache();

        return NextResponse.json({
            success: true,
            message: 'GHL credentials updated successfully' });
    } catch (error) {
        logger.error('Error updating GHL settings:', error);
        return NextResponse.json(
            { error: 'Failed to update GHL settings' },
            { status: 500 }
        );
    }
}

// DELETE /api/admin/settings/ghl - Reset to defaults
export async function DELETE() {
    try {
        const session = await auth();

        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await prisma.systemSettings.deleteMany({
            where: { category: 'ghl' }
        });

        invalidateGHLCredentialsCache();

        return NextResponse.json({
            success: true,
            message: 'GHL credentials reset to defaults' });
    } catch (error) {
        logger.error('Error resetting GHL settings:', error);
        return NextResponse.json(
            { error: 'Failed to reset GHL settings' },
            { status: 500 }
        );
    }
}
