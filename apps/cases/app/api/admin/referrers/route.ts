import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { z } from 'zod';
import { hasFullReferrerVisibility, getVisibleReferrerProjectIds } from '@/lib/referrer-access';

const logger = createLogger('api/admin/referrers');

const PAGE_SIZE = 20;

export const EMPLOYMENT_TYPES = ['EMPLOYED', 'SELF_EMPLOYED', 'CONTRACT', 'UNEMPLOYED', 'RETIRED'] as const;
export const ACCOUNT_TYPES = ['CHEQUE', 'SAVINGS', 'CURRENT'] as const;

export const COMMISSION_TYPES = ['FIXED', 'VOLUME_BASED'] as const;

const CreateSchema = z.object({
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    idNumber: z.string().trim().length(13).or(z.literal('')).transform(val => val === '' ? null : val).nullable().optional(),
    email: z.string().email().nullable().optional(),
    cellNumber: z.string().max(20).nullable().optional(),
    // Employment
    employerName: z.string().max(200).nullable().optional(),
    employmentType: z.enum(EMPLOYMENT_TYPES).nullable().optional(),
    employerAddress: z.string().max(500).nullable().optional(),
    employerPhone: z.string().max(20).nullable().optional(),
    occupation: z.string().max(200).nullable().optional(),
    monthlyIncome: z.number().positive().nullable().optional(),
    // Banking
    bankName: z.string().max(100).nullable().optional(),
    accountNumber: z.string().max(50).nullable().optional(),
    accountType: z.enum(ACCOUNT_TYPES).nullable().optional(),
    branchCode: z.string().max(10).nullable().optional(),
    accountHolderName: z.string().max(200).nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
    isActive: z.boolean().optional(),
    // Commission
    commissionType: z.enum(COMMISSION_TYPES).optional(),
    fixedCommissionAmount: z.number().min(1).max(99999).nullable().optional(),
    // Hierarchy — who referred this referrer (optional)
    parentReferrerId: z.string().nullable().optional(),
    // Initial staff members of the referrer sub-project (optional). Membership
    // is what grants non-admin staff visibility of this referrer.
    memberUserIds: z.array(z.string().min(1)).max(100).optional(),
});

// GET /api/admin/referrers — paginated list with search and status filters
export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if (!session.user.isAdmin && !session.user.isExecutive && !session.user.isSeniorManager && session.user.role !== 'MANAGER') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const page = Math.max(1, Number(searchParams.get('page') ?? 1));
        const search = searchParams.get('search') ?? '';
        const isActiveParam = searchParams.get('isActive') ?? '';

        // Membership scoping: admins see every referrer; everyone else only
        // sees referrers whose sub-project they are a member of.
        // null = unrestricted (admin).
        const visibleProjectIds = hasFullReferrerVisibility(session.user)
            ? null
            : await getVisibleReferrerProjectIds(session.user.id);

        const where: Record<string, unknown> = {};
        if (visibleProjectIds !== null) {
            where.projectId = { in: visibleProjectIds };
        }
        if (search) {
            where.OR = [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { idNumber: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { cellNumber: { contains: search, mode: 'insensitive' } },
            ];
        }
        if (isActiveParam === 'true') where.isActive = true;
        if (isActiveParam === 'false') where.isActive = false;

        const [referrers, total] = await Promise.all([
            prisma.referrer.findMany({
                where,
                orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
                skip: (page - 1) * PAGE_SIZE,
                take: PAGE_SIZE,
                include: {
                    project: { select: { id: true, name: true, parentId: true } },
                    parentReferrer: { select: { id: true, firstName: true, lastName: true } },
                    _count: { select: { cases: true } },
                },
            }),
            prisma.referrer.count({ where }),
        ]);

        // Meta counts respect the same visibility scope so non-admins never
        // see totals for referrers they cannot access.
        const scopeWhere: Record<string, unknown> = visibleProjectIds !== null
            ? { projectId: { in: visibleProjectIds } }
            : {};
        const [totalCount, activeCount] = await Promise.all([
            prisma.referrer.count({ where: scopeWhere }),
            prisma.referrer.count({ where: { ...scopeWhere, isActive: true } }),
        ]);

        const referrerIds = referrers.map(r => r.id);
        const [pageCommissions, globalCommissions] = await Promise.all([
            prisma.referrerCommission.groupBy({
                by: ['referrerId', 'isPaid'],
                where: { referrerId: { in: referrerIds }, isEligible: true },
                _sum: { commissionAmount: true },
            }),
            prisma.referrerCommission.groupBy({
                by: ['isPaid'],
                where: {
                    isEligible: true,
                    ...(visibleProjectIds !== null
                        ? { referrer: { projectId: { in: visibleProjectIds } } }
                        : {}),
                },
                _sum: { commissionAmount: true },
            })
        ]);

        const enrichedReferrers = referrers.map(r => {
            const outstanding = pageCommissions.find(c => c.referrerId === r.id && !c.isPaid)?._sum.commissionAmount?.toNumber() || 0;
            const paid = pageCommissions.find(c => c.referrerId === r.id && c.isPaid)?._sum.commissionAmount?.toNumber() || 0;
            return { ...r, outstandingCommission: outstanding, paidCommission: paid };
        });

        const totalOutstanding = globalCommissions.find(c => !c.isPaid)?._sum.commissionAmount?.toNumber() || 0;
        const totalPaid = globalCommissions.find(c => c.isPaid)?._sum.commissionAmount?.toNumber() || 0;

        return NextResponse.json({
            referrers: enrichedReferrers,
            total,
            page,
            pages: Math.ceil(total / PAGE_SIZE),
            meta: { 
                total: totalCount, active: activeCount, inactive: totalCount - activeCount,
                totalOutstanding, totalPaid 
            },
        });
    } catch (error) {
        logger.error('Error fetching referrers:', error);
        return NextResponse.json({ error: 'Failed to fetch referrers' }, { status: 500 });
    }
}

