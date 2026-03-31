'use server';

import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { MaxDcSettingsSchema, parseBody } from '@/lib/schemas';
import { z } from 'zod';

const logger = createLogger('api/admin/settings/maxdc');

// GET /api/admin/settings/maxdc — fetch stored MaxDC credentials
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const rows = await prisma.systemSettings.findMany({
            where: { category: 'maxdc' },
            select: { key: true, value: true, updatedAt: true }
        });

        const settings: Record<string, string> = {};
        let lastUpdated: Date | null = null;

        for (const row of rows) {
            settings[row.key] = row.key === 'maxdc_password' && row.value
                ? '••••••••'
                : row.value;
            if (!lastUpdated || row.updatedAt > lastUpdated) lastUpdated = row.updatedAt;
        }

        return NextResponse.json({ settings, lastUpdated });
    } catch (error) {
        logger.error('Error fetching MaxDC settings:', error);
        return NextResponse.json({ error: 'Failed to fetch MaxDC settings' }, { status: 500 });
    }
}

// POST /api/admin/settings/maxdc — save MaxDC credentials
export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const parsed = parseBody(MaxDcSettingsSchema, await request.json());
        if (!parsed.success) return parsed.response;
        const { username, password } = parsed.data as z.infer<typeof MaxDcSettingsSchema>;

        if (username !== undefined && username !== null) {
            await prisma.systemSettings.upsert({
                where: { key: 'maxdc_username' },
                update: { value: username, updatedAt: new Date() },
                create: {
                    key: 'maxdc_username',
                    value: username,
                    category: 'maxdc',
                    description: 'MaxDC Portal Username',
                    isEncrypted: false
                }
            });
        }

        if (password && !password.includes('•')) {
            await prisma.systemSettings.upsert({
                where: { key: 'maxdc_password' },
                update: { value: password, updatedAt: new Date() },
                create: {
                    key: 'maxdc_password',
                    value: password,
                    category: 'maxdc',
                    description: 'MaxDC Portal Password',
                    isEncrypted: false
                }
            });
        }

        return NextResponse.json({ success: true, message: 'MaxDC credentials saved successfully' });
    } catch (error) {
        logger.error('Error saving MaxDC settings:', error);
        return NextResponse.json({ error: 'Failed to save MaxDC settings' }, { status: 500 });
    }
}

// DELETE /api/admin/settings/maxdc — clear stored credentials
export async function DELETE() {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await prisma.systemSettings.deleteMany({ where: { category: 'maxdc' } });

        return NextResponse.json({ success: true, message: 'MaxDC credentials cleared' });
    } catch (error) {
        logger.error('Error clearing MaxDC settings:', error);
        return NextResponse.json({ error: 'Failed to clear MaxDC settings' }, { status: 500 });
    }
}
