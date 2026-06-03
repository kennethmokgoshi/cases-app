'use client';
import { toast, confirm } from '@zenowethu/ui';


import { useEffect, useState } from 'react';
import Link from 'next/link';

type RiskTier = 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
type UWDecision = 'APPROVE' | 'CONDITIONAL_APPROVE' | 'REFER' | 'DECLINE' | null;

type AssessmentRow = {
    id: string;
    status: string;
    totalCurrentPremium: number;
    replacementPremium: number | null;
    monthlySavings: number | null;
    annualSavings: number | null;
    totalAccounts: number;
    riskTier: RiskTier | null;
    riskScore: number | null;
    uwDecision: UWDecision;
    updatedAt: string;
    Case: {
        id: string;
        fileNumber: string;
        client: {
            firstName: string;
            lastName: string;
            idNumber: string;
        };
    };
    policies: { id: string; status: string }[];
    cancellationLetters: { id: string; status: string }[];
};

const TIER_STYLES: Record<RiskTier, { bg: string; text: string; label: string }> = {
    LOW: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'LOW' },
    MEDIUM: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'MEDIUM' },
    HIGH: { bg: 'bg-orange-500/20', text: 'text-orange-400', label: 'HIGH' },
    VERY_HIGH: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'VERY HIGH' }
};

const DECISION_STYLES: Record<string, { bg: string; text: string }> = {
    APPROVE: { bg: 'bg-green-500/20', text: 'text-green-400' },
    CONDITIONAL_APPROVE: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
    REFER: { bg: 'bg-yellow-500/20', text: 'text-yellow-300' },
    DECLINE: { bg: 'bg-red-500/20', text: 'text-red-400' }
};

const STATUS_FILTER_OPTIONS = [
    { value: '', label: 'All Assessments' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'UNDER_REVIEW', label: 'Under Review' },
    { value: 'LETTERS_GENERATED', label: 'Letters Generated' },
    { value: 'ACCEPTED', label: 'Accepted' },
    { value: 'DECLINED', label: 'Declined' },
];

