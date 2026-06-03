import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger } from '@zenowethu/shared-lib';
import { z } from 'zod';

const QuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    from: z.string().optional(),
    to: z.string().optional(),
    category: z.string().optional(),
    method: z.string().optional(),
});

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { id } = await params;

        const client = await prisma.client.findUnique({
            where: { id },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                idNumber: true,
                email: true,
                phone: true,
                cases: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: {
                        id: true,
                        fileNumber: true,
                        status: true,
                        serviceFee: true,
                        instalments: true,
                        totalMonthlyInstallment: true,
                    },
                },
            },
        });

        if (!client) {
            return NextResponse.json({ error: 'Client not found' }, { status: 404 });
        }

        const { searchParams } = new URL(request.url);
        const parsed = QuerySchema.safeParse({
            page: searchParams.get('page'),
            limit: searchParams.get('limit'),
            from: searchParams.get('from') ?? undefined,
            to: searchParams.get('to') ?? undefined,
            category: searchParams.get('category') ?? undefined,
            method: searchParams.get('method') ?? undefined,
        });

        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
        }

        const { page, limit, from, to, category, method } = parsed.data;
        const skip = (page - 1) * limit;

        const where: Record<string, unknown> = { clientId: id };
        if (category) where.category = category;
        if (method) where.method = method;
        if (from || to) {
            where.date = {} as Record<string, Date>;
            if (from) (where.date as Record<string, Date>).gte = new Date(from);
            if (to) {
                const toDate = new Date(to);
                toDate.setHours(23, 59, 59, 999);
                (where.date as Record<string, Date>).lte = toDate;
            }
        }

        const [payments, total, sumAgg] = await Promise.all([
            prisma.payment.findMany({
                where,
                orderBy: { date: 'desc' },
                skip,
                take: limit,
                include: {
                    case: { select: { fileNumber: true } },
                    recordedBy: { select: { firstName: true, lastName: true } },
                    batch: { select: { fileName: true } },
                },
            }),
            prisma.payment.count({ where }),
            prisma.payment.aggregate({
                where: { clientId: id, status: 'COMPLETED' },
                _sum: { amount: true },
            }),
        ]);

        const activeCase = client.cases[0] ?? null;
        const totalPaid = Number(sumAgg._sum.amount ?? 0);
        const serviceFee = Number(activeCase?.serviceFee ?? 0);
        const outstanding = serviceFee > 0 ? Math.max(0, serviceFee - totalPaid) : null;

        return NextResponse.json({
            client: {
                id: client.id,
                firstName: client.firstName,
                lastName: client.lastName,
                idNumber: client.idNumber,
                email: client.email,
                phone: client.phone,
            },
            activeCase,
            summary: {
                totalPaid,
                outstanding,
                paymentCount: total,
            },
            payments,
            total,
            page,
            pages: Math.ceil(total / limit),
        });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error('[Finance] GET /finance/clients/[id]/payments error:', error);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
