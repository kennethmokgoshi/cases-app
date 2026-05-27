
import { prisma } from '@zenowethu/database';

export const dynamic = 'force-dynamic';
import { notFound } from 'next/navigation';
import { BatchPaymentTable } from '@zenowethu/ui';
import { BatchHeaderActions } from '@zenowethu/ui';
import Link from 'next/link';

export const metadata = {
    title: 'Batch Details | Zenowethu' };

export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = await params;

    const batch = await prisma.paymentBatch.findUnique({
        where: { id: resolvedParams.id },
        include: {
            payments: {
                include: {
                    client: {
                        select: { id: true, firstName: true, lastName: true, idNumber: true }
                    }
                },
                orderBy: { date: 'desc' }
            },
            uploadedBy: {
                select: { firstName: true, lastName: true, email: true }
            }
        }
    });

    if (!batch) {
        notFound();
    }

    const userName = batch.uploadedBy ? `${batch.uploadedBy.firstName} ${batch.uploadedBy.lastName}` : 'Unknown User';

    const serializedPayments = batch.payments.map(p => ({
        ...p,
        amount: p.amount.toNumber(),
        date: p.date.toISOString(),
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString() }));

    const hasPending = batch.payments.some(p => p.status === 'PENDING');

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-8">
            {/* Header */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 pb-6 border-b border-white/5">
                <div className="flex items-center gap-4">
                    <Link href="/accounts" className="p-3 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all border border-white/5 hover:border-white/10">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-white mb-1">Payment Batch Details</h1>
                        <div className="flex items-center gap-3 text-sm text-gray-400">
                            <div className="flex items-center gap-1.5">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                <span>{batch.fileName}</span>
                            </div>
                            <span className="text-gray-600">•</span>
                            <div className="flex items-center gap-1.5">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                <span>{userName}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row gap-4 w-full lg:w-auto items-end md:items-center">
                    <div className="flex gap-4 w-full lg:w-auto">
                        <div className="flex-1 lg:flex-none px-5 py-3 bg-white/5 rounded-xl border border-white/10 text-center">
                            <div className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-1">Total Amount</div>
                            <div className="text-xl font-bold text-white tracking-tight">R {batch.totalAmount.toNumber().toFixed(2)}</div>
                        </div>
                        <div className="flex-1 lg:flex-none px-5 py-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-center">
                            <div className="text-[10px] text-emerald-400 uppercase tracking-widest font-semibold mb-1">Matched</div>
                            <div className="text-xl font-bold text-emerald-400 tracking-tight">{batch.matchCount}</div>
                        </div>
                        <div className="flex-1 lg:flex-none px-5 py-3 bg-red-500/10 rounded-xl border border-red-500/20 text-center">
                            <div className="text-[10px] text-red-400 uppercase tracking-widest font-semibold mb-1">Unmatched</div>
                            <div className="text-xl font-bold text-red-400 tracking-tight">{batch.unmatchCount}</div>
                        </div>
                    </div>

                    <div className="h-10 w-px bg-white/10 hidden md:block"></div>

                    <BatchHeaderActions batchId={batch.id} hasPending={hasPending} />
                </div>
            </div>

            {/* Content */}
            <div>
                <BatchPaymentTable payments={serializedPayments} />
            </div>
        </div>
    );
}
