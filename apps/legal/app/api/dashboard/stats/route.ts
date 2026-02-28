import { NextResponse } from 'next/server';
import { auth, logger } from '@zenowethu/shared-lib';
import { getLegalDashboardStats } from '../../../../lib/legal-service';

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const stats = await getLegalDashboardStats(session.user.id);
        return NextResponse.json(stats);
    } catch (error) {
        logger.error({ error }, 'Error fetching dashboard stats:');
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
