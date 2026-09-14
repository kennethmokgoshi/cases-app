// Reusable Next.js route handler for searching Projects, Main Sources,
// Branches, Sub-Projects, and Referrers/Referrals across the Zenowethu system.
// Node-only — do not import from package root.

import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth } from '../auth';
import { createLogger } from '../logger';

const logger = createLogger('api/projects/search');

export type OrgSearchResult = {
    id: string;
    name: string;
    entityType: 'MAIN_SOURCE' | 'BRANCH' | 'SUB_PROJECT' | 'PROJECT' | 'REFERRER';
    typeLabel: string;
    subtitle: string;
    parentName?: string | null;
    badgeColor: string;
    href: string;
    caseCount?: number;
    referrerDetails?: {
        firstName: string;
        lastName: string;
        cellNumber?: string | null;
        email?: string | null;
        idNumber?: string | null;
        referrerType?: string | null;
    };
    projectDetails?: {
        type: string;
        clientType?: string | null;
        parentId?: string | null;
    };
};

/**
 * Referrer visibility for the caller. `visibleReferrerProjectIds` is the list of
 * project IDs whose referrers the viewer may see; `null` means unrestricted
 * (admin). Resolved by the consuming app, which owns the membership rules.
 */
export type OrgSearchScope = {
    visibleReferrerProjectIds: string[] | null;
};

export async function searchOrgEntities(
    query: string | undefined,
    scope?: OrgSearchScope
): Promise<OrgSearchResult[]> {
    const q = query?.trim();

    // Non-admins only get referrers whose sub-project they are a member of. An
    // empty list matches nothing, which is the correct result for a user with
    // no referrer memberships.
    const referrerScope =
        scope && scope.visibleReferrerProjectIds !== null
            ? { projectId: { in: scope.visibleReferrerProjectIds } }
            : {};

    const [projects, referrers] = await Promise.all([
        // Search Projects
        !q
            ? prisma.project.findMany({
                take: 6,
                include: {
                    parent: { select: { id: true, name: true, type: true } },
                    _count: { select: { cases: true, children: true } }
                },
                orderBy: { updatedAt: 'desc' }
            })
            : prisma.project.findMany({
                where: {
                    OR: [
                        { name: { contains: q, mode: 'insensitive' } },
                        { description: { contains: q, mode: 'insensitive' } },
                        { clientType: { contains: q, mode: 'insensitive' } },
                        { type: { contains: q, mode: 'insensitive' } },
                        { parent: { name: { contains: q, mode: 'insensitive' } } }
                    ]
                },
                take: 10,
                include: {
                    parent: { select: { id: true, name: true, type: true } },
                    _count: { select: { cases: true, children: true } }
                },
                orderBy: { updatedAt: 'desc' }
            }),

        // Search Referrers
        !q
            ? prisma.referrer.findMany({
                where: { isActive: true, ...referrerScope },
                take: 6,
                include: {
                    project: { select: { id: true, name: true } },
                    parentReferrer: { select: { id: true, firstName: true, lastName: true } }
                },
                orderBy: { updatedAt: 'desc' }
            })
            : prisma.referrer.findMany({
                where: {
                    ...referrerScope,
                    OR: [
                        { firstName: { contains: q, mode: 'insensitive' } },
                        { lastName: { contains: q, mode: 'insensitive' } },
                        { email: { contains: q, mode: 'insensitive' } },
                        { cellNumber: { contains: q, mode: 'insensitive' } },
                        { idNumber: { contains: q, mode: 'insensitive' } },
                        { employerName: { contains: q, mode: 'insensitive' } }
                    ]
                },
                take: 10,
                include: {
                    project: { select: { id: true, name: true } },
                    parentReferrer: { select: { id: true, firstName: true, lastName: true } }
                },
                orderBy: { updatedAt: 'desc' }
            })
    ]);

    const results: OrgSearchResult[] = [];

    // Map Projects
    for (const p of projects) {
        let entityType: OrgSearchResult['entityType'] = 'PROJECT';
        let typeLabel = 'Project';
        let badgeColor = 'bg-blue-500/20 text-blue-300 border-blue-500/30';

        if (p.type === 'ACQUISITION_SOURCE' || !p.parentId) {
            entityType = 'MAIN_SOURCE';
            typeLabel = 'Main Source';
            badgeColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
        } else if (p.type === 'BRANCH' || p.parent?.type === 'ACQUISITION_SOURCE') {
            entityType = 'BRANCH';
            typeLabel = 'Branch';
            badgeColor = 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
        } else if (p.parentId) {
            entityType = 'SUB_PROJECT';
            typeLabel = 'Sub-Project';
            badgeColor = 'bg-amber-500/20 text-amber-300 border-amber-500/30';
        }

        const subtitleParts: string[] = [];
        if (p.parent?.name) subtitleParts.push(`Under ${p.parent.name}`);
        if (p.clientType) subtitleParts.push(p.clientType);
        subtitleParts.push(`${p._count?.cases || 0} cases`);

        results.push({
            id: p.id,
            name: p.name,
            entityType,
            typeLabel,
            subtitle: subtitleParts.join(' · '),
            parentName: p.parent?.name || null,
            badgeColor,
            href: `/projects?id=${p.id}`,
            caseCount: p._count?.cases || 0,
            projectDetails: {
                type: p.type,
                clientType: p.clientType,
                parentId: p.parentId
            }
        });
    }

    // Map Referrers
    for (const r of referrers) {
        const fullName = `${r.firstName} ${r.lastName}`.trim();
        const subtitleParts: string[] = ['Referrer / Partner'];
        if (r.cellNumber) subtitleParts.push(r.cellNumber);
        if (r.email) subtitleParts.push(r.email);
        if (r.project?.name) subtitleParts.push(`Project: ${r.project.name}`);

        results.push({
            id: r.id,
            name: fullName,
            entityType: 'REFERRER',
            typeLabel: 'Referrer',
            subtitle: subtitleParts.join(' · '),
            parentName: r.parentReferrer ? `${r.parentReferrer.firstName} ${r.parentReferrer.lastName}` : null,
            badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
            href: `/admin/referrers/${r.id}/clients`,
            referrerDetails: {
                firstName: r.firstName,
                lastName: r.lastName,
                cellNumber: r.cellNumber,
                email: r.email,
                idNumber: r.idNumber,
                referrerType: r.referrerType
            }
        });
    }

    return results;
}

export type OrgSearchRouteOptions = {
    /**
     * Resolves the referrer visibility scope for the signed-in user. Omit to
     * leave results unscoped (every referrer is searchable).
     */
    resolveReferrerScope?: (user: { id: string; isAdmin?: boolean }) => Promise<string[] | null>;
};

export function createOrgSearchRoute(options: OrgSearchRouteOptions = {}) {
    async function GET(request: Request) {
        try {
            const session = await auth();
            if (!session?.user) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }

            const { searchParams } = new URL(request.url);
            const query = searchParams.get('q')?.trim();

            if (query && query.length < 2) {
                return NextResponse.json([]);
            }

            const visibleReferrerProjectIds = options.resolveReferrerScope
                ? await options.resolveReferrerScope(session.user as { id: string; isAdmin?: boolean })
                : null;

            return NextResponse.json(
                await searchOrgEntities(query, { visibleReferrerProjectIds })
            );
        } catch (error) {
            logger.error('Error searching projects & referrers:', error);
            return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
        }
    }

    return { GET };
}
