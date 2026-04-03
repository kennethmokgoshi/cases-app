'use client';

import { useState } from 'react';
import { SavingsAuditResult } from '@zenowethu/shared-lib';

interface SavingsAuditCardProps {
    data: SavingsAuditResult;
    onRefer: () => void;
    isReferring: boolean;
}

export function SavingsAuditCard({ data, onRefer, isReferring }: SavingsAuditCardProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    if (!data || data.monthlySavings <= 0) return null;

    return (
        <div className="bg-gradient-to-br from-teal-900/40 to-zeno-blue/30 border border-teal-500/30 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-sm">
            {/* Hero Section */}
            <div className="p-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2 text-teal-400 font-bold tracking-wider text-xs uppercase">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
                            </span>
                            Insurance Savings Audit Found Opportunities
                        </div>
                        <h2 className="text-3xl font-black text-white">
                            R {data.totalFutureSavings.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                        </h2>
                        <p className="text-zinc-400 text-sm font-medium">
                            Total Untapped Future Savings across {data.accounts.length} accounts
                        </p>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                        <div className="bg-red-500/10 border border-red-500/20 px-4 py-2 rounded-xl text-right">
                            <p className="text-[10px] text-red-300/70 font-bold uppercase tracking-tighter">Historical "What If" Loss</p>
                            <p className="text-lg font-bold text-red-400">
                                - R {data.historicalLoss.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                            </p>
                        </div>
                        <button 
                            onClick={onRefer}
                            disabled={isReferring}
                            className="bg-teal-500 hover:bg-teal-400 text-zeno-blue font-black px-6 py-3 rounded-xl transition-all active:scale-95 shadow-lg shadow-teal-500/20 disabled:opacity-50 text-sm uppercase"
                        >
                            {isReferring ? 'Processing Referral...' : 'Secure These Savings Now'}
                        </button>
                    </div>
                </div>

                {/* Sub-metrics */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
                    <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                        <p className="text-[10px] font-bold text-zinc-500 uppercase">Monthly Savings</p>
                        <p className="text-xl font-bold text-emerald-400">R {data.monthlySavings.toFixed(2)}</p>
                    </div>
                    <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                        <p className="text-[10px] font-bold text-zinc-500 uppercase">Your Commission (40%)</p>
                        <p className="text-xl font-bold text-teal-400">R {data.referralCommission.toFixed(2)}</p>
                    </div>
                    <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                        <p className="text-[10px] font-bold text-zinc-500 uppercase">DCCP Consolidated Rate</p>
                        <p className="text-xl font-bold text-white">Competitive</p>
                    </div>
                    <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                        <p className="text-[10px] font-bold text-zinc-500 uppercase">Audit Confidence</p>
                        <p className="text-xl font-bold text-white">High (AI-Driven)</p>
                    </div>
                </div>

                <div className="mt-6 flex justify-center">
                    <button 
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="text-xs font-bold text-zinc-500 hover:text-white transition-colors flex items-center gap-1 uppercase tracking-widest"
                    >
                        {isExpanded ? 'Hide Account Breakdown ▲' : 'Show Account Breakdown ▼'}
                    </button>
                </div>
            </div>

            {/* Account Breakdown Table */}
            {isExpanded && (
                <div className="border-t border-white/5 bg-black/20 p-6 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="text-zinc-500 font-bold uppercase text-[10px] tracking-widest border-b border-white/10">
                                <th className="pb-4">Creditor</th>
                                <th className="pb-4">Current Premium</th>
                                <th className="pb-4">DCCP Premium</th>
                                <th className="pb-4">Monthly Saving</th>
                                <th className="pb-4">Historical Loss</th>
                                <th className="pb-4 text-right">Future Savings</th>
                            </tr>
                        </thead>
                        <tbody className="text-zinc-300">
                            {data.accounts.map((acc, i) => (
                                <tr key={i} className="border-b border-white/5 last:border-0">
                                    <td className="py-4 font-bold text-white">{acc.creditor}</td>
                                    <td className="py-4 text-red-300">R {acc.currentPremium.toFixed(2)}</td>
                                    <td className="py-4 text-teal-300">R {acc.dccpPremium.toFixed(2)}</td>
                                    <td className="py-4 font-bold text-emerald-400">R {acc.monthlySaving.toFixed(2)}</td>
                                    <td className="py-4 text-red-400/70">R {acc.historicalLoss.toFixed(2)}</td>
                                    <td className="py-4 text-right font-black text-white">R {acc.futureSaving.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
