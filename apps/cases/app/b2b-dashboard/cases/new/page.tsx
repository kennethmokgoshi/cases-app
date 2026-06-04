'use client';
import { toast } from '@zenowethu/ui';


import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from '@zenowethu/ui';
import Link from 'next/link';

// Client-side logger
const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    debug: (...args: any[]) => console.debug('[DEBUG]', ...args)
};

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
    const isDebtReviewSelected = (services: string[]) =>
        services.includes('debt_review_flag_removal') || services.includes('debt_review_application');

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
        bankStatement?: File;
        payslip?: File;
        proofOfResidence?: File;
        form16?: File;
        form171?: File;
        form172?: File;
        form177?: File;
        clearance?: File;
        allCombined?: File;
        optional: File[];
    }>({ optional: [] });

    // Joint Application State
    const [isJointApplication, setIsJointApplication] = useState(false);
    const [jointSurname, setJointSurname] = useState('');
    const [jointFullNames, setJointFullNames] = useState('');
    const [jointIdNumber, setJointIdNumber] = useState('');
    const [jointCellNumber, setJointCellNumber] = useState('');
    const [jointEmail, setJointEmail] = useState('');

    // Duplicate alert state
    const [duplicateAlert, setDuplicateAlert] = useState<{
        existingClientName: string;
        existingFileNumber: string;
        existingProjectName: string;
    } | null>(null);

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
        if (name.toLowerCase().includes('letsatsi')) return 'Letsatsi';
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

    // Reset Joint Application if services change and none are Debt Review
    useEffect(() => {
        if (selectedServices.length > 0 && !isDebtReviewSelected(selectedServices)) {
            setIsJointApplication(false);
        }
    }, [selectedServices]);


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
            toast.error('Please select Main Source, Year, and Month');
            return;
        }

        if (selectedServices.length === 0) {
            toast.error('Please select at least one service');
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
            toast.error('Failed to create project structure. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleFileChange = (type: 'id' | 'poa' | 'creditReport' | 'bankStatement' | 'payslip' | 'proofOfResidence' | 'form16' | 'form171' | 'form172' | 'form177' | 'clearance' | 'allCombined' | 'optional', file: File | null) => {
        if (type === 'optional' && file) {
            // Check for duplicates in the optional list
            const isDuplicate = uploadedFiles.optional.some(existing => 
                existing.name === file.name && existing.size === file.size
            );
            if (isDuplicate) return;

            setUploadedFiles(prev => ({
                ...prev,
                optional: [...prev.optional, file]
            }));
        } else {
            // Can be file or null (for removal)
            setUploadedFiles(prev => ({ ...prev, [type]: file }));
        }
    };

    const handleRemoveOptionalFile = (index: number) => {
        setUploadedFiles(prev => ({
            ...prev,
            optional: prev.optional.filter((_, i) => i !== index)
        }));
    };

    const handleCreateCase = async (allowDuplicate = false) => {
        // Validate required fields (phone and email are now optional)
        if (!surname || !fullNames || !idNumber) {
            toast.error('Please fill in Surname, Full Names, and ID Number');
            return;
        }

        if (isJointApplication) {
            if (!jointSurname || !jointFullNames || !jointIdNumber) {
                toast.error('Please fill in Joint Applicant Surname, Full Names, and ID Number');
                return;
            }
        }

        // Validate ID Number: Must be exactly 13 digits
        const idNumberClean = idNumber.replace(/\D/g, ''); // Remove non-digits
        if (idNumberClean.length !== 13) {
            toast.error('❌ Invalid ID Number\n\nSouth African ID numbers must be exactly 13 digits.\n\nYou entered: ' + idNumberClean.length + ' digits');
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
                    toast.error('❌ Invalid Cell Number\n\nInternational format must be: +27XXXXXXXXX (12 characters)\n\nExample: +27823456789');
                    return;
                }
            } else {
                // Local format: Must be exactly 10 digits
                if (digitsOnly.length !== 10) {
                    toast.error('❌ Invalid Cell Number\n\nLocal format must be 10 digits.\n\nExample: 0823456789\n\nYou entered: ' + digitsOnly.length + ' digits');
                    return;
                }
            }
        }

        // Validate Email format (if provided)
        if (email && email.trim() !== '') {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                toast.error('❌ Invalid Email Address\n\nPlease enter a valid email address.\n\nExample: name@example.com');
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
                        phone: cellNumber || null,
                        email: email || null },
                    
                    jointClient: isJointApplication ? {
                        firstName: jointFullNames,
                        lastName: jointSurname,
                        idNumber: jointIdNumber,
                        phone: jointCellNumber || null,
                        email: jointEmail || null
                    } : null,

                    projectId: finalProjectId,
                    acquisitionType: 'B2B',
                    partnerName: getPartnerNameFromProject(),
                    partnerBranch: getBranchNameFromProject(),
                    partnerSplitPercent: 50,
                    services: selectedServices,
                    allowDuplicate,
                }) });

            if (!caseResponse.ok) {
                const errorData = await caseResponse.json();

                if (caseResponse.status === 409 && (errorData.code === 'DUPLICATE_CASE' || errorData.code === 'DUPLICATE_ID_NUMBER')) {
                    setDuplicateAlert({
                        existingClientName: errorData.existingClientName || errorData.existingClient?.name || 'Unknown',
                        existingFileNumber: errorData.existingFileNumber || '',
                        existingProjectName: errorData.existingProjectName || 'Unknown Project',
                    });
                    setSubmitting(false);
                    return;
                } else if (caseResponse.status === 409) {
                    const fieldName = errorData.field === 'phone' ? 'Cell Number'
                        : errorData.field === 'email' ? 'Email Address'
                            : 'Field';
                    toast.error(`❌ ${errorData.error || 'Duplicate detected'}\n\nA record with this ${fieldName} already exists.`);
                } else if (errorData.errors && typeof errorData.errors === 'object') {
                    const fieldMessages = Object.entries(errorData.errors as Record<string, string[]>)
                        .map(([field, msgs]) => `• ${field}: ${msgs.join(', ')}`)
                        .join('\n');
                    toast.error(`❌ Submission failed — please fix the following:\n\n${fieldMessages}`);
                } else {
                    toast.error(`Failed to create case: ${errorData.error || errorData.message || 'Unknown error'}`);
                }

                setSubmitting(false);
                return;
            }

            const caseData = await caseResponse.json();

            // Handle document uploads if present
            const hasFiles = uploadMode === 'combined'
                ? uploadedFiles.allCombined
                : (uploadedFiles.id || uploadedFiles.poa || uploadedFiles.creditReport || uploadedFiles.bankStatement || uploadedFiles.payslip || uploadedFiles.proofOfResidence || uploadedFiles.form16 || uploadedFiles.form171 || uploadedFiles.form172 || uploadedFiles.form177 || uploadedFiles.clearance || uploadedFiles.optional.length > 0);

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
                    if (uploadedFiles.bankStatement) formData.append('file_BANK_STATEMENT', uploadedFiles.bankStatement);
                    if (uploadedFiles.payslip) formData.append('file_PAYSLIP', uploadedFiles.payslip);
                    if (uploadedFiles.proofOfResidence) formData.append('file_PROOF_OF_RESIDENCE', uploadedFiles.proofOfResidence);
                    if (uploadedFiles.form16) formData.append('file_FORM_16', uploadedFiles.form16);
                    if (uploadedFiles.form171) formData.append('file_FORM_17_1', uploadedFiles.form171);
                    if (uploadedFiles.form172) formData.append('file_FORM_17_2', uploadedFiles.form172);
                    if (uploadedFiles.form177) formData.append('file_FORM_17_7', uploadedFiles.form177);
                    if (uploadedFiles.clearance) formData.append('file_CLEARANCE', uploadedFiles.clearance);
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
                        toast.success('Case created successfully, but document upload failed: ' + (err.error || 'Unknown error'));
                    } else {
                        logger.info('✅ Documents uploaded successfully');
                    }
                } catch (uploadError) {
                    logger.error('Upload Error:', uploadError);
                    toast.success('Case created successfully, but an error occurred during document upload.');
                }
            }

            // SUCCESS! Redirect
            router.push('/b2b-dashboard?success=lead_created');
        } catch (error) {
            logger.error('Case creation error:', error);
            toast.error(`Failed to create lead: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

                        {/* Application Type - moved below services */}

                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-full bg-white/5 flex items-center justify-center text-[10px] text-gray-400">2</span>
                                    Year <span className="text-red-400">*</span>
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
                                <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-full bg-white/5 flex items-center justify-center text-[10px] text-gray-400">3</span>
                                    Month <span className="text-red-400">*</span>
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
                            <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-white/5 flex items-center justify-center text-[10px] text-gray-400">4</span>
                                Main Source <span className="text-red-400">*</span>
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
                                <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-full bg-white/5 flex items-center justify-center text-[10px] text-gray-400">5</span>
                                    Branch/Subproject <span className="text-gray-500">(Optional)</span>
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
                                <label className="block text-sm font-medium text-gray-300 flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-full bg-white/5 flex items-center justify-center text-[10px] text-gray-400">6</span>
                                    Services Required <span className="text-red-400">*</span>
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

                        {/* Application Type */}
                        {isDebtReviewSelected(selectedServices) && (
                            <div className="mt-8 pt-8 border-t border-white/5 animate-in fade-in slide-in-from-top-2 duration-300">
                                <label className="block text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
                                    <span className="w-6 h-6 rounded-full bg-zeno-cyan text-zeno-navy flex items-center justify-center text-xs font-bold">7</span>
                                    Application Type <span className="text-red-400">*</span>
                                </label>
                                <div className="grid grid-cols-2 gap-4">
                                    <button
                                        type="button"
                                        onClick={() => setIsJointApplication(false)}
                                        className={`p-5 rounded-xl border-2 transition-all text-left group ${!isJointApplication ? 'bg-indigo-600/20 border-indigo-500 shadow-lg shadow-indigo-900/20' : 'bg-zeno-navy border-white/10 hover:border-white/30'}`}
                                    >
                                        <div className="flex items-center justify-between mb-3">
                                            <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-2xl transition-colors ${!isJointApplication ? 'bg-indigo-500 text-white' : 'bg-gray-800 text-gray-400 group-hover:bg-gray-700'}`}>
                                                👤
                                            </div>
                                            {!isJointApplication && (
                                                <span className="bg-indigo-500 text-white text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">
                                                    Selected
                                                </span>
                                            )}
                                        </div>
                                        <h3 className="font-bold text-white text-lg">Single Application</h3>
                                        <p className="text-sm text-gray-400 mt-1">Capture data for one applicant</p>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setIsJointApplication(true)}
                                        className={`p-5 rounded-xl border-2 transition-all text-left group ${isJointApplication ? 'bg-indigo-600/20 border-indigo-500 shadow-lg shadow-indigo-900/20' : 'bg-zeno-navy border-white/10 hover:border-white/30'}`}
                                    >
                                        <div className="flex items-center justify-between mb-3">
                                            <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-2xl transition-colors ${isJointApplication ? 'bg-indigo-500 text-white' : 'bg-gray-800 text-gray-400 group-hover:bg-gray-700'}`}>
                                                👥
                                            </div>
                                            {isJointApplication && (
                                                <span className="bg-indigo-500 text-white text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">
                                                    Selected
                                                </span>
                                            )}
                                        </div>
                                        <h3 className="font-bold text-white text-lg">Joint Application</h3>
                                        <p className="text-sm text-gray-400 mt-1">Capture data for two applicants (e.g. Spouse)</p>
                                    </button>
                                </div>
                            </div>
                        )}

                        {selectedParentId && (
                            <div className="mt-6 p-4 bg-zeno-navy rounded-lg border border-zeno-cyan/30">
                                <p className="text-sm text-gray-400 mb-1">Case summary:</p>
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                                    <p className="text-zeno-cyan font-bold">
                                        {selectedParent?.name}
                                        {selectedSubprojectId && ` ${subprojects.find(s => s.id === selectedSubprojectId)?.name}`}
                                        {` ${selectedMonth} ${selectedYear}`}
                                    </p>
                                    {isDebtReviewSelected(selectedServices) && (
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${isJointApplication ? 'bg-indigo-500/20 text-indigo-300' : 'bg-gray-500/20 text-gray-400'}`}>
                                            {isJointApplication ? 'Joint' : 'Single'}
                                        </span>
                                    )}
                                </div>

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
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-zeno-cyan uppercase tracking-wider">Primary Applicant Information</h2>
                            <div className="px-3 py-1 rounded-full bg-zeno-cyan/10 border border-zeno-cyan/30 text-zeno-cyan text-[10px] font-bold uppercase">
                                Applicant 1
                            </div>
                        </div>

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
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Cell Number
                                </label>
                                <input
                                    type="text"
                                    value={cellNumber}
                                    onChange={(e) => setCellNumber(e.target.value)}
                                    className="w-full bg-zeno-navy border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-zeno-cyan"
                                    placeholder="0823456789"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Email
                                </label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full bg-zeno-navy border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-zeno-cyan"
                                    placeholder="email@example.com"
                                />
                            </div>
                        </div>
                    </div>

                    {/* JOINT APPLICANT SECTION */}
                    {isJointApplication && (
                        <div className="bg-zeno-gray border border-indigo-500/30 rounded-xl p-6 animate-in fade-in slide-in-from-top-4 duration-500">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-bold text-indigo-400 uppercase tracking-wider">Joint Applicant Information</h2>
                                <div className="px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-[10px] font-bold uppercase">
                                    Applicant 2
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mb-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        Joint Surname <span className="text-red-400">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={jointSurname}
                                        onChange={(e) => setJointSurname(e.target.value)}
                                        className="w-full bg-zeno-navy border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500"
                                        placeholder="Enter joint surname"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        Joint Full Names <span className="text-red-400">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={jointFullNames}
                                        onChange={(e) => setJointFullNames(e.target.value)}
                                        className="w-full bg-zeno-navy border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500"
                                        placeholder="Enter joint full names"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4 mb-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        Joint ID Number <span className="text-red-400">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={jointIdNumber}
                                        onChange={(e) => setJointIdNumber(e.target.value)}
                                        maxLength={13}
                                        className={`w-full bg-zeno-navy border rounded-lg px-4 py-3 text-white focus:outline-none ${jointIdNumber.replace(/\D/g, '').length === 13
                                            ? 'border-green-500 focus:border-green-400'
                                            : jointIdNumber.length > 0
                                                ? 'border-red-500 focus:border-red-400'
                                                : 'border-white/20 focus:border-indigo-500'
                                            }`}
                                        placeholder="0000000000000"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        Joint Cell Number
                                    </label>
                                    <input
                                        type="text"
                                        value={jointCellNumber}
                                        onChange={(e) => setJointCellNumber(e.target.value)}
                                        className="w-full bg-zeno-navy border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500"
                                        placeholder="0823456789"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        Joint Email
                                    </label>
                                    <input
                                        type="email"
                                        value={jointEmail}
                                        onChange={(e) => setJointEmail(e.target.value)}
                                        className="w-full bg-zeno-navy border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500"
                                        placeholder="joint@example.com"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

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
                                            <div className="mt-3 flex items-center justify-center gap-2 bg-green-500/10 border border-green-500/20 rounded-lg py-1.5 px-3">
                                                <span className="text-green-400 text-sm truncate max-w-[200px]">✓ {uploadedFiles.allCombined.name}</span>
                                                <button 
                                                    type="button" 
                                                    onClick={(e) => { e.preventDefault(); handleFileChange('allCombined', null); }}
                                                    className="text-gray-400 hover:text-red-400 transition-colors"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                                </button>
                                            </div>
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
                                                <div className="mt-2 flex items-center justify-center gap-2 bg-green-500/10 border border-green-500/20 rounded-lg py-1 px-2">
                                                    <span className="text-green-400 text-xs truncate max-w-[120px]">✓ {uploadedFiles.id.name}</span>
                                                    <button 
                                                        type="button" 
                                                        onClick={(e) => { e.preventDefault(); handleFileChange('id', null); }}
                                                        className="text-gray-400 hover:text-red-400 transition-colors"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                                    </button>
                                                </div>
                                            )}
                                        </label>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Zenowethu POA</label>
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
                                                <div className="mt-2 flex items-center justify-center gap-2 bg-green-500/10 border border-green-500/20 rounded-lg py-1 px-2">
                                                    <span className="text-green-400 text-xs truncate max-w-[120px]">✓ {uploadedFiles.poa.name}</span>
                                                    <button 
                                                        type="button" 
                                                        onClick={(e) => { e.preventDefault(); handleFileChange('poa', null); }}
                                                        className="text-gray-400 hover:text-red-400 transition-colors"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                                    </button>
                                                </div>
                                            )}
                                        </label>
                                    </div>
                                </div>

                                <div className="col-span-2">
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Credit Report (Experian, XDS, ClearScore, TransUnion, etc.)</label>
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
                                            <p className="text-zeno-cyan text-sm">Click to upload Credit Report</p>
                                            <p className="text-xs text-gray-500 mt-1">AI will automatically identify the bureau and category</p>
                                            {uploadedFiles.creditReport && (
                                                <div className="mt-2 flex items-center justify-center gap-2 bg-green-500/10 border border-green-500/20 rounded-lg py-1 px-2 mx-auto max-w-[240px]">
                                                    <span className="text-green-400 text-xs truncate">✓ {uploadedFiles.creditReport.name}</span>
                                                    <button 
                                                        type="button" 
                                                        onClick={(e) => { e.preventDefault(); handleFileChange('creditReport', null); }}
                                                        className="text-gray-400 hover:text-red-400 transition-colors"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                                    </button>
                                                </div>
                                            )}
                                        </label>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Payslip</label>
                                    <div className="border-2 border-dashed border-gray-600 rounded-xl p-6 text-center hover:border-zeno-cyan transition-colors cursor-pointer">
                                        <input
                                            type="file"
                                            accept=".pdf,.jpg,.jpeg,.png"
                                            onChange={(e) => handleFileChange('payslip', e.target.files?.[0] || null)}
                                            className="hidden"
                                            id="payslip-upload"
                                        />
                                        <label htmlFor="payslip-upload" className="cursor-pointer">
                                            <div className="text-3xl mb-2">💸</div>
                                            <p className="text-zeno-cyan text-sm">Click to upload Payslip</p>
                                            {uploadedFiles.payslip && (
                                                <div className="mt-2 flex items-center justify-center gap-2 bg-green-500/10 border border-green-500/20 rounded-lg py-1 px-2">
                                                    <span className="text-green-400 text-xs truncate max-w-[120px]">✓ {uploadedFiles.payslip.name}</span>
                                                    <button 
                                                        type="button" 
                                                        onClick={(e) => { e.preventDefault(); handleFileChange('payslip', null); }}
                                                        className="text-gray-400 hover:text-red-400 transition-colors"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                                    </button>
                                                </div>
                                            )}
                                        </label>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Bank Statement</label>
                                    <div className="border-2 border-dashed border-gray-600 rounded-xl p-6 text-center hover:border-zeno-cyan transition-colors cursor-pointer">
                                        <input
                                            type="file"
                                            accept=".pdf,.jpg,.jpeg,.png"
                                            onChange={(e) => handleFileChange('bankStatement', e.target.files?.[0] || null)}
                                            className="hidden"
                                            id="bank-statement-upload"
                                        />
                                        <label htmlFor="bank-statement-upload" className="cursor-pointer">
                                            <div className="text-3xl mb-2">🏦</div>
                                            <p className="text-zeno-cyan text-sm">Click to upload Statement</p>
                                            {uploadedFiles.bankStatement && (
                                                <div className="mt-2 flex items-center justify-center gap-2 bg-green-500/10 border border-green-500/20 rounded-lg py-1 px-2">
                                                    <span className="text-green-400 text-xs truncate max-w-[120px]">✓ {uploadedFiles.bankStatement.name}</span>
                                                    <button 
                                                        type="button" 
                                                        onClick={(e) => { e.preventDefault(); handleFileChange('bankStatement', null); }}
                                                        className="text-gray-400 hover:text-red-400 transition-colors"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                                    </button>
                                                </div>
                                            )}
                                        </label>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Proof of Residence</label>
                                    <div className="border-2 border-dashed border-gray-600 rounded-xl p-6 text-center hover:border-teal-400 transition-colors cursor-pointer">
                                        <input
                                            type="file"
                                            accept=".pdf,.jpg,.jpeg,.png"
                                            onChange={(e) => handleFileChange('proofOfResidence', e.target.files?.[0] || null)}
                                            className="hidden"
                                            id="por-upload"
                                        />
                                        <label htmlFor="por-upload" className="cursor-pointer">
                                            <div className="text-3xl mb-2">🏠</div>
                                            <p className="text-teal-400 text-sm">Click to upload PoR</p>
                                            {uploadedFiles.proofOfResidence && (
                                                <div className="mt-2 flex items-center justify-center gap-2 bg-green-500/10 border border-green-500/20 rounded-lg py-1 px-2">
                                                    <span className="text-green-400 text-xs truncate max-w-[120px]">✓ {uploadedFiles.proofOfResidence.name}</span>
                                                    <button 
                                                        type="button" 
                                                        onClick={(e) => { e.preventDefault(); handleFileChange('proofOfResidence', null); }}
                                                        className="text-gray-400 hover:text-red-400 transition-colors"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                                    </button>
                                                </div>
                                            )}
                                        </label>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Form 16</label>
                                    <div className="border-2 border-dashed border-gray-600 rounded-xl p-6 text-center hover:border-zeno-cyan transition-colors cursor-pointer">
                                        <input
                                            type="file"
                                            accept=".pdf,.jpg,.jpeg,.png"
                                            onChange={(e) => handleFileChange('form16', e.target.files?.[0] || null)}
                                            className="hidden"
                                            id="form16-upload"
                                        />
                                        <label htmlFor="form16-upload" className="cursor-pointer">
                                            <div className="text-3xl mb-2">📄</div>
                                            <p className="text-zeno-cyan text-sm">Click to upload Form 16</p>
                                            {uploadedFiles.form16 && (
                                                <div className="mt-2 flex items-center justify-center gap-2 bg-green-500/10 border border-green-500/20 rounded-lg py-1 px-2">
                                                    <span className="text-green-400 text-xs truncate max-w-[120px]">✓ {uploadedFiles.form16.name}</span>
                                                    <button 
                                                        type="button" 
                                                        onClick={(e) => { e.preventDefault(); handleFileChange('form16', null); }}
                                                        className="text-gray-400 hover:text-red-400 transition-colors"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                                    </button>
                                                </div>
                                            )}
                                        </label>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Form 17.1</label>
                                    <div className="border-2 border-dashed border-gray-600 rounded-xl p-6 text-center hover:border-zeno-cyan transition-colors cursor-pointer">
                                        <input
                                            type="file"
                                            accept=".pdf,.jpg,.jpeg,.png"
                                            onChange={(e) => handleFileChange('form171', e.target.files?.[0] || null)}
                                            className="hidden"
                                            id="form171-upload"
                                        />
                                        <label htmlFor="form171-upload" className="cursor-pointer">
                                            <div className="text-3xl mb-2">📄</div>
                                            <p className="text-zeno-cyan text-sm">Click to upload Form 17.1</p>
                                            {uploadedFiles.form171 && (
                                                <div className="mt-2 flex items-center justify-center gap-2 bg-green-500/10 border border-green-500/20 rounded-lg py-1 px-2">
                                                    <span className="text-green-400 text-xs truncate max-w-[120px]">✓ {uploadedFiles.form171.name}</span>
                                                    <button 
                                                        type="button" 
                                                        onClick={(e) => { e.preventDefault(); handleFileChange('form171', null); }}
                                                        className="text-gray-400 hover:text-red-400 transition-colors"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                                    </button>
                                                </div>
                                            )}
                                        </label>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Form 17.2</label>
                                    <div className="border-2 border-dashed border-gray-600 rounded-xl p-6 text-center hover:border-zeno-cyan transition-colors cursor-pointer">
                                        <input
                                            type="file"
                                            accept=".pdf,.jpg,.jpeg,.png"
                                            onChange={(e) => handleFileChange('form172', e.target.files?.[0] || null)}
                                            className="hidden"
                                            id="form172-upload"
                                        />
                                        <label htmlFor="form172-upload" className="cursor-pointer">
                                            <div className="text-3xl mb-2">📄</div>
                                            <p className="text-zeno-cyan text-sm">Click to upload Form 17.2</p>
                                            {uploadedFiles.form172 && (
                                                <div className="mt-2 flex items-center justify-center gap-2 bg-green-500/10 border border-green-500/20 rounded-lg py-1 px-2">
                                                    <span className="text-green-400 text-xs truncate max-w-[120px]">✓ {uploadedFiles.form172.name}</span>
                                                    <button 
                                                        type="button" 
                                                        onClick={(e) => { e.preventDefault(); handleFileChange('form172', null); }}
                                                        className="text-gray-400 hover:text-red-400 transition-colors"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                                    </button>
                                                </div>
                                            )}
                                        </label>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Form 17.7</label>
                                    <div className="border-2 border-dashed border-gray-600 rounded-xl p-6 text-center hover:border-zeno-cyan transition-colors cursor-pointer">
                                        <input
                                            type="file"
                                            accept=".pdf,.jpg,.jpeg,.png"
                                            onChange={(e) => handleFileChange('form177', e.target.files?.[0] || null)}
                                            className="hidden"
                                            id="form177-upload"
                                        />
                                        <label htmlFor="form177-upload" className="cursor-pointer">
                                            <div className="text-3xl mb-2">📄</div>
                                            <p className="text-zeno-cyan text-sm">Click to upload Form 17.7</p>
                                            {uploadedFiles.form177 && (
                                                <div className="mt-2 flex items-center justify-center gap-2 bg-green-500/10 border border-green-500/20 rounded-lg py-1 px-2">
                                                    <span className="text-green-400 text-xs truncate max-w-[120px]">✓ {uploadedFiles.form177.name}</span>
                                                    <button 
                                                        type="button" 
                                                        onClick={(e) => { e.preventDefault(); handleFileChange('form177', null); }}
                                                        className="text-gray-400 hover:text-red-400 transition-colors"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                                    </button>
                                                </div>
                                            )}
                                        </label>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Clearance Certificate (Form 17.W)</label>
                                    <div className="border-2 border-dashed border-gray-600 rounded-xl p-6 text-center hover:border-zeno-cyan transition-colors cursor-pointer">
                                        <input
                                            type="file"
                                            accept=".pdf,.jpg,.jpeg,.png"
                                            onChange={(e) => handleFileChange('clearance', e.target.files?.[0] || null)}
                                            className="hidden"
                                            id="clearance-upload"
                                        />
                                        <label htmlFor="clearance-upload" className="cursor-pointer">
                                            <div className="text-3xl mb-2">🏆</div>
                                            <p className="text-zeno-cyan text-sm">Click to upload Clearance</p>
                                            {uploadedFiles.clearance && (
                                                <div className="mt-2 flex items-center justify-center gap-2 bg-green-500/10 border border-green-500/20 rounded-lg py-1 px-2">
                                                    <span className="text-green-400 text-xs truncate max-w-[120px]">✓ {uploadedFiles.clearance.name}</span>
                                                    <button 
                                                        type="button" 
                                                        onClick={(e) => { e.preventDefault(); handleFileChange('clearance', null); }}
                                                        className="text-gray-400 hover:text-red-400 transition-colors"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                                    </button>
                                                </div>
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
                                            <p className="text-xs text-gray-500 mt-1">Select multiple if needed</p>
                                        </label>
                                        {uploadedFiles.optional.length > 0 && (
                                            <div className="mt-4 border-t border-white/10 pt-4 space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                                                {uploadedFiles.optional.map((file, idx) => (
                                                    <div key={`${file.name}-${idx}`} className="flex items-center justify-between gap-2 bg-white/5 border border-white/10 rounded-lg py-1.5 px-3">
                                                        <span className="text-gray-300 text-xs truncate text-left flex-1">✓ {file.name}</span>
                                                        <button 
                                                            type="button" 
                                                            onClick={(e) => { e.preventDefault(); handleRemoveOptionalFile(idx); }}
                                                            className="text-gray-500 hover:text-red-400 transition-colors"
                                                        >
                                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex gap-4">
                        <button
                            onClick={() => { setStep(1); window.scrollTo({ top: 0, behavior: 'instant' }); }}
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

            {/* Duplicate Client Alert */}
            {duplicateAlert && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-zeno-navy border border-amber-500/40 rounded-xl p-6 max-w-lg w-full shadow-2xl">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center text-xl flex-shrink-0">⚠️</div>
                            <h3 className="text-xl font-bold text-white">Duplicate ID Number Detected</h3>
                        </div>
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-5">
                            <p className="text-amber-200 text-sm leading-relaxed">
                                This ID number is already on file as:
                            </p>
                            <p className="text-white font-bold text-lg mt-1">{duplicateAlert.existingClientName}</p>
                            {duplicateAlert.existingFileNumber && (
                                <p className="text-gray-300 text-sm mt-1">Case: <span className="text-zeno-cyan font-mono">{duplicateAlert.existingFileNumber}</span></p>
                            )}
                            <p className="text-gray-300 text-sm mt-0.5">Project: <span className="text-gray-100">{duplicateAlert.existingProjectName}</span></p>
                        </div>
                        <p className="text-gray-400 text-sm mb-5">
                            Do you want to record this referral anyway? A new case will be created and linked to the existing client record with their correct ID number.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => { setDuplicateAlert(null); setSubmitting(false); }}
                                className="flex-1 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors font-medium"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => { setDuplicateAlert(null); handleCreateCase(true); }}
                                className="flex-1 px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-colors font-bold"
                            >
                                Record Anyway
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
