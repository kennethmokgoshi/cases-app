'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { PDFDocument } from 'pdf-lib';

// Client-side logger
const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    debug: (...args: any[]) => console.debug('[DEBUG]', ...args)
};

type CaseDetail = {
    id: string;
    fileNumber: string;
    status: string;
    createdAt: string;
    client: {
        firstName: string;
        lastName: string;
        idNumber: string;
        phone: string;
        email: string | null;
    };
    services: string | null;
    partnerName: string | null;
    partnerBranch: string | null;
    acquisitionType: string;
};

type Comment = {
    id: string;
    content: string;
    createdAt: string;
    user: {
        firstName: string;
        lastName: string;
    };
};

type Document = {
    id: string;
    type: string;
    fileName: string;
    fileUrl: string;
    uploadedAt: string;
    uploadedById?: string | null;
};

type WorkflowLog = {
    id: string;
    fromStatus: string | null;
    toStatus: string;
    timestamp: string;
    notes: string | null;
    user: {
        firstName: string;
        lastName: string;
    } | null;
};

export function CaseDetailContent({ caseId }: { caseId: string }) {
    const router = useRouter();
    const { data: session } = useSession();
    const [caseData, setCaseData] = useState<CaseDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'workflow' | 'comments' | 'documents'>('workflow');

    // Comments state
    const [comments, setComments] = useState<Comment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [postingComment, setPostingComment] = useState(false);

    // Documents state
    const [documents, setDocuments] = useState<Document[]>([]);
    const [uploadingDoc, setUploadingDoc] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [docType, setDocType] = useState('OTHER');
    const [isShrinking, setIsShrinking] = useState(false);
    const [pendingPart2, setPendingPart2] = useState<File | null>(null);

    // Workflow state
    const [workflowLogs, setWorkflowLogs] = useState<WorkflowLog[]>([]);

    useEffect(() => {
        if (!session) return;
        fetchCase();
        fetchComments();
        fetchDocuments();
        fetchWorkflowLogs();
    }, [session, caseId]);

    const fetchCase = async () => {
        try {
            const response = await fetch(`/api/cases/${caseId}`);
            if (!response.ok) {
                if (response.status === 404) {
                    setError('Case not found');
                } else if (response.status === 403) {
                    setError('You do not have access to this case');
                } else {
                    setError('Failed to load case');
                }
                setLoading(false);
                return;
            }
            const data = await response.json();
            setCaseData(data);
        } catch (err) {
            setError('An error occurred while loading the case');
        } finally {
            setLoading(false);
        }
    };

    const fetchComments = async () => {
        try {
            const response = await fetch(`/api/cases/${caseId}/comments`);
            if (response.ok) {
                const data = await response.json();
                setComments(data.comments || data || []);
            }
        } catch (err) {
            logger.error('Failed to fetch comments:', err);
        }
    };

    const fetchDocuments = async () => {
        try {
            const response = await fetch(`/api/cases/${caseId}/documents`);
            if (response.ok) {
                const data = await response.json();
                setDocuments(data.documents || []);
            }
        } catch (err) {
            logger.error('Failed to fetch documents:', err);
        }
    };

    const fetchWorkflowLogs = async () => {
        try {
            const response = await fetch(`/api/cases/${caseId}/workflow-logs`);
            if (response.ok) {
                const data = await response.json();
                setWorkflowLogs(data.workflowLogs || data || []);
            }
        } catch (err) {
            logger.error('Failed to fetch workflow logs:', err);
        }
    };

    const handlePostComment = async () => {
        if (!newComment.trim()) return;

        setPostingComment(true);
        try {
            const response = await fetch(`/api/cases/${caseId}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: newComment }) });

            if (response.ok) {
                setNewComment('');
                fetchComments();
            } else {
                alert('Failed to post comment');
            }
        } catch (err) {
            logger.error('Error posting comment:', err);
            alert('Error posting comment');
        } finally {
            setPostingComment(false);
        }
    };

    const handleFileUpload = async () => {
        if (!selectedFile) {
            alert('Please select a file');
            return;
        }

        setUploadingDoc(true);
        try {
            logger.info(`[UPLOAD] Starting upload: ${selectedFile.name} (${selectedFile.size} bytes)`);
            const formData = new FormData();
            formData.append('file', selectedFile);
            formData.append('type', docType);
            formData.append('caseId', caseId);

            const response = await fetch(`/api/cases/${caseId}/documents`, {
                method: 'POST',
                body: formData,
                // Removed keepalive: true as it limits payload size to 64KB in browsers
            });

            if (response.ok) {
                setError(null);

                // Auto-queue Part 2 if it exists
                if (pendingPart2) {
                    setSelectedFile(pendingPart2);
                    setPendingPart2(null);
                    alert('Part 1 uploaded! I have automatically selected PART 2 for you. Click Upload again.');
                } else {
                    setSelectedFile(null);
                    alert('Document uploaded successfully');
                }

                setDocType('OTHER');
                fetchDocuments();
            } else {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.details || errorData.error || 'Failed to upload document';
                alert(`Upload failed: ${errorMessage}`);
            }
        } catch (err: any) {
            logger.error('Error uploading document:', err);
            const msg = err.message || String(err);
            alert(`Error uploading document: ${msg}\n\nTechnical details: ${msg.includes('fetch') ? 'The connection was dropped or blocked. Try a smaller file or splitting it.' : msg}`);
        } finally {
            setUploadingDoc(false);
        }
    };

    const handleDeleteDocument = async (documentId: string, fileName: string) => {
        if (!confirm(`Are you sure you want to delete "${fileName}"? This action cannot be undone.`)) {
            return;
        }

        try {
            const response = await fetch(`/api/cases/${caseId}/documents?documentId=${documentId}`, {
                method: 'DELETE' });

            if (response.ok) {
                fetchDocuments();
                alert('Document deleted successfully');
            } else {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.details || errorData.error || 'Failed to delete document';
                alert(`Delete failed: ${errorMessage}`);
            }
        } catch (err) {
            logger.error('Error deleting document:', err);
            alert('Error deleting document');
        }
    };

    const handleShrinkPDF = async () => {
        if (!selectedFile || selectedFile.type !== 'application/pdf') return;

        setIsShrinking(true);
        try {
            logger.info(`[SHRINK] Starting compression for ${selectedFile.name}...`);
            const arrayBuffer = await selectedFile.arrayBuffer();
            const pdfDoc = await PDFDocument.load(arrayBuffer);

            // Re-saving with useObjectStreams often significantly reduces size
            const compressedBytes = await pdfDoc.save({
                useObjectStreams: true,
                addDefaultPage: false
            });

            const shrunkFile = new File([compressedBytes as any], selectedFile.name, { type: 'application/pdf' });

            const savedPct = Math.round(((selectedFile.size - shrunkFile.size) / selectedFile.size) * 100);
            logger.info(`[SHRINK] Success! New size: ${shrunkFile.size} bytes (Saved ${savedPct}%)`);

            setSelectedFile(shrunkFile);
            alert(`PDF Shrunk! Saved ${savedPct}% (${(selectedFile.size / 1024 / 1024).toFixed(1)}MB -> ${(shrunkFile.size / 1024 / 1024).toFixed(1)}MB)`);
        } catch (err) {
            logger.error('Error shrinking PDF:', err);
            alert('Failed to shrink PDF. This file might be protected or too complex.');
        } finally {
            setIsShrinking(false);
        }
    };

    const handleSplitPDF = async () => {
        if (!selectedFile || selectedFile.type !== 'application/pdf') return;

        setIsShrinking(true);
        try {
            logger.info(`[SPLIT] Starting split for ${selectedFile.name}...`);
            const arrayBuffer = await selectedFile.arrayBuffer();
            const pdfDoc = await PDFDocument.load(arrayBuffer);
            const pageCount = pdfDoc.getPageCount();

            if (pageCount < 2) {
                alert("This PDF only has 1 page and cannot be split.");
                return;
            }

            const midPoint = Math.ceil(pageCount / 2);

            // Part 1
            const part1Doc = await PDFDocument.create();
            const part1Pages = await part1Doc.copyPages(pdfDoc, Array.from({ length: midPoint }, (_, i) => i));
            part1Pages.forEach(p => part1Doc.addPage(p));
            const part1Bytes = await part1Doc.save();

            // Part 2
            const part2Doc = await PDFDocument.create();
            const part2Pages = await part2Doc.copyPages(pdfDoc, Array.from({ length: pageCount - midPoint }, (_, i) => i + midPoint));
            part2Pages.forEach(p => part2Doc.addPage(p));
            const part2Bytes = await part2Doc.save();

            // Create the new files
            const baseName = selectedFile.name.replace('.pdf', '');
            const file1 = new File([part1Bytes as any], `${baseName}_PART_1.pdf`, { type: 'application/pdf' });
            const file2 = new File([part2Bytes as any], `${baseName}_PART_2.pdf`, { type: 'application/pdf' });

            setSelectedFile(file1);
            setPendingPart2(file2);
            alert(`PDF Split in half! I've loaded PART 1 for you. Once you upload it, I will automatically load PART 2.`);

        } catch (err) {
            logger.error('Error splitting PDF:', err);
            alert('Failed to split PDF. The file might be protected.');
        } finally {
            setIsShrinking(false);
        }
    };

    const getStatusColor = (status: string) => {
        const statusColors: { [key: string]: string } = {
            'NEW_LEAD': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
            'OUTSTANDING_DOCUMENTS': 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
            'DOCUMENTS_RECEIVED': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
            'IN_PROGRESS': 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
            'COMPLETED': 'bg-green-500/10 text-green-400 border-green-500/20' };
        return statusColors[status] || 'bg-gray-500/10 text-gray-400 border-gray-500/20';
    };

    const formatStatus = (status: string) => {
        return status.split('_').map(word => word.charAt(0) + word.slice(1).toLowerCase()).join(' ');
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-zeno-dark p-6">
                <div className="max-w-6xl mx-auto">
                    <div className="flex items-center justify-center h-64">
                        <div className="text-white text-xl">Loading case details...</div>
                    </div>
                </div>
            </div>
        );
    }

    if (error || !caseData) {
        return (
            <div className="min-h-screen bg-zeno-dark p-6">
                <div className="max-w-6xl mx-auto">
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
                        <h2 className="text-xl font-bold text-red-400 mb-4">⚠️ {error || 'Case not found'}</h2>
                        <Link
                            href="/b2b-dashboard/cases"
                            className="inline-block px-6 py-2 bg-zeno-cyan hover:bg-zeno-cyan/80 text-white rounded-lg transition-colors"
                        >
                            ← Back to Cases
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    const services = caseData.services ? JSON.parse(caseData.services) : [];

    return (
        <div className="min-h-screen bg-zeno-dark p-6">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="mb-6">
                    <Link
                        href="/b2b-dashboard/cases"
                        className="inline-flex items-center text-zeno-cyan hover:text-zeno-cyan/80 transition-colors mb-4"
                    >
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Back to Cases
                    </Link>

                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-bold text-white mb-2">{caseData.fileNumber}</h1>
                            <p className="text-gray-400">Case Details</p>
                        </div>
                        <div className={`px-4 py-2 rounded-lg border ${getStatusColor(caseData.status)}`}>
                            {formatStatus(caseData.status)}
                        </div>
                    </div>
                </div>

                {/* Case Information */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    {/* Client Information */}
                    <div className="bg-zeno-gray border border-white/10 rounded-xl p-6">
                        <h2 className="text-xl font-bold text-white mb-4 flex items-center">
                            <svg className="w-6 h-6 mr-2 text-zeno-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            Client Information
                        </h2>
                        <div className="space-y-3">
                            <div>
                                <label className="text-sm text-gray-400">Full Name</label>
                                <p className="text-white font-medium">{caseData.client.firstName} {caseData.client.lastName}</p>
                            </div>
                            <div>
                                <label className="text-sm text-gray-400">ID Number</label>
                                <p className="text-white font-medium">{caseData.client.idNumber}</p>
                            </div>
                            <div>
                                <label className="text-sm text-gray-400">Phone</label>
                                <p className="text-white font-medium">{caseData.client.phone}</p>
                            </div>
                            {caseData.client.email && (
                                <div>
                                    <label className="text-sm text-gray-400">Email</label>
                                    <p className="text-white font-medium">{caseData.client.email}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Case Information */}
                    <div className="bg-zeno-gray border border-white/10 rounded-xl p-6">
                        <h2 className="text-xl font-bold text-white mb-4 flex items-center">
                            <svg className="w-6 h-6 mr-2 text-zeno-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Case Information
                        </h2>
                        <div className="space-y-3">
                            <div>
                                <label className="text-sm text-gray-400">File Number</label>
                                <p className="text-white font-medium">{caseData.fileNumber}</p>
                            </div>
                            <div>
                                <label className="text-sm text-gray-400">Acquisition Type</label>
                                <p className="text-white font-medium">{caseData.acquisitionType}</p>
                            </div>
                            {caseData.partnerName && (
                                <div>
                                    <label className="text-sm text-gray-400">Partner</label>
                                    <p className="text-white font-medium">{caseData.partnerName}</p>
                                </div>
                            )}
                            {caseData.partnerBranch && (
                                <div>
                                    <label className="text-sm text-gray-400">Branch</label>
                                    <p className="text-white font-medium">{caseData.partnerBranch}</p>
                                </div>
                            )}
                            <div>
                                <label className="text-sm text-gray-400">Created</label>
                                <p className="text-white font-medium">{new Date(caseData.createdAt).toLocaleDateString()}</p>
                            </div>
                        </div>
                    </div>

                    {/* Services */}
                    {services.length > 0 && (
                        <div className="bg-zeno-gray border border-white/10 rounded-xl p-6 lg:col-span-2">
                            <h2 className="text-xl font-bold text-white mb-4 flex items-center">
                                <svg className="w-6 h-6 mr-2 text-zeno-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                                </svg>
                                Requested Services
                            </h2>
                            <div className="flex flex-wrap gap-2">
                                {services.map((service: string, index: number) => (
                                    <span
                                        key={index}
                                        className="px-3 py-1 bg-zeno-cyan/10 text-zeno-cyan border border-zeno-cyan/20 rounded-lg text-sm"
                                    >
                                        {service.split('_').map(word => word.charAt(0) + word.slice(1).toLowerCase()).join(' ')}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Tabs Section */}
                <div className="bg-zeno-gray border border-white/10 rounded-xl overflow-hidden">
                    {/* Tab Headers */}
                    <div className="flex border-b border-white/10">
                        <button
                            onClick={() => setActiveTab('workflow')}
                            className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${activeTab === 'workflow'
                                ? 'bg-zeno-cyan/10 text-zeno-cyan border-b-2 border-zeno-cyan'
                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                                }`}
                        >
                            📋 Workflow Status
                        </button>
                        <button
                            onClick={() => setActiveTab('comments')}
                            className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${activeTab === 'comments'
                                ? 'bg-zeno-cyan/10 text-zeno-cyan border-b-2 border-zeno-cyan'
                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                                }`}
                        >
                            💬 Activity & Comments
                        </button>
                        <button
                            onClick={() => setActiveTab('documents')}
                            className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${activeTab === 'documents'
                                ? 'bg-zeno-cyan/10 text-zeno-cyan border-b-2 border-zeno-cyan'
                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                                }`}
                        >
                            📁 Documents
                        </button>
                    </div>

                    {/* Tab Content */}
                    <div className="p-6">
                        {/* Workflow Tab */}
                        {activeTab === 'workflow' && (
                            <div className="space-y-4">
                                {workflowLogs.length === 0 ? (
                                    <p className="text-gray-400 text-center py-8">No workflow history yet</p>
                                ) : (
                                    workflowLogs.map((log) => (
                                        <div key={log.id} className="flex items-start gap-4 pb-4 border-b border-white/10 last:border-0">
                                            <div className="w-10 h-10 rounded-full bg-zeno-cyan/10 flex items-center justify-center flex-shrink-0">
                                                <svg className="w-5 h-5 text-zeno-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                                </svg>
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex items-center justify-between mb-1">
                                                    <p className="text-white font-medium">
                                                        {log.fromStatus ? `${formatStatus(log.fromStatus)} → ` : ''}
                                                        <span className="text-zeno-cyan">{formatStatus(log.toStatus)}</span>
                                                    </p>
                                                    <span className="text-sm text-gray-400">
                                                        {new Date(log.timestamp).toLocaleString()}
                                                    </span>
                                                </div>
                                                {log.user && (
                                                    <p className="text-sm text-gray-400">
                                                        by {log.user.firstName} {log.user.lastName}
                                                    </p>
                                                )}
                                                {log.notes && (
                                                    <p className="text-sm text-gray-300 mt-2">{log.notes}</p>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {/* Comments Tab */}
                        {activeTab === 'comments' && (
                            <div className="space-y-6">
                                {/* Comment Input */}
                                <div className="bg-black/20 rounded-lg p-4">
                                    <textarea
                                        value={newComment}
                                        onChange={(e) => setNewComment(e.target.value)}
                                        placeholder="Add a comment... Use @name to mention someone"
                                        className="w-full bg-transparent text-white border border-white/10 rounded-lg p-3 focus:outline-none focus:border-zeno-cyan min-h-[100px]"
                                    />
                                    <div className="flex justify-between items-center mt-3">
                                        <p className="text-sm text-gray-400">Tip: Use @name to mention and notify someone</p>
                                        <button
                                            onClick={handlePostComment}
                                            disabled={postingComment || !newComment.trim()}
                                            className="px-6 py-2 bg-zeno-cyan hover:bg-zeno-cyan/80 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                                        >
                                            {postingComment ? 'Posting...' : 'Post Comment'}
                                        </button>
                                    </div>
                                </div>

                                {/* Comments List */}
                                <div className="space-y-4">
                                    {comments.length === 0 ? (
                                        <p className="text-gray-400 text-center py-8">No comments yet. Be the first to comment!</p>
                                    ) : (
                                        comments.map((comment) => (
                                            <div key={comment.id} className="flex items-start gap-4 pb-4 border-b border-white/10 last:border-0">
                                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-zeno-cyan to-cyan-600 flex items-center justify-center flex-shrink-0">
                                                    <span className="text-white font-bold text-sm">
                                                        {comment.user.firstName[0]}{comment.user.lastName[0]}
                                                    </span>
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <p className="text-white font-medium">
                                                            {comment.user.firstName} {comment.user.lastName}
                                                        </p>
                                                        <span className="text-sm text-gray-400">
                                                            {new Date(comment.createdAt).toLocaleString()}
                                                        </span>
                                                    </div>
                                                    <p className="text-gray-300">{comment.content}</p>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Documents Tab */}
                        {activeTab === 'documents' && (
                            <div className="space-y-6">
                                {/* Upload Section */}
                                <div className="bg-black/20 rounded-lg p-4">
                                    <h3 className="text-white font-medium mb-4">Upload Document</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <select
                                            value={docType}
                                            onChange={(e) => setDocType(e.target.value)}
                                            className="bg-zeno-gray border border-white/10 text-white rounded-lg p-3 focus:outline-none focus:border-zeno-cyan [color-scheme:dark] [&>option]:bg-zeno-dark [&>option]:text-white"
                                        >
                                            <option value="ID" className="bg-zeno-dark text-white">ID Copy</option>
                                            <option value="POA" className="bg-zeno-dark text-white">Proof of Address</option>
                                            <option value="CREDIT_REPORT" className="bg-zeno-dark text-white">Credit Report</option>
                                            <option value="PAYSLIP" className="bg-zeno-dark text-white">Payslip</option>
                                            <option value="BANK_STATEMENT" className="bg-zeno-dark text-white">Bank Statement</option>
                                            <option value="OTHER" className="bg-zeno-dark text-white">Other Document</option>
                                        </select>
                                        <div className="relative">
                                            <input
                                                type="file"
                                                id="file-upload"
                                                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                                                className="hidden"
                                            />
                                            <label
                                                htmlFor="file-upload"
                                                className={`flex items-center justify-between w-full bg-zeno-navy border ${selectedFile ? 'border-zeno-cyan shadow-[0_0_10px_rgba(6,182,212,0.2)]' : 'border-white/10'} hover:border-zeno-cyan/50 text-white rounded-lg p-3 cursor-pointer transition-all group`}
                                            >
                                                <span className={`text-sm ${selectedFile ? 'text-white' : 'text-white/40'}`}>
                                                    {selectedFile ? `${selectedFile.name} (${(selectedFile.size / 1024 / 1024).toFixed(1)}MB)` : 'Select file...'}
                                                </span>
                                                <div className="px-3 py-1 bg-zeno-cyan text-white text-xs font-bold rounded-md group-hover:bg-zeno-cyan/80 transition-colors">
                                                    CHOOSE
                                                </div>
                                            </label>
                                        </div>

                                        {selectedFile && selectedFile.type === 'application/pdf' && selectedFile.size >= 10 * 1024 * 1024 && (
                                            <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
                                                <button
                                                    onClick={handleShrinkPDF}
                                                    disabled={isShrinking}
                                                    className="w-full py-2 bg-zeno-orange/20 hover:bg-zeno-orange/30 text-zeno-orange border border-zeno-orange/30 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2"
                                                >
                                                    {isShrinking ? 'Processing...' : 'Try Compress PDF'}
                                                </button>
                                                <button
                                                    onClick={handleSplitPDF}
                                                    disabled={isShrinking}
                                                    className="w-full py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2"
                                                >
                                                    {isShrinking ? 'Processing...' : 'Split into 2 Parts'}
                                                </button>
                                            </div>
                                        )}

                                        <button
                                            onClick={handleFileUpload}
                                            disabled={uploadingDoc || !selectedFile || isShrinking}
                                            className="px-6 py-3 bg-zeno-cyan hover:bg-zeno-cyan/80 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                                        >
                                            {uploadingDoc ? 'Uploading...' : 'Upload'}
                                        </button>
                                    </div>
                                </div>

                                {/* Documents List */}
                                <div className="space-y-3">
                                    <h3 className="text-white font-medium">Uploaded Documents</h3>
                                    {documents.length === 0 ? (
                                        <p className="text-gray-400 text-center py-8">No documents uploaded yet.</p>
                                    ) : (
                                        documents.map((doc) => (
                                            <div key={doc.id} className="flex items-center justify-between bg-black/20 rounded-lg p-4 hover:bg-black/30 transition-colors">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-lg bg-zeno-cyan/10 flex items-center justify-center">
                                                        <svg className="w-6 h-6 text-zeno-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                                        </svg>
                                                    </div>
                                                    <div>
                                                        <p className="text-white font-medium">{doc.fileName}</p>
                                                        <p className="text-sm text-gray-400">
                                                            {doc.type} • {new Date(doc.uploadedAt).toLocaleDateString()}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <a
                                                        href={doc.fileUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                        </svg>
                                                        View
                                                    </a>
                                                    <a
                                                        href={doc.fileUrl}
                                                        download
                                                        className="px-4 py-2 bg-zeno-cyan/10 hover:bg-zeno-cyan/20 text-zeno-cyan rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                                        </svg>
                                                        Download
                                                    </a>
                                                    {/* Delete button - only show for user's own uploads */}
                                                    {doc.uploadedById === session?.user?.id && (
                                                        <button
                                                            onClick={() => handleDeleteDocument(doc.id, doc.fileName)}
                                                            className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                            </svg>
                                                            Delete
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
