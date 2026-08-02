'use client';

import { useState } from 'react';
import { isClearanceButtonEligible, hasCreditReport } from '@/lib/clearance-button-eligibility';

interface AccountRow {
    id: string;
    creditorName: string;
    accountNumber: string | null;
    accountType: string;
    balance: number;
    isMortgage: boolean;
    isPrescribedCandidate: boolean;
    lastPaymentDate: string | null;
}

interface CandidateForm {
    id: 'FORM_19_F2' | 'FORM_19_F1' | 'FORM_17_W';
    label: string;
    description: string;
    recommended: boolean;
    targetStatus: 'F2' | 'F1' | 'G' | 'B';
}

interface EvaluationResult {
    eligible: boolean;
    hasCreditReport: boolean;
    recommendedForm: 'FORM_19_F2' | 'FORM_19_F1' | 'FORM_17_W';
    recommendedFormTitle: string;
    targetStatus: 'F2' | 'F1' | 'G' | 'B';
    reasoning: string;
    accountsSummary: {
        openCount: number;
        closedCount: number;
        totalBalance: number;
        openAccounts: AccountRow[];
    };
    candidateForms: CandidateForm[];
}

interface GenerateClearanceButtonProps {
    caseId: string;
    status?: string | null;
    dhsStatus?: string | null;
    manuallyAcceptedViaDhs?: boolean;
    uploadedDocTypes?: string[];
    documents?: Array<{ documentType?: string | null; type?: string | null }>;
    onDocumentGenerated?: () => void;
    variant?: 'header' | 'tab';
}