export default function UnderwritingQueuePage() {
    const [assessments, setAssessments] = useState<AssessmentRow[]>([]);
    const [total, setTotal] = useState(0);
    const [statusFilter, setStatusFilter] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [runningId, setRunningId] = useState<string | null>(null);

    async function fetchAssessments() {
        setLoading(true);
        setError(null);
        try {
            const qs = statusFilter ? `?status=${statusFilter}` : '';
            const res = await fetch(`/api/insurance/assessments${qs}`);
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            setAssessments(data.assessments ?? []);
            setTotal(data.total ?? 0);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { fetchAssessments(); }, [statusFilter]);

    async function runUnderwriting(assessmentId: string) {
        setRunningId(assessmentId);
        try {
            const res = await fetch(`/api/insurance/assessments/${assessmentId}/underwrite`, {
                method: 'POST'
            });
            if (!res.ok) {
                const err = await res.json();
                toast.error(`Underwriting failed: ${err.error}`);
                return;
            }
            await fetchAssessments();
        } catch (e: any) {
            toast.error(`Error: ${e.message}`);
        } finally {
            setRunningId(null);
        }
    }

    async function generateLetters(assessmentId: string) {
        setRunningId(assessmentId);
        try {
            const res = await fetch(`/api/insurance/assessments/${assessmentId}/cancellation-letters`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            if (!res.ok) {
                const err = await res.json();
                toast.error(`Letter generation failed: ${err.error}`);
                return;
            }
            const data = await res.json();
            toast.success(`${data.results?.filter((r: any) => r.status === 'created').length ?? 0} letter(s) generated.`);
            await fetchAssessments();
        } catch (e: any) {
            toast.error(`Error: ${e.message}`);
        } finally {
            setRunningId(null);
        }
    }
    async function issuePolicy(assessmentId: string) {
        if (!await confirm('Are you sure you want to issue a formal policy for this assessment? This will update the case status and generate a policy schedule.')) return;

        setRunningId(assessmentId);
        try {
            const res = await fetch(`/api/insurance/assessments/${assessmentId}/policy`, {
                method: 'POST'
            });
            if (!res.ok) {
                const err = await res.json();
                toast.error(`Policy issuance failed: ${err.error}`);
                return;
            }
            const data = await res.json();
            toast.success(`Policy ${data.policyNumber} issued successfully!`);
            window.open(`data:application/pdf;base64,${data.pdf}`, '_blank');
            await fetchAssessments();
        } catch (e: any) {
            toast.error(`Error: ${e.message}`);
        } finally {
            setRunningId(null);
        }
    }

    // Summary counts
    const approvedCount = assessments.filter(a => a.uwDecision === 'APPROVE').length;
    const referCount = assessments.filter(a => a.uwDecision === 'REFER').length;
    const declineCount = assessments.filter(a => a.uwDecision === 'DECLINE').length;
    const pendingCount = assessments.filter(a => !a.uwDecision).length;

    return (
        <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white mb-2">Underwriting Queue</h1>
                <p className="text-gray-400">Automated risk scoring and underwriting decisions for all assessments.</p>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {[
                    { label: 'Pending UW', count: pendingCount, color: 'border-gray-500/40', icon: '⏳' },
                    { label: 'Approved', count: approvedCount, color: 'border-green-500/40', icon: '✅' },
                    { label: 'Refer', count: referCount, color: 'border-yellow-500/40', icon: '🔍' },
                    { label: 'Declined', count: declineCount, color: 'border-red-500/40', icon: '❌' },
                ].map(card => (
                    <div key={card.label} className={`bg-zeno-blue/30 border ${card.color} rounded-xl p-4`}>
                        <div className="flex items-center gap-2 mb-1">
                            <span>{card.icon}</span>
                            <span className="text-gray-400 text-xs">{card.label}</span>
                        </div>
                        <p className="text-2xl font-bold text-white">{card.count}</p>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3 mb-6 flex-wrap">
                {STATUS_FILTER_OPTIONS.map(opt => (
                    <button
                        key={opt.value}
                        onClick={() => setStatusFilter(opt.value)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${statusFilter === opt.value
                            ? 'bg-zeno-cyan text-zeno-navy border-zeno-cyan'
                            : 'bg-zeno-blue/30 text-gray-300 border-white/10 hover:border-zeno-cyan/40'
                            }`}
                    >
                        {opt.label}
                    </button>
                ))}
                <span className="ml-auto text-gray-500 text-sm">{total} total</span>
            </div>

            {/* Table */}
            {error ? (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
                    <p className="text-red-400">{error}</p>
                    <button onClick={fetchAssessments} className="text-red-300 text-sm underline mt-2">Retry</button>
                </div>
            ) : loading ? (
                <div className="text-gray-500 text-center py-16">Loading assessments...</div>
            ) : assessments.length === 0 ? (
                <div className="text-center py-16 text-gray-500">
                    No assessments found.{' '}
                    <Link href="/cases/new?type=insurance" className="text-zeno-cyan underline">Start a new assessment</Link>
                </div>
            ) : (
                <div className="space-y-3">
                    {assessments.map(a => {
                        const tierStyle = a.riskTier ? TIER_STYLES[a.riskTier] : null;
                        const decStyle = a.uwDecision ? DECISION_STYLES[a.uwDecision] : null;
                        const isRunning = runningId === a.id;
                        const hasPolicy = a.policies.length > 0;
                        const hasLetters = a.cancellationLetters.length > 0;
                        const canRunUW = !['ACCEPTED', 'DECLINED', 'CANCELLED'].includes(a.status);
                        const canGenLetters = ['UNDER_REVIEW', 'LETTERS_GENERATED'].includes(a.status) ||
                            (a.uwDecision === 'APPROVE' || a.uwDecision === 'CONDITIONAL_APPROVE');

                        return (
                            <div key={a.id} className="bg-zeno-blue/20 border border-white/5 rounded-xl p-5 hover:border-zeno-cyan/20 transition-all">
                                <div className="flex flex-col md:flex-row md:items-center gap-4">
                                    {/* Client info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3 mb-1">
                                            <Link
                                                href={`/cases/${a.Case.id}`}
                                                className="font-semibold text-white hover:text-zeno-cyan transition-colors"
                                            >
                                                {a.Case.client.firstName} {a.Case.client.lastName}
                                            </Link>
                                            <span className="text-xs text-gray-500">{a.Case.fileNumber}</span>
                                            {hasPolicy && (
                                                <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">Policy Active</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-4 text-sm text-gray-400">
                                            <span>{a.totalAccounts} account{a.totalAccounts !== 1 ? 's' : ''}</span>
                                            <span>Current: <span className="text-white">R{Number(a.totalCurrentPremium).toFixed(0)}/mo</span></span>
                                            {a.monthlySavings != null && (
                                                <span>Savings: <span className="text-green-400 font-medium">R{Number(a.monthlySavings).toFixed(0)}/mo</span></span>
                                            )}
                                            {a.annualSavings != null && (
                                                <span className="hidden lg:inline">Annual: <span className="text-green-400 font-medium">R{Number(a.annualSavings).toLocaleString()}</span></span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Risk & Decision badges */}
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {/* Risk score */}
                                        {tierStyle ? (
                                            <span className={`text-xs font-semibold px-3 py-1 rounded-full ${tierStyle.bg} ${tierStyle.text}`}>
                                                Risk: {tierStyle.label} {a.riskScore != null ? `(${a.riskScore})` : ''}
                                            </span>
                                        ) : (
                                            <span className="text-xs px-3 py-1 rounded-full bg-gray-700/50 text-gray-500">No Risk Score</span>
                                        )}

                                        {/* UW decision */}
                                        {decStyle ? (
                                            <span className={`text-xs font-semibold px-3 py-1 rounded-full ${decStyle.bg} ${decStyle.text}`}>
                                                {a.uwDecision?.replace('_', ' ')}
                                            </span>
                                        ) : (
                                            <span className="text-xs px-3 py-1 rounded-full bg-gray-700/50 text-gray-500">Pending UW</span>
                                        )}

                                        {/* Letters */}
                                        {hasLetters && (
                                            <span className="text-xs bg-purple-500/20 text-purple-400 px-3 py-1 rounded-full">
                                                {a.cancellationLetters.length} Letter{a.cancellationLetters.length !== 1 ? 's' : ''}
                                            </span>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-2">
                                        {canRunUW && (
                                            <button
                                                onClick={() => runUnderwriting(a.id)}
                                                disabled={isRunning}
                                                className="px-3 py-2 text-xs font-medium bg-zeno-cyan/20 hover:bg-zeno-cyan/30 text-zeno-cyan border border-zeno-cyan/30 rounded-lg transition-all disabled:opacity-50"
                                            >
                                                {isRunning ? 'Running...' : '▶ Run UW'}
                                            </button>
                                        )}
                                        {canGenLetters && !hasLetters && (
                                            <button
                                                onClick={() => generateLetters(a.id)}
                                                disabled={isRunning}
                                                className="px-3 py-2 text-xs font-medium bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 border border-purple-500/30 rounded-lg transition-all disabled:opacity-50"
                                            >
                                                {isRunning ? '...' : '📄 Gen Letters'}
                                            </button>
                                        )}
                                        {a.status !== 'ACCEPTED' && (a.uwDecision === 'APPROVE' || a.uwDecision === 'CONDITIONAL_APPROVE') && (
                                            <button
                                                onClick={() => issuePolicy(a.id)}
                                                disabled={isRunning}
                                                className="px-3 py-2 text-xs font-medium bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30 rounded-lg transition-all disabled:opacity-50"
                                            >
                                                {isRunning ? '...' : '📜 Issue Policy'}
                                            </button>
                                        )}
                                        <Link
                                            href={`/cases/${a.Case.id}`}
                                            className="px-3 py-2 text-xs font-medium bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 rounded-lg transition-all"
                                        >
                                            View Case →
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
