import { NextResponse } from 'next/server';
import { auth, logger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { generateAuditReportPdf, type AuditReportData } from '@/lib/audit-report-pdf';
import type { AccountFinding, FullAuditResult } from '@/lib/forensic-engine';

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ caseId: string }> }
) {
    try {
        const { caseId } = await params;
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
        }

        // Load audit + case + client
        const audit = await prisma.forensicAudit.findFirst({
            where: { caseId },
            orderBy: { updatedAt: 'desc' },
            include: {
                Case: {
                    include: {
                        client: true } },
                User: { select: { firstName: true, lastName: true, email: true } } } });

        if (!audit) {
            return NextResponse.json(
                { error: 'No audit found for this case. Run the audit first.' },
                { status: 404 }
            );
        }

        const caseRecord = audit.Case;
        const client = caseRecord.client;
        const accountFindings: AccountFinding[] = audit.findings ? JSON.parse(audit.findings) : [];

        // Calculate totals from findings
        const totalRiskScore = Math.min(
            100,
            accountFindings.reduce((sum, af) => sum + (af.accountRiskScore ?? 0), 0)
        );

        const riskLevel: FullAuditResult['riskLevel'] =
            totalRiskScore >= 81 ? 'CRITICAL' :
            totalRiskScore >= 61 ? 'HIGH' :
            totalRiskScore >= 31 ? 'MEDIUM' : 'LOW';

        const section80Eligible = accountFindings.some(
            af => af.checks?.recklessLending?.flagged && (af.checks.recklessLending.riskScore ?? 0) >= 35
        );

        // Rebuild summary findings from accountFindings
        const summaryFindings: AuditReportData['summaryFindings'] = [];
        for (const af of accountFindings) {
            if (af.checks?.prescription?.flagged) {
                summaryFindings.push({ type: 'PRESCRIPTION', severity: 'CRITICAL', message: `${af.creditorName} — ${af.checks.prescription.reason}` });
            }
            if (af.checks?.recklessLending?.flagged) {
                summaryFindings.push({ type: 'RECKLESS_LENDING', severity: (af.checks.recklessLending.riskScore ?? 0) >= 35 ? 'HIGH' : 'MEDIUM', message: `${af.creditorName} — ${af.checks.recklessLending.reason}` });
            }
            if (af.checks?.interestRate?.flagged) {
                summaryFindings.push({ type: 'INTEREST_RATE', severity: 'HIGH', message: `${af.creditorName} — ${af.checks.interestRate.reason}` });
            }
            if (af.checks?.insurancePremium?.flagged) {
                summaryFindings.push({ type: 'INSURANCE_PREMIUM', severity: 'MEDIUM', message: `${af.creditorName} — ${af.checks.insurancePremium.reason}` });
            }
        }

        const auditorName = audit.User
            ? `${audit.User.firstName ?? ''} ${audit.User.lastName ?? ''}`.trim() || (audit.User.email ?? 'Unknown')
            : 'Unknown';

        const reportData: AuditReportData = {
            fileNumber: caseRecord.fileNumber,
            clientName: `${client.firstName} ${client.lastName}`,
            idNumber: client.idNumber ?? '',
            auditDate: audit.updatedAt,
            auditorName,
            riskLevel,
            totalRiskScore,
            totalAccounts: accountFindings.length,
            summaryFindings,
            accountFindings,
            recommendedAction: audit.recommendations ?? 'No recommendations recorded.',
            section80Eligible };

        const pdfBytes = await generateAuditReportPdf(reportData);

        return new Response(Buffer.from(pdfBytes), {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="audit-report-${caseRecord.fileNumber}.pdf"`,
                'Cache-Control': 'no-store' } });
    } catch (error) {
        logger.error('Error generating audit report PDF:', error);
        return NextResponse.json({ error: 'Failed to generate audit report' }, { status: 500 });
    }
}
