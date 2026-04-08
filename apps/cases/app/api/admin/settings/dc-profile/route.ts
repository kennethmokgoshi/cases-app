import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';

const logger = createLogger('api/admin/settings/dc-profile');

const KEYS = ['dc_ncrdcNo', 'dc_name', 'dc_organisation'] as const;

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin && !(session?.user as any)?.isExecutive) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const rows = await prisma.systemSettings.findMany({
            where: { category: 'dc_profile' },
            select: { key: true, value: true }
        });

        const settings: Record<string, string> = {
            dc_ncrdcNo: 'NCRDC3693',
            dc_name: 'Aaron Nzotho',
            dc_organisation: 'Zenowethu Debt Management',
        };
        for (const row of rows) {
            settings[row.key] = row.value;
        }

        return NextResponse.json({ settings });
    } catch (error) {
        logger.error('Error fetching DC profile settings:', error);
        return NextResponse.json({ error: 'Failed to fetch DC profile' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { ncrdcNo, dcName, dcOrganisation } = body;

        if (!ncrdcNo?.trim() || !dcName?.trim() || !dcOrganisation?.trim()) {
            return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
        }

        const upserts = [
            { key: 'dc_ncrdcNo', value: ncrdcNo.trim(), description: 'Portal DC NCRDC registration number' },
            { key: 'dc_name', value: dcName.trim(), description: 'Portal DC full name' },
            { key: 'dc_organisation', value: dcOrganisation.trim(), description: 'Portal DC trading / organisation name' },
        ];

        for (const u of upserts) {
            await prisma.systemSettings.upsert({
                where: { key: u.key },
                update: { value: u.value, updatedAt: new Date() },
                create: { key: u.key, value: u.value, category: 'dc_profile', description: u.description, isEncrypted: false },
            });
        }

        logger.info(`✅ DC profile updated: ${ncrdcNo} — ${dcName}, ${dcOrganisation}`);
        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error('Error saving DC profile settings:', error);
        return NextResponse.json({ error: 'Failed to save DC profile' }, { status: 500 });
    }
}
