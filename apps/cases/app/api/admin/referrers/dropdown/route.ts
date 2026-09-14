import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { hasFullReferrerVisibility, getVisibleReferrerProjectIds } from '@/lib/referrer-access';

const logger = createLogger('api/admin/referrers/dropdown');

export type ReferrerDropdownItem = {
    id: string;
    name: string;
    email: string | null;       // kept for notification use later in case lifecycle
    cellNumber: string | null;  // kept for notification use later in case lifecycle
    isActive: boolean;
    hasFullProfile: boolean; // false = sub-project only, details not yet filled
    projectId: string | null;
};

/**
 * GET /api/admin/referrers/dropdown
 * Returns referrers + REFERRER-type sub-projects without a linked Referrer record,
 * sorted A–Z for use in dropdowns across the app.
 *
 * Accessible to Admin, Executive, Senior Manager, Manager, and all Staff, but
 * scoped the same way as the referrer registry: admins see every referrer,
 * everyone else only sees referrers whose sub-project they are a member of.
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // null = unrestricted (admin); otherwise the project IDs this user may see.
        const visibleProjectIds = hasFullReferrerVisibility(session.user)
            ? null
            : await getVisibleReferrerProjectIds(session.user.id);

        // 1. Full Referrer records — always include contact fields for downstream notifications
        const referrers = await prisma.referrer.findMany({
            where: visibleProjectIds !== null ? { projectId: { in: visibleProjectIds } } : {},
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                cellNumber: true,
                isActive: true,
                projectId: true,
            },
            orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        });

        // Every linked project, not just the visible ones — an out-of-scope
        // referrer's project must not resurface as an "orphan" placeholder.
        const allLinked = await prisma.referrer.findMany({
            where: { projectId: { not: null } },
            select: { projectId: true },
        });
        const linkedProjectIds = new Set(allLinked.map(r => r.projectId).filter(Boolean) as string[]);

        // 2. REFERRER-type sub-projects with no linked Referrer record yet
        const orphanSubProjects = await prisma.project.findMany({
            where: {
                type: 'REFERRER',
                id: {
                    notIn: [...linkedProjectIds],
                    ...(visibleProjectIds !== null ? { in: visibleProjectIds } : {}),
                },
            },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
        });

        const items: ReferrerDropdownItem[] = [
            ...referrers.map(r => ({
                id: r.id,
                name: `${r.firstName} ${r.lastName}`.trim(),
                email: r.email,
                cellNumber: r.cellNumber,
                isActive: r.isActive,
                hasFullProfile: true,
                projectId: r.projectId,
            })),
            // Orphan sub-projects become selectable placeholder entries
            ...orphanSubProjects.map(p => ({
                id: `project:${p.id}`,  // prefixed so frontend knows it's a project
                name: p.name,
                email: null,
                cellNumber: null,
                isActive: true,
                hasFullProfile: false,
                projectId: p.id,
            })),
        ];

        // Sort everything A–Z by name
        items.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));

        return NextResponse.json({ referrers: items });
    } catch (error) {
        logger.error('Error fetching referrer dropdown:', error);
        return NextResponse.json({ error: 'Failed to fetch referrers' }, { status: 500 });
    }
}
