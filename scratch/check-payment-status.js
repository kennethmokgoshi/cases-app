// Read-only snapshot of payment data state for the Finance over-collection audit
const { PrismaClient } = require('../packages/database/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // 1. Payments grouped by status
    const byStatus = await prisma.payment.groupBy({
        by: ['status'],
        _count: { _all: true },
        _sum: { amount: true },
    });
    console.log('=== Payments by status ===');
    console.table(byStatus.map(r => ({
        status: r.status,
        count: r._count._all,
        total: r._sum.amount?.toString(),
    })));

    // 2. Payments grouped by category
    const byCategory = await prisma.payment.groupBy({
        by: ['category'],
        _count: { _all: true },
        _sum: { amount: true },
    });
    console.log('=== Payments by category ===');
    console.table(byCategory.map(r => ({
        category: r.category,
        count: r._count._all,
        total: r._sum.amount?.toString(),
    })));

    // 3. Batches
    const batches = await prisma.paymentBatch.findMany({
        orderBy: { uploadedAt: 'desc' },
        take: 10,
        select: { fileName: true, uploadedAt: true, status: true, totalAmount: true, matchCount: true, unmatchCount: true },
    });
    console.log('=== Recent payment batches (last 10) ===');
    console.table(batches.map(b => ({
        file: b.fileName,
        uploaded: b.uploadedAt.toISOString().slice(0, 10),
        status: b.status,
        total: b.totalAmount.toString(),
        matched: b.matchCount,
        unmatched: b.unmatchCount,
    })));

    // 4. Payments linked to cases, by case status category
    const paymentsWithCase = await prisma.payment.findMany({
        where: { caseId: { not: null } },
        select: { amount: true, date: true, case: { select: { status: true } } },
    });
    const byCaseStatus = {};
    for (const p of paymentsWithCase) {
        const s = p.case.status;
        byCaseStatus[s] = byCaseStatus[s] || { count: 0, total: 0 };
        byCaseStatus[s].count++;
        byCaseStatus[s].total += Number(p.amount);
    }
    console.log('=== Payments by linked case status ===');
    console.table(Object.entries(byCaseStatus).map(([status, v]) => ({
        caseStatus: status, count: v.count, total: v.total.toFixed(2),
    })));

    // 5. Over-collection candidates: cases where sum(payments) > serviceFee
    const cases = await prisma.case.findMany({
        where: { serviceFee: { not: null }, payments: { some: {} } },
        select: {
            fileNumber: true,
            status: true,
            serviceFee: true,
            instalments: true,
            payments: { select: { amount: true } },
        },
    });
    const over = cases
        .map(c => {
            const collected = c.payments.reduce((s, p) => s + Number(p.amount), 0);
            return { fileNumber: c.fileNumber, status: c.status, fee: Number(c.serviceFee), collected, over: collected - Number(c.serviceFee), nPayments: c.payments.length };
        })
        .filter(c => c.over > 0.01)
        .sort((a, b) => b.over - a.over);
    console.log(`=== Over-collected cases (collected > serviceFee): ${over.length} ===`);
    console.table(over.slice(0, 20));
    const totalOver = over.reduce((s, c) => s + c.over, 0);
    console.log(`Total over-collected across ${over.length} cases: R${totalOver.toFixed(2)}`);

    // 6. Overall totals
    const totalPayments = await prisma.payment.count();
    const totalCasesWithFee = await prisma.case.count({ where: { serviceFee: { not: null } } });
    console.log(`\nTotal payment records: ${totalPayments}`);
    console.log(`Cases with a serviceFee set: ${totalCasesWithFee}`);
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
