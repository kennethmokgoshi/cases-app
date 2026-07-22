'use client';

import { useState } from 'react';
import { toast } from '@zenowethu/ui';

interface SearchableMailbox {
    id: string;
    label: string;
    emailAddress: string;
    isDcCommunication: boolean;
    hasPassword: boolean;
    isActive: boolean;
}

interface CheckResult {
    success: boolean;
    duplicate?: boolean;
    scanQueued?: boolean;
    inboxConfigured?: boolean;
    mailboxes?: {
        id: string;
        emailAddress: string;
        isDcCommunication: boolean;
        configured: boolean;
    }[];
    scanSummary?: {
        status: 'QUEUED' | 'DUPLICATE' | 'NOT_CONFIGURED' | 'COMPLETED';
        searchFrom: string;
        idNumberMatchRequired: boolean;
        idNumberMatchValue: string;
        selectedMailboxCount: number;
        readableMailboxCount: number;
        skippedMailboxCount: number;
        emailsScanned: number | null;
        newEmailsFound: number | null;
        invoiceCandidatesFound: number | null;
        uploadedDocuments: number | null;
        note: string;
    };
    message?: string;
    error?: string;
}

const GROUP_TITLES: Record<string, string> = {
    'ALL': 'All Documents',
    'ID_POA': 'ID & POA',
    'CREDIT_REPORT': 'Credit Reports',
    'DC_INVOICE': 'DC Invoices',
    'POP': 'Proofs of Payment',
    'PAID_UP': 'Paid-Up Letters',
    'DEBT_REVIEW_FORMS': 'Debt Review Forms',
};

function formatCount(value: number | null | undefined): string {
    return typeof value === 'number' ? String(value) : 'Pending';
}

function formatDate(value: string | undefined): string {
    if (!value) return 'Pending';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'Pending';
    return parsed.toISOString().slice(0, 10);
}

