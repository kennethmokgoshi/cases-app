import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import * as XLSX from 'xlsx';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
};

// ─── PDF table builder ────────────────────────────────────────────────────────

async function buildTablePDF(title: string, headers: string[], rows: string[][]): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const pageW = 842;   // A4 landscape
    const pageH = 595;
    const margin = 36;
    const usableW = pageW - margin * 2;
    const colW = usableW / headers.length;
    const ROW_H = 16;
    const HEADER_H = 20;
    const FONT_SIZE = 8;
    const HEADER_FONT_SIZE = 9;

    let page = pdfDoc.addPage([pageW, pageH]);
    let y = pageH - margin;

    const newPage = () => {
        page = pdfDoc.addPage([pageW, pageH]);
        y = pageH - margin;
    };

    // Title
    page.drawText(title, { x: margin, y, size: 13, font: boldFont, color: rgb(0.02, 0.71, 0.83) });
    y -= 20;

    // Generated date
    page.drawText(`Generated: ${new Date().toLocaleString('en-ZA')}`, { x: margin, y, size: 7, font, color: rgb(0.6, 0.6, 0.6) });
    y -= 16;

    // Header row background
    page.drawRectangle({ x: margin, y: y - HEADER_H + 4, width: usableW, height: HEADER_H, color: rgb(0.07, 0.18, 0.28) });

    headers.forEach((h, i) => {
        const text = h.length > 18 ? h.slice(0, 17) + '…' : h;
        page.drawText(text, { x: margin + i * colW + 4, y: y - 12, size: HEADER_FONT_SIZE, font: boldFont, color: rgb(0.02, 0.71, 0.83) });
    });
    y -= HEADER_H;

    // Data rows
    rows.forEach((row, rowIdx) => {
        if (y < margin + ROW_H + 10) newPage();

        // Alternating row background
        if (rowIdx % 2 === 0) {
            page.drawRectangle({ x: margin, y: y - ROW_H + 4, width: usableW, height: ROW_H, color: rgb(0.05, 0.12, 0.2) });
        }

        row.forEach((cell, i) => {
            const maxChars = Math.floor(colW / 4.5);
            const text = (cell ?? '').toString();
            const truncated = text.length > maxChars ? text.slice(0, maxChars - 1) + '…' : text;
            page.drawText(truncated, { x: margin + i * colW + 4, y: y - 11, size: FONT_SIZE, font, color: rgb(0.88, 0.88, 0.88) });
        });

        y -= ROW_H;
    });

    // Bottom border
    page.drawLine({ start: { x: margin, y: y + ROW_H - 2 }, end: { x: margin + usableW, y: y + ROW_H - 2 }, thickness: 0.5, color: rgb(0.2, 0.3, 0.4) });

    return pdfDoc.save();
}

// ─── Response builders ────────────────────────────────────────────────────────

