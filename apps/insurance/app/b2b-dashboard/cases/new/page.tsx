'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from '@zenowethu/ui';
import Link from 'next/link';
import { logger } from '@zenowethu/shared-lib/src/logger';

type Project = {
    id: string;
    name: string;
    type: string;
    clientType?: string | null;
    parent_id?: string | null;
    children?: Project[];
};

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const SERVICES = [
    { id: 'admin_order_removal', label: 'Administration Order Removal' },
    { id: 'admin_order_application', label: 'Administration Order Application' },
    { id: 'debt_review_flag_removal', label: 'Debt Review Flag Removal' },
    { id: 'debt_review_application', label: 'Debt Review Application' },
    { id: 'payment_profile_update', label: 'Payment Profile Update' },
    { id: 'paid_accounts_update', label: 'Paid Accounts Update' },
    { id: 'prescription_of_accounts', label: 'Prescription of Accounts' },
    { id: 'paid_judgments', label: 'Paid Judgments' },
    { id: 'paid_defaults', label: 'Paid Defaults' },
    { id: 'rescission_unpaid_judgments', label: 'Rescission of Not Paid Judgments' },
    { id: 'rescission_unpaid_defaults', label: 'Rescission of Not Paid Defaults' },
    { id: 'itc_clearance', label: 'ITC/Credit Bureau Clearance' },
    { id: 'blacklisting_removal', label: 'Blacklisting Removal' },
    { id: 'eao_removal', label: 'Emolument Attachment Order (EAO) Removal' },
    { id: 'garnishee_order_rescission', label: 'Garnishee Order Review/Rescission' },
    { id: 'fraudulent_account_disputes', label: 'Fraudulent Account Disputes' },
    { id: 'credit_report_disputes', label: 'Credit Report Disputes' },
    { id: 'section_88_certificate', label: 'Section 88 Certificate Application' },
    { id: 'sequestration_application', label: 'Sequestration Application' },
    { id: 'debt_consolidation', label: 'Debt Consolidation' },
    { id: 'ncr_complaint', label: 'NCR Complaint Lodging' },
    { id: 'consumer_tribunal', label: 'Consumer Tribunal Applications' },
];

export default function PartnerNewCasePage() {
    return (
        <Suspense fallback={<div className="text-white flex items-center justify-center min-h-screen">Loading...</div>}>
            <PartnerNewCaseComponent />
        </Suspense>
    );
}

