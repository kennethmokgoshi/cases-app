import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger, WORKFLOW_STATUSES } from '@zenowethu/shared-lib';
import * as XLSX from 'xlsx';
import { sendEmailWithAttachments } from '@/lib/email-with-attachments';
import { getWeekStart } from '../route';

export async function POST() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id;
        const userEmail = session.user.email;
        const userName = `${session.user.firstName || ''} ${session.user.lastName || ''}`.trim() || 'Partner';

        if (!userEmail) {
            return NextResponse.json({ error: 'No email address on your account' }, { status: 400 });
        }

        const userType = session.user.userType;
        const isAdmin = session.user.isAdmin === true || session.user.role?.toUpperCase() === 'ADMIN';
        const isStaff = userType === 'STAFF';
        const isRestricted = !isAdmin && !isStaff;

        let projectWhere: Record<string, unknown> = {};

        if (isRestricted) {
            const memberships = await prisma.projectMember.findMany({
                where: { userId },
                select: { projectId: true },
            });
            const rootProjectIds = memberships.map((m) => m.projectId);

            if (session.user.b2bPartnerId && !rootProjectIds.includes(session.user.b2bPartnerId)) {
                rootProjectIds.push(session.user.b2bPartnerId);
            }

            if (rootProjectIds.length === 0) {
                projectWhere = { createdById: userId };
            } else {
                const allProjects = await prisma.project.findMany({
                    select: { id: true, parentId: true },
                });
                const childrenMap = new Map<string, string[]>();
                for (const p of allProjects) {
                    if (p.parentId) {
                        const list = childrenMap.get(p.parentId) || [];
                        list.push(p.id);
                        childrenMap.set(p.parentId, list);
                    }
                }
                const effectiveIds = new Set<string>(rootProjectIds);
                const queue = [...rootProjectIds];
                while (queue.length > 0) {
                    const curr = queue.shift()!;
                    for (const child of childrenMap.get(curr) || []) {
                        if (!effectiveIds.has(child)) {
                            effectiveIds.add(child);
                            queue.push(child);
                        }
                    }
                }
                projectWhere = { projects: { some: { projectId: { in: Array.from(effectiveIds) } } } };
            }
        }

        const completedCodes = WORKFLOW_STATUSES
            .filter(s => s.category === 'COMPLETED' || s.category === 'SETTLED')
            .map(s => s.code);

        const weekStart = getWeekStart();

        const cases = await prisma.case.findMany({
            where: {
                ...projectWhere,
                status: { in: completedCodes },
                updatedAt: { gte: weekStart },
            },
            select: {
                fileNumber: true,
                status: true,
                updatedAt: true,
                client: {
                    select: {
                        firstName: true,
                        lastName: true,
                        idNumber: true,
                        phone: true,
                        email: true,
                    },
                },
                projects: {
                    select: { project: { select: { name: true, fullPath: true } } },
                    take: 1,
                },
            },
            orderBy: { updatedAt: 'desc' },
        });

        const weekStartLabel = weekStart.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });
        const todayLabel = new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });

        // Build Excel
        const sheetData = cases.map((c) => ({
            'File Number': c.fileNumber,
            'Client Name': `${c.client.firstName} ${c.client.lastName}`,
            'ID Number': c.client.idNumber || '',
            'Phone': c.client.phone || '',
            'Email': c.client.email || '',
            'Status': c.status.replace(/_/g, ' '),
            'Completed Date': c.updatedAt.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }),
            'Project / Group': c.projects[0]?.project.fullPath || c.projects[0]?.project.name || '',
        }));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(sheetData);
        ws['!cols'] = [
            { wch: 14 }, { wch: 28 }, { wch: 16 }, { wch: 16 },
            { wch: 30 }, { wch: 22 }, { wch: 18 }, { wch: 30 },
        ];
        XLSX.utils.book_append_sheet(wb, ws, 'Completed This Week');
        const xlsBuffer: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        const tableRows = cases.map((c) => `
            <tr>
                <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${c.fileNumber}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${c.client.firstName} ${c.client.lastName}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${c.client.idNumber || '-'}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${c.status.replace(/_/g, ' ')}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${c.updatedAt.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
            </tr>`).join('');

        const html = `
        <div style="font-family:Inter,Arial,sans-serif;max-width:700px;margin:0 auto;background:#fff;">
            <div style="background:#0B1D35;padding:28px 32px;">
                <h1 style="color:#fff;margin:0;font-size:22px;">Zenowethu Debt Counselling</h1>
                <p style="color:#C4953A;margin:4px 0 0;font-size:14px;">Completed Cases — Week Report</p>
            </div>
            <div style="padding:28px 32px;">
                <p style="color:#374151;margin:0 0 8px;">Hi ${userName},</p>
                <p style="color:#374151;margin:0 0 24px;">
                    Please find below the <strong>${cases.length} case${cases.length !== 1 ? 's' : ''}</strong> completed
                    this week (${weekStartLabel} – ${todayLabel}). The full list is attached as an Excel file.
                </p>
                <table style="width:100%;border-collapse:collapse;font-size:13px;">
                    <thead>
                        <tr style="background:#0B1D35;">
                            <th style="padding:10px 12px;color:#C4953A;text-align:left;font-weight:600;">File No.</th>
                            <th style="padding:10px 12px;color:#C4953A;text-align:left;font-weight:600;">Client</th>
                            <th style="padding:10px 12px;color:#C4953A;text-align:left;font-weight:600;">ID Number</th>
                            <th style="padding:10px 12px;color:#C4953A;text-align:left;font-weight:600;">Status</th>
                            <th style="padding:10px 12px;color:#C4953A;text-align:left;font-weight:600;">Completed</th>
                        </tr>
                    </thead>
                    <tbody>${tableRows || '<tr><td colspan="5" style="padding:16px 12px;color:#6b7280;">No completed cases this week.</td></tr>'}</tbody>
                </table>
            </div>
            <div style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;">
                <p style="color:#6b7280;font-size:12px;margin:0;">
                    Aaron Nzotho | NCRDC3693 | Suite 2, Second Floor, Central House, 17 Central Road, Mabopane, 0190<br>
                    Tel: +27 12 035 1824 | Cell: 082 363 8207 | info@zenowethu.co.za | www.zenowethu.co.za | Member of DCASA
                </p>
            </div>
        </div>`;

        const filename = `completed-this-week-${todayLabel.replace(/ /g, '-')}.xlsx`;
        const result = await sendEmailWithAttachments({
            to: userEmail,
            subject: `Completed Cases This Week — ${todayLabel}`,
            html,
            fromName: 'Zenowethu Debt Counselling',
            attachments: [{ filename, content: xlsBuffer, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }],
        });

        if (!result.success) {
            logger.error('[b2b-dashboard/completed-this-week/email] Send failed:', result.error);
            return NextResponse.json({ error: result.error || 'Failed to send email' }, { status: 500 });
        }

        return NextResponse.json({ success: true, sentTo: userEmail, count: cases.length });
    } catch (error) {
        logger.error('[b2b-dashboard/completed-this-week/email] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