// POST /api/admin/referrers — create a new referrer and auto-create their sub-project
export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if (!session.user.isAdmin && !session.user.isExecutive && !session.user.isSeniorManager && session.user.role !== 'MANAGER') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await request.json();
        const parsed = CreateSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 });
        }

        const data = parsed.data;

        // Check for duplicate ID number (only when provided)
        if (data.idNumber) {
            const existing = await prisma.referrer.findUnique({ where: { idNumber: data.idNumber } });
            if (existing) {
                return NextResponse.json({ error: 'A referrer with this ID number already exists' }, { status: 409 });
            }
        }

        // Validate initial members if provided — only internal staff accounts
        // can be referrer members (same rule as PUT /[id]/members)
        const memberUserIds = Array.from(new Set(data.memberUserIds ?? [])).filter(
            (userId) => userId !== session.user.id // creator is always added separately as MANAGER
        );
        if (memberUserIds.length > 0) {
            const users = await prisma.user.findMany({
                where: { id: { in: memberUserIds } },
                select: { id: true, userType: true },
            });
            if (users.length !== memberUserIds.length) {
                return NextResponse.json({ error: 'One or more selected members do not exist' }, { status: 422 });
            }
            if (users.some((u) => u.userType !== 'STAFF')) {
                return NextResponse.json({ error: 'Only staff users can be members of a referrer' }, { status: 422 });
            }
        }

        // Validate parent referrer if provided
        let parentProjectId: string | null = null;
        if (data.parentReferrerId) {
            const parent = await prisma.referrer.findUnique({
                where: { id: data.parentReferrerId },
                select: { id: true, projectId: true, firstName: true, lastName: true },
            });
            if (!parent) {
                return NextResponse.json({ error: 'Parent referrer not found' }, { status: 404 });
            }
            parentProjectId = parent.projectId ?? null;
        }

        // Determine the parent project for the new sub-project:
        // - If this referrer was referred by another referrer → nest under their sub-project
        // - Otherwise → find or create the root "Referrals" acquisition source project
        let subProjectParentId: string;
        if (parentProjectId) {
            subProjectParentId = parentProjectId;
        } else {
            let referralsRoot = await prisma.project.findFirst({
                where: { name: 'Referrals', type: 'ACQUISITION_SOURCE', parentId: null },
            });
            if (!referralsRoot) {
                referralsRoot = await prisma.project.create({
                    data: { name: 'Referrals', type: 'ACQUISITION_SOURCE', description: 'Cases referred by external referrers' },
                });
            }
            subProjectParentId = referralsRoot.id;
        }

        // Create sub-project named after the referrer. The creator becomes its
        // first member so non-admin staff keep visibility of referrers they add
        // (membership is what scopes the referrer registry). Any selected
        // initial members join alongside the creator as MEMBER.
        const subProject = await prisma.project.create({
            data: {
                name: `${data.firstName} ${data.lastName}`,
                type: 'REFERRER',
                description: `Referral sub-project for ${data.firstName} ${data.lastName}${data.idNumber ? ` (ID: ${data.idNumber})` : ''}`,
                parentId: subProjectParentId,
                members: {
                    create: [
                        { userId: session.user.id, role: 'MANAGER' },
                        ...memberUserIds.map((userId) => ({ userId, role: 'MEMBER' })),
                    ],
                },
            },
        });

        const { parentReferrerId, memberUserIds: _memberUserIds, ...restData } = data;
        const referrer = await prisma.referrer.create({
            data: {
                ...restData,
                monthlyIncome: restData.monthlyIncome != null ? restData.monthlyIncome : undefined,
                projectId: subProject.id,
                createdById: session.user.id,
                parentReferrerId: parentReferrerId ?? null,
            },
            include: {
                project: { select: { id: true, name: true, parentId: true } },
                parentReferrer: { select: { id: true, firstName: true, lastName: true } },
                _count: { select: { cases: true } },
            },
        });

        logger.info(`Referrer created: ${referrer.id} — ${referrer.firstName} ${referrer.lastName}`);
        return NextResponse.json(referrer, { status: 201 });
    } catch (error) {
        logger.error('Error creating referrer:', error);
        return NextResponse.json({ error: 'Failed to create referrer' }, { status: 500 });
    }
}
