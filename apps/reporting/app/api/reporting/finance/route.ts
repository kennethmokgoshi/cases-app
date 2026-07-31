import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth } from '@/lib/auth';
import { canAccessDashboard } from '@/lib/role-check';
import { UserRole } from '@/lib/roles';
import { getOverpaymentSummary } from '@zenowethu/shared-lib/src/finance/overpayments';
import { verifyStaffApiAccess } from '@/lib/api-guard';

export async function GET(request: Request) {
  try {
    const session = await auth();
    const authError = verifyStaffApiAccess(session);
    if (authError) return authError;

    const userRole = ((session!.user as any)?.reportingRole || 'staff') as UserRole;
    if (userRole === 'staff' || userRole === 'unauthorized') {
      return NextResponse.json({ error: 'Forbidden: Insufficient permissions for Finance Reporting' }, { status: 403 });
    }

    const isAdminOrFinance =
      session!.user.isAdmin === true ||
      session!.user.role === 'ADMIN' ||
      userRole === 'admin' ||
      userRole === 'finance';

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    // Run parallel database queries for optimal performance
    const [
      thisMonthAgg,
      lastMonthAgg,
      pendingBatchesCount,
      unallocatedCount,
      unallocatedSum,
      recentBatches,
      quotesCount,
      acceptedQuotesCount,
      invoicesAgg,
      casesCount,
      creditAccountsCount,
      overpayments,
    ] = await Promise.all([
      // 1. Collections this month
      prisma.payment.aggregate({
        where: { date: { gte: startOfMonth }, status: 'COMPLETED' },
        _sum: { amount: true },
      }).catch(() => ({ _sum: { amount: null } })),

      // 2. Collections last month
      prisma.payment.aggregate({
        where: { date: { gte: startOfLastMonth, lte: endOfLastMonth }, status: 'COMPLETED' },
        _sum: { amount: true },
      }).catch(() => ({ _sum: { amount: null } })),

      // 3. Pending batches
      prisma.paymentBatch.count({
        where: { status: { in: ['PROCESSING', 'MATCHED'] } },
      }).catch(() => 0),

      // 4. Unallocated payments count
      prisma.payment.count({
        where: { clientId: null, caseId: null },
      }).catch(() => 0),

      // 5. Unallocated payments total ZAR amount
      prisma.payment.aggregate({
        where: { clientId: null, caseId: null },
        _sum: { amount: true },
      }).catch(() => ({ _sum: { amount: null } })),

      // 6. Recent payment batches
      prisma.paymentBatch.findMany({
        take: 6,
        orderBy: { uploadedAt: 'desc' },
        include: {
          uploadedBy: {
            select: { firstName: true, lastName: true },
          },
        },
      }).catch(() => []),

      // 7. Quotes total count
      prisma.invoice.count({
        where: { type: 'QUOTE' },
      }).catch(() => 0),

      // 8. Accepted quotes count
      prisma.invoice.count({
        where: { type: 'QUOTE', status: { in: ['ACCEPTED', 'CONVERTED'] } },
      }).catch(() => 0),

      // 9. Invoices total & paid sums
      prisma.invoice.aggregate({
        where: { type: 'INVOICE' },
        _sum: { total: true },
        _count: { id: true },
      }).catch(() => ({ _sum: { total: null }, _count: { id: 0 } })),

      // 10. Active Cases count
      prisma.case.count().catch(() => 0),

      // 11. Credit Accounts count
      prisma.consumerAccount.count().catch(() => 0),

      // 12. Client Overpayments summary (for admin/finance roles)
      isAdminOrFinance
        ? getOverpaymentSummary({ limit: 10 }).catch(() => null)
        : Promise.resolve(null),
    ]);

    const thisMonthTotal = Number(thisMonthAgg._sum.amount ?? 0);
    const lastMonthTotal = Number(lastMonthAgg._sum.amount ?? 0);

    const percentChange =
      lastMonthTotal === 0
        ? thisMonthTotal > 0
          ? 100
          : 0
        : Math.round(((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100);

    const totalInvoicedAmount = Number(invoicesAgg._sum.total ?? 0);
    const totalCollectedInvoices = 0;
    const totalOutstandingFees = Math.max(0, totalInvoicedAmount - totalCollectedInvoices);
    const unallocatedTotalAmount = Number(unallocatedSum._sum.amount ?? 0);

    return NextResponse.json({
      metrics: {
        totalCollected: thisMonthTotal,
        lastMonthCollected: lastMonthTotal,
        percentChange,
        pendingBatches: pendingBatchesCount,
        unallocatedCount,
        unallocatedTotalAmount,
        totalInvoicedAmount,
        totalCollectedInvoices,
        totalOutstandingFees,
        quotesCount,
        acceptedQuotesCount,
        invoicesCount: invoicesAgg._count.id,
      },
      recentBatches: recentBatches.map((batch: any) => ({
        id: batch.id,
        fileName: batch.fileName,
        uploadedAt: batch.uploadedAt,
        totalAmount: Number(batch.totalAmount),
        matchCount: batch.matchCount ?? 0,
        unmatchCount: batch.unmatchCount ?? 0,
        status: batch.status,
        uploadedBy: batch.uploadedBy
          ? `${batch.uploadedBy.firstName || ''} ${batch.uploadedBy.lastName || ''}`.trim()
          : 'System',
      })),
      overpayments,
      operations: {
        activeCases: casesCount,
        creditAccounts: creditAccountsCount,
      },
      userPermissions: {
        canViewOverpayments: isAdminOrFinance,
        role: userRole,
      },
    });
  } catch (error: any) {
    console.error('[API] Finance reporting fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch financial reporting metrics', details: error.message },
      { status: 500 }
    );
  }
}
