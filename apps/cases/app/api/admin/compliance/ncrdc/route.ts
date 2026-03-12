import { NextResponse } from 'next/server';
import { auth } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';

const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
};

const CATEGORY = 'ncrdc';
const FIELDS = ['ncrdc_number', 'registered_name', 'registration_date', 'expiry_date', 'notes'] as const;
type NcrdcField = typeof FIELDS[number];

// Keys are globally unique, prefixed with "ncrdc_" to avoid collisions
const dbKey = (field: NcrdcField) => `ncrdc_${field}`;

// GET /api/admin/compliance/ncrdc
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const rows = await prisma.systemSettings.findMany({
            where: { category: CATEGORY },
            select: { key: true, value: true, updatedAt: true }
        });

        const settings: Record<string, string> = {};
        let lastUpdated: Date | null = null;

        rows.forEach(row => {
            // Strip the "ncrdc_" prefix so the client receives field names directly
            const field = row.key.replace(/^ncrdc_/, '');
            settings[field] = row.value;
            if (!lastUpdated || row.updatedAt > lastUpdated) lastUpdated = row.updatedAt;
        });

        return NextResponse.json({ settings, lastUpdated });
    } catch (error) {
        logger.error('GET /api/admin/compliance/ncrdc error:', error);
        return NextResponse.json({ error: 'Failed to fetch NCRDC settings' }, { status: 500 });
    }
}

// POST /api/admin/compliance/ncrdc
export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const body = await request.json();

        const upserts = FIELDS.map(field =>
            prisma.systemSettings.upsert({
                where: { key: dbKey(field) },
                update: { value: body[field] ?? '' },
                create: { key: dbKey(field), category: CATEGORY, value: body[field] ?? '', description: `NCRDC ${field}` }
            })
        );

        await prisma.$transaction(upserts);

        logger.info({ userId: session.user.id }, 'NCRDC registration updated');
        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error('POST /api/admin/compliance/ncrdc error:', error);
        return NextResponse.json({ error: 'Failed to save NCRDC settings' }, { status: 500 });
    }
}
