import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth } from '@/auth';

export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const consumerId = session.user.id;

        // Fetch consumer with linked client and cases
        const consumer = await prisma.consumerAccount.findUnique({
            where: { id: consumerId },
            include: {
                linkedClient: {
                    include: {
                        cases: {
                            orderBy: { updatedAt: 'desc' },
                            include: {
                                workflowLogs: {
                                    orderBy: { timestamp: 'desc' },
                                    take: 1
                                }
                            }
                        },
                        creditAccounts: true,
                        payments: {
                            orderBy: { date: 'desc' },
                            take: 5
                        }
                    }
                }
            }
        });

        const consumerResult = consumer as any;
        const client = consumerResult?.linkedClient;

        if (!consumer || !client) {
            // No linked client yet — return empty/ready stats
            return NextResponse.json({
                stats: [
                    { label: "Active Cases", value: "0", sub: "Start a dispute", color: "#2563EB", bg: "#EFF6FF" },
                    { label: "Disputes Filed", value: "0", sub: "Since joining", color: "#7C3AED", bg: "#F5F3FF" },
                    { label: "Items Removed", value: "0", sub: "Negative items cleared", color: "#059669", bg: "#ECFDF5" },
                    { label: "Months Active", value: "0", sub: "New journey", color: "#C4953A", bg: "#F6EDD6" },
                ],
                cases: [],
                activities: [],
                bureaus: [
                    { key: "transunion", name: "TransUnion", score: 0, change: 0, lastPulled: "Never" },
                    { key: "experian",   name: "Experian",   score: 0, change: 0, lastPulled: "Never" },
                    { key: "xds",        name: "XDS",        score: 0, change: 0, lastPulled: "Never" },
                ]
            });
        }

        // Calculate Stats
        const activeCases = client.cases.filter(c => c.status !== 'RESOLVED' && c.status !== 'CLOSED').length;
        const totalDisputes = client.cases.length;
        const itemsRemoved = client.cases.filter(c => c.status === 'RESOLVED').length;
        const monthsActive = Math.ceil((Date.now() - consumer.createdAt.getTime()) / (1000 * 60 * 60 * 24 * 30));

        const STATUS_LABELS: Record<string, string> = {
            IN_PROGRESS: 'Case Assessment',
            RESOLVED: 'Item Removed',
            NEW_LEAD: 'File Created',
            WAITING: 'Awaiting Bureau',
        };

        // Format Activities
        const activities = client.cases.flatMap(c => 
            c.workflowLogs.map(log => ({
                type: log.toStatus === 'RESOLVED' ? 'CHECK' : 'CLOCK',
                title: STATUS_LABELS[log.toStatus] || log.toStatus,
                subtitle: `${c.description ?? c.fileNumber}`,
                time: log.timestamp.toLocaleDateString(),
                iconBg: log.toStatus === 'RESOLVED' ? "#ECFDF5" : "#EFF6FF"
            }))
        ).sort((a,b) => b.time.localeCompare(a.time)).slice(0, 5);

        // Format Cases for Dashboard (Preview)
        const dashboardCases = client.cases.slice(0, 3).map(c => ({
            id: c.fileNumber,
            title: c.description || 'Unnamed Case',
            status: c.status,
            step: c.status === 'RESOLVED' ? 'Completed' : 'Processing',
            daysLeft: null, // Hard to calculate without deadlines
            bureau: 'Multiple', // Placeholder
        }));

        return NextResponse.json({
            stats: [
                { label: "Active Cases", value: String(activeCases), sub: `${activeCases} in progress`, color: "#2563EB", bg: "#EFF6FF" },
                { label: "Disputes Filed", value: String(totalDisputes), sub: "Since joining", color: "#7C3AED", bg: "#F5F3FF" },
                { label: "Items Removed", value: String(itemsRemoved), sub: "Negative items cleared", color: "#059669", bg: "#ECFDF5" },
                { label: "Months Active", value: String(monthsActive), sub: "Credit repair journey", color: "#C4953A", bg: "#F6EDD6" },
            ],
            cases: dashboardCases,
            activities,
            bureaus: [
                { key: "transunion", name: "TransUnion", score: 0, change: 0, lastPulled: "Never" },
                { key: "experian",   name: "Experian",   score: 0, change: 0, lastPulled: "Never" },
                { key: "xds",        name: "XDS",        score: 0, change: 0, lastPulled: "Never" },
            ]
        });

    } catch (error: any) {
        console.error('Dashboard Data Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