export default function CheckInvoiceEmailsButton({
    caseId,
    receivedAfter,
    reason,
    onRequested,
    menuAlign = 'right',
}: {
    caseId: string;
    receivedAfter?: string | null;
    reason?: string | null;
    onRequested?: () => void;
    menuAlign?: 'left' | 'right';
}) {
    const [showMenu, setShowMenu] = useState(false);
    const [selectedLookbackDays, setSelectedLookbackDays] = useState<number>(365);
    const [selectedMailboxId, setSelectedMailboxId] = useState<string>('ALL');
    const [mailboxes, setMailboxes] = useState<SearchableMailbox[] | null>(null);
    const [isChecking, setIsChecking] = useState(false);
    const [currentGroup, setCurrentGroup] = useState<string>('ALL');
    const [result, setResult] = useState<CheckResult | null>(null);
    const [scanProgress, setScanProgress] = useState<{
        progress: number;
        emailsScanned: number;
        newEmailsFound: number;
    } | null>(null);
    const [isVerifyingRequest, setIsVerifyingRequest] = useState(false);
    const [verifyRequestResult, setVerifyRequestResult] = useState<{
        success: boolean;
        hasRequested: boolean;
        count: number;
        firstSentAt: string | null;
        lastSentAt: string | null;
        allSentFromSameSender: boolean;
        allSentToSameRecipient: boolean;
        commonSender: string | null;
        commonRecipient: string | null;
        isPreferred: boolean;
        source: string;
        emails?: {
            sentAt: string;
            sender: string;
            recipient: string;
            subject: string;
            isPreferred: boolean;
            source: string;
        }[];
    } | null>(null);

    const openMenu = async () => {
        setShowMenu(prev => !prev);
        if (!mailboxes) {
            try {
                const res = await fetch(`/api/cases/${caseId}/dhs-decline/check-fee-emails/verify-request`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.mailboxes) {
                        setMailboxes(data.mailboxes);
                    } else {
                        setMailboxes([]);
                    }
                } else {
                    setMailboxes([]);
                }
            } catch {
                setMailboxes([]);
            }
        }
    };

    const checkVerifyRequest = async () => {
        setIsVerifyingRequest(true);
        try {
            const res = await fetch(`/api/cases/${caseId}/dhs-decline/check-fee-emails/verify-request`);
            if (res.ok) {
                const data = await res.json();
                setVerifyRequestResult(data);
            } else {
                toast.error('Failed to verify request history');
            }
        } catch {
            toast.error('Network error verifying request history');
        } finally {
            setIsVerifyingRequest(false);
        }
    };

    const runCheck = async (mailboxId: string, overrideLookbackDays?: number, docGroupToUse = 'ALL') => {
        setShowMenu(false);
        setIsChecking(true);
        setCurrentGroup(docGroupToUse);
        setResult(null);
        setScanProgress({ progress: 0, emailsScanned: 0, newEmailsFound: 0 });
        setVerifyRequestResult(null);
        const lookbackToUse = overrideLookbackDays ?? selectedLookbackDays;
        try {
            const res = await fetch(`/api/cases/${caseId}/dhs-decline/check-fee-emails`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lookbackDays: lookbackToUse,
                    receivedAfter: receivedAfter || undefined,
                    reason: reason || undefined,
                    mailboxId,
                    docGroup: docGroupToUse,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                toast.error(data.error || 'Email harvest failed');
                setIsChecking(false);
                setScanProgress(null);
                return;
            }

            const reader = res.body?.getReader();
            if (!reader) {
                toast.error('Failed to read response stream');
                setIsChecking(false);
                setScanProgress(null);
                return;
            }

            const decoder = new TextDecoder();
            let buffer = '';
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const chunk = JSON.parse(line);
                        if (chunk.type === 'progress') {
                            setScanProgress({
                                progress: chunk.progress,
                                emailsScanned: chunk.emailsScanned,
                                newEmailsFound: chunk.newEmailsFound,
                            });
                        } else if (chunk.type === 'complete') {
                            setResult(chunk.data);
                            if (chunk.data.success) {
                                toast.success(chunk.data.message || 'Email document harvest completed.');
                                onRequested?.();
                            } else {
                                toast.error(chunk.data.error || 'Harvest failed');
                            }
                        } else if (chunk.type === 'error') {
                            toast.error(chunk.error || 'An error occurred during email harvest');
                        }
                    } catch (e) {
                        console.error('Error parsing chunk:', e);
                    }
                }
            }
        } catch {
            toast.error('Network error - please try again');
        } finally {
            setIsChecking(false);
            setScanProgress(null);
        }
    };

    return (
        <div className="inline-block">
            <div className="relative">
                <button
                    type="button"
                    onClick={openMenu}
                    disabled={isChecking}
                    className="text-xs text-white bg-cyan-750 border border-cyan-500/50 px-3 py-1.5 rounded hover:bg-cyan-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 font-medium shadow-sm"
                >
                    {isChecking ? (
                        <>
                            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                            Harvesting {GROUP_TITLES[currentGroup]}...
                        </>
                    ) : (
                        <>📧 Harvest from Email ▾</>
                    )}
                </button>
                
                {showMenu && (
                    <div className={`absolute ${menuAlign === 'right' ? 'right-0' : 'left-0'} top-full mt-1 w-80 bg-zeno-navy border border-cyan-500/30 rounded-lg shadow-2xl z-20 overflow-hidden`}>
                        <div className="p-3 border-b border-white/10 bg-white/5 space-y-2.5">
                            <div>
                                <div className="text-[10px] uppercase font-semibold tracking-wider text-cyan-300/90 mb-1 flex items-center justify-between">
                                    <span className="flex items-center gap-1">📅 Search Date Range</span>
                                    <span className="text-[10px] text-gray-400 font-normal">
                                        {selectedLookbackDays === 30 ? '30 days' : selectedLookbackDays === 90 ? '90 days' : selectedLookbackDays === 180 ? '6 months' : selectedLookbackDays === 365 ? '1 year' : '3 years'}
                                    </span>
                                </div>
                                <div className="grid grid-cols-5 gap-1">
                                    {[
                                        { label: '30d', days: 30 },
                                        { label: '90d', days: 90 },
                                        { label: '6mo', days: 180 },
                                        { label: '1yr', days: 365 },
                                        { label: '3yr', days: 1095 },
                                    ].map(opt => (
                                        <button
                                            key={opt.days}
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedLookbackDays(opt.days);
                                            }}
                                            className={`px-1 py-0.5 text-[10px] rounded transition-all text-center font-medium ${
                                                selectedLookbackDays === opt.days
                                                    ? 'bg-cyan-600 text-white shadow-sm font-semibold ring-1 ring-cyan-400'
                                                    : 'bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white'
                                            }`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <div className="text-[10px] uppercase font-semibold tracking-wider text-cyan-300/90 mb-1 flex items-center justify-between">
                                    <span className="flex items-center gap-1">📬 Select Mailbox</span>
                                </div>
                                <select
                                    value={selectedMailboxId}
                                    onChange={(e) => setSelectedMailboxId(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-cyan-500/50"
                                >
                                    <option value="ALL" className="bg-zeno-navy text-white">All Connected Mailboxes</option>
                                    {mailboxes?.map(m => (
                                        <option key={m.id} value={m.id} className="bg-zeno-navy text-white">
                                            {m.emailAddress} ({m.label}){!m.hasPassword ? ' [No Password]' : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="p-2 space-y-0.5 bg-black/25 border-b border-white/5">
                            <div className="px-2.5 py-1 text-[10px] font-semibold text-cyan-300/90 uppercase tracking-wider">
                                📧 Targeted Extractions
                            </div>
                            {[
                                { key: 'ID_POA', label: 'Extract ID & POA', icon: '🪪' },
                                { key: 'CREDIT_REPORT', label: 'Extract Credit Reports', icon: '📊' },
                                { key: 'DC_INVOICE', label: 'Extract DC Invoices', icon: '🧾' },
                                { key: 'POP', label: 'Extract Proofs of Payment', icon: '💸' },
                                { key: 'PAID_UP', label: 'Extract Paid-Up Letters', icon: '✉️' },
                                { key: 'DEBT_REVIEW_FORMS', label: 'Extract Debt Review Forms', icon: '📜' },
                            ].map(act => (
                                <button
                                    key={act.key}
                                    type="button"
                                    onClick={() => runCheck(selectedMailboxId, selectedLookbackDays, act.key)}
                                    className="w-full text-left px-2.5 py-1.5 text-xs text-gray-200 hover:bg-cyan-500/20 hover:text-white rounded transition-colors font-medium flex items-center gap-2"
                                >
                                    <span>{act.icon}</span>
                                    <span>{act.label}</span>
                                </button>
                            ))}
                        </div>

                        <div className="p-2 bg-black/45">
                            <button
                                type="button"
                                onClick={() => runCheck(selectedMailboxId, selectedLookbackDays, 'ALL')}
                                className="w-full text-left px-2.5 py-1.5 text-xs text-cyan-200 hover:bg-cyan-500/20 bg-cyan-900/30 border border-cyan-500/30 rounded transition-colors font-semibold flex items-center gap-2"
                            >
                                <span>🔍</span>
                                <span>Extract All / Any Documents</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>
            
            {isChecking && scanProgress && (
                <div className="mt-3 p-3 rounded-lg border border-cyan-500/20 bg-cyan-900/10 text-cyan-200 text-xs w-72">
                    <div className="flex justify-between items-center mb-1.5 font-semibold">
                        <span>Harvesting {GROUP_TITLES[currentGroup]}...</span>
                        <span>{scanProgress.progress}%</span>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden mb-2.5">
                        <div
                            className="bg-cyan-400 h-1.5 transition-all duration-300 ease-out"
                            style={{ width: `${scanProgress.progress}%` }}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-2 opacity-90">
                        <div>
                            <span className="opacity-60">Emails Scanned:</span>{' '}
                            <span className="font-semibold">{scanProgress.emailsScanned}</span>
                        </div>
                        <div>
                            <span className="opacity-60">New Emails:</span>{' '}
                            <span className="font-semibold">{scanProgress.newEmailsFound}</span>
                        </div>
                    </div>
                </div>
            )}
            
            {!isChecking && result && (
                <div className={`mt-3 p-3 rounded-lg border text-xs ${
                    result.success
                        ? result.inboxConfigured
                            ? 'bg-cyan-900/10 border-cyan-500/20 text-cyan-200'
                            : 'bg-amber-900/10 border-amber-500/20 text-amber-200'
                        : 'bg-red-900/10 border-red-500/20 text-red-300'
                }`}>
                    <div className="font-semibold mb-1">
                        {result.success ? `${GROUP_TITLES[currentGroup]} harvest completed` : 'Harvest failed'}
                        {result.duplicate && (
                            <span className="ml-2 font-normal opacity-70">(already requested)</span>
                        )}
                    </div>
                    <div className="opacity-90">
                        {result.message || result.error || 'No result message returned.'}
                    </div>
                    {result.success && result.scanSummary && (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                            <div className="rounded border border-white/10 bg-white/5 p-2">
                                <div className="text-[10px] uppercase tracking-wide opacity-60">Search from</div>
                                <div className="font-semibold">{formatDate(result.scanSummary.searchFrom)}</div>
                            </div>
                            <div className="rounded border border-white/10 bg-white/5 p-2">
                                <div className="text-[10px] uppercase tracking-wide opacity-60">Readable mailboxes</div>
                                <div className="font-semibold">{result.scanSummary.readableMailboxCount}/{result.scanSummary.selectedMailboxCount}</div>
                            </div>
                            <div className="col-span-2 rounded border border-emerald-500/20 bg-emerald-500/10 p-2">
                                <div className="text-[10px] uppercase tracking-wide opacity-70">Strict match rule</div>
                                <div className="font-semibold">
                                    Only open/read emails that contain ID number {result.scanSummary.idNumberMatchValue}.
                                </div>
                                <div className="mt-1 text-[11px] opacity-75">
                                    Non-matching emails must be skipped unopened.
                                </div>
                            </div>
                            <div className="rounded border border-white/10 bg-white/5 p-2">
                                <div className="text-[10px] uppercase tracking-wide opacity-60">Emails scanned</div>
                                <div className="font-semibold">{formatCount(result.scanSummary.emailsScanned)}</div>
                            </div>
                            <div className="rounded border border-white/10 bg-white/5 p-2">
                                <div className="text-[10px] uppercase tracking-wide opacity-60">New emails found</div>
                                <div className="font-semibold">{formatCount(result.scanSummary.newEmailsFound)}</div>
                            </div>
                            <div className="rounded border border-white/10 bg-white/5 p-2">
                                <div className="text-[10px] uppercase tracking-wide opacity-60">Candidates</div>
                                <div className="font-semibold">{formatCount(result.scanSummary.invoiceCandidatesFound)}</div>
                            </div>
                            <div className="rounded border border-white/10 bg-white/5 p-2">
                                <div className="text-[10px] uppercase tracking-wide opacity-60">Uploaded docs</div>
                                <div className="font-semibold">{formatCount(result.scanSummary.uploadedDocuments)}</div>
                            </div>
                            {result.scanSummary.skippedMailboxCount > 0 && (
                                <div className="col-span-2 text-[11px] opacity-75">
                                    {result.scanSummary.skippedMailboxCount} mailbox{result.scanSummary.skippedMailboxCount === 1 ? '' : 'es'} skipped because no password is saved.
                                </div>
                            )}
                            {result.mailboxes && result.mailboxes.length > 0 && (
                                <div className="col-span-2 rounded border border-white/10 bg-white/5 p-2.5">
                                    <div className="text-[10px] uppercase tracking-wide opacity-60 mb-1.5 font-semibold">
                                        Mailboxes Searched
                                    </div>
                                    <div className="space-y-1">
                                        {result.mailboxes.map((mb: any) => (
                                            <div key={mb.id || mb.emailAddress} className="flex justify-between items-center text-[11px]">
                                                <span className="font-semibold text-gray-200">{mb.emailAddress}</span>
                                                {mb.configured ? (
                                                    <span className="text-emerald-400 font-medium">Searched</span>
                                                ) : (
                                                    <span className="text-amber-400 font-medium">Skipped (no password)</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-[10px] text-gray-400 mt-2 border-t border-white/5 pt-1.5 leading-normal">
                                        💡 Searches the notifications inbox, outgoing communications, and all linked channels (including BCC archives) for matching records.
                                    </p>
                                </div>
                            )}
                            <div className="col-span-2 text-[11px] opacity-75">
                                {result.scanSummary.note}
                            </div>
                            {result.scanSummary.uploadedDocuments === 0 && (
                                <div className="col-span-2 mt-2 pt-2 border-t border-white/10">
                                    {verifyRequestResult ? (
                                        <div className="p-2.5 rounded bg-white/5 border border-white/10 text-xs space-y-2">
                                            <div className="font-semibold flex items-center gap-1">
                                                {verifyRequestResult.hasRequested ? (
                                                    <span className="text-emerald-400">✓ Invoice was requested</span>
                                                ) : (
                                                    <span className="text-amber-400">✗ Invoice not requested yet</span>
                                                )}
                                            </div>
                                            {verifyRequestResult.hasRequested ? (
                                                <div className="space-y-1.5 opacity-90 text-[11px] leading-relaxed">
                                                    <p>
                                                        <span className="opacity-60">Total request emails:</span>{' '}
                                                        <span className="font-semibold text-white">{verifyRequestResult.count}</span>
                                                    </p>
                                                    <p>
                                                        <span className="opacity-60">First request date:</span>{' '}
                                                        <span className="font-semibold text-white">{formatDate(verifyRequestResult.firstSentAt)}</span>
                                                    </p>
                                                    <p>
                                                        <span className="opacity-60">Last request date:</span>{' '}
                                                        <span className="font-semibold text-white">{formatDate(verifyRequestResult.lastSentAt)}</span>
                                                    </p>

                                                    <div className="mt-2 pt-2 border-t border-white/5 space-y-1">
                                                        <p>
                                                            <span className="opacity-60">Sent from:</span>{' '}
                                                            <span className="font-semibold text-white">
                                                                {verifyRequestResult.allSentFromSameSender 
                                                                    ? verifyRequestResult.commonSender 
                                                                    : 'Multiple addresses (see detail)'}
                                                            </span>
                                                        </p>
                                                        <p>
                                                            <span className="opacity-60">Sent to:</span>{' '}
                                                            <span className="font-semibold text-white">
                                                                {verifyRequestResult.allSentToSameRecipient 
                                                                    ? verifyRequestResult.commonRecipient 
                                                                    : 'Multiple addresses (see detail)'}
                                                            </span>
                                                        </p>
                                                        {verifyRequestResult.allSentToSameRecipient && (
                                                            <>
                                                                <p className="flex items-center gap-1.5 mt-0.5">
                                                                    <span className="opacity-60">DHS Preferred:</span>{' '}
                                                                    {verifyRequestResult.isPreferred ? (
                                                                        <span className="px-1 py-0.2 text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded font-semibold">
                                                                            Yes (DHS Match)
                                                                        </span>
                                                                    ) : (
                                                                        <span className="px-1 py-0.2 text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded font-semibold">
                                                                            No
                                                                        </span>
                                                                    )}
                                                                </p>
                                                                <p className="text-[10px] text-gray-400">
                                                                    <span className="opacity-60 font-semibold text-white">Address found in:</span>{' '}
                                                                    <span>{verifyRequestResult.source}</span>
                                                                </p>
                                                            </>
                                                        )}
                                                    </div>

                                                    {verifyRequestResult.emails && verifyRequestResult.emails.length > 0 && (
                                                        <div className="mt-2 pt-2 border-t border-white/5">
                                                            <span className="text-[10px] uppercase tracking-wide opacity-60 block mb-1">
                                                                Request History logs:
                                                            </span>
                                                            <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
                                                                {verifyRequestResult.emails.map((e: any, index: number) => (
                                                                    <div key={index} className="p-1 rounded bg-white/5 border border-white/5 text-[10px]">
                                                                        <div className="flex justify-between text-gray-400">
                                                                            <span>{formatDate(e.sentAt)}</span>
                                                                            <span className="truncate max-w-[150px]">To: {e.recipient}</span>
                                                                        </div>
                                                                        <div className="text-gray-300 truncate mt-0.5">{e.subject}</div>
                                                                        {!verifyRequestResult.allSentToSameRecipient && (
                                                                            <div className="text-[9px] text-gray-500 flex justify-between mt-0.5">
                                                                                <span>Source: {e.source}</span>
                                                                                {e.isPreferred && <span className="text-emerald-400 font-semibold">DHS Preferred</span>}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <p className="text-[11px] opacity-75">
                                                    No outgoing emails requesting an invoice have been sent from this case yet.
                                                </p>
                                            )}
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={checkVerifyRequest}
                                            disabled={isVerifyingRequest}
                                            className="w-full text-center text-xs text-white bg-slate-700/80 hover:bg-slate-700 border border-slate-500/30 py-1.5 px-3 rounded font-semibold transition-colors disabled:opacity-50"
                                        >
                                            {isVerifyingRequest ? 'Checking request history...' : 'Check if invoice was requested'}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                    {result.success && !result.inboxConfigured && (
                        <div className="mt-1 opacity-70">
                            Save mailbox passwords in Admin → Settings to let the app read invoice and proof-of-payment replies automatically.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
