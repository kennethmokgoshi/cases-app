'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ForensicSmartStartPage() {
    const router = useRouter();
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
        phone: ''
    });

    // Phase 2: Evidence Intake (The Big Five)
    const [documents, setDocuments] = useState<{ type: string, fileName: string }[]>([]);

    const EVIDENCE_TYPES = [
        { id: 'LEDGER', label: 'Transaction Ledger / Statement', icon: '📊', desc: 'Required for Prescription Check' },
        { id: 'AGREEMENT', label: 'Credit Agreement & Quote', icon: '📝', desc: 'Checks for Illegal Fees' },
        { id: 'AFFORDABILITY', label: 'Affordability Worksheet', icon: '🧮', desc: 'Proof of Reckless Lending' },
        { id: 'SEC_129', label: 'Section 129 Notice', icon: '📨', desc: 'Procedural Validity Check' },
        { id: 'CREDIT_REPORT', label: 'Historical Credit Report', icon: '📑', desc: 'Cross-reference Defaults' }
    ];

    // --- LOGIC ---

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
                    phone: data.client.phone || ''
                });
            } else {
                setClientData(null);
            }
        } catch (err) {
            setError('Search failed.');
        } finally {
            setLoading(false);
        }
    };

    const toggleDocument = (type: string) => {
        // Mock File Selection - In real app this would contain file upload logic
        setDocuments(prev => {
            const exists = prev.find(d => d.type === type);
            if (exists) return prev.filter(d => d.type !== type);
            return [...prev, { type, fileName: `${type}_upload_mock.pdf` }];
        });
    };

    const handleSubmit = async () => {
        setLoading(true);
        try {
            const payload = {
                client: clientData ? { id: clientData.id } : { ...newClientData, idNumber },
                documents
            };

            const res = await fetch('/api/cases/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error('Failed to create investigation');

            // Redirect to dashboard (or specific case view)
            router.push('/');

        } catch (err: any) {
            setError(err.message);
            setLoading(false);
        }
    };

    return (
        <div className="max-w-3xl mx-auto py-12 px-4 text-white">
            {/* Progress */}
            <div className="flex items-center justify-between mb-12">
                <div className={`text-sm font-bold ${step >= 1 ? 'text-emerald-400' : 'text-gray-500'}`}>1. Subject Profile</div>
                <div className="h-px bg-gray-700 flex-1 mx-4"></div>
                <div className={`text-sm font-bold ${step >= 2 ? 'text-emerald-400' : 'text-gray-500'}`}>2. Evidence Intake</div>
            </div>

            {error && <div className="p-4 mb-6 bg-red-900/20 border border-red-500/20 text-red-400 rounded-lg">{error}</div>}

            {step === 1 && (
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8">
                    <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                        <span className="text-emerald-400">👤</span> Subject Identification
                    </h2>

                    <div className="flex gap-4 mb-6">
                        <input
                            value={idNumber} onChange={e => setIdNumber(e.target.value)}
                            placeholder="South African ID Number"
                            className="flex-1 bg-black/20 border border-gray-700 rounded-lg px-4 py-3 text-white focus:border-emerald-500 outline-none block"
                        />
                        <button onClick={handleSearch} disabled={loading} className="px-6 py-3 bg-emerald-600 rounded-lg font-bold hover:bg-emerald-500 transition-colors">
                            {loading ? '...' : 'Search'}
                        </button>
                    </div>

                    {clientData && (
                        <div className="p-4 bg-emerald-900/20 border border-emerald-500/20 rounded-lg mb-6">
                            <h3 className="font-bold text-emerald-400">Subject Found</h3>
                            <p className="text-gray-300">{clientData.firstName} {clientData.lastName}</p>
                        </div>
                    )}

                    {clientData === null && idNumber && !loading && (
                        <div className="p-4 bg-yellow-900/20 border border-yellow-500/20 rounded-lg mb-6">
                            <h3 className="font-bold text-yellow-400 mb-4">New Subject Registration</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <input placeholder="First Name" className="bg-black/20 border border-gray-700 rounded px-4 py-2"
                                    value={newClientData.firstName} onChange={e => setNewClientData({ ...newClientData, firstName: e.target.value })} />
                                <input placeholder="Last Name" className="bg-black/20 border border-gray-700 rounded px-4 py-2"
                                    value={newClientData.lastName} onChange={e => setNewClientData({ ...newClientData, lastName: e.target.value })} />
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end">
                        <button
                            disabled={!clientData && !newClientData.firstName}
                            onClick={() => setStep(2)}
                            className="px-8 py-3 bg-white text-black font-bold rounded-lg hover:bg-gray-200 disabled:opacity-50"
                        >
                            Next Step →
                        </button>
                    </div>
                </div>
            )}

            {step === 2 && (
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8">
                    <h2 className="text-2xl font-bold mb-2 flex items-center gap-3">
                        <span className="text-emerald-400">📂</span> Evidence Intake
                    </h2>
                    <p className="text-gray-400 mb-8">Upload the "Big Five" to trigger AI analysis.</p>

                    <div className="space-y-4 mb-8">
                        {EVIDENCE_TYPES.map(type => {
                            const isUploaded = documents.find(d => d.type === type.id);
                            return (
                                <div key={type.id}
                                    onClick={() => toggleDocument(type.id)}
                                    className={`p-4 rounded-xl border flex items-center gap-4 cursor-pointer transition-all
                                    ${isUploaded ? 'bg-emerald-900/20 border-emerald-500/50' : 'bg-black/20 border-gray-800 hover:border-gray-600'}`}
                                >
                                    <div className="text-2xl">{type.icon}</div>
                                    <div className="flex-1">
                                        <h4 className={`font-bold ${isUploaded ? 'text-emerald-400' : 'text-gray-300'}`}>{type.label}</h4>
                                        <p className="text-xs text-gray-500">{type.desc}</p>
                                    </div>
                                    {isUploaded ? <span className="text-emerald-500 font-bold">✓ Uploaded</span> : <span className="text-gray-600">+ Add File</span>}
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex justify-between items-center">
                        <button onClick={() => setStep(1)} className="text-gray-500 hover:text-white">← Back</button>
                        <button
                            onClick={handleSubmit}
                            disabled={loading || documents.length === 0}
                            className="px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow-lg shadow-emerald-900/20 disabled:opacity-50"
                        >
                            {loading ? 'Initializing Audit...' : 'Start Investigation'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
