import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';

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
 * Returns all referrers + REFERRER-type sub-projects without a linked Referrer record,
 * sorted A–Z for use in dropdowns across the app.
 *
 * Accessible to Admin, Executive, Senior Manager, Manager, and all Staff.
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 1. Full Referrer records — always include contact fields for downstream notifications
        const referrers = await prisma.referrer.findMany({
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

        const linkedProjectIds = new Set(referrers.map(r => r.projectId).filter(Boolean));

        // 2. REFERRER-type sub-projects with no linked Referrer record yet
        const orphanSubProjects = await prisma.project.findMany({
            where: {
                type: 'REFERRER',
                id: { notIn: [...linkedProjectIds] as string[] },
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
