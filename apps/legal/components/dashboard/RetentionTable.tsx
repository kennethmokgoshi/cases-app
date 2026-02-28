'use client';

export default function RetentionTable() {
    const RETENTION_RULES = [
        { type: 'Adverse Behavior', period: '1 Year', desc: 'Subjective labels like "slow payer"' },
        { type: 'Enforcement Action', period: '1 Year', desc: 'Handed over, written off' },
        { type: 'Civil Judgments', period: '5 Years', desc: 'Or until rescinded/paid' },
        { type: 'Administration', period: '5 Years', desc: 'Or until rescinded' },
        { type: 'Sequestration', period: '5 Years', desc: 'Or until rehabilitation' },
        { type: 'Credit Enquiries', period: '1 Year', desc: 'Store/Bank checks' },
        { type: 'Payment Profile', period: '5 Years', desc: '24-month payment history' },
    ];

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 h-full overflow-hidden flex flex-col">
            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
                <span className="text-2xl">📅</span>
                NCA Retention Reference
            </h3>

            <div className="flex-1 overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead>
                        <tr className="border-b border-gray-800 text-gray-500">
                            <th className="pb-2 font-medium">Category</th>
                            <th className="pb-2 font-medium">Period</th>
                            <th className="pb-2 font-medium hidden sm:table-cell">Details</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {RETENTION_RULES.map((rule, idx) => (
                            <tr key={idx} className="group hover:bg-white/5 transition-colors">
                                <td className="py-2.5 text-gray-300 font-medium">{rule.type}</td>
                                <td className="py-2.5">
                                    <span className={`px-2 py-0.5 rounded text-xs font-bold
                                        ${rule.period.includes('1') ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}`}>
                                        {rule.period}
                                    </span>
                                </td>
                                <td className="py-2.5 text-gray-500 text-xs hidden sm:table-cell">{rule.desc}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
