import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { generateForm16, type Form16Data } from '@/lib/form16-pdf';

const logger = createLogger('api/cases/[id]/form16');

// GET /api/cases/[id]/form16 — generate and stream a pre-filled Form 16 PDF
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        const caseRecord = await prisma.case.findUnique({
            where: { id },
            include: {
                client: true,
                creditAccounts: {
                    where: { isIncluded: true },
                    orderBy: { creditorName: 'asc' }
                }
            }
        });

        if (!caseRecord) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        // Load DC details from SystemSettings (fall back to env)
        const dcSettings = await prisma.systemSettings.findMany({
            where: { category: 'dc_profile' },
            select: { key: true, value: true }
        });
        const dcMap: Record<string, string> = {};
        for (const s of dcSettings) dcMap[s.key] = s.value;

        const data: Form16Data = {
            fileNumber:             caseRecord.fileNumber,
            applicationDate:        new Date(),
            // Client
            firstName:              caseRecord.client.firstName,
            lastName:               caseRecord.client.lastName,
            idNumber:               caseRecord.client.idNumber,
            email:                  caseRecord.client.email,
            phone:                  caseRecord.client.phone,
            address:                caseRecord.client.address,
            // Employment
            employer:               caseRecord.client.employer,
            employeeNo:             caseRecord.client.employeeNo,
            grossSalary:            caseRecord.client.grossSalary ? Number(caseRecord.client.grossSalary) : null,
            netSalary:              caseRecord.client.netSalary   ? Number(caseRecord.client.netSalary)   : null,
            salaryPayDate:          caseRecord.client.salaryPayDate,
            // Debt summary
            totalDebtAmount:        caseRecord.totalDebtAmount        ? Number(caseRecord.totalDebtAmount)        : null,
            totalMonthlyInstalment: caseRecord.totalMonthlyInstallment ? Number(caseRecord.totalMonthlyInstallment) : null,
            // Credit accounts
            creditAccounts: caseRecord.creditAccounts.map(a => ({
                creditorName:       a.creditorName,
                accountNumber:      a.accountNumber,
                accountType:        a.accountType,
                outstandingBalance: Number(a.outstandingBalance),
                monthlyInstalment:  a.monthlyInstalment ? Number(a.monthlyInstalment) : null,
                interestRate:       a.interestRate      ? Number(a.interestRate)      : null,
                isPrescribed:       a.isPrescribed,
                isIncluded:         a.isIncluded,
            })),
            // DC details — from SystemSettings or env fallback
            dcNcrdcNo:  dcMap['dc_ncrdc_no']  || process.env.DHS_USERNAME || 'NCRDC____',
            dcName:     dcMap['dc_name']       || 'Zenowethu Debt Counsellor',
            dcAddress:  dcMap['dc_address']    || '—',
            dcPhone:    dcMap['dc_phone']      || '—',
            dcEmail:    dcMap['dc_email']      || '—',
        };

        const pdfBytes = await generateForm16(data);

        const fileName = `Form16_${caseRecord.fileNumber}_${new Date().toISOString().slice(0, 10)}.pdf`;

        return new NextResponse(Buffer.from(pdfBytes), {
            status: 200,
            headers: {
                'Content-Type':        'application/pdf',
                'Content-Disposition': `attachment; filename="${fileName}"`,
                'Content-Length':      pdfBytes.length.toString(),
            }
        });
    } catch (error) {
        logger.error('Form 16 generation failed:', error);
        return NextResponse.json({ error: 'Failed to generate Form 16' }, { status: 500 });
    }
}
