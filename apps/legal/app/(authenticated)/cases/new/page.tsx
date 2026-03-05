'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
};

export default function LegalSmartStartPage() {
    const router = useRouter();
    const searchParams = useSearchParams();

    // Initial type from URL? (e.g. ?type=rescission)
    const initialType = searchParams.get('type') || 'Rescission';

    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Phase 1: Identity
    const [idNumber, setIdNumber] = useState('');
    const [clientData, setClientData] = useState<any>(null);
    const [newClientData, setNewClientData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        address: ''
    });

    // Phase 2: Matter Details
    const [matterType, setMatterType] = useState(initialType);
    const [creditor, setCreditor] = useState('');
    const [accountNumber, setAccountNumber] = useState('');
    const [caseNumber, setCaseNumber] = useState(''); // For rescission

    // --- PHASE 1 LOGIC ---

    const handleSearch = async () => {
        if (!idNumber) return;
        setLoading(true);
        setError(null);
        try {
            // Reuse the shared client lookup API
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

    const handleSubmit = async () => {
        setLoading(true);
        setError(null);

        try {
            const payload = {
                client: clientData ? { id: clientData.id } : { ...newClientData, idNumber },
                matter: {
                    type: matterType,
                    creditor,
                    accountNumber,
                    caseNumber // Relevant for rescission
                }
            };

            const res = await fetch('/api/legal/cases/create', {
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
            setLoading(false);
        }
    };

    return (
        <div className="max-w-3xl mx-auto py-12 px-4">
            {/* Progress Bar */}
            <div className="flex items-center justify-between mb-12 relative">
                <div className="absolute left-0 top-1/2 w-full h-1 bg-white/10 -z-10"></div>
                {[1, 2].map((s) => (
                    <div key={s} className={`flex flex-col items-center gap-2 ${step >= s ? 'text-blue-400' : 'text-gray-500'}`}>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border-4 transition-all
                            ${step >= s ? 'bg-gray-900 border-blue-500 text-blue-400' : 'bg-gray-900 border-white/10 text-gray-500'}`}>
                            {s}
                        </div>
                        <span className="text-xs font-medium bg-gray-900 px-2">
                            {s === 1 && 'Applicant Identity'}
                            {s === 2 && 'Matter Details'}
                        </span>
                    </div>
                ))}
            </div>

            {/* ERROR BANNER */}
            {error && (
                <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg flex items-center gap-3">
                    <span className="text-xl">⚠️</span>
                    {error}
                </div>
            )}

            {/* STEP 1: IDENTITY */}
            {step === 1 && (
                <div className="bg-gray-900 border border-white/10 rounded-2xl p-8">
                    <h2 className="text-2xl font-bold mb-6 text-white flex items-center gap-3">
                        <span className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm">1</span>
                        Identity Verification
                    </h2>

                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-400 mb-2">South African ID Number</label>
                        <div className="flex gap-4">
                            <input
                                type="text"
                                value={idNumber}
                                onChange={(e) => setIdNumber(e.target.value)}
                                placeholder="e.g. 8001015009087"
                                className="flex-1 bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                            />
                            <button
                                onClick={handleSearch}
                                disabled={loading || !idNumber}
                                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors disabled:opacity-50"
                            >
                                {loading ? 'Searching...' : 'Search'}
                            </button>
                        </div>
                    </div>

                    {clientData && (
                        <div className="p-6 bg-green-900/20 border border-green-500/20 rounded-xl mb-6">
                            <div className="flex items-start gap-4">
                                <div className="text-green-400 text-2xl">✓</div>
                                <div>
                                    <h3 className="font-bold text-white mb-1">Applicant Found</h3>
                                    <p className="text-gray-400 text-sm">
                                        {clientData.firstName} {clientData.lastName}<br />
                                        {clientData.email}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {clientData === null && idNumber && !loading && (
                        <div className="p-6 bg-yellow-900/20 border border-yellow-500/20 rounded-xl mb-6">
                            <h3 className="font-bold text-yellow-400 mb-4">New Applicant Registration</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <input placeholder="First Name" className="bg-black/20 border border-white/10 rounded px-4 py-2 text-white"
                                    value={newClientData.firstName} onChange={e => setNewClientData({ ...newClientData, firstName: e.target.value })} />
                                <input placeholder="Last Name" className="bg-black/20 border border-white/10 rounded px-4 py-2 text-white"
                                    value={newClientData.lastName} onChange={e => setNewClientData({ ...newClientData, lastName: e.target.value })} />
                                <input placeholder="Email" className="bg-black/20 border border-white/10 rounded px-4 py-2 text-white"
                                    value={newClientData.email} onChange={e => setNewClientData({ ...newClientData, email: e.target.value })} />
                                <input placeholder="Phone" className="bg-black/20 border border-white/10 rounded px-4 py-2 text-white"
                                    value={newClientData.phone} onChange={e => setNewClientData({ ...newClientData, phone: e.target.value })} />
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end">
                        <button
                            onClick={handleContinueToPhase2}
                            disabled={!clientData && !newClientData.firstName}
                            className="px-8 py-3 bg-white text-black font-bold rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Continue →
                        </button>
                    </div>
                </div>
            )}

            {/* STEP 2: MATTER DETAILS */}
            {step === 2 && (
                <div className="bg-gray-900 border border-white/10 rounded-2xl p-8">
                    <h2 className="text-2xl font-bold mb-6 text-white flex items-center gap-3">
                        <span className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm">2</span>
                        Matter Details
                    </h2>

                    <div className="space-y-6 mb-8">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Legal Action Type</label>
                            <select
                                value={matterType}
                                onChange={(e) => setMatterType(e.target.value)}
                                className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                            >
                                <option value="Rescission">Rule 49 Rescission</option>
                                <option value="Prescription">Prescription Challenge (Section 126B)</option>
                                <option value="Dispute">Section 72 Dispute</option>
                                <option value="Reckless">Reckless Lending Assessment</option>
                                <option value="Administration">Administration Order Rescission</option>
                            </select>
                        </div>

                        {matterType === 'Rescission' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">Original Court Case Number</label>
                                <input
                                    type="text"
                                    value={caseNumber}
                                    onChange={(e) => setCaseNumber(e.target.value)}
                                    placeholder="e.g. 1234/2023"
                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                                />
                                <p className="text-xs text-gray-500 mt-1">Found on the original Garnishee Order or Court Order.</p>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">Creditor / Bank Name</label>
                                <input
                                    type="text"
                                    value={creditor}
                                    onChange={(e) => setCreditor(e.target.value)}
                                    placeholder="e.g. Capitec Bank"
                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">Account Number (Optional)</label>
                                <input
                                    type="text"
                                    value={accountNumber}
                                    onChange={(e) => setAccountNumber(e.target.value)}
                                    placeholder="e.g. 155022..."
                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-between items-center">
                        <button onClick={() => setStep(1)} className="text-gray-400 hover:text-white">← Back</button>

                        <button
                            onClick={handleSubmit}
                            disabled={loading}
                            className="px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-blue-900/30"
                        >
                            {loading ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    Creating Case...
                                </>
                            ) : (
                                <>⚡ Open Legal File</>
                            )}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
