'use client';

import { useState, useEffect } from 'react';

export default function PrescriptionCalculator() {
    const [lastPaymentDate, setLastPaymentDate] = useState('');
    const [hasSummons, setHasSummons] = useState(false);
    const [status, setStatus] = useState<'PENDING' | 'PRESCRIBED' | 'ENFORCEABLE'>('PENDING');

    useEffect(() => {
        if (!lastPaymentDate) {
            setStatus('PENDING');
            return;
        }

        const paymentDate = new Date(lastPaymentDate);
        const today = new Date();
        const threeYearsAgo = new Date();
        threeYearsAgo.setFullYear(today.getFullYear() - 3);

        if (hasSummons) {
            setStatus('ENFORCEABLE'); // Summons interrupts prescription
        } else if (paymentDate < threeYearsAgo) {
            setStatus('PRESCRIBED');
        } else {
            setStatus('ENFORCEABLE');
        }
    }, [lastPaymentDate, hasSummons]);

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 h-full flex flex-col">
            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-6">
                <span className="text-2xl">⚔️</span>
                Prescription Sword
            </h3>

            <div className="space-y-4 flex-1">
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Last Payment / Acknowledgement</label>
                    <input
                        type="date"
                        value={lastPaymentDate}
                        onChange={(e) => setLastPaymentDate(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                    />
                </div>

                <div className="flex items-center gap-2 p-3 bg-gray-800/30 rounded-lg border border-gray-800">
                    <input
                        type="checkbox"
                        id="summons"
                        checked={hasSummons}
                        onChange={(e) => setHasSummons(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500/20"
                    />
                    <label htmlFor="summons" className="text-sm text-gray-300 select-none">
                        Legacy Summons Issued?
                    </label>
                </div>

                {status !== 'PENDING' && (
                    <div className={`p-4 rounded-xl border flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2
                        ${status === 'PRESCRIBED'
                            ? 'bg-green-500/10 border-green-500/20 text-green-400'
                            : 'bg-red-500/10 border-red-500/20 text-red-400'
                        }`}
                    >
                        <span className="text-2xl">{status === 'PRESCRIBED' ? '🛡️' : '⚠️'}</span>
                        <div>
                            <p className="font-bold text-lg">
                                {status === 'PRESCRIBED' ? 'Debt Prescribed' : 'Legally Enforceable'}
                            </p>
                            <p className="text-xs opacity-80">
                                {status === 'PRESCRIBED'
                                    ? 'Older than 3 years. Section 126B defense applies.'
                                    : 'Prescription interrupted or < 3 years.'}
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {status === 'PRESCRIBED' && (
                <button className="w-full mt-4 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg transition-colors shadow-lg shadow-green-900/20">
                    Draft 126B Defense Letter
                </button>
            )}
        </div>
    );
}