function PartnerNewCaseComponent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { data: session, status } = useSession();
    const partnerIdParam = searchParams.get('partnerId');

    const [step, setStep] = useState(1); // 1=Project Selection, 2=Manual Entry & Upload
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [parentProjects, setParentProjects] = useState<Project[]>([]);

    // Step 1: Project Selection
    const currentYearVal = new Date().getFullYear();
    const currentMonthVal = new Date().toLocaleString('default', { month: 'long' });
    const years = Array.from({ length: currentYearVal - 1999 }, (_, i) => currentYearVal - i);

    const [selectedParentId, setSelectedParentId] = useState('');
    const [selectedSubprojectId, setSelectedSubprojectId] = useState('');
    const [selectedYear, setSelectedYear] = useState(String(currentYearVal));
    const [selectedMonth, setSelectedMonth] = useState(currentMonthVal);
    const [selectedServices, setSelectedServices] = useState<string[]>([]);
    const [finalProjectId, setFinalProjectId] = useState('');

    // Step 2: Manual Entry
    const [surname, setSurname] = useState('');
    const [fullNames, setFullNames] = useState('');
    const [idNumber, setIdNumber] = useState('');
    const [cellNumber, setCellNumber] = useState('');
    const [email, setEmail] = useState('');
    const [uploadMode, setUploadMode] = useState<'separate' | 'combined'>('separate');
    const [uploadedFiles, setUploadedFiles] = useState<{
        id?: File;
        poa?: File;
        creditReport?: File;
        allCombined?: File;
        optional: File[];
    }>({ optional: [] });

    // Duplicate Check State
    const [duplicateError, setDuplicateError] = useState<any | null>(null);
    const [prefixedIdInput, setPrefixedIdInput] = useState('');

    const isB2BPartner = session?.user?.userType === 'B2B_PARTNER';

    // Get available months
    const currentMonth = new Date().getMonth();
    const availableMonths = selectedYear === String(currentYearVal)
        ? MONTHS.slice(0, currentMonth + 1)
        : MONTHS;

    // Filter to show only partner's own project
    const filteredParentProjects = parentProjects.filter(p => {
        // Strict filtering only if the assigned partner ID is valid and present in the list
        if (isB2BPartner && session?.user?.b2bPartnerId) {
            const assignedProjectExists = parentProjects.some(proj => proj.id === session.user.b2bPartnerId);
            if (assignedProjectExists) {
                return p.id === session.user.b2bPartnerId;
            }
            // If assigned ID is not found (stale/invalid), fall through to show all available
        }
        return p.clientType === 'B2B' || !p.clientType;
    });

    const selectedParent = parentProjects.find(p => p.id === selectedParentId);
    const subprojects = selectedParent?.children?.filter(c =>
        c.type === 'BRANCH' || c.type === 'FOLDER'
    ) || [];

    const getPartnerNameFromProject = (): string | null => {
        if (!selectedParent) return null;
        const name = selectedParent.name;
        if (name.toLowerCase().includes('letsatsi')) return 'Letsatsi Finance';
        if (name.toLowerCase().includes('shosholoza')) return 'Shosholoza Finance';
        if (name.toLowerCase().includes('future')) return 'Future Finance';
        return name;
    };

    const getBranchNameFromProject = (): string | null => {
        if (!selectedSubprojectId) return null;
        const branch = subprojects.find(s => s.id === selectedSubprojectId);
        return branch?.name || null;
    };

    useEffect(() => {
        if (status === 'loading') return;

        async function fetchProjects() {
            setLoading(true);
            try {
                const res = await fetch(`/api/projects?type=ACQUISITION_SOURCE&flat=true&t=${new Date().getTime()}`, {
                    cache: 'no-store',
                    headers: { 'Pragma': 'no-cache' }
                });
                const data = await res.json();

                let uniqueProjects: Project[] = [];

                if (Array.isArray(data)) {
                    uniqueProjects = data;
                } else {
                    logger.info('API did not return an array, checking for hierarchy:', data);
                    if (data.independent) uniqueProjects = data.independent;
                    else if (data.hierarchy) uniqueProjects = [data.hierarchy];
                }

                logger.info('Fetched ACQUISITION_SOURCE projects:', uniqueProjects.length);

                // Sort alphabetically
                uniqueProjects.sort((a, b) => a.name.localeCompare(b.name));
                setParentProjects(uniqueProjects);

                // Auto-select logic
                if (partnerIdParam) {
                    const match = uniqueProjects.find(p => p.id === partnerIdParam);
                    if (match) {
                        setSelectedParentId(match.id);
                        return;
                    }
                }

                // If not via param, determine default based on session
                if (session?.user?.b2bPartnerId) {
                    const assigned = uniqueProjects.find(p => p.id === session.user.b2bPartnerId);
                    if (assigned) {
                        logger.info('Auto-selecting assigned partner:', assigned.name);
                        setSelectedParentId(assigned.id);
                    }
                } else if (uniqueProjects.length > 0) {
                    // Fallback to first B2B project if no assignment but we have items
                    const firstB2B = uniqueProjects.find(p => p.clientType === 'B2B');
                    if (firstB2B) setSelectedParentId(firstB2B.id);
                }
            } catch (error) {
                logger.error('Failed to fetch projects', error);
            } finally {
                setLoading(false);
            }
        }
        fetchProjects();
    }, [partnerIdParam, status, session?.user?.b2bPartnerId]);

    // Auto-select if there's only one option in the filtered list
    useEffect(() => {
        if (!selectedParentId && filteredParentProjects.length === 1) {
            setSelectedParentId(filteredParentProjects[0].id);
        }
    }, [filteredParentProjects, selectedParentId]);

    useEffect(() => {
        if (!selectedParentId) {
            setSelectedSubprojectId('');
            return;
        }

        const selectedParent = parentProjects.find(p => p.id === selectedParentId);
        const children = selectedParent?.children?.filter(c => c.type === 'BRANCH' || c.type === 'FOLDER') || [];

        if (children.length > 0) {
            setSelectedSubprojectId(children[0].id);
        } else {
            setSelectedSubprojectId('');
        }
    }, [selectedParentId, parentProjects]);

    const handleServiceToggle = (serviceId: string) => {
        setSelectedServices(prev =>
            prev.includes(serviceId)
                ? prev.filter(id => id !== serviceId)
                : [...prev, serviceId]
        );
    };

    const handleSelectAllServices = () => {
        if (selectedServices.length === SERVICES.length) {
            setSelectedServices([]);
        } else {
            setSelectedServices(SERVICES.map(s => s.id));
        }
    };

    const handleContinueToForm = async () => {
        if (!selectedParentId || !selectedYear || !selectedMonth) {
            alert('Please select Main Source, Year, and Month');
            return;
        }

        if (selectedServices.length === 0) {
            alert('Please select at least one service');
            return;
        }

        setSubmitting(true);

        try {
            // Create project path
            const baseProjectId = selectedSubprojectId || selectedParentId;

            const yearRes = await fetch('/api/projects/ensure-path', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    parentId: baseProjectId,
                    name: selectedYear,
                    type: 'YEAR'
                }) });
            if (!yearRes.ok) throw new Error('Failed to create year project');
            const yearProject = await yearRes.json();

            const monthRes = await fetch('/api/projects/ensure-path', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    parentId: yearProject.id,
                    name: selectedMonth,
                    type: 'MONTH'
                }) });
            if (!monthRes.ok) throw new Error('Failed to create month project');
            const monthProject = await monthRes.json();

            setFinalProjectId(monthProject.id);
            setStep(2);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (error) {
            logger.error('Error creating project path:', error);
            alert('Failed to create project structure. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleFileChange = (type: 'id' | 'poa' | 'creditReport' | 'allCombined' | 'optional', file: File | null) => {
        if (type === 'optional' && file) {
            setUploadedFiles(prev => ({
                ...prev,
                optional: [...prev.optional, file]
            }));
        } else if (file) {
            setUploadedFiles(prev => ({ ...prev, [type]: file }));
        }
    };

    const handleCreateCase = async () => {
        // Validate required fields (phone and email are now optional)
        if (!surname || !fullNames || !idNumber) {
            alert('Please fill in Surname, Full Names, and ID Number');
            return;
        }

        // Validate ID Number: Must be exactly 13 digits
        const idNumberClean = idNumber.replace(/\D/g, ''); // Remove non-digits
        if (idNumberClean.length !== 13) {
            alert('❌ Invalid ID Number\n\nSouth African ID numbers must be exactly 13 digits.\n\nYou entered: ' + idNumberClean.length + ' digits');
            return;
        }

        // Validate Cell Number format (if provided)
        if (cellNumber && cellNumber.trim() !== '') {
            const cellNumberClean = cellNumber.replace(/[\s\-()]/g, ''); // Remove spaces, dashes, brackets
            const isInternational = cellNumberClean.startsWith('+27');
            const digitsOnly = cellNumberClean.replace(/\D/g, '');

            if (isInternational) {
                // International format: +27 followed by 9 digits = 12 characters total
                if (cellNumberClean.length !== 12 || digitsOnly.length !== 11) {
                    alert('❌ Invalid Cell Number\n\nInternational format must be: +27XXXXXXXXX (12 characters)\n\nExample: +27823456789');
                    return;
                }
            } else {
                // Local format: Must be exactly 10 digits
                if (digitsOnly.length !== 10) {
                    alert('❌ Invalid Cell Number\n\nLocal format must be 10 digits.\n\nExample: 0823456789\n\nYou entered: ' + digitsOnly.length + ' digits');
                    return;
                }
            }
        }

        // Validate Email format (if provided)
        if (email && email.trim() !== '') {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                alert('❌ Invalid Email Address\n\nPlease enter a valid email address.\n\nExample: name@example.com');
                return;
            }
        }

        // Documents are optional - partners can upload later
        // No document validation needed

        setSubmitting(true);

        try {
            // Create case (API will set status to NEW_LEAD automatically)
            const caseResponse = await fetch('/api/cases', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client: {
                        firstName: fullNames,
                        lastName: surname,
                        idNumber: idNumber,
                        phone: cellNumber, // API expects 'phone' not 'cellNumber'
                        email: email || null },
                    projectId: finalProjectId,
                    acquisitionType: 'B2B',
                    partnerName: getPartnerNameFromProject(),
                    partnerBranch: getBranchNameFromProject(),
                    partnerSplitPercent: 50,
                    services: selectedServices, // API expects services array
                }) });

            if (!caseResponse.ok) {
                const errorData = await caseResponse.json();

                // Check if it's a duplicate ID error (409 Conflict)
                if (caseResponse.status === 409 && errorData.code === 'DUPLICATE_ID_NUMBER' && errorData.allowPrefixedId) {
                    // Show the duplicate modal with prefixed ID option
                    setDuplicateError(errorData);
                    setPrefixedIdInput(errorData.suggestedIdNumber || '');
                    setSubmitting(false);
                    return;
                } else if (caseResponse.status === 409) {
                    // Other duplicate errors (phone, email)
                    const fieldName = errorData.field === 'idNumber' ? 'ID Number'
                        : errorData.field === 'phone' ? 'Cell Number'
                            : errorData.field === 'email' ? 'Email Address'
                                : 'Field';

                    alert(`❌ ${errorData.error}\n\n${errorData.message}\n\nPlease use a different ${fieldName}.`);
                } else {
                    alert(`Failed to create case: ${errorData.error || errorData.message || 'Unknown error'}`);
                }

                setSubmitting(false);
                return;
            }

            const caseData = await caseResponse.json();

            // Handle document uploads if present
            const hasFiles = uploadMode === 'combined'
                ? uploadedFiles.allCombined
                : (uploadedFiles.id || uploadedFiles.poa || uploadedFiles.creditReport || uploadedFiles.optional.length > 0);

            if (hasFiles) {
                const formData = new FormData();
                formData.append('caseId', caseData.id);
                formData.append('skipAnalysis', 'true'); // Instant creation - skip AI extraction
                if (session?.user?.b2bPartnerId) {
                    formData.append('partnerId', session.user.b2bPartnerId);
                }

                if (uploadMode === 'combined' && uploadedFiles.allCombined) {
                    formData.append('files', uploadedFiles.allCombined);
                    formData.append('combined', 'true');
                } else {
                    if (uploadedFiles.id) formData.append('file_ID', uploadedFiles.id);
                    if (uploadedFiles.poa) formData.append('file_POA', uploadedFiles.poa);
                    if (uploadedFiles.creditReport) formData.append('file_CREDIT_REPORT', uploadedFiles.creditReport);
                    uploadedFiles.optional.forEach(file => formData.append('files', file));
                }

                try {
                    const uploadRes = await fetch('/api/documents/upload', {
                        method: 'POST',
                        body: formData });

                    if (!uploadRes.ok) {
                        const err = await uploadRes.json();
                        logger.error('Document upload failed:', err);
                        // We still created the case, so we report the error but might still redirect
                        alert('Case created successfully, but document upload failed: ' + (err.error || 'Unknown error'));
                    } else {
                        logger.info('✅ Documents uploaded successfully');
                    }
                } catch (uploadError) {
                    logger.error('Upload Error:', uploadError);
                    alert('Case created successfully, but an error occurred during document upload.');
                }
            }

            // SUCCESS! Redirect
            router.push('/b2b-dashboard?success=lead_created');
        } catch (error) {
            logger.error('Case creation error:', error);
            alert(`Failed to create lead: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return <div className="text-white flex items-center justify-center min-h-screen">Loading...</div>;
    }

    return (
        <div className="max-w-4xl mx-auto">
            <div className="mb-8">
                <Link href="/b2b-dashboard" className="text-zeno-cyan hover:text-cyan-300 text-sm mb-4 inline-block">
                    ← Back to Cases
                </Link>
                <h1 className="text-3xl font-bold text-white mb-2">Add Partner Case</h1>
                <p className="text-gray-400">Quick lead submission - under 10 seconds</p>
            </div>

            {/* Step Indicators */}
            <div className="flex items-center gap-4 mb-8">
                <div className={`flex items-center gap-3 ${step === 1 ? 'opacity-100' : 'opacity-50'}`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${step === 1 ? 'bg-zeno-cyan text-zeno-navy' : 'bg-gray-700 text-gray-400'} font-bold`}>
                        1
                    </div>
                    <span className="text-white font-medium">Select Period & Source</span>
                </div>
                <div className="flex-1 h-0.5 bg-gray-700"></div>
                <div className={`flex items-center gap-3 ${step === 2 ? 'opacity-100' : 'opacity-50'}`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${step === 2 ? 'bg-zeno-cyan text-zeno-navy' : 'bg-gray-700 text-gray-400'} font-bold`}>
                        2
                    </div>
                    <span className="text-white font-medium">Enter Details & Upload</span>
                </div>
            </div>

            {/* STEP 1: Project Selection */}
            {step === 1 && (
                <div className="space-y-6">
                    <div className="bg-zeno-gray border border-white/10 rounded-xl p-6">
                        <h2 className="text-xl font-bold text-white mb-6">Case Details</h2>

                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    1. Year <span className="text-red-400">*</span>
                                </label>
                                <select
                                    value={selectedYear}
                                    onChange={(e) => setSelectedYear(e.target.value)}
                                    className="w-full bg-zeno-navy border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-zeno-cyan [color-scheme:dark] [&>option]:bg-zeno-dark [&>option]:text-white"
                                >
                                    {years.map(year => (
                                        <option key={year} value={year} className="bg-zeno-dark text-white">{year}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    2. Month <span className="text-red-400">*</span>
                                </label>
                                <select
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(e.target.value)}
                                    className="w-full bg-zeno-navy border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-zeno-cyan [color-scheme:dark] [&>option]:bg-zeno-dark [&>option]:text-white"
                                >
                                    {availableMonths.map(month => (
                                        <option key={month} value={month} className="bg-zeno-dark text-white">{month}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="mb-6 p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-lg">
                            <h3 className="text-indigo-300 font-bold mb-1">B2B Partner Case</h3>
                            <p className="text-indigo-200/80 text-sm">No R350 registration fee required</p>
                        </div>

                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                3. Main Source <span className="text-red-400">*</span>
                            </label>
                            <select
                                value={selectedParentId}
                                onChange={(e) => setSelectedParentId(e.target.value)}
                                className="w-full bg-zeno-navy border border-zeno-cyan/50 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-zeno-cyan [color-scheme:dark] [&>option]:bg-zeno-dark [&>option]:text-white"
                            >
                                <option value="" className="bg-zeno-dark text-white">Choose partner source...</option>
                                {filteredParentProjects.map(project => (
                                    <option key={project.id} value={project.id} className="bg-zeno-dark text-white">
                                        {project.name} {project.clientType && `(${project.clientType})`}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {selectedParentId && subprojects.length > 0 && (
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    4. Branch/Subproject <span className="text-gray-500">(Optional)</span>
                                </label>
                                <select
                                    value={selectedSubprojectId}
                                    onChange={(e) => setSelectedSubprojectId(e.target.value)}
                                    className="w-full bg-zeno-navy border border-zeno-cyan/50 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-zeno-cyan [color-scheme:dark] [&>option]:bg-zeno-dark [&>option]:text-white"
                                >
                                    <option value="" className="bg-zeno-dark text-white">No subproject (use main source)</option>
                                    {subprojects.map(sub => (
                                        <option key={sub.id} value={sub.id} className="bg-zeno-dark text-white">{sub.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div>
                            <div className="flex justify-between items-center mb-3">
                                <label className="block text-sm font-medium text-gray-300">
                                    6. Services Required <span className="text-red-400">*</span>
                                </label>
                                <button
                                    onClick={handleSelectAllServices}
                                    className="text-xs text-zeno-cyan hover:text-cyan-300"
                                >
                                    {selectedServices.length === SERVICES.length ? 'Deselect All' : 'Select All'}
                                </button>
                            </div>
                            <div className="grid grid-cols-2 gap-3 max-h-64 overflow-y-auto p-2 bg-zeno-navy/50 rounded-lg">
                                {SERVICES.map(service => (
                                    <label key={service.id} className="flex items-center gap-2 cursor-pointer hover:bg-white/5 p-2 rounded">
                                        <input
                                            type="checkbox"
                                            checked={selectedServices.includes(service.id)}
                                            onChange={() => handleServiceToggle(service.id)}
                                            className="w-4 h-4 rounded border-gray-500 text-zeno-cyan focus:ring-zeno-cyan"
                                        />
                                        <span className="text-sm text-gray-200">{service.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {selectedParentId && selectedServices.length > 0 && (
                            <div className="mt-6 p-4 bg-zeno-navy rounded-lg border border-zeno-cyan/30">
                                <p className="text-sm text-gray-400 mb-1">Case will be created under:</p>
                                <p className="text-zeno-cyan font-bold">
                                    {selectedYear} {selectedMonth} → {selectedParent?.name}
                                    {selectedSubprojectId && ` → ${subprojects.find(s => s.id === selectedSubprojectId)?.name}`}
                                </p>
                                <p className="text-sm text-gray-400 mt-2">Services: {selectedServices.length} selected</p>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end">
                        <button
                            onClick={handleContinueToForm}
                            disabled={!selectedParentId || !selectedYear || !selectedMonth || selectedServices.length === 0 || submitting}
                            className="bg-zeno-cyan hover:bg-cyan-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-zeno-navy font-bold px-8 py-3 rounded-lg transition-all"
                        >
                            {submitting ? 'Please wait...' : 'Continue to Upload Documents'}
                        </button>
                    </div>
                </div>
            )}

            {/* STEP 2: Manual Entry & Upload */}
            {step === 2 && (
                <div className="space-y-6">
                    <div className="bg-zeno-gray border border-white/10 rounded-xl p-6">
                        <h2 className="text-xl font-bold text-zeno-cyan mb-6">PERSONAL INFORMATION</h2>

                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Surname <span className="text-red-400">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={surname}
                                    onChange={(e) => setSurname(e.target.value)}
                                    className="w-full bg-zeno-navy border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-zeno-cyan"
                                    placeholder="Enter surname"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Full Names <span className="text-red-400">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={fullNames}
                                    onChange={(e) => setFullNames(e.target.value)}
                                    className="w-full bg-zeno-navy border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-zeno-cyan"
                                    placeholder="Enter full names"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4 mb-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    ID Number <span className="text-red-400">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={idNumber}
                                    onChange={(e) => setIdNumber(e.target.value)}
                                    maxLength={13}
                                    className={`w-full bg-zeno-navy border rounded-lg px-4 py-3 text-white focus:outline-none ${idNumber.replace(/\D/g, '').length === 13
                                        ? 'border-green-500 focus:border-green-400'
                                        : idNumber.length > 0
                                            ? 'border-red-500 focus:border-red-400'
                                            : 'border-white/20 focus:border-zeno-cyan'
                                        }`}
                                    placeholder="0000000000000"
                                />
                                <div className="flex justify-between items-center mt-1">
                                    <p className="text-xs text-gray-400">13 digits required</p>
                                    <p className={`text-xs ${idNumber.replace(/\D/g, '').length === 13
                                        ? 'text-green-400'
                                        : 'text-gray-500'
                                        }`}>
                                        {idNumber.replace(/\D/g, '').length}/13
                                    </p>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Cell Number
                                </label>
                                <input
                                    type="text"
                                    value={cellNumber}
                                    onChange={(e) => setCellNumber(e.target.value)}
                                    className={`w-full bg-zeno-navy border rounded-lg px-4 py-3 text-white focus:outline-none ${(() => {
                                        if (cellNumber.trim() === '') return 'border-white/20 focus:border-zeno-cyan';
                                        const clean = cellNumber.replace(/[\s\-()]/g, '');
                                        const digits = clean.replace(/\D/g, '');
                                        const isIntl = clean.startsWith('+27');
                                        const isValid = isIntl ? clean.length === 12 : digits.length === 10;
                                        return isValid
                                            ? 'border-green-500 focus:border-green-400'
                                            : 'border-red-500 focus:border-red-400';
                                    })()
                                        }`}
                                    placeholder="0823456789 or +27823456789"
                                />
                                <p className="text-xs text-gray-400 mt-1">Optional - 10 digits (local) or +27XXXXXXXXX (international)</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Email
                                </label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className={`w-full bg-zeno-navy border rounded-lg px-4 py-3 text-white focus:outline-none ${(() => {
                                        if (email.trim() === '') return 'border-white/20 focus:border-zeno-cyan';
                                        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                                        return emailRegex.test(email)
                                            ? 'border-green-500 focus:border-green-400'
                                            : 'border-red-500 focus:border-red-400';
                                    })()
                                        }`}
                                    placeholder="email@example.com"
                                />
                                <p className="text-xs text-gray-400 mt-1">Optional - must be valid format (e.g., name@example.com)</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-zeno-gray border border-white/10 rounded-xl p-6">
                        <h2 className="text-xl font-bold text-white mb-4">Upload Documents</h2>

                        <div className="flex gap-2 mb-6">
                            <button
                                onClick={() => setUploadMode('separate')}
                                className={`px-4 py-2 rounded-lg font-medium transition-all ${uploadMode === 'separate'
                                    ? 'bg-zeno-cyan text-zeno-navy'
                                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                    }`}
                            >
                                Separate Files
                            </button>
                            <button
                                onClick={() => setUploadMode('combined')}
                                className={`px-4 py-2 rounded-lg font-medium transition-all ${uploadMode === 'combined'
                                    ? 'bg-zeno-cyan text-zeno-navy'
                                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                    }`}
                            >
                                One Combined PDF
                            </button>
                        </div>

                        {uploadMode === 'combined' ? (
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Combined PDF (ID, POA, Report, etc.) <span className="text-red-400">*</span>
                                </label>
                                <div className="border-2 border-dashed border-gray-600 rounded-xl p-8 text-center hover:border-zeno-cyan transition-colors cursor-pointer">
                                    <input
                                        type="file"
                                        accept=".pdf"
                                        onChange={(e) => handleFileChange('allCombined', e.target.files?.[0] || null)}
                                        className="hidden"
                                        id="combined-upload"
                                    />
                                    <label htmlFor="combined-upload" className="cursor-pointer">
                                        <div className="text-4xl mb-2">📄</div>
                                        <p className="text-zeno-cyan font-medium">Click to upload Combined PDF</p>
                                        <p className="text-sm text-gray-400 mt-1">Ideally contains ID and POA</p>
                                        {uploadedFiles.allCombined && (
                                            <p className="text-green-400 text-sm mt-2">✓ {uploadedFiles.allCombined.name}</p>
                                        )}
                                    </label>
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">ID Copy</label>
                                    <div className="border-2 border-dashed border-gray-600 rounded-xl p-6 text-center hover:border-zeno-cyan transition-colors cursor-pointer">
                                        <input
                                            type="file"
                                            accept=".pdf,.jpg,.jpeg,.png"
                                            onChange={(e) => handleFileChange('id', e.target.files?.[0] || null)}
                                            className="hidden"
                                            id="id-upload"
                                        />
                                        <label htmlFor="id-upload" className="cursor-pointer">
                                            <div className="text-3xl mb-2">🆔</div>
                                            <p className="text-zeno-cyan text-sm">Click to upload ID</p>
                                            {uploadedFiles.id && (
                                                <p className="text-green-400 text-xs mt-1">✓ {uploadedFiles.id.name}</p>
                                            )}
                                        </label>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Signed POA</label>
                                    <div className="border-2 border-dashed border-gray-600 rounded-xl p-6 text-center hover:border-zeno-cyan transition-colors cursor-pointer">
                                        <input
                                            type="file"
                                            accept=".pdf,.jpg,.jpeg,.png"
                                            onChange={(e) => handleFileChange('poa', e.target.files?.[0] || null)}
                                            className="hidden"
                                            id="poa-upload"
                                        />
                                        <label htmlFor="poa-upload" className="cursor-pointer">
                                            <div className="text-3xl mb-2">📋</div>
                                            <p className="text-zeno-cyan text-sm">Click to upload POA</p>
                                            {uploadedFiles.poa && (
                                                <p className="text-green-400 text-xs mt-1">✓ {uploadedFiles.poa.name}</p>
                                            )}
                                        </label>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Credit Report</label>
                                    <div className="border-2 border-dashed border-gray-600 rounded-xl p-6 text-center hover:border-zeno-cyan transition-colors cursor-pointer">
                                        <input
                                            type="file"
                                            accept=".pdf"
                                            onChange={(e) => handleFileChange('creditReport', e.target.files?.[0] || null)}
                                            className="hidden"
                                            id="report-upload"
                                        />
                                        <label htmlFor="report-upload" className="cursor-pointer">
                                            <div className="text-3xl mb-2">📊</div>
                                            <p className="text-zeno-cyan text-sm">Click to upload Report</p>
                                            {uploadedFiles.creditReport && (
                                                <p className="text-green-400 text-xs mt-1">✓ {uploadedFiles.creditReport.name}</p>
                                            )}
                                        </label>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Other Files</label>
                                    <div className="border-2 border-dashed border-gray-600 rounded-xl p-6 text-center hover:border-zeno-cyan transition-colors cursor-pointer">
                                        <input
                                            type="file"
                                            multiple
                                            accept=".pdf,.jpg,.jpeg,.png"
                                            onChange={(e) => {
                                                const files = Array.from(e.target.files || []);
                                                files.forEach(file => handleFileChange('optional', file));
                                            }}
                                            className="hidden"
                                            id="optional-upload"
                                        />
                                        <label htmlFor="optional-upload" className="cursor-pointer">
                                            <div className="text-3xl mb-2">📁</div>
                                            <p className="text-zeno-cyan text-sm">Add optional files</p>
                                            {uploadedFiles.optional.length > 0 && (
                                                <p className="text-green-400 text-xs mt-1">✓ {uploadedFiles.optional.length} files</p>
                                            )}
                                        </label>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex gap-4">
                        <button
                            onClick={() => setStep(1)}
                            className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-all"
                        >
                            Back
                        </button>
                        <button
                            onClick={handleCreateCase}
                            disabled={submitting}
                            className="flex-1 bg-zeno-cyan hover:bg-cyan-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-zeno-navy font-bold px-8 py-3 rounded-lg transition-all"
                        >
                            {submitting ? 'Creating Lead...' : 'Create Case'}
                        </button>
                    </div>
                </div>
            )}

            {/* Duplicate Override Modal */}
            {duplicateError && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-zeno-navy border border-white/10 rounded-xl p-6 max-w-xl w-full shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="flex items-center gap-3 mb-4 text-amber-500">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                            <h3 className="text-xl font-bold text-white">Duplicate Client Detected</h3>
                        </div>

                        <p className="text-gray-300 mb-4 leading-relaxed">
                            {duplicateError.error}
                        </p>

                        {/* Option: Capture with prefix */}
                        {duplicateError.allowPrefixedId && (
                            <div className="mb-4 p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                                <p className="text-white font-medium mb-2">Create New Record with Prefixed ID</p>
                                <p className="text-sm text-gray-400 mb-3">
                                    Add a prefix to make the ID unique (e.g., <span className="text-blue-300 font-mono">DRL</span> for "Debt Review Letsatsi client").
                                </p>
                                <div className="flex gap-2 items-center mb-3">
                                    <input
                                        type="text"
                                        value={prefixedIdInput}
                                        onChange={(e) => setPrefixedIdInput(e.target.value.toUpperCase())}
                                        placeholder={duplicateError.suggestedIdNumber || `DRL${duplicateError.originalIdNumber}`}
                                        className="flex-1 bg-zeno-dark border border-blue-500/50 rounded-lg px-4 py-2 text-white font-mono focus:outline-none focus:border-blue-400"
                                    />
                                </div>
                                <p className="text-xs text-gray-500 mb-3">
                                    Common prefixes: <span className="text-blue-400">DRL</span> (Debt Review Letsatsi), <span className="text-blue-400">DRS</span> (Debt Review Shosholoza), <span className="text-blue-400">DUP</span> (Duplicate)
                                </p>
                                <button
                                    onClick={async () => {
                                        const newIdNumber = prefixedIdInput || duplicateError.suggestedIdNumber;
                                        if (newIdNumber && newIdNumber !== duplicateError.originalIdNumber) {
                                            // Update the ID and retry
                                            setIdNumber(newIdNumber);
                                            setDuplicateError(null);
                                            setPrefixedIdInput('');
                                            // Re-submit with the new ID after a short delay
                                            setTimeout(() => handleCreateCase(), 100);
                                        } else {
                                            alert('Please enter a valid prefixed ID number');
                                        }
                                    }}
                                    disabled={!prefixedIdInput && !duplicateError.suggestedIdNumber}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
                                >
                                    Create with Prefixed ID
                                </button>
                            </div>
                        )}

                        <div className="flex justify-end">
                            <button
                                onClick={() => { setDuplicateError(null); setPrefixedIdInput(''); setSubmitting(false); }}
                                className="px-4 py-2 bg-transparent text-gray-400 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