function csvResponse(headers: string[], rows: string[][], filename: string) {
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${(v ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
    return new Response(csv, {
        headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="${filename}.csv"`
        }
    });
}

function excelResponse(headers: string[], rows: string[][], filename: string) {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

    // Style header row width
    ws['!cols'] = headers.map(() => ({ wch: 20 }));

    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    return new Response(ab, {
        headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${filename}.xlsx"`
        }
    });
}

async function pdfResponse(title: string, headers: string[], rows: string[][], filename: string) {
    const pdfBytes = await buildTablePDF(title, headers, rows);
    const ab = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer;
    return new Response(ab, {
        headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${filename}.pdf"`
        }
    });
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type') || 'cases';
        const format = (searchParams.get('format') || 'csv') as 'csv' | 'excel' | 'pdf';
        const from = searchParams.get('from');
        const to = searchParams.get('to');
        const projectId = searchParams.get('projectId');
        const filterBy = searchParams.get('filterBy') || 'createdAt';

        const dateFilter: any = from && to ? {
            [filterBy]: {
                gte: new Date(from),
                lte: new Date(to + 'T23:59:59.999Z')
            }
        } : {};

        // Project Filter (Recursive)
        if (projectId && projectId !== 'all') {
            const allProjects = await prisma.project.findMany({
                select: { id: true, parentId: true }
            });

            const projectIds = new Set<string>([projectId]);
            let added = true;
            while (added) {
                added = false;
                allProjects.forEach(p => {
                    if (p.parentId && projectIds.has(p.parentId) && !projectIds.has(p.id)) {
                        projectIds.add(p.id);
                        added = true;
                    }
                });
            }

            dateFilter.projects = {
                some: {
                    projectId: { in: Array.from(projectIds) }
                }
            };
        }

        let headers: string[] = [];
        let rows: string[][] = [];
        let filename = 'export';
        let pdfTitle = 'Zenowethu Report';

        // ── Cases (All/B2B/B2C/Completed) ───────────────────────────────────────
        if (type === 'cases' || type === 'cases_b2b' || type === 'cases_b2c' || type === 'cases_completed') {
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

            headers = ['File Number', 'Client Name', 'ID Number', 'Phone', 'Email', 'Status', 'Client Type', 'Project', 'Created Date', 'Target Completion'];
            rows = cases.map(c => [
                c.fileNumber,
                `${c.client.firstName} ${c.client.lastName}`,
                c.client.idNumber,
                c.client.phone || '',
                c.client.email || '',
                c.status,
                c.acquisitionType || 'N/A',
                c.projects[0]?.project?.name || 'N/A',
                c.createdAt.toISOString().split('T')[0],
                c.fileToBeCompleted ? c.fileToBeCompleted.toISOString().split('T')[0] : 'N/A'
            ]);

            const labelMap: Record<string, string> = {
                'cases': 'All Cases',
                'cases_b2b': 'B2B Cases',
                'cases_b2c': 'B2C Cases',
                'cases_completed': 'Completion Report'
            };
            const label = labelMap[type] || 'Cases Report';
            filename = `cases_${type}_${from}_${to}`;
            pdfTitle = `Zenowethu — ${label} (${from} to ${to})`;

        // ── Staff Performance ──────────────────────────────────────────────────
        } else if (type === 'staff') {
            const staffCasesRaw = await prisma.case.groupBy({
                by: ['assignedToId'],
                _count: { id: true },
                where: dateFilter
            });

            const staffIds = staffCasesRaw.map(s => s.assignedToId).filter(Boolean) as string[];
            const staffMembers = await prisma.user.findMany({
                where: { id: { in: staffIds } },
                select: { id: true, firstName: true, lastName: true, email: true }
            });

            headers = ['Staff Member', 'Email', 'Case Count'];
            rows = staffCasesRaw.map(s => {
                const member = staffMembers.find(m => m.id === s.assignedToId);
                return [
                    member ? `${member.firstName} ${member.lastName}` : 'Unassigned',
                    member?.email || 'N/A',
                    String(s._count.id)
                ];
            }).sort((a, b) => Number(b[2]) - Number(a[2]));

            filename = `staff_performance_${from}_${to}`;
            pdfTitle = `Zenowethu — Staff Performance (${from} to ${to})`;

        // ── B2B Performance ────────────────────────────────────────────────────
        } else if (type === 'b2b') {
            const b2bStatsRaw = await prisma.case.groupBy({
                by: ['partnerName'],
                _count: { id: true },
                where: { ...dateFilter, acquisitionType: 'B2B' }
            });

            headers = ['Partner Name', 'Case Count'];
            rows = b2bStatsRaw.map(b => [
                b.partnerName || 'Unknown Partner',
                String(b._count.id)
            ]).sort((a, b) => Number(b[1]) - Number(a[1]));

            filename = `b2b_performance_${from}_${to}`;
            pdfTitle = `Zenowethu — B2B Partner Performance (${from} to ${to})`;

        // ── Invoices ───────────────────────────────────────────────────────────
        } else if (type === 'invoices') {
            const invoices = await prisma.case.findMany({
                where: { ...dateFilter, acquisitionType: 'B2C', r350Status: 'PENDING' },
                include: { client: true },
                orderBy: { createdAt: 'desc' }
            });

            headers = ['File Number', 'Client Name', 'Phone', 'Email', 'Amount', 'Status', 'Date'];
            rows = invoices.map(c => [
                c.fileNumber,
                `${c.client.firstName} ${c.client.lastName}`,
                c.client.phone || '',
                c.client.email || '',
                'R350',
                'Pending',
                c.createdAt.toISOString().split('T')[0]
            ]);

            filename = `invoices_${from}_${to}`;
            pdfTitle = `Zenowethu — Pending Invoices (${from} to ${to})`;

        // ── Cases by Status ────────────────────────────────────────────────────
        } else if (type === 'status') {
            const statusCounts = await prisma.case.groupBy({
                by: ['status'],
                _count: { status: true },
                where: dateFilter
            });

            headers = ['Status', 'Count'];
            rows = statusCounts.map(s => [s.status, String(s._count.status)]);
            filename = `cases_by_status_${from}_${to}`;
            pdfTitle = `Zenowethu — Cases by Status (${from} to ${to})`;

        // ── Cases by Project ───────────────────────────────────────────────────
        } else if (type === 'project') {
            const caseProjects = await prisma.caseProject.findMany({
                where: { isPrimary: true, case: dateFilter },
                include: { project: { select: { name: true } } }
            });

            const counts: Record<string, number> = {};
            caseProjects.forEach(cp => {
                counts[cp.project.name] = (counts[cp.project.name] || 0) + 1;
            });

            headers = ['Project', 'Count'];
            rows = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, count]) => [name, String(count)]);
            filename = `cases_by_project_${from}_${to}`;
            pdfTitle = `Zenowethu — Cases by Project (${from} to ${to})`;
        }

        // ── Format response ────────────────────────────────────────────────────
        if (format === 'excel') return excelResponse(headers, rows, filename);
        if (format === 'pdf') return pdfResponse(pdfTitle, headers, rows, filename);
        return csvResponse(headers, rows, filename);

    } catch (error) {
        logger.error('Error exporting report:', error);
        return NextResponse.json({ error: 'Failed to export report' }, { status: 500 });
    }
}
