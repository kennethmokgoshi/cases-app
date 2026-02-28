'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

export function FileUploader() {
    const [file, setFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            validateAndSetFile(e.target.files[0]);
        }
    };

    const validateAndSetFile = (selectedFile: File) => {
        // Check for Excel file types
        const validTypes = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'];
        if (!validTypes.includes(selectedFile.type) && !selectedFile.name.endsWith('.xlsx')) {
            setUploadError('Invalid file type. Please upload an Excel (.xlsx) file.');
            return;
        }
        setFile(selectedFile);
        setUploadError(null);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            validateAndSetFile(e.dataTransfer.files[0]);
        }
    };

    const handleUpload = async () => {
        if (!file) return;

        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('/api/accounts/import', {
                method: 'POST',
                body: formData });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Upload failed');
            }

            const data = await res.json();
            // In a real flow, we would redirect to a review page
            router.push(`/accounts/batches/${data.batchId}`);
        } catch (err: any) {
            setUploadError(err.message);
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div
                className={`border-2 border-dashed rounded-xl p-12 text-center transition-all ${isDragging ? 'border-emerald-500 bg-emerald-500/10' : 'border-white/10 hover:border-white/20 bg-white/5'}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                    accept=".xlsx,.xls"
                />

                {!file ? (
                    <div className="flex flex-col items-center justify-center space-y-4">
                        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-lg font-medium text-white">Click or drag file to this area to upload</p>
                            <p className="text-sm text-gray-500 mt-1">Support for a single Excel file (.xlsx)</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors"
                        >
                            Select File
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center space-y-4 animate-in fade-in zoom-in duration-300">
                        <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
                            <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-lg font-medium text-white">{file.name}</p>
                            <p className="text-sm text-gray-500 mt-1">{(file.size / 1024).toFixed(2)} KB</p>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={handleUpload}
                                disabled={isUploading}
                                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isUploading ? (
                                    <>
                                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Uploading...
                                    </>
                                ) : 'Process Batch'}
                            </button>
                            <button
                                onClick={() => setFile(null)}
                                disabled={isUploading}
                                className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {uploadError && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-center animate-in slide-in-from-top-2">
                    {uploadError}
                </div>
            )}
        </div>
    );
}
