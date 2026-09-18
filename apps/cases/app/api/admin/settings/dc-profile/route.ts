/**
 * Legacy "Portal DC Profile" endpoint — kept for the DHS import page.
 *
 * It is now a thin adapter over the company profile
 * (`/api/admin/settings/company-profile`), so the NCRDC number, debt
 * counsellor name and trading name have a single source of truth.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { getCompanyProfile, saveCompanyProfile } from '@zenowethu/shared-lib/src/company/company-profile-service';

const logger = createLogger('api/admin/settings/dc-profile');

const DcProfileSchema = z.object({
    ncrdcNo: z.string().trim().min(1, 'NCRDC number is required').max(50),
    dcName: z.string().trim().min(1, 'Debt counsellor name is required').max(200),
    dcOrganisation: z.string().trim().min(1, 'Organisation name is required').max(200),
});

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin && !session?.user?.isExecutive) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const company = await getCompanyProfile();
        return NextResponse.json({
            settings: {
                dc_ncrdcNo: company.ncrdcNumber ?? '',
                dc_name: company.debtCounsellorName ?? '',
                dc_organisation: company.tradingName,
            },
        });
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

        const parsed = DcProfileSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'All fields are required' }, { status: 400 });
        }

        const { ncrdcNo, dcName, dcOrganisation } = parsed.data;
        await saveCompanyProfile({ ncrdcNumber: ncrdcNo, debtCounsellorName: dcName, tradingName: dcOrganisation });

        logger.info(`✅ DC profile updated: ${ncrdcNo} — ${dcName}, ${dcOrganisation}`);
        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error('Error saving DC profile settings:', error);
        return NextResponse.json({ error: 'Failed to save DC profile' }, { status: 500 });
    }
}
