import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger } from '@zenowethu/shared-lib';

const logger = createLogger('api/cases/[id]/dccp-referral');

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        // 1. Get Case and Client details
        const caseDetail = await prisma.case.findUnique({
            where: { id },
            include: { 
                client: true,
                documents: {
                    where: { type: 'CREDIT_REPORT' },
                    orderBy: { uploadedAt: 'desc' },
                    take: 1
                }
            }
        });

        if (!caseDetail) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        const report = caseDetail.documents[0];
        if (!report || !report.extractedData) {
            return NextResponse.json({ error: 'No credit report analysis found for referral' }, { status: 400 });
        }

        const extractedData = JSON.parse(report.extractedData);
        const audit = extractedData.savingsAudit;

        if (!audit || audit.monthlySavings <= 0) {
            return NextResponse.json({ error: 'No savings identified for this client' }, { status: 400 });
        }

        // 2. Submit Referral (Logic for sending email to DCCP would go here)
        // For now, we log it and create a workflow entry
        
        await prisma.workflowLog.create({
            data: {
                caseId: id,
                fromStatus: caseDetail.status,
                toStatus: caseDetail.status,
                notes: `[DCCP_REFERRAL] Insurance Savings Referral Submitted. Potential Monthly Savings: R${audit.monthlySavings.toFixed(2)}. Total Future Savings: R${audit.totalFutureSavings.toFixed(2)}.`,
                userId: session.user.id
            }
        });

        // 3. Mark the referral as sent (we can use a metadata field or just the log)
        // In a more complex system, we might have a 'Referral' table

        logger.info(`DCCP Referral submitted for case ${caseDetail.fileNumber} by ${session.user.email}`);

        return NextResponse.json({ 
            success: true, 
            message: 'Referral submitted successfully',
            auditSummary: {
                monthlySavings: audit.monthlySavings,
                totalFutureSavings: audit.totalFutureSavings,
                commission: audit.referralCommission
            }
        });

    } catch (error) {
        logger.error('Error submitting DCCP referral:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
