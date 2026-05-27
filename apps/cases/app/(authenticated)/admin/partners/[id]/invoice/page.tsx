'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@zenowethu/ui';
import Link from 'next/link';

export default function PartnerInvoiceGenerator({ params }: { params: { id: string } }) {
    const router = useRouter();
    const [partnerName, setPartnerName] = useState('Partner');
    const [file, setFile] = useState<File | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        // Fetch partner details
        fetch(`/api/projects/${params.id}`)
            .then(res => res.json())
            .then(data => {
                if (data && data.name) setPartnerName(data.name);
            })
            .catch(() => console.error('Failed to load partner details'));
    }, [params.id]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const selected = e.target.files[0];
            if (!selected.name.match(/\.(xls|xlsx)$/i)) {
                toast.error('Please select a valid Excel file (.xls or .xlsx)');
                setFile(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
                return;
            }
            setFile(selected);
        }
    };

    const handleGenerate = async () => {
        if (!file) {
            toast.error('Please select a file first.');
            return;
        }

        setIsGenerating(true);
        try {
            const formData = new FormData();
            formData.append('file', file);

            const res = await fetch(`/api/admin/partners/${params.id}/invoice/generate`, {
                method: 'POST',
                body: formData
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to generate invoice');
            }

            const data = await res.json();
            toast.success(`Invoice ${data.invoiceNumber} generated successfully!`);
            router.push('/admin/partners');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'An error occurred');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="max-w-3xl mx-auto p-6">
            <div className="flex items-center gap-3 mb-8">
                <Link href="/admin/partners" className="text-gray-400 hover:text-white">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </Link>
                <h1 className="text-3xl font-bold text-white">Generate Invoice: {partnerName}</h1>
            </div>

            <div className="bg-zeno-blue/30 border border-zeno-blue/50 rounded-xl p-8">
                <h2 className="text-xl font-semibold text-white mb-4">Upload Usage Report</h2>
                <p className="text-gray-400 mb-6">
                    Upload an Excel file (.xls or .xlsx) containing the partner's usage data.
                    The system expects columns for Description, Quantity, and Unit Price to generate the line items.
                </p>

                <div className="border-2 border-dashed border-zeno-blue rounded-xl p-8 text-center mb-6">
                    <input
                        type="file"
                        accept=".xls,.xlsx"
                        onChange={handleFileChange}
                        className="hidden"
                        ref={fileInputRef}
                        id="file-upload"
                    />
                    <label
                        htmlFor="file-upload"
                        className="cursor-pointer flex flex-col items-center justify-center"
                    >
                        <svg className="w-12 h-12 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        {file ? (
                            <span className="text-white font-medium">{file.name}</span>
                        ) : (
                            <>
                                <span className="text-zeno-cyan font-semibold hover:underline">Click to upload</span>
                                <span className="text-sm text-gray-500 mt-1">or drag and drop</span>
                            </>
                        )}
                    </label>
                </div>

                <div className="flex justify-end gap-4">
                    <button
                        onClick={() => router.push('/admin/partners')}
                        className="px-6 py-2 bg-zeno-blue/50 text-white rounded-lg hover:bg-zeno-blue/70 transition-colors"
                        disabled={isGenerating}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleGenerate}
                        disabled={!file || isGenerating}
                        className="px-6 py-2 bg-zeno-cyan text-zeno-navy font-semibold rounded-lg hover:bg-cyan-400 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                        {isGenerating && (
                            <svg className="animate-spin h-5 w-5 text-zeno-navy" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        )}
                        {isGenerating ? 'Processing...' : 'Generate Invoice'}
                    </button>
                </div>
            </div>
        </div>
    );
}
