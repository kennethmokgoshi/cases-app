import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';

// Server-side logger for API routes
const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    debug: (...args: any[]) => console.debug('[DEBUG]', ...args)
};


export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type') || 'cases';
        const from = searchParams.get('from');
        const to = searchParams.get('to');

        const dateFilter = from && to ? {
            createdAt: {
                gte: new Date(from),
                lte: new Date(to + 'T23:59:59.999Z')
            }
        } : {};

        let csv = '';
        let filename = 'export.csv';

        if (type === 'cases' || type === 'cases_b2b' || type === 'cases_b2c') {
            const clientTypeFilter = type === 'cases_b2b' ? { acquisitionType: 'B2B' }
                : type === 'cases_b2c' ? { acquisitionType: 'B2C' }
                    : {};

            const cases = await prisma.case.findMany({
                where: { ...dateFilter, ...clientTypeFilter },
                include: {
                    client: true,
                    projects: { where: { isPrimary: true }, include: { project: true } }
                },
                orderBy: { createdAt: 'desc' }
            });

            csv = 'File Number,Client Name,ID Number,Phone,Email,Status,Client Type,Project,Created Date\n';
            cases.forEach(c => {
                const project = c.projects[0]?.project?.name || 'N/A';
                csv += `"${c.fileNumber}","${c.client.firstName} ${c.client.lastName}","${c.client.idNumber}","${c.client.phone || ''}","${c.client.email || ''}","${c.status}","${c.acquisitionType || 'N/A'}","${project}","${c.createdAt.toISOString().split('T')[0]}"\n`;
            });
            filename = `cases_${type}_${from}_${to}.csv`;
        } else if (type === 'invoices') {
            const invoices = await prisma.case.findMany({
                where: { ...dateFilter, acquisitionType: 'B2C', r350Status: 'PENDING' },
                include: { client: true },
                orderBy: { createdAt: 'desc' }
            });

            csv = 'File Number,Client Name,Phone,Email,Amount,Status,Date\n';
            invoices.forEach(c => {
                csv += `"${c.fileNumber}","${c.client.firstName} ${c.client.lastName}","${c.client.phone || ''}","${c.client.email || ''}","R350","Pending","${c.createdAt.toISOString().split('T')[0]}"\n`;
            });
            filename = `invoices_${from}_${to}.csv`;
        } else if (type === 'status') {
            const statusCounts = await prisma.case.groupBy({
                by: ['status'],
                _count: { status: true },
                where: dateFilter
            });

            csv = 'Status,Count\n';
            statusCounts.forEach(s => {
                csv += `"${s.status}","${s._count.status}"\n`;
            });
            filename = `cases_by_status_${from}_${to}.csv`;
        } else if (type === 'project') {
            const caseProjects = await prisma.caseProject.findMany({
                where: { isPrimary: true, case: dateFilter },
                include: { project: { select: { name: true } } }
            });

            const counts: Record<string, number> = {};
            caseProjects.forEach(cp => {
                counts[cp.project.name] = (counts[cp.project.name] || 0) + 1;
            });

            csv = 'Project,Count\n';
            Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([name, count]) => {
                csv += `"${name}","${count}"\n`;
            });
            filename = `cases_by_project_${from}_${to}.csv`;
        }

        return new Response(csv, {
            headers: {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="${filename}"`
            }
        });
    } catch (error) {
        logger.error('Error exporting report:', error);
        return NextResponse.json({ error: 'Failed to export report' }, { status: 500 });
    }
}

