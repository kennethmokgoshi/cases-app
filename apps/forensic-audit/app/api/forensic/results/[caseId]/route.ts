import { NextResponse } from 'next/server';
import { auth, logger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';

export async function GET(
    _request: Request,
    { params }: { params: { caseId: string } }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
        }

        const audit = await prisma.forensicAudit.findFirst({
            where: { caseId: params.caseId },
            orderBy: { updatedAt: 'desc' },
            include: {
                RecklessLendingAssessment: true,
                User: { select: { firstName: true, lastName: true, email: true } } } });

        if (!audit) {
            return NextResponse.json(null);
        }

        const accountFindings = audit.findings ? JSON.parse(audit.findings) : [];

        return NextResponse.json({
            auditId: audit.id,
            status: audit.status,
            auditor: audit.User
                ? `${audit.User.firstName ?? ''} ${audit.User.lastName ?? ''}`.trim() || audit.User.email
                : null,
            recommendations: audit.recommendations,
            accountFindings,
            recklessLendingAssessment: audit.RecklessLendingAssessment,
            updatedAt: audit.updatedAt });
    } catch (error) {
        logger.error('Error fetching forensic audit results:', error);
        return NextResponse.json({ error: 'Failed to fetch audit results' }, { status: 500 });
    }
}
