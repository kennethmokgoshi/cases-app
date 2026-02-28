'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { logger } from '@zenowethu/shared-lib';

export default function SmartStartPage() {
    const router = useRouter();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // State for Phase 1: Identity
    const [idNumber, setIdNumber] = useState('');
    const [clientData, setClientData] = useState<any>(null); // Existing client if found
    const [newClientData, setNewClientData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        address: ''
    });

    // State for Phase 2: Analysis
    const [creditReportFile, setCreditReportFile] = useState<File | null>(null);
    const [parsedAccounts, setParsedAccounts] = useState<any[]>([]);
    const [analyzing, setAnalyzing] = useState(false);
    const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);

    // State for Phase 3: Audit
    const [auditData, setAuditData] = useState<Record<string, any>>({});
    const [submitting, setSubmitting] = useState(false);

    // --- PHASE 1 LOGIC ---

    const handleSearch = async () => {
        if (!idNumber) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/clients/lookup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idNumber })
            });
            const data = await res.json();

            if (data.found) {
                setClientData(data.client);
                setNewClientData({
                    firstName: data.client.firstName,
                    lastName: data.client.lastName,
                    email: data.client.email || '',
                    phone: data.client.phone || '',
                    address: data.client.address || ''
                });
            } else {
                setClientData(null);
            }
        } catch (err) {
            setError('Failed to search for client. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleContinueToPhase2 = () => {
        if (!clientData && (!newClientData.firstName || !newClientData.lastName)) {
            setError('Please enter client details.');
            return;
        }
        setStep(2);
    };

    // --- PHASE 2 LOGIC ---

    const handleAnalyzeReport = async () => {
        if (!creditReportFile) return;
        setAnalyzing(true);

        // Simulate "AI delay"
        setTimeout(() => {
            const mockAccounts = [
                {
                    id: 'acc_1',
                    lender: 'Absa Bank',
                    type: 'Personal Loan',
                    accountNumber: '**** 4512',
                    balance: 45000,
                    instalment: 1250,
                    junkFlag: false
                },
                {
                    id: 'acc_2',
                    lender: 'Capitec',
                    type: 'Credit Card',
                    accountNumber: '**** 8821',
                    balance: 12000,
                    instalment: 650,
                    junkFlag: true,
                    junkReason: 'Potential Duplicate Credit Life detected'
                },
                {
                    id: 'acc_3',
                    lender: 'Old Mutual',
                    type: 'Policy',
                    accountNumber: 'POL-9912',
                    balance: 0,
                    instalment: 250,
                    junkFlag: true,
                    junkReason: 'Keyword "Club Fee" found in description'
                }
            ];
            setParsedAccounts(mockAccounts);
            setAnalyzing(false);
        }, 1500);
    };

    const toggleAccount = (id: string) => {
        setSelectedAccounts(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const handleContinueToPhase3 = () => {
        if (selectedAccounts.length === 0) {
            setError('Please select at least one account to audit.');
            return;
        }
        initializeAuditData();
        setStep(3);
    };

    // --- PHASE 3 LOGIC ---

    const initializeAuditData = () => {
        const initialData: Record<string, any> = {};
        selectedAccounts.forEach(accId => {
            const acc = parsedAccounts.find(a => a.id === accId);
            if (acc) {
                initialData[accId] = {
                    lender: acc.lender,
                    accountNumber: acc.accountNumber,
                    principal: acc.balance,
                    interestRate: 11.75,
                    termMonths: 60,
                    startDate: new Date().toISOString().split('T')[0],
                    premium: acc.instalment,
                    serviceFee: 69.00
                };
            }
        });
        setAuditData(prev => ({ ...initialData, ...prev }));
    };

    const handleAuditChange = (accId: string, field: string, value: any) => {
        setAuditData(prev => ({
            ...prev,
            [accId]: {
                ...prev[accId],
                [field]: value
            }
        }));
    };

    const handleContinueToPhase4 = () => {
        setStep(4);
    };

    // --- PHASE 4 LOGIC ---

    const handleSubmit = async () => {
        setSubmitting(true);
        setError(null);

        try {
            const payload = {
                client: clientData ? { id: clientData.id } : { ...newClientData, idNumber },
                accounts: selectedAccounts.map(accId => ({
                    ...auditData[accId],
                    originalId: accId
                }))
            };

            const res = await fetch('/api/insurance/cases/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to create case');
            }

            const data = await res.json();
            router.push(`/cases/${data.caseId}`);

        } catch (err: any) {
            logger.error(err);
            setError(err.message || 'Submission failed');
            setSubmitting(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto py-12 px-4">
            {/* Progress Bar */}
            <div className="flex items-center justify-between mb-12 relative">
                <div className="absolute left-0 top-1/2 w-full h-1 bg-white/10 -z-10"></div>

                {[1, 2, 3, 4].map((s) => (
                    <div key={s} className={`flex flex-col items-center gap-2 ${step >= s ? 'text-zeno-cyan' : 'text-gray-500'}`}>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border-4 transition-all
                            ${step >= s ? 'bg-zeno-navy border-zeno-cyan text-zeno-cyan' : 'bg-zeno-navy border-white/10 text-gray-500'}`}>
                            {s}
                        </div>
                        <span className="text-xs font-medium bg-zeno-navy px-2">
                            {s === 1 && 'Identity'}
                            {s === 2 && 'Analysis'}
                            {s === 3 && 'Audit'}
                            {s === 4 && 'Submit'}
                        </span>
                    </div>
                ))}
            </div>

            {/* PHASE 1: IDENTITY */}
            {step === 1 && (
                <div className="bg-zeno-blue/30 border border-zeno-cyan/20 rounded-2xl p-8 backdrop-blur-sm">
                    <h2 className="text-2xl font-bold mb-6 text-white flex items-center gap-3">
                        <span className="w-8 h-8 rounded-full bg-zeno-cyan text-zeno-navy flex items-center justify-center text-sm">1</span>
                        Client Identity Check
                    </h2>

                    <div className="grid gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">ID Number</label>
                            <div className="flex gap-4">
                                <input
                                    type="text"
                                    value={idNumber}
                                    onChange={(e) => setIdNumber(e.target.value)}
                                    placeholder="Enter South African ID Number"
                                    className="flex-1 bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-zeno-cyan/50"
                                />
                                <button
                                    onClick={handleSearch}
                                    disabled={loading || !idNumber}
                                    className="px-6 py-3 bg-zeno-cyan hover:bg-cyan-400 text-zeno-navy font-bold rounded-lg transition-colors disabled:opacity-50"
                                >
                                    {loading ? 'Searching...' : 'Search Database'}
                                </button>
                            </div>
                        </div>

                        {error && <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg">{error}</div>}

                        {clientData && (
                            <div className="p-6 bg-green-500/10 border border-green-500/20 rounded-xl">
                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 text-xl font-bold">✓</div>
                                    <div className="flex-1">
                                        <h3 className="text-lg font-bold text-white mb-1">Client Found</h3>
                                        <p className="text-gray-400 text-sm mb-4">
                                            We found an existing profile for <strong>{clientData.firstName} {clientData.lastName}</strong>.
                                        </p>
                                        <div className="grid grid-cols-2 gap-4 text-sm text-gray-300">
                                            <div><span className="text-gray-500 block text-xs">Email</span> {clientData.email || '-'}</div>
                                            <div><span className="text-gray-500 block text-xs">Phone</span> {clientData.phone || '-'}</div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleContinueToPhase2}
                                        className="px-6 py-2 bg-green-500 hover:bg-green-400 text-black font-bold rounded-lg transition-colors"
                                    >
                                        Continue
                                    </button>
                                </div>
                            </div>
                        )}

                        {clientData === null && idNumber && !loading && !error && (
                            <div className="p-6 bg-zeno-orange/10 border border-zeno-orange/20 rounded-xl">
                                <h3 className="text-lg font-bold text-zeno-orange mb-4">New Client Registration</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <input
                                        type="text"
                                        placeholder="First Name"
                                        value={newClientData.firstName}
                                        onChange={(e) => setNewClientData({ ...newClientData, firstName: e.target.value })}
                                        className="bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white"
                                    />
                                    <input
                                        type="text"
                                        placeholder="Last Name"
                                        value={newClientData.lastName}
                                        onChange={(e) => setNewClientData({ ...newClientData, lastName: e.target.value })}
                                        className="bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white"
                                    />
                                    <input
                                        type="email"
                                        placeholder="Email Address"
                                        value={newClientData.email}
                                        onChange={(e) => setNewClientData({ ...newClientData, email: e.target.value })}
                                        className="bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white"
                                    />
                                    <input
                                        type="tel"
                                        placeholder="Phone Number"
                                        value={newClientData.phone}
                                        onChange={(e) => setNewClientData({ ...newClientData, phone: e.target.value })}
                                        className="bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white"
                                    />
                                </div>
                                <div className="mt-6 flex justify-end">
                                    <button
                                        onClick={handleContinueToPhase2}
                                        className="px-8 py-3 bg-zeno-orange hover:bg-orange-400 text-black font-bold rounded-lg transition-colors"
                                    >
                                        Create Profile & Continue →
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* PHASE 2: ANALYSIS */}
            {step === 2 && (
                <div className="bg-zeno-blue/30 border border-zeno-cyan/20 rounded-2xl p-8 backdrop-blur-sm">
                    <h2 className="text-2xl font-bold mb-6 text-white flex items-center gap-3">
                        <span className="w-8 h-8 rounded-full bg-zeno-cyan text-zeno-navy flex items-center justify-center text-sm">2</span>
                        AI Credit Report Analysis
                    </h2>

                    {!parsedAccounts.length ? (
                        <div className="text-center py-12 border-2 border-dashed border-white/10 rounded-xl">
                            <div className="mb-4"><span className="text-4xl">📄</span></div>
                            <h3 className="text-lg font-medium text-white mb-2">Upload Credit Report</h3>
                            <p className="text-sm text-gray-400 mb-6">Upload the client's TransUnion or Experian report (PDF)</p>

                            <input
                                type="file"
                                accept=".pdf"
                                onChange={(e) => setCreditReportFile(e.target.files?.[0] || null)}
                                className="hidden"
                                id="report-upload"
                            />

                            {analyzing ? (
                                <div className="flex flex-col items-center gap-2">
                                    <div className="w-6 h-6 border-2 border-zeno-cyan border-t-transparent rounded-full animate-spin"></div>
                                    <p className="text-zeno-cyan text-sm animate-pulse">AI Agent is parsing accounts...</p>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center gap-4">
                                    <label
                                        htmlFor="report-upload"
                                        className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg cursor-pointer transition-colors"
                                    >
                                        {creditReportFile ? creditReportFile.name : 'Select PDF'}
                                    </label>

                                    {creditReportFile && (
                                        <button
                                            onClick={handleAnalyzeReport}
                                            className="px-8 py-3 bg-zeno-cyan hover:bg-cyan-400 text-zeno-navy font-bold rounded-lg transition-colors"
                                        >
                                            Analyze with AI
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div>
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-semibold text-white">Identified Accounts</h3>
                                <div className="text-xs text-gray-400 bg-black/20 px-3 py-1 rounded-full">{parsedAccounts.length} Accounts Found</div>
                            </div>

                            <div className="space-y-3 mb-8">
                                {parsedAccounts.map((acc) => (
                                    <div
                                        key={acc.id}
                                        onClick={() => toggleAccount(acc.id)}
                                        className={`p-4 rounded-xl border cursor-pointer transition-all relative overflow-hidden
                                            ${selectedAccounts.includes(acc.id)
                                                ? 'bg-zeno-cyan/10 border-zeno-cyan'
                                                : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className={`w-6 h-6 rounded border flex items-center justify-center flex-shrink-0
                                                ${selectedAccounts.includes(acc.id) ? 'bg-zeno-cyan border-zeno-cyan' : 'border-gray-500'}`}>
                                                {selectedAccounts.includes(acc.id) && <span className="text-black text-xs">✓</span>}
                                            </div>

                                            <div className="flex-1">
                                                <div className="flex justify-between">
                                                    <h4 className="font-bold text-white">{acc.lender}</h4>
                                                    <span className="text-white font-mono">R {acc.balance.toLocaleString()}</span>
                                                </div>
                                                <p className="text-xs text-gray-400">{acc.type} • {acc.accountNumber}</p>
                                            </div>
                                        </div>

                                        {acc.junkFlag && (
                                            <div className="mt-3 flex items-start gap-2 bg-red-500/10 p-2 rounded-lg border border-red-500/20">
                                                <span className="text-red-400 text-xs">🕵️‍♂️ AI ALERT:</span>
                                                <span className="text-gray-300 text-xs">{acc.junkReason}</span>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            <div className="flex justify-end gap-3">
                                <button onClick={() => setParsedAccounts([])} className="px-4 py-2 text-gray-400 hover:text-white">Re-upload</button>
                                <button
                                    onClick={handleContinueToPhase3}
                                    className="px-8 py-3 bg-zeno-cyan hover:bg-cyan-400 text-zeno-navy font-bold rounded-lg transition-colors"
                                >
                                    Continue to Audit ({selectedAccounts.length}) →
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* PHASE 3: AUDIT */}
            {step === 3 && (
                <div className="bg-zeno-blue/30 border border-zeno-cyan/20 rounded-2xl p-8 backdrop-blur-sm">
                    <h2 className="text-2xl font-bold mb-6 text-white flex items-center gap-3">
                        <span className="w-8 h-8 rounded-full bg-zeno-cyan text-zeno-navy flex items-center justify-center text-sm">3</span>
                        Insurance Assessment Data
                    </h2>

                    <div className="space-y-6">
                        {selectedAccounts.map(accId => {
                            const acc = parsedAccounts.find(a => a.id === accId);
                            const data = auditData[accId] || {};
                            if (!acc) return null;

                            return (
                                <div key={accId} className="bg-black/20 border border-white/10 rounded-xl p-6">
                                    <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-4">
                                        <h3 className="font-bold text-lg text-white">{acc.lender} - {acc.type}</h3>
                                        <span className="text-sm text-gray-400">{acc.accountNumber}</span>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-medium text-gray-400 mb-1">Original Principal Debt (R)</label>
                                            <input
                                                type="number"
                                                value={data.principal}
                                                onChange={(e) => handleAuditChange(accId, 'principal', parseFloat(e.target.value))}
                                                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-white focus:border-zeno-cyan/50 outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-400 mb-1">Interest Rate (%)</label>
                                            <input
                                                type="number"
                                                step="0.1"
                                                value={data.interestRate}
                                                onChange={(e) => handleAuditChange(accId, 'interestRate', parseFloat(e.target.value))}
                                                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-white focus:border-zeno-cyan/50 outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-400 mb-1">Loan Term (Months)</label>
                                            <input
                                                type="number"
                                                value={data.termMonths}
                                                onChange={(e) => handleAuditChange(accId, 'termMonths', parseFloat(e.target.value))}
                                                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-white focus:border-zeno-cyan/50 outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-400 mb-1">Inception Date</label>
                                            <input
                                                type="date"
                                                value={data.startDate}
                                                onChange={(e) => handleAuditChange(accId, 'startDate', e.target.value)}
                                                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-white focus:border-zeno-cyan/50 outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-400 mb-1">Current Monthly Premium (R)</label>
                                            <input
                                                type="number"
                                                value={data.premium}
                                                onChange={(e) => handleAuditChange(accId, 'premium', parseFloat(e.target.value))}
                                                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-white focus:border-zeno-cyan/50 outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-400 mb-1">Monthly Service Fee (R)</label>
                                            <input
                                                type="number"
                                                value={data.serviceFee}
                                                onChange={(e) => handleAuditChange(accId, 'serviceFee', parseFloat(e.target.value))}
                                                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-white focus:border-zeno-cyan/50 outline-none"
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="mt-8 flex justify-between">
                        <button onClick={() => setStep(2)} className="text-gray-400 hover:text-white">← Back</button>
                        <button
                            onClick={handleContinueToPhase4}
                            className="px-8 py-3 bg-zeno-cyan hover:bg-cyan-400 text-zeno-navy font-bold rounded-lg transition-colors"
                        >
                            Review & Submit →
                        </button>
                    </div>
                </div>
            )}

            {/* PHASE 4: SUMMARY & SUBMIT */}
            {step === 4 && (
                <div className="bg-zeno-blue/30 border border-zeno-cyan/20 rounded-2xl p-8 backdrop-blur-sm">
                    <h2 className="text-2xl font-bold mb-6 text-white flex items-center gap-3">
                        <span className="w-8 h-8 rounded-full bg-zeno-cyan text-zeno-navy flex items-center justify-center text-sm">4</span>
                        Confirm & Launch Audit
                    </h2>

                    <div className="bg-white/5 rounded-xl p-6 mb-8 border border-white/10">
                        <h3 className="text-lg font-bold text-white mb-4">Executive Summary</h3>

                        <div className="grid grid-cols-2 gap-y-4 text-sm mb-6">
                            <div className="text-gray-400">Client</div>
                            <div className="text-white font-medium">
                                {clientData ? `${clientData.firstName} ${clientData.lastName}` : `${newClientData.firstName} ${newClientData.lastName}`}
                            </div>

                            <div className="text-gray-400">ID Number</div>
                            <div className="text-white font-medium">{idNumber}</div>

                            <div className="text-gray-400">Accounts to Audit</div>
                            <div className="text-white font-medium">{selectedAccounts.length}</div>
                        </div>

                        <div className="space-y-2">
                            {selectedAccounts.map(accId => {
                                const data = auditData[accId];
                                return (
                                    <div key={accId} className="flex justify-between text-sm py-2 border-t border-white/5">
                                        <span className="text-gray-300">{data.lender}</span>
                                        <span className="text-zeno-cyan">R {data.premium}/pm</span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {error && (
                        <div className="p-4 mb-6 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg">
                            {error}
                        </div>
                    )}

                    <div className="flex justify-between items-center">
                        <button onClick={() => setStep(3)} className="text-gray-400 hover:text-white" disabled={submitting}>
                            ← Back to Edit
                        </button>

                        <button
                            onClick={handleSubmit}
                            disabled={submitting}
                            className="px-8 py-4 bg-zeno-cyan hover:bg-cyan-400 text-zeno-navy font-bold text-lg rounded-xl transition-all shadow-lg shadow-zeno-cyan/20 flex items-center gap-2"
                        >
                            {submitting ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-zeno-navy border-t-transparent rounded-full animate-spin"></div>
                                    Launching Audit...
                                </>
                            ) : (
                                <>🚀 Create Insurance Case</>
                            )}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
