import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { z } from 'zod';

const logger = createLogger('api/admin/credit-providers');

const PAGE_SIZE = 20;

export const PROVIDER_TYPES = ['BANK', 'MICRO_LENDER', 'TELECOM', 'RETAILER', 'OTHER'] as const;

const CreateSchema = z.object({
    name: z.string().min(1).max(200),
    type: z.enum(PROVIDER_TYPES),
    email: z.string().email().nullable().optional(),
    phone: z.string().max(30).nullable().optional(),
    address: z.string().max(500).nullable().optional(),
    attorney: z.string().max(200).nullable().optional(),
    attorneyEmail: z.string().email().nullable().optional(),
    attorneyPhone: z.string().max(30).nullable().optional(),
    isActive: z.boolean().optional(),
});

// GET /api/admin/credit-providers — paginated list with search/type/isActive filters
export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const page = Math.max(1, Number(searchParams.get('page') ?? 1));
        const search = searchParams.get('search') ?? '';
        const type = searchParams.get('type') ?? '';
        const isActiveParam = searchParams.get('isActive') ?? '';

        const where: Record<string, unknown> = {};
        if (search) where.name = { contains: search, mode: 'insensitive' };
        if (type) where.type = type;
        if (isActiveParam === 'true') where.isActive = true;
        if (isActiveParam === 'false') where.isActive = false;

        const [providers, total] = await Promise.all([
            prisma.creditProvider.findMany({
                where,
                orderBy: { name: 'asc' },
                skip: (page - 1) * PAGE_SIZE,
                take: PAGE_SIZE,
            }),
            prisma.creditProvider.count({ where }),
        ]);

        const [totalCount, activeCount] = await Promise.all([
            prisma.creditProvider.count(),
            prisma.creditProvider.count({ where: { isActive: true } }),
        ]);

        return NextResponse.json({
            providers,
            total,
            page,
            pages: Math.ceil(total / PAGE_SIZE),
            meta: {
                total: totalCount,
                active: activeCount,
                inactive: totalCount - activeCount,
            },
        });
    } catch (error) {
        logger.error('Error fetching credit providers:', error);
        return NextResponse.json({ error: 'Failed to fetch credit providers' }, { status: 500 });
    }
}

// POST /api/admin/credit-providers — create a new credit provider
export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const canMutate =
            session.user.isAdmin || session.user.isExecutive || session.user.isSeniorManager;
        if (!canMutate) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await request.json();
        const parsed = CreateSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Validation failed', issues: parsed.error.issues },
                { status: 422 }
            );
        }

        const { name, type, email, phone, address, attorney, attorneyEmail, attorneyPhone, isActive } =
            parsed.data;

        const provider = await prisma.creditProvider.create({
            data: {
                name,
                type,
                email: email ?? null,
                phone: phone ?? null,
                address: address ?? null,
                attorney: attorney ?? null,
                attorneyEmail: attorneyEmail ?? null,
                attorneyPhone: attorneyPhone ?? null,
                isActive: isActive ?? true,
            },
        });

        logger.info(`Credit provider created by user ${session.user.id}: ${provider.name}`);
        return NextResponse.json(provider, { status: 201 });
    } catch (error: unknown) {
        if (
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            (error as { code: string }).code === 'P2002'
        ) {
            return NextResponse.json(
                { error: 'A credit provider with that name already exists' },
                { status: 409 }
            );
        }
        logger.error('Error creating credit provider:', error);
        return NextResponse.json({ error: 'Failed to create credit provider' }, { status: 500 });
    }
}
