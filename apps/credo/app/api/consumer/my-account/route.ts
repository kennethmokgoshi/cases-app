import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth } from '@/auth';

export async function GET(_req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const consumer = await prisma.consumerAccount.findUnique({
            where: { id: session.user.id },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                linkedClientId: true,
                linkedClient: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        idNumber: true,
                        cases: {
                            orderBy: { createdAt: 'desc' },
                            take: 1,
                            select: {
                                id: true,
                                fileNumber: true,
                                status: true,
                                statusEntryDate: true,
                                createdAt: true,
                                serviceFee: true,
                                instalments: true,
                                totalMonthlyInstallment: true,
                                workflowLogs: {
                                    orderBy: { timestamp: 'asc' },
                                    select: {
                                        id: true,
                                        fromStatus: true,
                                        toStatus: true,
                                        action: true,
                                        timestamp: true,
                                        notes: true,
                                    },
                                },
                            },
                        },
                        payments: {
                            orderBy: { date: 'desc' },
                            select: {
                                id: true,
                                amount: true,
                                date: true,
                                method: true,
                                reference: true,
                                category: true,
                                status: true,
                            },
                        },
                    },
                },
            },
        });

        if (!consumer) {
            return NextResponse.json({ error: 'Consumer not found' }, { status: 404 });
        }

        if (!consumer.linkedClient) {
            return NextResponse.json({ linked: false });
        }

        const client = consumer.linkedClient;
        const activeCase = client.cases[0] ?? null;
        const payments = client.payments;

        const totalPaid = payments
            .filter(p => p.status === 'COMPLETED')
            .reduce((sum, p) => sum + Number(p.amount), 0);

        const serviceFee = activeCase ? Number(activeCase.serviceFee ?? 0) : 0;
        const outstanding = serviceFee > 0 ? Math.max(0, serviceFee - totalPaid) : null;

        return NextResponse.json({
            linked: true,
            client: {
                firstName: client.firstName,
                lastName: client.lastName,
                idNumber: client.idNumber,
            },
            account: {
                serviceFee,
                totalPaid,
                outstanding,
                instalments: activeCase?.instalments ?? 0,
                monthlyInstallment: activeCase ? Number(activeCase.totalMonthlyInstallment ?? 0) : 0,
            },
            activeCase: activeCase
                ? {
                      fileNumber: activeCase.fileNumber,
                      status: activeCase.status,
                      statusEntryDate: activeCase.statusEntryDate,
                      createdAt: activeCase.createdAt,
                  }
                : null,
            workflowLogs: activeCase?.workflowLogs ?? [],
            payments,
        });
    } catch (error: unknown) {
        console.error('[Credo] GET /api/consumer/my-account error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
