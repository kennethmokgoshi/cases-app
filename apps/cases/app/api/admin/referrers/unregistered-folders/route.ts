import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';

const logger = createLogger('api/admin/referrers/unregistered-folders');

/**
 * GET /api/admin/referrers/unregistered-folders
 *
 * Returns sub-projects that exist in the project hierarchy under
 * ACQUISITION_SOURCE parents but are NOT yet linked to a Referrer record.
 *
 * These are the "orphan referral folders" that staff have been using
 * manually (e.g. Capitec Central City, Dede, Errol Matabane) without
 * commission tracking. Registering them creates a Referrer record linked
 * to the existing project so cases already in those folders get back-filled.
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if (!session.user.isAdmin && !session.user.isExecutive && !session.user.isSeniorManager && session.user.role !== 'MANAGER') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Get all projectIds already linked to Referrer records
        const linked = await prisma.referrer.findMany({
            where: { projectId: { not: null } },
            select: { projectId: true },
        });
        const linkedIds = new Set(linked.map(r => r.projectId).filter(Boolean) as string[]);

        // Get ACQUISITION_SOURCE projects that are B2C (or untyped/generic) only.
        // B2B partners (Letsatsi, Shosholoza, etc.) have clientType='B2B' — their
        // children are branches, not referrers, and must be excluded.
        const acquisitionRoots = await prisma.project.findMany({
            where: {
                type: 'ACQUISITION_SOURCE',
                clientType: { not: 'B2B' },  // exclude B2B partner roots
            },
            select: { id: true, name: true },
        });
        const rootIds = acquisitionRoots.map(r => r.id);

        if (rootIds.length === 0) {
            return NextResponse.json({ folders: [] });
        }

        // Get all direct children of those roots that are not yet linked to a Referrer
        const unregistered = await prisma.project.findMany({
            where: {
                parentId: { in: rootIds },
                id: { notIn: [...linkedIds] },
                type: { in: ['FOLDER', 'REFERRER'] },
            },
            select: {
                id: true,
                name: true,
                type: true,
                parentId: true,
                parent: { select: { id: true, name: true } },
                _count: { select: { cases: true } },
            },
            orderBy: { name: 'asc' },
        });

        return NextResponse.json({ folders: unregistered });
    } catch (error) {
        logger.error('Error fetching unregistered folders:', error);
        return NextResponse.json({ error: 'Failed to fetch unregistered folders' }, { status: 500 });
    }
}
