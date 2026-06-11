import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger } from '@zenowethu/shared-lib';
import { generateMandatePdf } from '../../../../../../../lib/mandate-pdf';
import { calcTotalFromInstalments } from '../../../../../../../lib/mandate-calc';

function formatRand(n: number | null): string {
    if (n == null) return '';
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(n);
}

function formatDate(d: Date | null): string {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-ZA', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
}

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    const session = await auth();
    if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });

    try {
        const caseRecord = await prisma.case.findUnique({
            where: { id },
            select: {
                fileNumber: true,
                client: {
                    select: {
                        firstName: true, lastName: true, idNumber: true, phone: true, address: true,
                        bankName: true, accountHolderName: true, accountNumber: true, accountType: true, branchCode: true,
                    },
                },
            },
        });
        if (!caseRecord) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

        const mandate = await prisma.debitOrderMandate.findFirst({
            where: { caseId: id },
            orderBy: { createdAt: 'desc' },
        });

        const c = caseRecord.client;
        const monthly = mandate?.amount != null ? Number(mandate.amount) : null;
        const num = mandate?.numInstalments ?? null;
        const total = calcTotalFromInstalments(num, monthly);

        const pdfBytes = await generateMandatePdf({
            invoiceNumber: caseRecord.fileNumber,
            client: {
                firstName: c.firstName ?? undefined,
                lastName: c.lastName ?? undefined,
                idNumber: c.idNumber ?? undefined,
                phone: c.phone ?? undefined,
                address: c.address ?? undefined,
            },
            bankDetails: {
                bankName: mandate?.bankName ?? c.bankName ?? '',
                accountHolder: mandate?.accountHolderName ?? c.accountHolderName ?? `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim(),
                accountNumber: mandate?.accountNumber ?? c.accountNumber ?? '',
                branchCode: mandate?.branchCode ?? c.branchCode ?? '',
                accountType: mandate?.accountType ?? c.accountType ?? '',
            },
            paymentDetails: {
                contractAmount: formatRand(total),
                instalmentAmount: formatRand(monthly),
                numInstalments: num != null ? String(num) : '',
                frequency: mandate?.frequency ?? 'MONTHLY',
                firstDate: formatDate(mandate?.firstCollectionDate ?? null),
                lastDate: formatDate(mandate?.lastCollectionDate ?? null),
            },
            salesPerson: `${session.user.firstName ?? ''} ${session.user.lastName ?? ''}`.trim() || undefined,
            issuedAt: new Date(),
        });

        return new Response(Buffer.from(pdfBytes), {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `inline; filename="Mandate-${caseRecord.fileNumber}.pdf"`,
                'Content-Length': String(pdfBytes.byteLength),
            },
        });
    } catch (err) {
        logger.error('[GET /api/finance/cases/[id]/mandate/pdf]', err);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