export function GenerateClearanceButton({
    caseId,
    status,
    dhsStatus,
    manuallyAcceptedViaDhs,
    uploadedDocTypes,
    documents,
    onDocumentGenerated,
    variant = 'header',
}: GenerateClearanceButtonProps) {
    const [modalOpen, setModalOpen] = useState(false);
    const [evaluating, setEvaluating] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [assessment, setAssessment] = useState<EvaluationResult | null>(null);
    const [selectedForm, setSelectedForm] = useState<'FORM_19_F2' | 'FORM_19_F1' | 'FORM_17_W' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    const eligible = isClearanceButtonEligible({
        status,
        dhsStatus,
        manuallyAcceptedViaDhs,
    });

    const creditReportPresent = hasCreditReport({
        uploadedDocTypes,
        documents,
    });

    if (!eligible) return null;

    const handleOpenModal = async () => {
        setModalOpen(true);
        setEvaluating(true);
        setError(null);
        setSuccessMsg(null);

        try {
            const res = await fetch(`/api/cases/${caseId}/clearance/evaluate`);
            if (!res.ok) {
                throw new Error('Failed to evaluate credit report clearance options');
            }
            const data: EvaluationResult = await res.json();
            setAssessment(data);
            setSelectedForm(data.recommendedForm);
        } catch (err: any) {
            setError(err.message || 'An error occurred while evaluating clearance options.');
        } finally {
            setEvaluating(false);
        }
    };

    const handleGenerate = async () => {
        if (!selectedForm || !assessment) return;
        setGenerating(true);
        setError(null);
        setSuccessMsg(null);

        try {
            const formChoice = assessment.candidateForms.find(f => f.id === selectedForm);
            const docType = selectedForm === 'FORM_17_W' ? 'FORM_17_W' : 'CERTIFIED_FORM_19';
            const targetStatus = formChoice?.targetStatus || 'F2';

            const res = await fetch(`/api/cases/${caseId}/debt-review/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    documentType: docType,
                    targetStatus,
                }),
            });

            const genResult = await res.json();
            const isB2B = genResult.isB2B;

            if (isB2B) {
                setSuccessMsg(`Successfully generated ${formChoice?.label || docType}! Uploaded to Consumer Profile Vault (🔒 B2B Restricted: Crediva download disabled & mailing blocked).`);
            } else {
                setSuccessMsg(`Successfully generated ${formChoice?.label || docType}! Uploaded to Consumer Profile Vault (✓ Accessible on Crediva).`);
            }

            onDocumentGenerated?.();
            setTimeout(() => {
                setModalOpen(false);
            }, 2500);
        } catch (err: any) {
            setError(err.message || 'Error generating clearance certificate.');
        } finally {
            setGenerating(false);
        }
    };

    const buttonClass = variant === 'header'
        ? 'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-600/90 text-white hover:bg-teal-500 transition-all shadow-sm'
        : 'inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white hover:from-teal-500 hover:to-emerald-500 shadow-md transition-all';

    return (
        <>
            <button
                type="button"
                onClick={handleOpenModal}
                className={buttonClass}
                title={creditReportPresent ? 'Evaluate Credit Report & Generate Clearance (Form 19 / 17.W)' : 'Credit Report Required for Clearance Evaluation'}
            >
                <span>📜</span>
                <span>Evaluate Clearance</span>
                {!creditReportPresent && (
                    <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                        No Report
                    </span>
                )}
            </button>

            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
                    <div className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-700/80 rounded-2xl p-6 shadow-2xl text-zinc-100 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
                            <div className="flex items-center gap-2.5">
                                <span className="text-xl">📜</span>
                                <div>
                                    <h3 className="text-lg font-bold text-white">Clearance Certificate Engine</h3>
                                    <p className="text-xs text-zinc-400">Evaluates Credit Report to issue Form 19 or Form 17.W</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setModalOpen(false)}
                                className="text-zinc-400 hover:text-white text-xl p-1"
                            >
                                ✕
                            </button>
                        </div>

                        {evaluating ? (
                            <div className="py-12 text-center space-y-3">
                                <div className="animate-spin w-8 h-8 border-3 border-teal-500 border-t-transparent rounded-full mx-auto" />
                                <p className="text-sm font-medium text-zinc-300">Analyzing credit report accounts & DHS exit options...</p>
                            </div>
                        ) : error ? (
                            <div className="my-4 p-4 rounded-xl bg-red-950/60 border border-red-800/60 text-red-200 text-sm">
                                ⚠️ {error}
                            </div>
                        ) : assessment ? (
                            <div className="py-4 space-y-5 text-sm">
                                {!assessment.hasCreditReport && (
                                    <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-700/50 text-amber-200 flex items-start gap-3">
                                        <span className="text-xl">⚠️</span>
                                        <div>
                                            <div className="font-semibold text-amber-300">Credit Report Required</div>
                                            <p className="text-xs text-amber-200/80 mt-0.5">
                                                No Credit Report document was found in the case vault. A credit report is strictly required to evaluate and generate clearance documents. Please upload one of the 4 credit reports (Experian, TransUnion, XDS, Lightstone) to proceed.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {assessment.hasCreditReport && (
                                    <>
                                        {/* Recommendation Banner */}
                                        <div className="p-4 rounded-xl bg-teal-950/40 border border-teal-700/60 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-teal-400 uppercase tracking-wider">
                                            AI / Rules Recommendation
                                        </span>
                                        <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/40">
                                            {assessment.recommendedFormTitle}
                                        </span>
                                    </div>
                                    <p className="text-xs text-zinc-300 leading-relaxed">
                                        {assessment.reasoning}
                                    </p>
                                </div>

                                {/* Form Options Selector */}
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                                        Select Clearance Document to Generate:
                                    </label>
                                    <div className="grid gap-2">
                                        {assessment.candidateForms.map(form => (
                                            <label
                                                key={form.id}
                                                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                                                    selectedForm === form.id
                                                        ? 'bg-teal-600/15 border-teal-500/80 text-white'
                                                        : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-300 hover:border-zinc-600'
                                                }`}
                                            >
                                                <input
                                                    type="radio"
                                                    name="clearanceForm"
                                                    value={form.id}
                                                    checked={selectedForm === form.id}
                                                    onChange={() => setSelectedForm(form.id)}
                                                    className="mt-1 text-teal-500 focus:ring-teal-500"
                                                />
                                                <div className="flex-1">
                                                    <div className="flex items-center justify-between">
                                                        <span className="font-semibold text-xs text-white">{form.label}</span>
                                                        {form.recommended && (
                                                            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                                                                Recommended
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-zinc-400 mt-0.5">{form.description}</p>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                {/* Accounts Summary Table */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                                            Credit Report Accounts Analyzed ({assessment.accountsSummary.openAccounts.length} Open)
                                        </span>
                                        <span className="text-xs text-zinc-400">
                                            Total Open Balance: R{assessment.accountsSummary.totalBalance.toLocaleString()}
                                        </span>
                                    </div>

                                    {assessment.accountsSummary.openAccounts.length === 0 ? (
                                        <div className="p-3 text-center text-xs text-emerald-400 bg-emerald-950/20 border border-emerald-800/40 rounded-xl">
                                            ✓ 0 Open accounts — All registered credit accounts are settled/closed.
                                        </div>
                                    ) : (
                                        <div className="border border-zinc-800 rounded-xl overflow-hidden text-xs">
                                            <table className="w-full text-left">
                                                <thead className="bg-zinc-800/80 text-zinc-400 font-semibold border-b border-zinc-700/60">
                                                    <tr>
                                                        <th className="p-2">Creditor</th>
                                                        <th className="p-2">Type</th>
                                                        <th className="p-2">Balance</th>
                                                        <th className="p-2">Status / Notes</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-zinc-800 text-zinc-300">
                                                    {assessment.accountsSummary.openAccounts.map(acc => (
                                                        <tr key={acc.id} className="hover:bg-zinc-800/30">
                                                            <td className="p-2 font-medium">{acc.creditorName}</td>
                                                            <td className="p-2 text-zinc-400">{acc.accountType || '—'}</td>
                                                            <td className="p-2">R{(acc.balance || 0).toLocaleString()}</td>
                                                            <td className="p-2">
                                                                {acc.isMortgage ? (
                                                                    <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[10px]">
                                                                        Mortgage Bond
                                                                    </span>
                                                                ) : acc.isPrescribedCandidate ? (
                                                                    <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px]">
                                                                        Prescription Candidate (&gt;3 yrs)
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-amber-400 text-[10px]">Active Balance</span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>

                                {successMsg && (
                                    <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-700/60 text-emerald-200 text-xs flex items-center gap-2">
                                        <span>✓</span>
                                        <span>{successMsg}</span>
                                    </div>
                                )}
                                </>
                                )}
                            </div>
                        ) : null}

                        <div className="flex items-center justify-end gap-2 pt-4 border-t border-zinc-800">
                            <button
                                type="button"
                                onClick={() => setModalOpen(false)}
                                className="px-4 py-2 text-xs font-semibold rounded-xl bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-all"
                            >
                                Cancel
                            </button>
                            {assessment && assessment.hasCreditReport && (
                                <button
                                    type="button"
                                    onClick={handleGenerate}
                                    disabled={generating || !selectedForm}
                                    className="px-4 py-2 text-xs font-semibold rounded-xl bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-50 transition-all flex items-center gap-1.5"
                                >
                                    {generating ? (
                                        <>
                                            <span className="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" />
                                            <span>Generating PDF...</span>
                                        </>
                                    ) : (
                                        <>
                                            <span>⚡</span>
                                            <span>Generate Selected Clearance PDF</span>
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
