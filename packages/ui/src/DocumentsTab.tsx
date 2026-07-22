'use client';
import { confirm } from './providers/ConfirmProvider';


import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

// Client-side logger (avoid importing server-only modules from shared-lib)
const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    debug: (...args: any[]) => console.debug('[DEBUG]', ...args)
};

type DocumentAccessGrant = {
    userId: string;
    grantedAt: string;
    user: { id: string; firstName: string; lastName: string; email: string };
};

type Document = {
    id: string;
    type: string;
    fileName: string;
    fileUrl: string;
    fileSize: number;
    mimeType: string;
    uploadedAt: string;
    analyzedAt: string | null;
    extractedData: string | null;
    isAdminOnly: boolean;
    uploadedById?: string | null;
    accessGrants?: DocumentAccessGrant[];
};

const DOC_TYPE_LABELS: Record<string, { label: string; color: string; icon: string }> = {
    'ID': { label: 'ID Document', color: 'bg-blue-500/20 text-blue-300', icon: '🪪' },
    'POA': { label: 'Power of Attorney', color: 'bg-purple-500/20 text-purple-300', icon: '📝' },
    'CREDIT_REPORT': { label: 'Credit Report', color: 'bg-green-500/20 text-green-300', icon: '📊' },
    'CREDIT_REPORT_TRANSUNION': { label: 'TransUnion Report', color: 'bg-green-600/20 text-green-400', icon: '📊' },
    'CREDIT_REPORT_EXPERIAN': { label: 'Experian Report', color: 'bg-red-500/20 text-red-300', icon: '📊' },
    'CREDIT_REPORT_XDS': { label: 'XDS Report', color: 'bg-yellow-500/20 text-yellow-300', icon: '📊' },
    'CREDIT_REPORT_LIGHTSTONE': { label: 'Lightstone Report', color: 'bg-pink-500/20 text-pink-300', icon: '📊' },
    'ZENOWETHU_POA': { label: 'Zenowethu POA', color: 'bg-cyan-500/20 text-cyan-300', icon: '📋' },
    'PAYSLIP': { label: 'Payslip', color: 'bg-emerald-500/20 text-emerald-300', icon: '💸' },
    'BANK_STATEMENT': { label: 'Bank Statement', color: 'bg-indigo-500/20 text-indigo-300', icon: '🏦' },
    'PROOF_OF_RESIDENCE': { label: 'Proof of Residence', color: 'bg-teal-500/20 text-teal-300', icon: '🏠' },
    'COMBINED': { label: 'Combined File', color: 'bg-orange-500/20 text-orange-300', icon: '📦' },
    'PAID_UP_LETTER': { label: 'Paid Up Letter', color: 'bg-green-500/20 text-green-300', icon: '✅' },
    'FORM_17W': { label: 'Form 17.W', color: 'bg-violet-500/20 text-violet-300', icon: '📜' },
    'FORM_16': { label: 'Form 16', color: 'bg-violet-400/20 text-violet-200', icon: '📜' },
    'FORM_17_1': { label: 'Form 17.1', color: 'bg-violet-600/20 text-violet-400', icon: '📜' },
    'FORM_17_2': { label: 'Form 17.2', color: 'bg-violet-600/25 text-violet-300', icon: '📜' },
    'FORM_17_7': { label: 'Form 17.7', color: 'bg-violet-700/20 text-violet-400', icon: '📜' },
    'SECTION_86': { label: 'Section 86 Notice', color: 'bg-rose-500/20 text-rose-300', icon: '⚖️' },
    'COURT_ORDER': { label: 'Court Order', color: 'bg-rose-600/20 text-rose-400', icon: '🏛️' },
    'DEBT_RESTRUCTURING_PROPOSAL': { label: 'Debt Restructuring Proposal', color: 'bg-amber-500/20 text-amber-300', icon: '📋' },
    'INSURANCE_POLICY': { label: 'Insurance Policy', color: 'bg-sky-500/20 text-sky-300', icon: '🛡️' },
    'CONSENT_FORM': { label: 'Consent Form', color: 'bg-teal-400/20 text-teal-200', icon: '✍️' },
    'AFFIDAVIT': { label: 'Affidavit', color: 'bg-orange-600/20 text-orange-300', icon: '📃' },
    'DHS_SUMMARY_REPORT': { label: 'DHS Summary Report', color: 'bg-cyan-600/20 text-cyan-300', icon: '🖥️' },
    'OTHER': { label: 'Other Document', color: 'bg-gray-500/20 text-gray-300', icon: '📄' } };

