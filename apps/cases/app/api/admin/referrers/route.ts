import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { z } from 'zod';

const logger = createLogger('api/admin/referrers');

const PAGE_SIZE = 20;

export const EMPLOYMENT_TYPES = ['EMPLOYED', 'SELF_EMPLOYED', 'CONTRACT', 'UNEMPLOYED', 'RETIRED'] as const;
export const ACCOUNT_TYPES = ['CHEQUE', 'SAVINGS', 'CURRENT'] as const;

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

        const where: Record<string, unknown> = {};
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
                    project: { select: { id: true, name: true } },
                    _count: { select: { cases: true } },
                },
            }),
            prisma.referrer.count({ where }),
        ]);

        const [totalCount, activeCount] = await Promise.all([
            prisma.referrer.count(),
            prisma.referrer.count({ where: { isActive: true } }),
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
                where: { isEligible: true },
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

        // Find or create the root "Referrals" acquisition source project
        let referralsRoot = await prisma.project.findFirst({
            where: { name: 'Referrals', type: 'ACQUISITION_SOURCE', parentId: null },
        });
        if (!referralsRoot) {
            referralsRoot = await prisma.project.create({
                data: { name: 'Referrals', type: 'ACQUISITION_SOURCE', description: 'Cases referred by external referrers' },
            });
        }

        // Create sub-project named after the referrer
        const subProject = await prisma.project.create({
            data: {
                name: `${data.firstName} ${data.lastName}`,
                type: 'REFERRER',
                description: `Referral sub-project for ${data.firstName} ${data.lastName}${data.idNumber ? ` (ID: ${data.idNumber})` : ''}`,
                parentId: referralsRoot.id,
            },
        });

        const referrer = await prisma.referrer.create({
            data: {
                ...data,
                monthlyIncome: data.monthlyIncome != null ? data.monthlyIncome : undefined,
                projectId: subProject.id,
                createdById: session.user.id,
            },
            include: {
                project: { select: { id: true, name: true } },
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
