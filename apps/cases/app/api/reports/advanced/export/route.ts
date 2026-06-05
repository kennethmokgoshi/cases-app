import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, getSLATier, getBusinessDaysBetween, createLogger } from '@zenowethu/shared-lib';
import * as XLSX from 'xlsx';

const logger = createLogger('api/reports/advanced/export');

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const projectId = searchParams.get('projectId');

        const whereClause: any = { deletedAt: null };
        if (projectId && projectId !== 'all') {
            whereClause.projects = { some: { projectId } };
        }

        // 1. Fetch data
        const cases = await prisma.case.findMany({
            where: whereClause,
            include: { client: true }
        });

        // 2. Prepare SLA Data
        const slaData = cases.map(c => ({
            'File Number': c.fileNumber,
            'Client': `${c.client.firstName} ${c.client.lastName}`,
            'Status': c.status.replace(/_/g, ' '),
            'Deadline': c.deadline ? c.deadline.toISOString().split('T')[0] : 'None',
            'SLA Status': c.isOverdue ? 'CRITICAL (OVERDUE)' : getSLATier(c.deadline, c.status),
            'Acquisition': c.acquisitionType
        }));

        // 3. Prepare Bottleneck Data
        const logs = await prisma.workflowLog.findMany({
            where: { case: whereClause },
            orderBy: { timestamp: 'desc' },
            take: 1000
        });

        const caseLogs: Record<string, any[]> = {};
        logs.forEach(l => {
            if (!caseLogs[l.caseId]) caseLogs[l.caseId] = [];
            caseLogs[l.caseId].push(l);
        });

        const statusStats: Record<string, { total: number; count: number }> = {};
        Object.values(caseLogs).forEach(clogs => {
            for (let i = 0; i < clogs.length - 1; i++) {
                const newer = clogs[i];
                const older = clogs[i + 1];
                if (older.fromStatus) {
                    const days = getBusinessDaysBetween(older.timestamp, newer.timestamp);
                    if (!statusStats[older.fromStatus]) {
                        statusStats[older.fromStatus] = { total: 0, count: 0 };
                    }
                    statusStats[older.fromStatus].total += days;
                    statusStats[older.fromStatus].count++;
                }
            }
        });

        const bottleneckData = Object.entries(statusStats).map(([status, data]) => ({
            'Status': status.replace(/_/g, ' '),
            'Average Days (MTIS)': (data.total / data.count).toFixed(1),
            'Sample Size': data.count
        })).sort((a, b) => Number(b['Average Days (MTIS)']) - Number(a['Average Days (MTIS)']));

        // 4. Create Workbook
        const wb = XLSX.utils.book_new();

        const wsSla = XLSX.utils.json_to_sheet(slaData);
        XLSX.utils.book_append_sheet(wb, wsSla, 'SLA Compliance');

        const wsBottlenecks = XLSX.utils.json_to_sheet(bottleneckData);
        XLSX.utils.book_append_sheet(wb, wsBottlenecks, 'Bottleneck Analysis');

        // 5. Generate Buffer
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        return new Response(buf, {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': 'attachment; filename="Advanced_Analytics_Report.xlsx"'
            }
        });

    } catch (error) {
        logger.error({ error }, 'Excel Export Error');
        return NextResponse.json({ error: 'Failed to export Excel' }, { status: 500 });
    }
}
