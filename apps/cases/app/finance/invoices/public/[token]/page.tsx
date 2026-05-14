import React from 'react';
import { notFound } from 'next/navigation';
import { prisma } from '@zenowethu/database';
import { format } from 'date-fns';

interface PublicInvoicePageProps {
    params: Promise<{ token: string }>;
}

export default async function PublicInvoicePage({ params }: PublicInvoicePageProps) {
    const { token } = await params;

    const invoice = await prisma.invoice.findUnique({
        where: { publicToken: token },
        include: {
            client: true,
            bankAccount: true,
            project: true,
        },
    });

    if (!invoice) {
        notFound();
    }

    const subtotal = Number(invoice.subtotal);
    const vatAmount = Number(invoice.vatAmount);
    const total = Number(invoice.total);
    const lineItems = invoice.lineItems as any[];

    return (
        <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8 font-sans text-slate-900">
            <div className="max-w-3xl mx-auto bg-white shadow-2xl rounded-2xl overflow-hidden border border-slate-100">
                {/* Header / Branding */}
                <div className="bg-slate-900 text-white p-8 sm:p-12 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                    <div>
                        <h1 className="text-3xl font-extrabold tracking-tight text-amber-400">
                            {invoice.project?.name || 'Zenowethu Debt Management'}
                        </h1>
                        <p className="mt-2 text-slate-400 font-medium">
                            {invoice.project?.companySlogan || 'Professional Debt Solutions'}
                        </p>
                    </div>
                    <div className="text-right">
                        <div className="inline-flex items-center px-4 py-1 rounded-full bg-amber-400/10 border border-amber-400/20 text-amber-400 text-sm font-bold uppercase tracking-wider mb-2">
                            {invoice.type}
                        </div>
                        <p className="text-xl font-mono">{invoice.invoiceNumber}</p>
                    </div>
                </div>

                {/* Status Bar */}
                <div className={`px-8 py-4 flex justify-between items-center ${
                    invoice.status === 'PAID' ? 'bg-emerald-50 text-emerald-700' : 
                    invoice.status === 'OVERDUE' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'
                }`}>
                    <span className="text-sm font-bold uppercase tracking-wide">Status: {invoice.status}</span>
                    <span className="text-sm font-medium">Issued: {format(invoice.issuedAt, 'dd MMM yyyy')}</span>
                </div>

                <div className="p-8 sm:p-12 space-y-12">
                    {/* Billing Info */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-12">
                        <div>
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Bill To</h3>
                            <div className="space-y-1">
                                <p className="text-lg font-bold">{invoice.client?.firstName} {invoice.client?.lastName}</p>
                                <p className="text-slate-500">{invoice.client?.email}</p>
                                <p className="text-slate-500">{invoice.client?.phone}</p>
                                {invoice.client?.address && <p className="text-slate-500 max-w-xs">{invoice.client.address}</p>}
                            </div>
                        </div>
                        <div className="sm:text-right">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Payment Details</h3>
                            <div className="space-y-1">
                                <p className="text-slate-900 font-bold">Due Date: <span className="text-rose-600">{format(invoice.dueAt, 'dd MMM yyyy')}</span></p>
                                {invoice.reference && <p className="text-slate-500">Reference: <span className="font-mono text-slate-900">{invoice.reference}</span></p>}
                                {!invoice.reference && <p className="text-slate-500">Reference: <span className="font-mono text-slate-900">{invoice.invoiceNumber}</span></p>}
                            </div>
                        </div>
                    </div>

                    {/* Line Items Table */}
                    <div className="overflow-x-auto -mx-8 sm:mx-0">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-100">
                                    <th className="pb-4 px-8 sm:px-0 font-bold text-slate-400 uppercase text-xs tracking-widest">Description</th>
                                    <th className="pb-4 px-4 font-bold text-slate-400 uppercase text-xs tracking-widest text-center">Qty</th>
                                    <th className="pb-4 px-4 font-bold text-slate-400 uppercase text-xs tracking-widest text-right">Unit Price</th>
                                    <th className="pb-4 px-8 sm:px-0 font-bold text-slate-400 uppercase text-xs tracking-widest text-right">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {lineItems.map((item, idx) => (
                                    <tr key={idx} className="group">
                                        <td className="py-6 px-8 sm:px-0">
                                            <p className="font-bold text-slate-900">{item.description}</p>
                                            {item.creditor && <p className="text-xs text-slate-400 mt-1">{item.creditor}</p>}
                                        </td>
                                        <td className="py-6 px-4 text-center font-medium text-slate-600">{item.quantity}</td>
                                        <td className="py-6 px-4 text-right font-medium text-slate-600">R {Number(item.unitPrice).toFixed(2)}</td>
                                        <td className="py-6 px-8 sm:px-0 text-right font-bold text-slate-900">R {(item.quantity * item.unitPrice).toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Totals */}
                    <div className="flex flex-col items-end pt-8 border-t border-slate-100 space-y-4">
                        <div className="flex justify-between w-full max-w-[240px] text-slate-500">
                            <span>Subtotal</span>
                            <span className="font-medium">R {subtotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between w-full max-w-[240px] text-slate-500">
                            <span>VAT (15%)</span>
                            <span className="font-medium">R {vatAmount.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between w-full max-w-[240px] pt-4 border-t border-slate-100 text-2xl font-black text-slate-900">
                            <span>Total</span>
                            <span className="text-amber-500">R {total.toFixed(2)}</span>
                        </div>
                    </div>

                    {/* Bank Details */}
                    {invoice.bankAccount && (
                        <div className="bg-slate-50 rounded-xl p-8 border border-slate-100">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6">How to Pay</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <p className="text-sm text-slate-500 leading-relaxed">
                                        Please use the reference below and send proof of payment to <span className="font-bold text-slate-900">finance@zenowethu.co.za</span>
                                    </p>
                                    <div className="inline-block px-4 py-2 bg-white rounded-lg border border-slate-200 shadow-sm">
                                        <p className="text-xs text-slate-400 uppercase font-bold tracking-tighter mb-1">Payment Reference</p>
                                        <p className="text-lg font-mono font-bold text-amber-600">{invoice.reference || invoice.invoiceNumber}</p>
                                    </div>
                                </div>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between border-b border-slate-200 pb-2">
                                        <span className="text-slate-400">Bank</span>
                                        <span className="font-bold text-slate-700">{invoice.bankAccount.bankName}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-slate-200 pb-2">
                                        <span className="text-slate-400">Account Holder</span>
                                        <span className="font-bold text-slate-700">{invoice.bankAccount.accountName}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-slate-200 pb-2">
                                        <span className="text-slate-400">Account Number</span>
                                        <span className="font-bold text-slate-700 font-mono">{invoice.bankAccount.accountNumber}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-slate-200 pb-2">
                                        <span className="text-slate-400">Branch Code</span>
                                        <span className="font-bold text-slate-700">{invoice.bankAccount.branchCode}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Footer */}
                    <div className="pt-12 text-center border-t border-slate-50">
                        <p className="text-slate-400 text-sm italic">
                            Thank you for your business. For any queries, please contact our support team.
                        </p>
                        <div className="mt-8 flex justify-center space-x-6">
                            <span className="text-slate-300">●</span>
                            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Professionalism</span>
                            <span className="text-slate-300">●</span>
                            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Integrity</span>
                            <span className="text-slate-300">●</span>
                            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Results</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div className="max-w-3xl mx-auto mt-8 flex justify-center">
                <button 
                    onClick={() => window.print()} 
                    className="flex items-center space-x-2 px-6 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors text-sm font-bold"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 00-2 2h2m2 4h10a2 2 0 002-2v-4a2 2 0 012-2H5a2 2 0 012 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                    <span>Print Invoice</span>
                </button>
            </div>
        </div>
    );
}
