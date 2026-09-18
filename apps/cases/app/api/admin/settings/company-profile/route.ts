/**
 * Company Profile settings — the tenant firm's identity used on every outbound
 * document, email, SMS, PDF and AI prompt.
 *
 * GET  → resolved profile (defaults + env + saved rows) for Admin/Executive
 * PUT  → partial update (Admin only). Blank string clears a field back to default.
 */
import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import {
    getCompanyProfile,
    saveCompanyProfile,
    CompanyProfileInputSchema,
} from '@zenowethu/shared-lib/src/company/company-profile-service';

const logger = createLogger('api/admin/settings/company-profile');

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin && !session?.user?.isExecutive) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const profile = await getCompanyProfile();
        return NextResponse.json({ profile });
    } catch (error) {
        logger.error('Error fetching company profile:', error);
        return NextResponse.json({ error: 'Failed to fetch company profile' }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json().catch(() => null);
        const parsed = CompanyProfileInputSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
                { status: 422 },
            );
        }

        const profile = await saveCompanyProfile(parsed.data);
        logger.info(`Company profile updated by ${session.user.email}`, {
            fields: Object.keys(parsed.data),
        });
        return NextResponse.json({ success: true, profile });
    } catch (error) {
        logger.error('Error saving company profile:', error);
        return NextResponse.json({ error: 'Failed to save company profile' }, { status: 500 });
    }
}
