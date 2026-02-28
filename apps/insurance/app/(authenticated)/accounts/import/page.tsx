import { FileUploader } from '@zenowethu/ui';
import Link from 'next/link';

export const metadata = {
    title: 'Import Payment Batch | Zenowethu' };

export default function ImportPage() {
    return (
        <div className="max-w-4xl mx-auto p-6 space-y-8">
            <div className="flex items-center gap-4">
                <Link href="/accounts" className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-white">Import Payment Batch</h1>
                    <p className="text-sm text-gray-400 mt-1">Upload partner payment spreadsheets for reconciliation</p>
                </div>
            </div>

            <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-white/5 p-1">
                <div className="p-6 border-b border-white/5">
                    <h3 className="text-lg font-semibold text-white">Upload File</h3>
                    <p className="text-gray-500 text-sm mt-1">Drag and drop or select an Excel file (.xlsx) containing payment records. The system will attempt to match payments to clients using 13-digit ID numbers.</p>
                </div>
                <div className="p-6">
                    <FileUploader />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-blue-500/5 p-6 rounded-xl border border-blue-500/10">
                    <h4 className="font-semibold text-blue-400 mb-2 flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        Instructions
                    </h4>
                    <ul className="text-sm text-gray-400 space-y-2 list-disc pl-5">
                        <li>Ensure the file is in .xlsx format.</li>
                        <li>The file should contain a column with 13-digit ID numbers for matching.</li>
                        <li>Payments without a matching client ID will be flagged as "Unallocated".</li>
                        <li>You can review and edit matched payments before finalizing the batch.</li>
                    </ul>
                </div>

                <div className="bg-orange-500/5 p-6 rounded-xl border border-orange-500/10">
                    <h4 className="font-semibold text-orange-400 mb-2 flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        Supported Columns
                    </h4>
                    <p className="text-sm text-gray-400 mb-2">The system looks for headers similar to:</p>
                    <div className="flex flex-wrap gap-2">
                        {['Date', 'Reference', 'Amount', 'ID Number', 'Client Name'].map(t => (
                            <span key={t} className="px-2 py-1 bg-white/5 rounded text-xs text-gray-300 border border-white/10">{t}</span>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
