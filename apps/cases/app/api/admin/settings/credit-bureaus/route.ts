'use server';

import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { z } from 'zod';
import { parseBody } from '@/lib/schemas';

const logger = createLogger('api/admin/settings/credit-bureaus');

const CATEGORY = 'credit_bureaus';

// Default SA credit bureau contact addresses (used when no DB records exist)
const DEFAULTS: Array<{ key: string; name: string; email: string }> = [
    { key: 'bureau_email_transunion', name: 'TransUnion',  email: 'disputes@transunion.co.za' },
    { key: 'bureau_email_experian',   name: 'Experian',    email: 'disputeenquiries@experian.co.za' },
    { key: 'bureau_email_xds',        name: 'XDS',         email: 'disputes@xds.co.za' },
];

const BureauEntrySchema = z.object({
    key:   z.string().min(1).max(80).regex(/^[a-z0-9_]+$/, 'Key must be lowercase letters, numbers, underscores'),
    name:  z.string().min(1, 'Bureau name is required').max(100),
    email: z.string().email('Must be a valid email address').max(200),
});

const SaveSchema = z.object({
    bureaus: z.array(BureauEntrySchema).min(1, 'At least one bureau is required'),
});

// GET /api/admin/settings/credit-bureaus
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const rows = await prisma.systemSettings.findMany({
            where: { category: CATEGORY },
            orderBy: { key: 'asc' },
        });

        let lastUpdated: Date | null = null;

        if (rows.length === 0) {
            // Return defaults (not yet saved to DB)
            return NextResponse.json({ bureaus: DEFAULTS, lastUpdated: null, isDefault: true });
        }

        const bureaus = rows.map(r => {
            if (!lastUpdated || r.updatedAt > lastUpdated) lastUpdated = r.updatedAt;
            const descParts = r.description?.split('|') ?? [];
            return {
                key:   r.key,
                name:  descParts[0]?.trim() || r.key,
                email: r.value,
            };
        });

        return NextResponse.json({ bureaus, lastUpdated, isDefault: false });
    } catch (error) {
        logger.error('Error fetching credit bureau settings:', error);
        return NextResponse.json({ error: 'Failed to fetch credit bureau settings' }, { status: 500 });
    }
}

// POST /api/admin/settings/credit-bureaus — save/replace all bureau entries
export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const parsed = parseBody(SaveSchema, await request.json());
        if (!parsed.success) return parsed.response;
        const { bureaus } = parsed.data as z.infer<typeof SaveSchema>;

        // Delete existing entries then upsert fresh set
        await prisma.systemSettings.deleteMany({ where: { category: CATEGORY } });

        await prisma.systemSettings.createMany({
            data: bureaus.map(b => ({
                key:         b.key,
                value:       b.email,
                category:    CATEGORY,
                description: `${b.name}|credit bureau dispute email`,
                isEncrypted: false,
            })),
        });

        logger.info(`Credit bureau emails updated by admin ${session.user.id}: ${bureaus.map(b => b.name).join(', ')}`);
        return NextResponse.json({ success: true, message: 'Credit bureau emails saved successfully' });
    } catch (error) {
        logger.error('Error saving credit bureau settings:', error);
        return NextResponse.json({ error: 'Failed to save credit bureau settings' }, { status: 500 });
    }
}

// DELETE /api/admin/settings/credit-bureaus — reset to defaults
export async function DELETE() {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await prisma.systemSettings.deleteMany({ where: { category: CATEGORY } });

        logger.info(`Credit bureau emails reset to defaults by admin ${session.user?.id}`);
        return NextResponse.json({ success: true, message: 'Credit bureau emails reset to defaults' });
    } catch (error) {
        logger.error('Error resetting credit bureau settings:', error);
        return NextResponse.json({ error: 'Failed to reset credit bureau settings' }, { status: 500 });
    }
}