const CREDIT_BUREAUS: { type: string; name: string; color: string; accent: string }[] = [
    { type: 'CREDIT_REPORT_TRANSUNION', name: 'TransUnion', color: 'border-green-500/30 bg-green-500/5', accent: 'text-green-400' },
    { type: 'CREDIT_REPORT_EXPERIAN',  name: 'Experian',   color: 'border-red-500/30 bg-red-500/5',   accent: 'text-red-400' },
    { type: 'CREDIT_REPORT_XDS',       name: 'XDS',        color: 'border-yellow-500/30 bg-yellow-500/5', accent: 'text-yellow-400' },
    { type: 'CREDIT_REPORT_LIGHTSTONE',name: 'Lightstone', color: 'border-pink-500/30 bg-pink-500/5', accent: 'text-pink-400' },
];

export function DocumentsTab({ caseId }: { caseId: string }) {
    const { data: session } = useSession();
    const isAdmin = (session?.user as any)?.isAdmin === true;
    const [documents, setDocuments] = useState<Document[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [extracting, setExtracting] = useState(false);
    const [extractingDhs, setExtractingDhs] = useState(false);
    const [reanalyzing, setReanalyzing] = useState<string | null>(null); // Track specific doc ID being re-analyzed
    const [uploadType, setUploadType] = useState('OTHER');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [extractionProgress, setExtractionProgress] = useState(0);
    const [extractionMessage, setExtractionMessage] = useState('');
    const [mounted, setMounted] = useState(false);
    const [uploadAdminOnly, setUploadAdminOnly] = useState(false);
    const [accessModal, setAccessModal] = useState<{ doc: Document } | null>(null);
    const [accessEmail, setAccessEmail] = useState('');
    const [accessLoading, setAccessLoading] = useState(false);
    const [allUsers, setAllUsers] = useState<{ id: string; firstName: string; lastName: string; email: string }[]>([]);

    // Track client-side hydration
    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        fetchDocuments();
    }, [caseId]);

    const fetchDocuments = async () => {
        try {
            const res = await fetch(`/api/cases/${caseId}/documents`);
            const data = await res.json();
            if (data.documents) {
                setDocuments(data.documents);
            }
        } catch (e) {
            logger.error('Error fetching documents:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, typeOverride?: string) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const effectiveType = typeOverride ?? uploadType;
        setUploading(true);
        setError('');
        setSuccess('');

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('type', effectiveType);
            if (isAdmin && uploadAdminOnly) {
                formData.append('isAdminOnly', 'true');
            }

            const res = await fetch(`/api/cases/${caseId}/documents`, {
                method: 'POST',
                body: formData });

            if (!res.ok) {
                let detail = `Server error ${res.status}`;
                try {
                    const errBody = await res.json();
                    detail = errBody.details || errBody.error || detail;
                } catch { /* ignore JSON parse error */ }
                throw new Error(detail);
            }

            const { document: uploadedDoc } = await res.json();

            setSuccess('Document uploaded successfully');

            fetchDocuments();
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Failed to upload document';
            setError(`Failed to upload document: ${msg}`);
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };

    const handleExtract = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setExtracting(true);
        setExtractionProgress(5);
        setExtractionMessage('Uploading file...');
        setError('');
        setSuccess('');

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('caseId', caseId);

            const response = await fetch('/api/documents/extract', {
                method: 'POST',
                body: formData });

            if (!response.ok) throw new Error('Failed to start extraction');

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            if (!reader) throw new Error('No reader available');

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (!line.trim()) continue;
                    let update;
                    try {
                        update = JSON.parse(line);
                    } catch (e) {
                        logger.error('Error parsing line:', e);
                        continue;
                    }

                    if (update.type === 'progress') {
                        setExtractionMessage(update.message);
                        if (update.progress) setExtractionProgress(update.progress);
                    } else if (update.type === 'error') {
                        throw new Error(update.message);
                    } else if (update.type === 'result') {
                        setSuccess(update.data.message || 'Extraction complete');
                        fetchDocuments();
                    }
                }
            }
        } catch (e: any) {
            setError(e.message || 'Failed to extract documents');
        } finally {
            setExtracting(false);
            setExtractionProgress(0);
            setExtractionMessage('');
            e.target.value = '';
        }
    };
    
    const handleDhsExtract = async (fileOrDocId: File | string) => {
        const isExisting = typeof fileOrDocId === 'string';
        setExtractingDhs(true);
        setExtractionProgress(5);
        setExtractionMessage(isExisting ? 'Initializing DHS extraction...' : 'Uploading file for DHS extraction...');
        setError('');
        setSuccess('');

        try {
            const formData = new FormData();
            if (isExisting) {
                formData.append('documentId', fileOrDocId);
            } else {
                formData.append('file', fileOrDocId as File);
            }
            formData.append('caseId', caseId);

            const response = await fetch('/api/documents/extract-dhs', {
                method: 'POST',
                body: formData });

            if (!response.ok) throw new Error('Failed to start DHS extraction');

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            if (!reader) throw new Error('No reader available');

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (!line.trim()) continue;
                    let update;
                    try {
                        update = JSON.parse(line);
                    } catch (e) {
                        logger.error('Error parsing line:', e);
                        continue;
                    }

                    if (update.type === 'progress') {
                        setExtractionMessage(update.message);
                        if (update.progress) setExtractionProgress(update.progress);
                    } else if (update.type === 'error') {
                        throw new Error(update.message);
                    } else if (update.type === 'result') {
                        setSuccess(update.data.message || 'DHS Extraction complete');
                        fetchDocuments();
                        // Auto-request via DHS immediately after extraction
                        setExtractionMessage('Submitting DHS transfer request...');
                        try {
                            const dhsRes = await fetch('/api/dhs/lookup', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ caseId, action: 'validate_and_request' }),
                            });
                            const dhsData = await dhsRes.json();
                            if (dhsData.success) {
                                setSuccess('DHS Extraction complete — Transfer requested via DHS successfully!');
                            } else {
                                setSuccess(`DHS Extraction complete. DHS request: ${dhsData.message || 'could not submit — check DHS tab.'}`);
                            }
                        } catch {
                            setSuccess('DHS Extraction complete. Could not auto-submit DHS request — use the DHS tab to request manually.');
                        }
                    }
                }
            }
        } catch (e: any) {
            setError(e.message || 'Failed to extract DHS documents');
        } finally {
            setExtractingDhs(false);
            setExtractionProgress(0);
            setExtractionMessage('');
        }
    };

    const handleSplitExisting = async (docId: string) => {
        setExtracting(true);
        setExtractionProgress(5);
        setExtractionMessage('Initializing split...');
        setError('');
        setSuccess('');

        try {
            const formData = new FormData();
            formData.append('documentId', docId);
            formData.append('caseId', caseId);

            const response = await fetch('/api/documents/extract', {
                method: 'POST',
                body: formData });

            if (!response.ok) throw new Error('Failed to start extraction');

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            if (!reader) throw new Error('No reader available');

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (!line.trim()) continue;
                    let update;
                    try {
                        update = JSON.parse(line);
                    } catch (e) {
                        logger.error('Error parsing line:', e);
                        continue;
                    }

                    if (update.type === 'progress') {
                        setExtractionMessage(update.message);
                        if (update.progress) setExtractionProgress(update.progress);
                    } else if (update.type === 'error') {
                        throw new Error(update.message);
                    } else if (update.type === 'result') {
                        setSuccess(update.data.message || 'Extraction complete');
                        fetchDocuments();
                    }
                }
            }
        } catch (e: any) {
            setError(e.message || 'Failed to extract documents');
        } finally {
            setExtracting(false);
            setExtractionProgress(0);
            setExtractionMessage('');
        }
    };

    const handleBatchReanalyze = async (mode: 'SEPARATE' | 'COMBINED') => {
        setReanalyzing('BATCH');
        setError('');
        setSuccess('');

        try {
            // Find relevant documents
            let payload: any = { caseId, mode };

            if (mode === 'SEPARATE') {
                const idDoc = documents.find(d => d.type === 'ID');
                const poaDoc = documents.find(d => d.type === 'POA');
                const creditDoc = documents.find(d => d.type === 'CREDIT_REPORT');
                const payslipDoc = documents.find(d => d.type === 'PAYSLIP');
                const bankDoc = documents.find(d => d.type === 'BANK_STATEMENT');

                if (!idDoc && !poaDoc && !creditDoc && !payslipDoc && !bankDoc) throw new Error('No relevant documents (ID, POA, Credit Report, Payslip, Bank Statement) found to analyze.');

                payload.documentIds = [idDoc?.id, poaDoc?.id, creditDoc?.id, payslipDoc?.id, bankDoc?.id].filter(Boolean);

                if (!await confirm(`Re-analyse ${payload.documentIds.length} documents together? This will overwrite existing data.`)) {
                    setReanalyzing(null);
                    return;
                }
            } else {
                // Combined mode
                const combinedDoc = documents.find(d => d.type === 'COMBINED');
                if (!combinedDoc) throw new Error('No Combined PDF found. Please upload one first.');

                payload.documentId = combinedDoc.id;
                payload.extractOnly = true; // DO NOT SPLIT

                if (!await confirm(`Re-analyse Combined PDF? This will re-extract data without splitting/creating new files.`)) {
                    setReanalyzing(null);
                    return;
                }
            }

            const res = await fetch('/api/documents/reanalyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload) });

            let data;
            const contentType = res.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                data = await res.json();
            } else {
                // Handle text/html errors (timeouts/server crash)
                const text = await res.text();
                throw new Error(`Server Error (${res.status}): ${text.substring(0, 50)}...`);
            }

            if (!res.ok) throw new Error(data.error || `Request failed with status ${res.status}`);

            setSuccess(data.message || 'Analysis complete');

            // Check for ID Verification warnings
            if (data.idVerification && !data.idVerification.isVerified) {
                // Show specific warning
                setError(`⚠️ ${data.idVerification.warning || 'ID Mismatch detected'}`);
                // Keep success message as well but maybe as a secondary info or just let error override visual priority
                // Actually, let's append to success or handle as a separate alert state if we had one.
                // For now, setting Error makes it visible in red box which is good for "verification failed".
            }

            fetchDocuments();
        } catch (e: any) {
            setError(e.message || 'Failed to analyze');
        } finally {
            setReanalyzing(null);
        }
    };

    const handleDelete = async (docId: string) => {
        if (!await confirm('Are you sure you want to delete this document?')) return;

        try {
            const res = await fetch(`/api/cases/${caseId}/documents?documentId=${docId}`, {
                method: 'DELETE' });
            if (!res.ok) throw new Error('Delete failed');
            setSuccess('Document deleted');
            fetchDocuments();
        } catch (e) {
            setError('Failed to delete document');
        }
    };

    const openAccessModal = async (doc: Document) => {
        setAccessModal({ doc });
        setAccessEmail('');
        setAccessLoading(true);
        try {
            const res = await fetch('/api/users?flat=true');
            if (res.ok) {
                const data = await res.json();
                setAllUsers(data.filter((u: any) => !u.isAdmin));
            }
        } catch { /* ignore */ } finally {
            setAccessLoading(false);
        }
    };

    const handleGrantAccess = async (documentId: string, userId: string) => {
        setAccessLoading(true);
        try {
            const res = await fetch(`/api/cases/${caseId}/documents/access`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ documentId, userId, action: 'grant' })
            });
            if (!res.ok) throw new Error('Failed to grant access');
            setSuccess('Access granted');
            fetchDocuments();
            // Refresh modal doc
            const updated = await fetch(`/api/cases/${caseId}/documents`).then(r => r.json());
            const updatedDoc = updated.documents?.find((d: Document) => d.id === documentId);
            if (updatedDoc) setAccessModal({ doc: updatedDoc });
        } catch {
            setError('Failed to grant access');
        } finally {
            setAccessLoading(false);
        }
    };

    const handleRevokeAccess = async (documentId: string, userId: string) => {
        setAccessLoading(true);
        try {
            const res = await fetch(`/api/cases/${caseId}/documents/access`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ documentId, userId, action: 'revoke' })
            });
            if (!res.ok) throw new Error('Failed to revoke access');
            setSuccess('Access revoked');
            fetchDocuments();
            const updated = await fetch(`/api/cases/${caseId}/documents`).then(r => r.json());
            const updatedDoc = updated.documents?.find((d: Document) => d.id === documentId);
            if (updatedDoc) setAccessModal({ doc: updatedDoc });
        } catch {
            setError('Failed to revoke access');
        } finally {
            setAccessLoading(false);
        }
    };

    const handleUpdateType = async (docId: string, newType: string) => {
        try {
            const res = await fetch(`/api/cases/${caseId}/documents?documentId=${docId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: newType }) });

            if (!res.ok) throw new Error('Failed to update document type');

            setSuccess(`Document type updated to ${DOC_TYPE_LABELS[newType].label}`);
            fetchDocuments();
        } catch (e) {
            setError('Failed to update document type');
        }
    };

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    const getDocTypeInfo = (type: string) => DOC_TYPE_LABELS[type] || DOC_TYPE_LABELS['OTHER'];

    if (loading) {
        return (
            <div className="bg-zeno-blue/20 rounded-xl border border-white/5 p-6">
                <div className="animate-pulse space-y-4">
                    <div className="h-6 bg-white/10 rounded w-1/4"></div>
                    <div className="h-20 bg-white/10 rounded"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-zeno-blue/20 rounded-xl border border-white/5 p-6">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-white">📁 Documents</h3>
                <div className="flex gap-2">
                    <div className="relative group">
                        <button
                            disabled={!!reanalyzing || extracting}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 cursor-pointer transition-colors flex items-center gap-2"
                        >
                            {reanalyzing ? 'Processing...' : '🤖 Re-analyse with AI'}
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                        </button>

                        {/* Dropdown Menu */}
                        <div className="absolute right-0 top-full mt-1 w-56 bg-zeno-navy border border-white/10 rounded-lg shadow-xl overflow-hidden hidden group-hover:block z-50">
                            <button
                                onClick={() => handleBatchReanalyze('SEPARATE')}
                                className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                            >
                                <div className="font-medium">Separate Documents</div>
                                <div className="text-xs text-gray-500">Analyses ID, POA & Credit Report together</div>
                            </button>
                            <button
                                onClick={() => handleBatchReanalyze('COMBINED')}
                                className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors border-t border-white/5"
                            >
                                <div className="font-medium">Combined Document</div>
                                <div className="text-xs text-gray-500">Analyses single merged PDF</div>
                            </button>
                        </div>
                    </div>

                    {/* Upload & Split Button */}
                    <label className="relative">
                        <span className="px-3 py-1.5 text-xs font-medium rounded-lg bg-zeno-cyan/20 text-zeno-cyan hover:bg-zeno-cyan/30 cursor-pointer transition-colors flex items-center gap-1">
                            {extracting ? '⏳ Processing...' : '📄 AI Upload & Split'}
                        </span>
                        <input type="file" accept=".pdf" onChange={handleExtract} disabled={extracting} className="sr-only" />
                    </label>

                    {/* DHS Extraction Button */}
                    <div className="relative group">
                        <button
                            disabled={extractingDhs || extracting}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 cursor-pointer transition-colors flex items-center gap-2"
                        >
                            {extractingDhs ? '⏳ DHS Processing...' : '🏠 DHS Extraction'}
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                        </button>

                        <div className="absolute right-0 top-full mt-1 w-64 bg-zeno-navy border border-white/10 rounded-lg shadow-xl overflow-hidden hidden group-hover:block z-50">
                            <div className="bg-white/5 px-4 py-2 text-[10px] uppercase font-bold text-gray-500 flex justify-between items-center">
                                <span>Select Doc to Extract</span>
                                <label className="text-rose-400 hover:text-rose-300 cursor-pointer">
                                    Upload New
                                    <input type="file" accept=".pdf" className="sr-only" onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleDhsExtract(file);
                                    }} />
                                </label>
                            </div>

                            <div className="max-h-60 overflow-y-auto">
                                {documents.filter(d => d.type === 'COMBINED' || d.type === 'OTHER' || d.type === 'DHS_SUMMARY_REPORT').map((doc) => (
                                    <button
                                        key={doc.id}
                                        onClick={() => handleDhsExtract(doc.id)}
                                        className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors border-t border-white/5"
                                    >
                                        <div className="font-medium truncate">{doc.fileName}</div>
                                        <div className="text-xs text-gray-500">
                                            {getDocTypeInfo(doc.type).label} • {formatFileSize(doc.fileSize)}
                                        </div>
                                    </button>
                                ))}

                                {documents.filter(d => d.type === 'COMBINED' || d.type === 'OTHER' || d.type === 'DHS_SUMMARY_REPORT').length === 0 && (
                                    <div className="px-4 py-4 text-center text-xs text-gray-500 italic">
                                        No suitable documents found
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>


                    {/* Split Existing Button */}
                    <div className="relative group">
                        <button
                            disabled={extracting}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 cursor-pointer transition-colors flex items-center gap-2"
                        >
                            ✂️ Split Existing
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                        </button>

                        <div className="absolute right-0 top-full mt-1 w-64 bg-zeno-navy border border-white/10 rounded-lg shadow-xl overflow-hidden hidden group-hover:block z-50">
                            <div className="bg-white/5 px-4 py-2 text-[10px] uppercase font-bold text-gray-500">
                                Select Document to Split
                            </div>

                            <div className="max-h-60 overflow-y-auto">
                                {documents.filter(d => d.type === 'COMBINED' || d.type === 'OTHER').map((doc) => (
                                    <button
                                        key={doc.id}
                                        onClick={() => handleSplitExisting(doc.id)}
                                        className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors border-t border-white/5"
                                    >
                                        <div className="font-medium truncate">{doc.fileName}</div>
                                        <div className="text-xs text-gray-500">
                                            {getDocTypeInfo(doc.type).label} • {formatFileSize(doc.fileSize)}
                                        </div>
                                    </button>
                                ))}

                                {documents.filter(d => d.type === 'COMBINED' || d.type === 'OTHER').length === 0 && (
                                    <div className="px-4 py-4 text-center text-xs text-gray-500 italic">
                                        No suitable documents found
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Extraction Progress Bar */}
                {(extracting || extractingDhs) && (
                    <div className="mb-6 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="bg-zeno-navy/50 rounded-lg border border-zeno-cyan/20 p-4">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-sm font-medium text-zeno-cyan flex items-center gap-2">
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-zeno-cyan opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-zeno-cyan"></span>
                                    </span>
                                    {extractionMessage || 'Processing documents...'}
                                </span>
                                <span className="text-xs font-bold text-gray-400">{extractionProgress}%</span>
                            </div>
                            <div className="w-full bg-white/5 rounded-full h-2.5 overflow-hidden border border-white/5">
                                <div
                                    className="bg-gradient-to-r from-zeno-cyan to-blue-500 h-full transition-all duration-500 ease-out shadow-[0_0_10px_rgba(34,211,238,0.3)]"
                                    style={{ width: `${extractionProgress}%` }}
                                ></div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Messages */}
            {error && <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm">{error}</div>}
            {success && <div className="mb-4 p-3 bg-green-500/20 border border-green-500/30 rounded-lg text-green-400 text-sm">{success}</div>}

            {/* Credit Bureau Reports Section */}
            <div className="mb-6 p-4 bg-zeno-navy/50 rounded-lg border border-white/10">
                <p className="text-sm font-medium text-white mb-3">📊 Credit Bureau Reports</p>
                <div className="grid grid-cols-2 gap-3">
                    {CREDIT_BUREAUS.map((bureau) => {
                        const uploaded = documents.find(d => d.type === bureau.type);
                        return (
                            <div key={bureau.type} className={`rounded-lg border p-3 flex items-center justify-between gap-3 ${bureau.color}`}>
                                <div className="min-w-0">
                                    <p className={`text-sm font-medium ${bureau.accent}`}>{bureau.name}</p>
                                    {uploaded ? (
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 font-bold uppercase tracking-wider">Already Uploaded</span>
                                            <p className="text-xs text-gray-400 truncate max-w-[120px]">{uploaded.fileName}</p>
                                        </div>
                                    ) : (
                                        <p className="text-xs text-gray-500 italic">Not uploaded</p>
                                    )}
                                </div>
                                <label className="shrink-0 cursor-pointer">
                                    <span className={`px-2 py-1 text-xs rounded transition-colors ${uploaded ? 'bg-white/10 text-gray-300 hover:bg-white/20' : `${bureau.accent} bg-white/10 hover:bg-white/20 font-bold`}`}>
                                        {uploading && uploadType === bureau.type ? '⏳' : uploaded ? 'Replace' : 'Upload'}
                                    </span>
                                    <input
                                        type="file"
                                        accept=".pdf,image/*"
                                        className="sr-only"
                                        disabled={uploading}
                                        onChange={(e) => handleUpload(e, bureau.type)}
                                    />
                                </label>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Upload Section */}
            <div className="mb-6 p-4 bg-zeno-navy/50 rounded-lg border border-white/10">
                <p className="text-sm text-gray-400 mb-3">Upload individual document:</p>
                <div className="flex gap-3 items-center">
                    <select
                        value={uploadType}
                        onChange={(e) => setUploadType(e.target.value)}
                        className="px-3 py-2 bg-zeno-gray border border-white/20 rounded-lg text-white text-sm [color-scheme:dark] [&>option]:bg-zeno-navy [&>option]:text-white"
                    >
                        <option value="ID" className="bg-zeno-navy text-white">ID Document</option>
                        <option value="POA" className="bg-zeno-navy text-white">Power of Attorney</option>
                        <optgroup label="Credit Bureau Reports" className="bg-zeno-navy text-gray-400">
                            <option value="CREDIT_REPORT_TRANSUNION" className="bg-zeno-navy text-white">TransUnion Report</option>
                            <option value="CREDIT_REPORT_EXPERIAN" className="bg-zeno-navy text-white">Experian Report</option>
                            <option value="CREDIT_REPORT_XDS" className="bg-zeno-navy text-white">XDS Report</option>
                            <option value="CREDIT_REPORT_LIGHTSTONE" className="bg-zeno-navy text-white">Lightstone Report</option>
                            <option value="CREDIT_REPORT" className="bg-zeno-navy text-white">Credit Report (other)</option>
                        </optgroup>
                        <option value="ZENOWETHU_POA" className="bg-zeno-navy text-white">Zenowethu POA</option>
                        <option value="PAYSLIP" className="bg-zeno-navy text-white">Payslip</option>
                        <option value="BANK_STATEMENT" className="bg-zeno-navy text-white">Bank Statement</option>
                        <option value="PROOF_OF_RESIDENCE" className="bg-zeno-navy text-white">Proof of Residence</option>
                        <option value="PAID_UP_LETTER" className="bg-zeno-navy text-white">Paid Up Letter</option>
                        <optgroup label="NCR / Legal Forms" className="bg-zeno-navy text-gray-400">
                            <option value="FORM_17W" className="bg-zeno-navy text-white">Form 17.W</option>
                            <option value="FORM_16" className="bg-zeno-navy text-white">Form 16</option>
                            <option value="FORM_17_1" className="bg-zeno-navy text-white">Form 17.1</option>
                            <option value="FORM_17_2" className="bg-zeno-navy text-white">Form 17.2</option>
                            <option value="FORM_17_7" className="bg-zeno-navy text-white">Form 17.7</option>
                            <option value="SECTION_86" className="bg-zeno-navy text-white">Section 86 Notice</option>
                            <option value="COURT_ORDER" className="bg-zeno-navy text-white">Court Order</option>
                            <option value="DEBT_RESTRUCTURING_PROPOSAL" className="bg-zeno-navy text-white">Debt Restructuring Proposal</option>
                        </optgroup>
                        <option value="INSURANCE_POLICY" className="bg-zeno-navy text-white">Insurance Policy</option>
                        <option value="CONSENT_FORM" className="bg-zeno-navy text-white">Consent Form</option>
                        <option value="AFFIDAVIT" className="bg-zeno-navy text-white">Affidavit</option>
                        <option value="COMBINED" className="bg-zeno-navy text-white">Combined File</option>
                        <option value="OTHER" className="bg-zeno-navy text-white">Other Document</option>
                    </select>
                    <label className="flex-1">
                        <span className="px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-white text-sm cursor-pointer transition-colors inline-flex items-center gap-2">
                            {uploading ? '⏳ Uploading...' : '📤 Choose File'}
                        </span>
                        <input
                            type="file"
                            accept=".pdf,image/*"
                            onChange={handleUpload}
                            disabled={uploading}
                            className="sr-only"
                        />
                    </label>
                </div>
                {/* Admin-only toggle — only visible to admins */}
                {isAdmin && (
                    <label className="mt-3 flex items-center gap-2 cursor-pointer w-fit select-none">
                        <div
                            onClick={() => setUploadAdminOnly(v => !v)}
                            className={`relative w-9 h-5 rounded-full transition-colors ${uploadAdminOnly ? 'bg-amber-500' : 'bg-white/20'}`}
                        >
                            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${uploadAdminOnly ? 'translate-x-4' : 'translate-x-0'}`} />
                        </div>
                        <span className={`text-xs font-medium ${uploadAdminOnly ? 'text-amber-400' : 'text-gray-400'}`}>
                            🔒 Private — admin eyes only
                        </span>
                    </label>
                )}
            </div>

            {/* Documents List */}
            <div className="space-y-3">
                {documents.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-8">No documents uploaded yet.</p>
                ) : (
                    documents.map((doc) => {
                        const typeInfo = getDocTypeInfo(doc.type);
                        const extractedInfo = doc.extractedData ? JSON.parse(doc.extractedData) : null;

                        const dhsRecords: any[] = extractedInfo?.records ?? [];
                        const isDhs = doc.type === 'DHS_SUMMARY_REPORT';

                        return (
                            <div
                                key={doc.id}
                                className={`p-4 bg-zeno-navy/30 rounded-lg border transition-colors ${isDhs ? 'border-rose-500/20 hover:border-rose-500/30' : 'border-white/5 hover:border-white/10'}`}
                            >
                            <div className="flex items-center gap-4">
                                <div className="text-2xl">{typeInfo.icon}</div>
                                <div className="flex-1 min-w-0 group relative">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`text-xs px-2 py-0.5 rounded ${typeInfo.color}`}>
                                            {typeInfo.label}
                                        </span>
                                        {doc.isAdminOnly && (
                                            <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium flex items-center gap-1">
                                                🔒 Admin Only
                                            </span>
                                        )}
                                        {/* Type Edit Dropdown */}
                                        <div className="relative inline-block text-left opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button className="text-gray-400 hover:text-white p-1">
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                            </button>
                                            <div className="absolute left-0 top-full mt-1 w-40 bg-zeno-navy border border-white/10 rounded shadow-lg z-50 hidden group-hover:block">
                                                {Object.keys(DOC_TYPE_LABELS).map((typeKey) => (
                                                    <button
                                                        key={typeKey}
                                                        onClick={() => handleUpdateType(doc.id, typeKey)}
                                                        className="block w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-white/10 hover:text-white"
                                                    >
                                                        {DOC_TYPE_LABELS[typeKey].label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {extractedInfo?.confidence && (
                                            <span className="text-xs text-gray-500">
                                                {Math.round(extractedInfo.confidence * 100)}% confidence
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-white text-sm truncate">{doc.fileName}</p>
                                    <p className="text-gray-500 text-xs">
                                        {formatFileSize(doc.fileSize)} • {mounted ? new Date(doc.uploadedAt).toLocaleDateString() : ''}
                                        {extractedInfo?.pageCount && ` • ${extractedInfo.pageCount} pages`}
                                    </p>
                                </div>
                                {/* Re-analyse Button for supported types */}
                                {
                                    /* Individual Re-analyse button removed as per request */
                                }

                                <div className="flex gap-2">
                                    <a
                                        href={doc.fileUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="px-3 py-1.5 text-xs font-medium rounded bg-zeno-cyan/20 text-zeno-cyan hover:bg-zeno-cyan/30 transition-colors"
                                    >
                                        View
                                    </a>
                                    <a
                                        href={doc.fileUrl}
                                        download={doc.fileName}
                                        className="px-3 py-1.5 text-xs font-medium rounded bg-white/10 text-white hover:bg-white/20 transition-colors"
                                    >
                                        Download
                                    </a>
                                    {isAdmin && doc.isAdminOnly && (
                                        <button
                                            onClick={() => openAccessModal(doc)}
                                            className="px-3 py-1.5 text-xs font-medium rounded bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors"
                                        >
                                            Manage Access
                                        </button>
                                    )}
                                    {(isAdmin || (doc.uploadedById === session?.user?.id)) && (
                                        <button
                                            onClick={() => handleDelete(doc.id)}
                                            disabled={!!reanalyzing}
                                            className="px-3 py-1.5 text-xs font-medium rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-50"
                                        >
                                            Delete
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* DHS records preview table */}
                            {isDhs && dhsRecords.length > 0 && (
                                <div className="mt-3 border-t border-rose-500/20 pt-3">
                                    <p className="text-xs text-rose-300 font-semibold mb-2">
                                        {dhsRecords.length} consumer record{dhsRecords.length !== 1 ? 's' : ''} extracted
                                    </p>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs text-left">
                                            <thead>
                                                <tr className="text-gray-500 border-b border-white/5">
                                                    <th className="pb-1 pr-3 font-medium">NCR Ref</th>
                                                    <th className="pb-1 pr-3 font-medium">Name</th>
                                                    <th className="pb-1 pr-3 font-medium">RSA ID</th>
                                                    <th className="pb-1 pr-3 font-medium">Status</th>
                                                    <th className="pb-1 pr-3 font-medium">Action</th>
                                                    <th className="pb-1 font-medium">Flag</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {dhsRecords.slice(0, 10).map((rec: any, i: number) => (
                                                    <tr key={i} className="border-b border-white/5 last:border-0">
                                                        <td className="py-1 pr-3 text-gray-300">{rec.ncr_ref}</td>
                                                        <td className="py-1 pr-3 text-white">{rec.surname}, {rec.first_name}</td>
                                                        <td className="py-1 pr-3 text-gray-400 font-mono">{rec.rsa_id}</td>
                                                        <td className="py-1 pr-3">
                                                            <span className="px-1.5 py-0.5 rounded bg-white/10 text-gray-300">{rec.status_code}</span>
                                                        </td>
                                                        <td className="py-1 pr-3">
                                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${rec.action === 'create' ? 'bg-green-500/20 text-green-300' : 'bg-amber-500/20 text-amber-300'}`}>
                                                                {rec.action}
                                                            </span>
                                                        </td>
                                                        <td className="py-1 text-rose-400 text-[10px]">{rec.flag ?? '—'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        {dhsRecords.length > 10 && (
                                            <p className="text-xs text-gray-500 mt-1 italic">
                                                …and {dhsRecords.length - 10} more records
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* Access Management Modal */}
            {accessModal && isAdmin && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-zeno-navy border border-white/10 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h2 className="text-white font-semibold text-base">🔒 Manage Access</h2>
                                <p className="text-gray-400 text-xs mt-0.5 truncate max-w-xs">{accessModal.doc.fileName}</p>
                            </div>
                            <button
                                onClick={() => setAccessModal(null)}
                                className="text-gray-400 hover:text-white transition-colors text-lg leading-none"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Currently granted users */}
                        <div className="mb-4">
                            <p className="text-xs font-medium text-gray-400 uppercase mb-2">Users with access</p>
                            {(accessModal.doc.accessGrants ?? []).length === 0 ? (
                                <p className="text-xs text-gray-500 italic">No one has been granted access yet.</p>
                            ) : (
                                <ul className="space-y-2">
                                    {(accessModal.doc.accessGrants ?? []).map((grant) => (
                                        <li key={grant.userId} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2">
                                            <div>
                                                <p className="text-sm text-white">{grant.user.firstName} {grant.user.lastName}</p>
                                                <p className="text-xs text-gray-400">{grant.user.email}</p>
                                            </div>
                                            <button
                                                onClick={() => handleRevokeAccess(accessModal.doc.id, grant.userId)}
                                                disabled={accessLoading}
                                                className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-50"
                                            >
                                                Revoke
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        {/* Grant access to another user */}
                        <div>
                            <p className="text-xs font-medium text-gray-400 uppercase mb-2">Grant access to a user</p>
                            {accessLoading ? (
                                <p className="text-xs text-gray-500 italic">Loading users...</p>
                            ) : (
                                <div className="flex gap-2">
                                    <select
                                        value={accessEmail}
                                        onChange={(e) => setAccessEmail(e.target.value)}
                                        className="flex-1 px-3 py-2 bg-zeno-gray border border-white/20 rounded-lg text-white text-sm [color-scheme:dark] [&>option]:bg-zeno-navy [&>option]:text-white"
                                    >
                                        <option value="">Select a user...</option>
                                        {allUsers
                                            .filter(u => !(accessModal.doc.accessGrants ?? []).some(g => g.userId === u.id))
                                            .map(u => (
                                                <option key={u.id} value={u.id}>
                                                    {u.firstName} {u.lastName} ({u.email})
                                                </option>
                                            ))}
                                    </select>
                                    <button
                                        onClick={() => {
                                            if (accessEmail) handleGrantAccess(accessModal.doc.id, accessEmail);
                                        }}
                                        disabled={!accessEmail || accessLoading}
                                        className="px-4 py-2 text-sm font-medium rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors disabled:opacity-40"
                                    >
                                        Grant
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

