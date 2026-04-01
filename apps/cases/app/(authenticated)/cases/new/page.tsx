'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from '@zenowethu/ui';
import Link from 'next/link';
import { ClientOnly } from './ClientOnly';

// Client-side logger (avoid importing server-only modules from shared-lib)
const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args)
};

type Project = {
    id: string;
    name: string;
    type: string;
    clientType?: string | null;  // B2B or B2C
    parent_id?: string | null;
    children?: Project[];
};

type ExtractedData = {
    validation?: {
        missingID?: boolean;
        missingPOA?: boolean;
    };
    id?: {
        surname?: string;
        names?: string;
        idNumber?: string;
    };
    poa?: {
        cellNumber?: string;
        whatsappNumber?: string;
        email?: string;
        address?: string;
        employer?: string;
        employeeNo?: string;
        instalments?: number;
        serviceFee?: number;
        clientType?: string;
        cellNumberVerification?: {
            letsatsiAgreement: string | null;
            debitOrder: string | null;
            poaSchedule6: string | null;
            allMatch: boolean;
            discrepancyNote: string | null;
        } | null;
    };
    salary?: {
        employer: string;
        grossSalary: number;
        netSalary: number;
        salaryPayDate: string;
        source: string;
    };
    documentIdentityReport?: {
        sourceDocument: string;
        pageNumber?: number;
        extractedId: string;
        extractedName: string;
        matchStatus: 'MATCH' | 'MISMATCH' | 'MISSING';
    }[];
    affordability?: {
        status?: string;
    };
    creditReport?: {
        codixResult?: { outcome: string; reason: string; };
        debtRestructuring?: {
            ncrdcNo: string;
            debtCounsellorName: string;
            debtReviewDate: string;
            dhsStatus: string;
        };
        summary?: {
            totalDebt: number;
            totalInstallment: number;
            activeAccounts: number;
            closedAccounts: number;
            balanceExposure?: number; // Added alias
            monthlyInstallment?: number; // Added alias
        };
        consumer?: {
            latestAddress: string;
            cellNumber: string;
            workNumber: string;
            homeNumber: string;
            employer: string;
            occupation: string;
        };
        accounts?: any[];
        insuranceNotes?: string;
    };
};

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

export default function NewCaseWithAIPage() {
    return (
        <ClientOnly>
            <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-white">Loading analysis engine...</div>}>
                <NewCaseWithAIComponent />
            </Suspense>
        </ClientOnly>
    );
}

function NewCaseWithAIComponent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { data: session, status } = useSession();
    const partnerIdParam = searchParams.get('partnerId');

    // Redirect B2B partners to dedicated partner page
    useEffect(() => {
        if (status === 'authenticated' && session?.user?.userType === 'B2B_PARTNER') {
            router.replace('/b2b-dashboard/cases/new' + (partnerIdParam ? `?partnerId=${partnerIdParam}` : ''));
        }
    }, [status, session, router, partnerIdParam]);

    const [step, setStep] = useState(1); // 1=Project, 2=Upload, 3=Review
    const [parentProjects, setParentProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [analyzing, setAnalyzing] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [creatingProject, setCreatingProject] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [progressMessage, setProgressMessage] = useState('Uploading documents...');
    const progressTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

    // Step 1: Project Selection (multi-step)
    const currentYearVal = new Date().getFullYear();
    const currentMonthVal = new Date().toLocaleString('default', { month: 'long' });

    // Generate years from current year down to 2000
    const years = Array.from({ length: currentYearVal - 1999 }, (_, i) => currentYearVal - i);

    const [selectedParentId, setSelectedParentId] = useState('');
    const [selectedSubprojectId, setSelectedSubprojectId] = useState('');
    const [selectedYear, setSelectedYear] = useState(String(currentYearVal));
    const [selectedMonth, setSelectedMonth] = useState(currentMonthVal);
    const [finalProjectId, setFinalProjectId] = useState('');

    // B2B vs B2C Classification
    const [acquisitionType, setAcquisitionType] = useState<'B2B' | 'B2C'>('B2B');

    // B2B Partners list
    const B2B_PARTNERS = [
        { id: 'letsatsi', name: 'Letsatsi Finance', splitPercent: 50 },
        { id: 'shosholoza', name: 'Shosholoza Finance', splitPercent: 50 },
        { id: 'future_finance', name: 'Future Finance', splitPercent: 50 },
    ];

    // Step 2: Document Upload
    const [uploadedFiles, setUploadedFiles] = useState<{
        id?: File;
        poa?: File;
        creditReport?: File;
        bankStatement?: File;
        payslip?: File;
        form16?: File;
        form171?: File;
        form172?: File;
        form177?: File;
        clearance?: File;
        allCombined?: File;
        optional: File[];
    }>({
        optional: []
    });
    const [uploadMode, setUploadMode] = useState<'separate' | 'combined'>('separate');

    // Step 3: Extracted Data
    const [extractedData, setExtractedData] = useState<ExtractedData>({});
    const [tempCaseId, setTempCaseId] = useState<string>('');

    // Services selection
    const [selectedServices, setSelectedServices] = useState<string[]>([]);

    // Form Data for Review
    const [formData, setFormData] = useState({
        surname: '',
        names: '',
        idNumber: '',
        cellNumber: '',
        whatsappNumber: '',
        email: '',
        alternativeEmail: '',
        alternativePhone: '',
        address: '',
        employer: '',
        employeeNo: '',
        grossSalary: '',
        netSalary: '',
        salaryPayDate: '',
        affordabilityStatus: '',
        category: 'Standard',
        closedAccounts: 0,
        openAccounts: 0,
        prescribedAccounts: 0,
        ncrdcNo: '',
        serviceFee: '',
        instalments: 1,
        totalDebtAmount: '',
        totalMonthlyInstallment: '',
        // CB specific
        cb_ncrdcNo: '',
        cb_debtCounsellor: '',
        cb_contactNo: '',
        cb_applicationDate: '',
        cb_status: '',
        cb_statusDate: '' });

    // Cell number verification from multiple documents
    const [cellVerification, setCellVerification] = useState<{
        letsatsiAgreement: string | null;
        debitOrder: string | null;
        poaSchedule6: string | null;
        allMatch: boolean;
        discrepancyNote: string | null;
    } | null>(null);

    // Error state for submission errors
    const [submitError, setSubmitError] = useState<{
        title: string;
        message: string;
        code: string;
    } | null>(null);

    // Warning for missing documents in combined upload
    const [missingDocsWarning, setMissingDocsWarning] = useState<string | null>(null);
    const [dhsMessage, setDhsMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // Identity Verification Report State
    const [identityReport, setIdentityReport] = useState<any[]>([]);
    const [fieldVerification, setFieldVerification] = useState<any[]>([]);

    useEffect(() => {
        if (extractedData?.documentIdentityReport) {
            setIdentityReport(extractedData.documentIdentityReport);
        }
        if ((extractedData as any)?.verification) {
            setFieldVerification((extractedData as any).verification);
        }
    }, [extractedData]);

    // Duplicate Check State
    const [duplicateError, setDuplicateError] = useState<any | null>(null);
    const [prefixedIdInput, setPrefixedIdInput] = useState('');

    // Re-analyze state (for adding more documents during review)
    const [additionalFiles, setAdditionalFiles] = useState<File[]>([]);
    const [reanalyzing, setReanalyzing] = useState(false);

    // Available services
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

    // Get available months (no future months for current year)
    const currentMonth = new Date().getMonth(); // 0-indexed
    const availableMonths = selectedYear === String(currentYearVal)
        ? MONTHS.slice(0, currentMonth + 1)
        : MONTHS;

    // Filter parent projects based on selected acquisition type (B2B/B2C)
    const filteredParentProjects = parentProjects.filter(p => {
        // Exclude legacy referral sources — they have no related cases
        if (p.name.toLowerCase().includes('referrals')) return false;

        if (acquisitionType === 'B2B') {
            // Strictly show only B2B marked projects, OR projects without clientType (legacy)
            // This ensures we show acquisition sources even if not yet marked
            return p.clientType === 'B2B' || !p.clientType;
        } else {
            // In B2C mode, show explicit B2C or projects with no type (Legacy/Generic)
            // But exclude explicit B2B AND known Legacy B2B Partners
            if (p.clientType === 'B2B') return false;

            // Exclude Legacy B2B partners by name if they haven't been migrated yet
            const name = p.name.toLowerCase();
            // Check for known B2B partner names
            if (name.includes('letsatsi') || name.includes('shosholoza') || name.includes('future finance')) {
                return false;
            }

            return true;
        }
    });

    // Debug logging
    logger.info('Parent Projects:', parentProjects);
    logger.info('Acquisition Type:', acquisitionType);
    logger.info('Filtered Projects:', filteredParentProjects);

    // Visible debug for user
    if (parentProjects.length > 0 && filteredParentProjects.length === 0) {
        logger.warn(`⚠️ ${parentProjects.length} projects fetched but ALL filtered out for ${acquisitionType} mode!`);
    }

    // Get selected parent project and its children
    const selectedParent = parentProjects.find(p => p.id === selectedParentId);
    const subprojects = selectedParent?.children?.filter(c =>
        c.type === 'BRANCH' || c.type === 'FOLDER'
    ) || [];

    // Helper functions to get partner and branch names from selected projects
    const getPartnerNameFromProject = (): string | null => {
        if (!selectedParent) return null;
        // Extract partner name from project (e.g., "Letsatsi Referrals" -> "Letsatsi Finance")
        const name = selectedParent.name;
        if (name.toLowerCase().includes('letsatsi')) return 'Letsatsi Finance';
        if (name.toLowerCase().includes('shosholoza')) return 'Shosholoza Finance';
        if (name.toLowerCase().includes('future')) return 'Future Finance';
        return name; // Return as-is if no match
    };

    const getBranchNameFromProject = (): string | null => {
        if (!selectedSubprojectId) return null;
        const branch = subprojects.find(s => s.id === selectedSubprojectId);
        return branch?.name || null;
    };

    useEffect(() => {
        async function fetchProjects() {
            try {
                // Fetch hierarchical projects
                const res = await fetch('/api/projects');
                const data = await res.json();

                // Get ACQUISITION_SOURCE projects (main parent projects)
                // Get ACQUISITION_SOURCE projects (main parent projects)
                const mainProjects: Project[] = [];
                if (data.hierarchy?.children) {
                    mainProjects.push(...data.hierarchy.children.filter(
                        (p: Project) => p.type === 'ACQUISITION_SOURCE'
                    ));
                }

                if (data.independent) {
                    mainProjects.push(...data.independent.filter(
                        (p: Project) => p.type === 'ACQUISITION_SOURCE'
                    ));
                }

                // Remove duplicates by ID
                const uniqueProjects = Array.from(new Map(mainProjects.map(p => [p.id, p])).values());

                setParentProjects(uniqueProjects);
            } catch (error) {
                logger.error('Failed to fetch projects', error);
            } finally {
                setLoading(false);
            }
        }
        fetchProjects();
    }, []);

    // Reset parent selection when acquisition type changes
    useEffect(() => {
        setSelectedParentId('');
        setSelectedSubprojectId('');
        // REMOVED: Reseting Year/Month
    }, [acquisitionType]);

    // Reset dependent selections when parent changes
    useEffect(() => {
        setSelectedSubprojectId('');
        // REMOVED: Reseting Year/Month
    }, [selectedParentId]);

    const handleFileChange = (type: 'id' | 'poa' | 'creditReport' | 'bankStatement' | 'payslip' | 'form16' | 'form171' | 'form172' | 'form177' | 'clearance' | 'allCombined' | 'optional', file: File | null) => {
        if (type === 'optional' && file) {
            setUploadedFiles(prev => ({
                ...prev,
                optional: [...prev.optional, file]
            }));
        } else if (file) {
            setUploadedFiles(prev => ({ ...prev, [type]: file }));
        }
    };

    // Check if required documents are uploaded based on mode
    const hasRequiredDocs = uploadMode === 'combined'
        ? !!uploadedFiles.allCombined
        : (!!uploadedFiles.id || !!uploadedFiles.poa || !!uploadedFiles.creditReport || uploadedFiles.optional.length > 0);

    // Create or find the final project based on selections
    const handleContinueToUpload = async () => {
        if (!selectedParentId || !selectedYear || !selectedMonth) {
            alert('Please select a parent project, year, and month');
            return;
        }

        setCreatingProject(true);

        try {
            // Build the project path
            const baseProjectId = selectedSubprojectId || selectedParentId;

            // Call API to create/find year project under base
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

            // Create/find month project under year
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
            window.scrollTo({ top: 0, behavior: 'instant' });
        } catch (error) {
            logger.error('Error creating project path:', error);
            alert('Failed to create project structure. Please try again.');
        } finally {
            setCreatingProject(false);
        }
    };

    const handleUploadAndAnalyze = async () => {
        // Validate based on upload mode
        if (uploadMode === 'combined') {
            if (!uploadedFiles.allCombined) {
                alert('Please upload the combined PDF document');
                return;
            }
        } else {
            // Separate mode - require at least one file
            if (!uploadedFiles.id && !uploadedFiles.poa && !uploadedFiles.creditReport && uploadedFiles.optional.length === 0) {
                alert('Please upload at least one document to proceed.');
                return;
            }
        }

        setUploading(true);
        setAnalyzing(true);

        try {
            // Create temporary case to store documents
            const tempCase = await fetch('/api/cases', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client: {
                        firstName: 'Temp',
                        lastName: 'Processing',
                        idNumber: `TEMP-${Date.now()}` },
                    projectId: finalProjectId, // Use the final project (month)
                    // B2B/B2C Classification
                    acquisitionType,
                    partnerName: acquisitionType === 'B2B' ? getPartnerNameFromProject() : null,
                    partnerBranch: acquisitionType === 'B2B' ? getBranchNameFromProject() : null,
                    partnerSplitPercent: acquisitionType === 'B2B' ? 50 : 0 }) });

            if (!tempCase.ok) throw new Error('Failed to create temporary case');
            const tempCaseData = await tempCase.json();
            setTempCaseId(tempCaseData.id);

            // Upload documents for AI analysis
            const formDataUpload = new FormData();
            formDataUpload.append('caseId', tempCaseData.id);

            // If it's a partner case, we might want to skip analysis if specified
            if (partnerIdParam) {
                formDataUpload.append('skipAnalysis', 'true');
            }

            if (uploadMode === 'combined' && uploadedFiles.allCombined) {
                // Combined mode - single PDF with all docs
                formDataUpload.append('files', uploadedFiles.allCombined);
                formDataUpload.append('combined', 'true');
            } else {
                // Separate mode - individual files
                // Use specific field names so backend can identify types regardless of filename
                if (uploadedFiles.id) formDataUpload.append('file_ID', uploadedFiles.id);
                if (uploadedFiles.poa) formDataUpload.append('file_POA', uploadedFiles.poa);
                if (uploadedFiles.creditReport) formDataUpload.append('file_CREDIT_REPORT', uploadedFiles.creditReport);
                if (uploadedFiles.bankStatement) formDataUpload.append('file_BANK_STATEMENT', uploadedFiles.bankStatement);
                if (uploadedFiles.payslip) formDataUpload.append('file_PAYSLIP', uploadedFiles.payslip);
                if (uploadedFiles.form16) formDataUpload.append('file_FORM_16', uploadedFiles.form16);
                if (uploadedFiles.form171) formDataUpload.append('file_FORM_17_1', uploadedFiles.form171);
                if (uploadedFiles.form172) formDataUpload.append('file_FORM_17_2', uploadedFiles.form172);
                if (uploadedFiles.form177) formDataUpload.append('file_FORM_17_7', uploadedFiles.form177);
                if (uploadedFiles.clearance) formDataUpload.append('file_CLEARANCE', uploadedFiles.clearance);
            }
            // Optional files still use generic 'files'
            uploadedFiles.optional.forEach(file => formDataUpload.append('files', file));

            // Upload documents with progress tracking
            const result = await new Promise<any>((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', '/api/documents/upload');

                xhr.upload.onprogress = (event) => {
                    if (event.lengthComputable) {
                        // Cap at 55% — remaining % represents server-side AI extraction + analysis
                        const percentComplete = Math.round((event.loaded / event.total) * 55);
                        setUploadProgress(percentComplete);
                        setProgressMessage('Uploading documents...');
                    }
                };

                xhr.upload.onload = () => {
                    // HTTP transfer done — simulate server-side AI phases with timed messages
                    // Clear any previous timeouts
                    progressTimeoutsRef.current.forEach(clearTimeout);
                    progressTimeoutsRef.current = [];

                    // Build list of uploaded doc types for phase labels
                    const isCombinedUpload = !!uploadedFiles.allCombined;
                    const docTypes: string[] = [];
                    if (!isCombinedUpload) {
                        if (uploadedFiles.id) docTypes.push('ID');
                        if (uploadedFiles.poa) docTypes.push('POA');
                        if (uploadedFiles.creditReport) docTypes.push('Credit Report');
                        if (uploadedFiles.bankStatement) docTypes.push('Bank Statement');
                        if (uploadedFiles.payslip) docTypes.push('Payslip');
                    }
                    if (docTypes.length === 0) docTypes.push('Documents');

                    const docCount = docTypes.length;
                    // Extraction phase: 55% → 60%, spread across docs
                    const extractionStepMs = docCount > 0 ? Math.round(4000 / docCount) : 4000;
                    // Analysis phase: 61% → 79%, spread across docs
                    const analysisStepMs = docCount > 0 ? Math.round(10000 / docCount) : 10000;

                    let delay = 200;

                    if (isCombinedUpload) {
                        // Combined flow: single extraction message then single analysis message
                        const t1 = setTimeout(() => {
                            setProgressMessage('Extracting documents from combined PDF...');
                            setUploadProgress(58);
                        }, delay);
                        progressTimeoutsRef.current.push(t1);
                        delay += 5000;

                        const t2 = setTimeout(() => {
                            setProgressMessage('Analysing extracted documents...');
                            setUploadProgress(70);
                        }, delay);
                        progressTimeoutsRef.current.push(t2);
                        delay += 10000;
                    } else {
                        // Separate files: per-document extraction then analysis
                        docTypes.forEach((docType, i) => {
                            const pct = 55 + Math.round(((i + 1) / docCount) * 5); // 55→60
                            const t = setTimeout(() => {
                                setProgressMessage(`Extracting ${docType}...`);
                                setUploadProgress(pct);
                            }, delay);
                            progressTimeoutsRef.current.push(t);
                            delay += extractionStepMs;
                        });

                        docTypes.forEach((docType, i) => {
                            const pct = 61 + Math.round(((i + 1) / docCount) * 18); // 61→79
                            const t = setTimeout(() => {
                                setProgressMessage(`Analysing ${docType}...`);
                                setUploadProgress(pct);
                            }, delay);
                            progressTimeoutsRef.current.push(t);
                            delay += analysisStepMs;
                        });
                    }

                    // Summarising phase at 80%
                    const summariseT = setTimeout(() => {
                        setProgressMessage('Summarising findings...');
                        setUploadProgress(80);
                    }, delay);
                    progressTimeoutsRef.current.push(summariseT);
                };

                xhr.onload = () => {
                    // Clear all simulated phase timeouts
                    progressTimeoutsRef.current.forEach(clearTimeout);
                    progressTimeoutsRef.current = [];

                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            const response = JSON.parse(xhr.responseText);
                            setProgressMessage('Complete!');
                            setUploadProgress(100);
                            resolve(response);
                        } catch (e) {
                            reject(new Error('Invalid JSON response from server'));
                        }
                    } else {
                        try {
                            const errorResponse = JSON.parse(xhr.responseText);
                            reject(new Error(errorResponse.details || errorResponse.error || 'Failed to upload documents'));
                        } catch (e) {
                            reject(new Error(`Upload failed with status ${xhr.status} ${xhr.statusText}`));
                        }
                    }
                };

                xhr.onerror = () => reject(new Error('Network error during upload'));
                xhr.send(formDataUpload);
            });

            logger.info('Upload complete, result:', result);
            setExtractedData(result.extractedData || {});
            setFieldVerification(result.extractedData?.verification || []);

            // Auto-populate form with extracted data
            // Auto-detect client type based on service fee
            const serviceFee = result.extractedData?.poa?.serviceFee || result.extractedData?.creditReport?.serviceFee;
            let detectedCategory = result.extractedData?.poa?.clientType || 'Standard';
            if (!detectedCategory || detectedCategory === 'Standard') {
                if (serviceFee === 4950) detectedCategory = 'Payroll Single';
                else if (serviceFee === 5500) detectedCategory = 'Non-Payroll Single';
                else if (serviceFee === 8500) detectedCategory = 'Joint';
            }

            // Get employer from payslip, then POA, then credit report consumer section
            const employer = result.extractedData?.salary?.employer || result.extractedData?.poa?.employer || result.extractedData?.creditReport?.consumer?.employer || '';

            // Store cell number verification data
            const cellVerificationData = result.extractedData?.poa?.cellNumberVerification;
            if (cellVerificationData) {
                setCellVerification(cellVerificationData);
            }

            // Helper to return 'NA' for missing/null/empty string fields
            const naStr = (val: string | null | undefined) => (val && val !== 'null' && val !== 'NA' ? val : 'NA');

            // Fallback: if no separate ID doc, use poa.surname/names, then split clientName
            const poaSurname = result.extractedData?.poa?.surname;
            const poaNames = result.extractedData?.poa?.names;
            const poaClientName = result.extractedData?.poa?.clientName || '';
            const nameParts = poaClientName.split(' ');
            const fallbackSurname = poaSurname || (nameParts.length > 1 ? nameParts[nameParts.length - 1] : poaClientName);
            const fallbackNames = poaNames || (nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : '');

            // Salary: prefer payslip, then credit report income section, then POA application form
            const grossSalaryVal = result.extractedData?.payslip?.grossSalary
                || result.extractedData?.creditReport?.income?.grossSalary
                || result.extractedData?.poa?.grossSalary
                || 0;
            const netSalaryVal = result.extractedData?.payslip?.netSalary
                || result.extractedData?.creditReport?.income?.netSalary
                || result.extractedData?.poa?.netSalary
                || 0;

            setFormData({
                surname: naStr(result.extractedData?.id?.surname || fallbackSurname),
                names: naStr(result.extractedData?.id?.names || fallbackNames),
                idNumber: naStr(result.extractedData?.id?.idNumber || result.extractedData?.poa?.idNumber),
                cellNumber: naStr(result.extractedData?.poa?.cellNumber),
                whatsappNumber: naStr(result.extractedData?.poa?.whatsappNumber),
                email: naStr(result.extractedData?.poa?.email),
                alternativeEmail: '',
                alternativePhone: '',
                address: naStr(result.extractedData?.poa?.address),
                employer: employer || naStr(result.extractedData?.poa?.employer),
                employeeNo: naStr(result.extractedData?.poa?.employeeNo),
                grossSalary: grossSalaryVal > 0 ? grossSalaryVal.toString() : '',
                netSalary: netSalaryVal > 0 ? netSalaryVal.toString() : '',
                // Prefer bank statement deposit date (most reliable) over payslip period-end estimate
                salaryPayDate: result.extractedData?.bankStatement?.latestSalaryDeposit?.date || result.extractedData?.payslip?.payDate || '',
                affordabilityStatus: result.extractedData?.creditReport?.income?.affordability || result.extractedData?.affordability?.status || '',
                category: detectedCategory,
                closedAccounts: result.extractedData?.creditReport?.summary?.closedAccounts || result.extractedData?.creditReport?.closedAccounts || 0,
                openAccounts: result.extractedData?.creditReport?.summary?.activeAccounts || result.extractedData?.creditReport?.openAccounts || 0,
                prescribedAccounts: result.extractedData?.creditReport?.prescribedAccounts || 0,
                ncrdcNo: '', // Disabled auto-fill as per request
                serviceFee: serviceFee?.toString() || '',
                instalments: result.extractedData?.poa?.instalments || 1,
                totalDebtAmount: (result.extractedData?.creditReport?.summary?.totalDebt || 0).toString(),
                totalMonthlyInstallment: (result.extractedData?.creditReport?.summary?.totalInstallment || 0).toString(),

                // CB Specific Fields
                cb_ncrdcNo: naStr(result.extractedData?.creditReport?.debtRestructuring?.ncrdcNo),
                cb_debtCounsellor: naStr(result.extractedData?.creditReport?.debtRestructuring?.debtCounsellorName),
                cb_contactNo: naStr(result.extractedData?.creditReport?.debtRestructuring?.debtCounsellorNumber),
                cb_applicationDate: naStr(result.extractedData?.creditReport?.debtRestructuring?.debtReviewDate),
                cb_status: naStr(result.extractedData?.creditReport?.debtRestructuring?.dhsStatus),
                cb_statusDate: naStr(result.extractedData?.creditReport?.debtRestructuring?.statusDate) });

            setStep(3); // Move to review step
            window.scrollTo({ top: 0, behavior: 'instant' });

            // Set warnings for missing documents
            const missingDocs = [];
            if (result.extractedData?.validation?.missingID) missingDocs.push('ID Document');
            if (result.extractedData?.validation?.missingPOA) missingDocs.push('Signed POA');

            if (missingDocs.length > 0) {
                setMissingDocsWarning(`Warning: The following mandatory documents were NOT detected in the combined file: ${missingDocs.join(', ')}. Please ensure they are uploaded or the case may be rejected.`);
            } else {
                setMissingDocsWarning(null);
            }

        } catch (error) {
            logger.error('Upload error:', error);
            alert(`Failed to upload and analyze documents: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setUploading(false);
            setAnalyzing(false);
            setUploadProgress(0);
            setProgressMessage('Uploading documents...');
            progressTimeoutsRef.current.forEach(clearTimeout);
            progressTimeoutsRef.current = [];
        }
    };

    const handleManualEntry = async () => {
        setUploading(true);
        try {
            // Create temporary case shell
            const tempCase = await fetch('/api/cases', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client: {
                        firstName: 'Manual',
                        lastName: 'Entry',
                        idNumber: `MANUAL-${Date.now()}` },
                    projectId: finalProjectId,
                    acquisitionType,
                    partnerName: acquisitionType === 'B2B' ? getPartnerNameFromProject() : null,
                    partnerBranch: acquisitionType === 'B2B' ? getBranchNameFromProject() : null,
                    partnerSplitPercent: acquisitionType === 'B2B' ? 50 : 0 }) });

            if (!tempCase.ok) throw new Error('Failed to initialize case');
            const tempCaseData = await tempCase.json();
            setTempCaseId(tempCaseData.id);

            // Clear any potential extracted data and move to form
            setExtractedData({});
            setCellVerification(null);
            setFormData({
                surname: '',
                names: '',
                idNumber: '',
                cellNumber: '',
                whatsappNumber: '',
                email: '',
                alternativeEmail: '',
                alternativePhone: '',
                address: '',
                employer: '',
                employeeNo: '',
                grossSalary: '',
                netSalary: '',
                salaryPayDate: '',
                affordabilityStatus: '',
                category: 'Standard',
                closedAccounts: 0,
                openAccounts: 0,
                prescribedAccounts: 0,
                ncrdcNo: '',
                serviceFee: '',
                instalments: 1,
                totalDebtAmount: '',
                totalMonthlyInstallment: '',
                // CB specific
                cb_ncrdcNo: '',
                cb_debtCounsellor: '',
                cb_contactNo: '',
                cb_applicationDate: '',
                cb_status: '',
                cb_statusDate: '' });
            setStep(3);
            window.scrollTo({ top: 0, behavior: 'instant' });
        } catch (error) {
            logger.error('Manual entry initialization failed:', error);
            alert('Failed to initialize manual case. Please try again.');
        } finally {
            setUploading(false);
        }
    };

    // Re-analyze with additional documents
    const handleReanalyze = async () => {
        if (additionalFiles.length === 0) {
            alert('Please select at least one additional document to upload.');
            return;
        }

        setReanalyzing(true);

        try {
            // Upload additional documents to existing temp case
            const formDataUpload = new FormData();
            formDataUpload.append('caseId', tempCaseId);
            additionalFiles.forEach(file => formDataUpload.append('files', file));

            const result = await new Promise<any>((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', '/api/documents/upload');

                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            const response = JSON.parse(xhr.responseText);
                            resolve(response);
                        } catch (e) {
                            reject(new Error('Invalid JSON response from server'));
                        }
                    } else {
                        try {
                            const errorResponse = JSON.parse(xhr.responseText);
                            reject(new Error(errorResponse.details || errorResponse.error || 'Failed to upload documents'));
                        } catch (e) {
                            reject(new Error(`Upload failed with status ${xhr.status}`));
                        }
                    }
                };

                xhr.onerror = () => reject(new Error('Network error during upload'));
                xhr.send(formDataUpload);
            });

            logger.info('Additional upload complete, result:', result);

            // Merge new extracted data with existing form data
            const newData = result.extractedData || {};

            setFormData(prev => ({
                ...prev,
                // Only update fields that are currently empty and have new values
                surname: prev.surname || newData.id?.surname || '',
                names: prev.names || newData.id?.names || '',
                idNumber: prev.idNumber || newData.id?.idNumber || '',
                cellNumber: prev.cellNumber || newData.poa?.cellNumber || '',
                email: prev.email || newData.poa?.email || '',
                address: prev.address || newData.poa?.address || '',
                employer: prev.employer || newData.salary?.employer || newData.poa?.employer || '',
                grossSalary: prev.grossSalary || newData.salary?.grossSalary?.toString() || '',
                netSalary: prev.netSalary || newData.salary?.netSalary?.toString() || '',
                salaryPayDate: prev.salaryPayDate || newData.salary?.salaryPayDate?.toString() || '',
                affordabilityStatus: prev.affordabilityStatus || newData.affordability?.status || '',
                closedAccounts: prev.closedAccounts || newData.creditReport?.summary?.closedAccounts || 0,
                openAccounts: prev.openAccounts || newData.creditReport?.summary?.activeAccounts || 0,
                totalDebtAmount: prev.totalDebtAmount || (newData.creditReport?.summary?.totalDebt || 0).toString(),
                totalMonthlyInstallment: prev.totalMonthlyInstallment || (newData.creditReport?.summary?.totalInstallment || 0).toString(),
                cb_ncrdcNo: prev.cb_ncrdcNo || newData.creditReport?.debtRestructuring?.ncrdcNo || '',
                cb_debtCounsellor: prev.cb_debtCounsellor || newData.creditReport?.debtRestructuring?.debtCounsellorName || '',
                cb_contactNo: prev.cb_contactNo || newData.creditReport?.debtRestructuring?.debtCounsellorNumber || '',
                cb_applicationDate: prev.cb_applicationDate || newData.creditReport?.debtRestructuring?.debtReviewDate || '',
                cb_status: prev.cb_status || newData.creditReport?.debtRestructuring?.dhsStatus || '',
                cb_statusDate: prev.cb_statusDate || newData.creditReport?.debtRestructuring?.statusDate || '' }));

            // Update extracted data for identity report
            setExtractedData(prev => ({
                ...prev,
                ...newData,
                documentIdentityReport: [
                    ...(prev.documentIdentityReport || []),
                    ...(newData.documentIdentityReport || [])
                ]
            }));

            // Clear additional files after successful upload
            setAdditionalFiles([]);
            setMissingDocsWarning(null);

            alert('Documents uploaded and analyzed successfully! Form data has been updated.');

        } catch (error) {
            logger.error('Re-analyze error:', error);
            alert(`Failed to upload and analyze: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setReanalyzing(false);
        }
    };

    const handleSubmit = async (forceUpdate = false) => {
        // Validate required fields before submitting
        const emailVal = formData.email?.trim();
        if (!emailVal || emailVal === 'NA') {
            setSubmitError({ title: '❌ Email Required', message: 'Please enter the client\'s email address before creating the case.', code: 'MISSING_EMAIL' });
            return;
        }

        setSubmitting(true);
        // Clear previous errors
        setSubmitError(null);

        // Strip "NA" placeholder values (set by naStr when AI can't extract a field)
        // back to null so they pass Zod validation (phone regex, email format, etc.)
        const clean = (val: string | null | undefined) => (!val || val === 'NA') ? null : val;

        try {
            // Update the temporary case with real client data and services
            const res = await fetch(`/api/cases/${tempCaseId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client: {
                        firstName: formData.names.split(' ')[0], // Simplistic split, maybe user should enter separate? Form has 'names' field.
                        lastName: formData.surname,
                        idNumber: formData.idNumber,
                        email: clean(formData.email),
                        alternativeEmail: clean(formData.alternativeEmail),
                        phone: clean(formData.cellNumber),
                        alternativePhone: clean(formData.alternativePhone),
                        address: clean(formData.address),
                        employer: clean(formData.employer),
                        employeeNo: clean(formData.employeeNo),
                        grossSalary: clean(formData.grossSalary),
                        netSalary: clean(formData.netSalary),
                        salaryPayDate: clean(formData.salaryPayDate),
                        type: formData.category },
                    closedAccounts: formData.closedAccounts,
                    openAccounts: formData.openAccounts,
                    prescribedAccounts: formData.prescribedAccounts,
                    ncrdcNo: clean(formData.ncrdcNo),
                    services: selectedServices,
                    serviceFee: clean(formData.serviceFee),
                    instalments: formData.instalments || 1,
                    affordabilityStatus: clean(formData.affordabilityStatus),
                    totalDebtAmount: formData.totalDebtAmount ? parseFloat(formData.totalDebtAmount) : null,
                    totalMonthlyInstallment: formData.totalMonthlyInstallment ? parseFloat(formData.totalMonthlyInstallment) : null,

                    cb_ncrdcNo: clean(formData.cb_ncrdcNo),
                    cb_debtCounsellor: clean(formData.cb_debtCounsellor),
                    cb_contactNo: clean(formData.cb_contactNo),
                    cb_applicationDate: clean(formData.cb_applicationDate),
                    cb_status: clean(formData.cb_status),
                    cb_statusDate: clean(formData.cb_statusDate),

                    forceUpdate // Allow overriding duplicates
                }) });

            const data = await res.json();

            if (!res.ok) {
                if (res.status === 409 && data.code === 'DUPLICATE_ID_NUMBER') {
                    setDuplicateError(data);
                    setSubmitting(false);
                    return;
                }

                // Handle other errors
                const errorData = data;
                let errorMessage = errorData.error || 'Failed to create case';
                let errorTitle = '❌ Error';

                if (errorData.code === 'DUPLICATE_EMAIL') {
                    errorTitle = '❌ Email Already Exists';
                    errorMessage = errorData.error;
                } else if (errorData.code === 'DUPLICATE_PHONE') {
                    errorTitle = '❌ Cell Number Already Exists';
                    errorMessage = errorData.error;
                } else if (errorData.code === 'CASE_NOT_FOUND') {
                    errorTitle = '❌ Case Not Found';
                    errorMessage = 'The case you\'re trying to update no longer exists.';
                } else if (errorData.code === 'VALIDATION_ERROR') {
                    errorTitle = '❌ Data Validation Error';
                    errorMessage = `${errorData.error}\n\n${errorData.details || ''}`;
                } else if (errorData.code === 'INTERNAL_ERROR') {
                    errorTitle = '❌ Server Error';
                    errorMessage = `${errorData.error}\n\nDetails: ${errorData.details || 'Unknown error'}`;
                }

                // Append Zod field-level errors when present (e.g. from parseBody returning { error, errors })
                if (errorData.errors && typeof errorData.errors === 'object') {
                    const fieldLines = Object.entries(errorData.errors as Record<string, string[]>)
                        .map(([field, msgs]) => `• ${field}: ${msgs.join(', ')}`)
                        .join('\n');
                    if (fieldLines) errorMessage = `${errorMessage}\n\n${fieldLines}`;
                }

                setSubmitError({ title: errorTitle, message: errorMessage, code: errorData.code });
                return;
            }

            // Success - Redirect to the new (or merged) case
            router.push(`/cases/${data.id}`);
        } catch (error) {
            logger.error('Error:', error);
            setSubmitError({
                title: '❌ Connection Error',
                message: 'Failed to create case. Please check your internet connection and try again.',
                code: 'NETWORK_ERROR'
            });
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-gray-400">Loading...</div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto">
            <div className="mb-8">
                <Link href="/cases" className="text-zeno-cyan hover:text-cyan-300 text-sm mb-4 inline-block">
                    ← Back to Cases
                </Link>
                <h1 className="text-3xl font-bold text-white mb-2">Add New Case</h1>
                <p className="text-gray-400">AI-powered document analysis for instant data extraction</p>
            </div>

            {/* Progress Steps */}
            <div className="mb-8 flex items-center justify-between">
                {[
                    { num: 1, label: 'Select Period & Source' },
                    { num: 2, label: 'Upload Documents' },
                    { num: 3, label: 'Review & Edit' },
                ].map((s, i) => (
                    <div key={s.num} className="flex items-center">
                        <div className={`flex items-center justify-center w-10 h-10 rounded-full font-bold ${step >= s.num ? 'bg-zeno-cyan text-zeno-navy' : 'bg-gray-700 text-gray-400'
                            }`}>
                            {s.num}
                        </div>
                        <span className={`ml-2 text-sm ${step >= s.num ? 'text-white' : 'text-gray-500'}`}>
                            {s.label}
                        </span>
                        {i < 2 && <div className="w-16 h-0.5 bg-gray-700 mx-4" />}
                    </div>
                ))}
            </div>

            {/* Step 1: Project Selection */}
            {step === 1 && (
                <div className="bg-zeno-blue/20 rounded-xl border border-white/5 p-6">
                    <h2 className="text-xl font-semibold text-white mb-6">Case Details</h2>

                    {/* 1. Year & Month Selection (Top Row) */}
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">
                                1. Year <span className="text-red-400">*</span>
                            </label>
                            <select
                                value={selectedYear}
                                onChange={(e) => setSelectedYear(e.target.value)}
                                className="w-full px-4 py-3 bg-zeno-navy border border-white/10 rounded-lg text-white focus:border-zeno-cyan focus:outline-none"
                            >
                                <option value="">Select year...</option>
                                {years.map(year => (
                                    <option key={year} value={year}>{year}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">
                                2. Month <span className="text-red-400">*</span>
                            </label>
                            <select
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(e.target.value)}
                                className="w-full px-4 py-3 bg-zeno-navy border border-white/10 rounded-lg text-white focus:border-zeno-cyan focus:outline-none"
                            >
                                <option value="">Select month...</option>
                                {MONTHS.map(month => (
                                    <option key={month} value={month}>{month}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="w-full h-px bg-white/5 my-6"></div>

                    {/* 2. Source Type Selection */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-400 mb-3">
                            3. Client Source Type <span className="text-red-400">*</span>
                        </label>
                        <div className="flex gap-4">
                            <button
                                type="button"
                                onClick={() => setAcquisitionType('B2B')}
                                className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all ${acquisitionType === 'B2B'
                                    ? 'bg-indigo-600/30 border-indigo-500 text-white'
                                    : 'bg-zeno-navy border-white/10 text-gray-400 hover:border-white/30'
                                    }`}
                            >
                                <div className="text-lg font-semibold">B2B (Partner)</div>
                                <div className="text-xs mt-1 opacity-70">Letsatsi, Shosholoza, etc.</div>
                                <div className="text-xs mt-1 text-green-400">No R350 required</div>
                            </button>
                            <button
                                type="button"
                                onClick={() => setAcquisitionType('B2C')}
                                className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all ${acquisitionType === 'B2C'
                                    ? 'bg-cyan-600/30 border-cyan-500 text-white'
                                    : 'bg-zeno-navy border-white/10 text-gray-400 hover:border-white/30'
                                    }`}
                            >
                                <div className="text-lg font-semibold">B2C (Private)</div>
                                <div className="text-xs mt-1 opacity-70">Direct client, Dealership</div>
                                <div className="text-xs mt-1 text-yellow-400">R350 required</div>
                            </button>
                        </div>
                    </div>

                    {/* 4. Main Source Project */}
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-400 mb-2">
                            4. Main Source <span className="text-red-400">*</span>
                            {filteredParentProjects.length === 0 && parentProjects.length > 0 && (
                                <span className="text-yellow-400 text-xs ml-2">
                                    (No {acquisitionType} sources configured)
                                </span>
                            )}
                        </label>
                        <select
                            value={selectedParentId}
                            onChange={(e) => setSelectedParentId(e.target.value)}
                            className="w-full px-4 py-3 bg-zeno-navy border border-white/10 rounded-lg text-white focus:border-zeno-cyan focus:outline-none"
                            required
                        >    <option value="">Choose main source...</option>
                            {filteredParentProjects.map(project => (
                                <option key={project.id} value={project.id}>
                                    {project.name}
                                    {project.clientType && ` (${project.clientType})`}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Subproject (Optional) */}
                    {selectedParentId && (
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-400 mb-2">
                                5. Branch/Subproject <span className="text-gray-600">(Optional)</span>
                            </label>
                            <select
                                value={selectedSubprojectId}
                                onChange={(e) => setSelectedSubprojectId(e.target.value)}
                                className="w-full px-4 py-3 bg-zeno-navy border border-white/10 rounded-lg text-white focus:border-zeno-cyan focus:outline-none"
                            >
                                <option value="">No subproject (use main source)</option>
                                {subprojects.map(project => (
                                    <option key={project.id} value={project.id}>{project.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Services Selection */}
                    {selectedMonth && (
                        <div className="mb-6">
                            <div className="flex items-center justify-between mb-3">
                                <label className="block text-sm font-medium text-gray-400">
                                    6. Services Required <span className="text-red-400">*</span>
                                </label>
                                <button
                                    type="button"
                                    onClick={handleSelectAllServices}
                                    className="text-xs text-zeno-cyan hover:text-cyan-300 transition-colors"
                                >
                                    {selectedServices.length === SERVICES.length ? 'Deselect All' : 'Select All'}
                                </button>
                            </div>
                            <div className="bg-zeno-navy/50 rounded-lg border border-white/5 p-4 max-h-64 overflow-y-auto">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {SERVICES.map(service => (
                                        <label
                                            key={service.id}
                                            className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedServices.includes(service.id)}
                                                onChange={() => handleServiceToggle(service.id)}
                                                className="w-4 h-4 rounded border-white/20 bg-zeno-navy text-zeno-cyan focus:ring-zeno-cyan focus:ring-offset-0"
                                            />
                                            <span className="text-sm text-white">{service.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            {selectedServices.length > 0 && (
                                <p className="text-xs text-gray-500 mt-2">
                                    {selectedServices.length} service{selectedServices.length !== 1 ? 's' : ''} selected
                                </p>
                            )}
                        </div>
                    )}

                    {/* Summary */}
                    {selectedMonth && selectedServices.length > 0 && (
                        <div className="mb-6 p-4 bg-zeno-navy/50 rounded-lg border border-white/5">
                            <p className="text-sm text-gray-400 mb-1">Case will be created under:</p>
                            <p className="text-white font-medium">
                                {selectedYear} {selectedMonth}
                                {selectedParent && ` → ${selectedParent.name}`}
                                {selectedSubprojectId && subprojects.find(s => s.id === selectedSubprojectId) &&
                                    ` → ${subprojects.find(s => s.id === selectedSubprojectId)?.name}`}
                            </p>
                            <p className="text-sm text-gray-400 mt-2">
                                Services: <span className="text-zeno-cyan">{selectedServices.length} selected</span>
                            </p>
                        </div>
                    )}

                    <div className="flex justify-end">
                        <button
                            onClick={handleContinueToUpload}
                            disabled={!selectedParentId || !selectedYear || !selectedMonth || selectedServices.length === 0 || creatingProject}
                            className={`
                                px-8 py-3 rounded-lg font-bold text-white transition-all
                                ${!selectedParentId || !selectedYear || !selectedMonth || selectedServices.length === 0 || creatingProject
                                    ? 'bg-gray-700 cursor-not-allowed opacity-50'
                                    : 'bg-zeno-cyan hover:bg-cyan-600 shadow-lg shadow-cyan-900/20'
                                }
                            `}
                        >
                            {creatingProject ? 'Initializing...' : 'Continue to Upload Documents'}
                        </button>
                    </div>
                </div>
            )}

            {/* Step 2: Upload Documents */}
            {step === 2 && (
                <div className="bg-zeno-blue/20 rounded-xl border border-white/5 p-6">
                    <h2 className="text-xl font-semibold text-white mb-6">Upload Documents</h2>

                    {/* Upload Mode Toggle */}
                    <div className="flex bg-zeno-navy p-1 rounded-lg mb-6 w-fit">
                        <button
                            className={`px-4 py-2 rounded-md text-sm transition-all ${uploadMode === 'separate' ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                            onClick={() => setUploadMode('separate')}
                        >
                            Separate Files
                        </button>
                        <button
                            className={`px-4 py-2 rounded-md text-sm transition-all ${uploadMode === 'combined' ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                            onClick={() => setUploadMode('combined')}
                        >
                            One Combined PDF
                        </button>
                    </div>

                    {uploadMode === 'separate' ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-300">ID Copy</label>
                                <div className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${uploadedFiles.id ? 'border-zeno-cyan/50 bg-zeno-cyan/10' : 'border-white/10 hover:border-white/30'}`}>
                                    <input
                                        type="file"
                                        id="id-upload"
                                        className="hidden"
                                        onChange={(e) => handleFileChange('id', e.target.files?.[0] || null)}
                                        accept=".pdf,image/*"
                                    />
                                    <label htmlFor="id-upload" className="cursor-pointer">
                                        {uploadedFiles.id ? (
                                            <div className="text-zeno-cyan font-medium flex items-center justify-center gap-2">
                                                <span>✓</span> {uploadedFiles.id.name}
                                            </div>
                                        ) : (
                                            <div className="text-gray-400">
                                                <span className="text-2xl block mb-2">🆔</span>
                                                Click to upload ID
                                            </div>
                                        )}
                                    </label>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-300">Signed POA</label>
                                <div className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${uploadedFiles.poa ? 'border-zeno-cyan/50 bg-zeno-cyan/10' : 'border-white/10 hover:border-white/30'}`}>
                                    <input
                                        type="file"
                                        id="poa-upload"
                                        className="hidden"
                                        onChange={(e) => handleFileChange('poa', e.target.files?.[0] || null)}
                                        accept=".pdf,image/*"
                                    />
                                    <label htmlFor="poa-upload" className="cursor-pointer">
                                        {uploadedFiles.poa ? (
                                            <div className="text-zeno-cyan font-medium flex items-center justify-center gap-2">
                                                <span>✓</span> {uploadedFiles.poa.name}
                                            </div>
                                        ) : (
                                            <div className="text-gray-400">
                                                <span className="text-2xl block mb-2">📝</span>
                                                Click to upload POA
                                            </div>
                                        )}
                                    </label>
                                </div>
                            </div>

                             <div className="space-y-2 col-span-2">
                                <label className="block text-sm font-medium text-gray-300">Credit Report (Experian, XDS, ClearScore, TransUnion, etc.)</label>
                                <div className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${uploadedFiles.creditReport ? 'border-zeno-cyan/50 bg-zeno-cyan/10' : 'border-white/10 hover:border-white/30'}`}>
                                    <input
                                        type="file"
                                        id="credit-upload"
                                        className="hidden"
                                        onChange={(e) => handleFileChange('creditReport', e.target.files?.[0] || null)}
                                        accept=".pdf"
                                    />
                                    <label htmlFor="credit-upload" className="cursor-pointer">
                                        {uploadedFiles.creditReport ? (
                                            <div className="text-zeno-cyan font-medium flex items-center justify-center gap-2">
                                                <span>✓</span> {uploadedFiles.creditReport.name}
                                            </div>
                                        ) : (
                                            <div className="text-gray-400">
                                                <span className="text-2xl block mb-2">📊</span>
                                                Click to upload Credit Report
                                                <span className="block text-xs mt-1 text-gray-500">AI will automatically identify the bureau and category</span>
                                            </div>
                                        )}
                                    </label>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-300">Bank Statement</label>
                                <div className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${uploadedFiles.bankStatement ? 'border-zeno-cyan/50 bg-zeno-cyan/10' : 'border-white/10 hover:border-white/30'}`}>
                                    <input
                                        type="file"
                                        id="bank-upload"
                                        className="hidden"
                                        onChange={(e) => handleFileChange('bankStatement', e.target.files?.[0] || null)}
                                        accept=".pdf"
                                    />
                                    <label htmlFor="bank-upload" className="cursor-pointer">
                                        {uploadedFiles.bankStatement ? (
                                            <div className="text-zeno-cyan font-medium flex items-center justify-center gap-2">
                                                <span>✓</span> {uploadedFiles.bankStatement.name}
                                            </div>
                                        ) : (
                                            <div className="text-gray-400">
                                                <span className="text-2xl block mb-2">🏦</span>
                                                Click to upload Bank Statement
                                            </div>
                                        )}
                                    </label>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-300">Payslip</label>
                                <div className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${uploadedFiles.payslip ? 'border-zeno-cyan/50 bg-zeno-cyan/10' : 'border-white/10 hover:border-white/30'}`}>
                                    <input
                                        type="file"
                                        id="payslip-upload"
                                        className="hidden"
                                        onChange={(e) => handleFileChange('payslip', e.target.files?.[0] || null)}
                                        accept=".pdf"
                                    />
                                    <label htmlFor="payslip-upload" className="cursor-pointer">
                                        {uploadedFiles.payslip ? (
                                            <div className="text-zeno-cyan font-medium flex items-center justify-center gap-2">
                                                <span>✓</span> {uploadedFiles.payslip.name}
                                            </div>
                                        ) : (
                                            <div className="text-gray-400">
                                                <span className="text-2xl block mb-2">💸</span>
                                                Click to upload Payslip
                                            </div>
                                        )}
                                    </label>
                                </div>
                            </div>

                            {(selectedServices.includes('debt_review_flag_removal') || selectedServices.includes('debt_review_application')) && (<>
                                <div className="col-span-2 mt-2">
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="h-px flex-1 bg-white/10"></div>
                                        <span className="text-xs text-gray-500 uppercase tracking-wider">Debt Review Documents</span>
                                        <div className="h-px flex-1 bg-white/10"></div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-300">Form 16</label>
                                    <div className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${uploadedFiles.form16 ? 'border-zeno-cyan/50 bg-zeno-cyan/10' : 'border-white/10 hover:border-white/30'}`}>
                                        <input type="file" id="form16-upload" className="hidden" onChange={(e) => handleFileChange('form16', e.target.files?.[0] || null)} accept=".pdf,image/*" />
                                        <label htmlFor="form16-upload" className="cursor-pointer">
                                            {uploadedFiles.form16 ? (
                                                <div className="text-zeno-cyan font-medium flex items-center justify-center gap-2"><span>✓</span> {uploadedFiles.form16.name}</div>
                                            ) : (
                                                <div className="text-gray-400"><span className="text-2xl block mb-2">📄</span>Click to upload Form 16</div>
                                            )}
                                        </label>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-300">Form 17.1</label>
                                    <div className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${uploadedFiles.form171 ? 'border-zeno-cyan/50 bg-zeno-cyan/10' : 'border-white/10 hover:border-white/30'}`}>
                                        <input type="file" id="form171-upload" className="hidden" onChange={(e) => handleFileChange('form171', e.target.files?.[0] || null)} accept=".pdf,image/*" />
                                        <label htmlFor="form171-upload" className="cursor-pointer">
                                            {uploadedFiles.form171 ? (
                                                <div className="text-zeno-cyan font-medium flex items-center justify-center gap-2"><span>✓</span> {uploadedFiles.form171.name}</div>
                                            ) : (
                                                <div className="text-gray-400"><span className="text-2xl block mb-2">📄</span>Click to upload Form 17.1</div>
                                            )}
                                        </label>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-300">Form 17.2</label>
                                    <div className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${uploadedFiles.form172 ? 'border-zeno-cyan/50 bg-zeno-cyan/10' : 'border-white/10 hover:border-white/30'}`}>
                                        <input type="file" id="form172-upload" className="hidden" onChange={(e) => handleFileChange('form172', e.target.files?.[0] || null)} accept=".pdf,image/*" />
                                        <label htmlFor="form172-upload" className="cursor-pointer">
                                            {uploadedFiles.form172 ? (
                                                <div className="text-zeno-cyan font-medium flex items-center justify-center gap-2"><span>✓</span> {uploadedFiles.form172.name}</div>
                                            ) : (
                                                <div className="text-gray-400"><span className="text-2xl block mb-2">📄</span>Click to upload Form 17.2</div>
                                            )}
                                        </label>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-300">Form 17.7</label>
                                    <div className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${uploadedFiles.form177 ? 'border-zeno-cyan/50 bg-zeno-cyan/10' : 'border-white/10 hover:border-white/30'}`}>
                                        <input type="file" id="form177-upload" className="hidden" onChange={(e) => handleFileChange('form177', e.target.files?.[0] || null)} accept=".pdf,image/*" />
                                        <label htmlFor="form177-upload" className="cursor-pointer">
                                            {uploadedFiles.form177 ? (
                                                <div className="text-zeno-cyan font-medium flex items-center justify-center gap-2"><span>✓</span> {uploadedFiles.form177.name}</div>
                                            ) : (
                                                <div className="text-gray-400"><span className="text-2xl block mb-2">📄</span>Click to upload Form 17.7</div>
                                            )}
                                        </label>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-300">Clearance Certificate (Form 17.W)</label>
                                    <div className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${uploadedFiles.clearance ? 'border-zeno-cyan/50 bg-zeno-cyan/10' : 'border-white/10 hover:border-white/30'}`}>
                                        <input type="file" id="clearance-upload" className="hidden" onChange={(e) => handleFileChange('clearance', e.target.files?.[0] || null)} accept=".pdf,image/*" />
                                        <label htmlFor="clearance-upload" className="cursor-pointer">
                                            {uploadedFiles.clearance ? (
                                                <div className="text-zeno-cyan font-medium flex items-center justify-center gap-2"><span>✓</span> {uploadedFiles.clearance.name}</div>
                                            ) : (
                                                <div className="text-gray-400"><span className="text-2xl block mb-2">🏆</span>Click to upload Clearance</div>
                                            )}
                                        </label>
                                    </div>
                                </div>
                            </>)}

                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-300">Other Files</label>
                                <div className={`border-2 border-dashed rounded-lg p-6 text-center border-white/10 hover:border-white/30`}>
                                    <input
                                        type="file"
                                        id="optional-upload"
                                        className="hidden"
                                        onChange={(e) => handleFileChange('optional', e.target.files?.[0] || null)}
                                        multiple
                                    />
                                    <label htmlFor="optional-upload" className="cursor-pointer">
                                        <div className="text-gray-400">
                                            <span className="text-2xl block mb-2">📂</span>
                                            Add optional files
                                        </div>
                                    </label>
                                    {uploadedFiles.optional.length > 0 && (
                                        <div className="mt-2 text-xs text-left">
                                            {uploadedFiles.optional.map((f, i) => (
                                                <div key={i} className="text-gray-300 truncate">• {f.name}</div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="mb-8">
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-300">Combined PDF (ID, POA, Report, etc.) <span className="text-red-400">*</span></label>
                                <div className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors ${uploadedFiles.allCombined ? 'border-zeno-cyan/50 bg-zeno-cyan/10' : 'border-white/10 hover:border-white/30'}`}>
                                    <input
                                        type="file"
                                        id="combined-upload"
                                        className="hidden"
                                        onChange={(e) => handleFileChange('allCombined', e.target.files?.[0] || null)}
                                        accept=".pdf"
                                    />
                                    <label htmlFor="combined-upload" className="cursor-pointer">
                                        {uploadedFiles.allCombined ? (
                                            <div className="text-zeno-cyan font-medium flex items-center justify-center gap-2">
                                                <span className="text-2xl">✓</span>
                                                <span className="text-lg">{uploadedFiles.allCombined.name}</span>
                                            </div>
                                        ) : (
                                            <div className="text-gray-400">
                                                <span className="text-4xl block mb-4">📑</span>
                                                <span className="text-lg block font-medium text-white mb-1">Click to upload Combined PDF</span>
                                                <span className="text-sm">Ideally contains ID and POA</span>
                                            </div>
                                        )}
                                    </label>
                                </div>
                            </div>
                        </div>
                    )}

                    {uploading && (
                        <div className="mb-6 bg-zeno-navy rounded-lg p-4 border border-white/5">
                            <div className="flex justify-between text-sm mb-2 text-white">
                                <span>{progressMessage}</span>
                                <span>{uploadProgress}%</span>
                            </div>
                            <div className="w-full bg-gray-700 rounded-full h-2">
                                <div
                                    className="bg-zeno-cyan h-2 rounded-full transition-all duration-500"
                                    style={{ width: `${uploadProgress}%` }}
                                ></div>
                            </div>
                            <p className="text-xs text-gray-400 mt-2 text-center animate-pulse">
                                {uploadProgress < 56 ? 'Sending files to secure server...' :
                                 uploadProgress < 61 ? 'Splitting and identifying document types...' :
                                 uploadProgress < 80 ? 'AI is reading and extracting data from each document...' :
                                 uploadProgress < 100 ? 'Comparing fields across documents for accuracy...' :
                                 'Done!'}
                            </p>
                        </div>
                    )}

                    <div className="flex gap-4">
                        <button
                            onClick={() => { setStep(1); window.scrollTo({ top: 0, behavior: 'instant' }); }}
                            className="flex-1 px-4 py-3 rounded-lg font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-all text-sm"
                            disabled={uploading}
                        >
                            Back
                        </button>
                        <button
                            onClick={handleManualEntry}
                            className="flex-1 px-4 py-3 rounded-lg font-medium text-indigo-400 hover:text-indigo-300 hover:bg-indigo-900/20 transition-all border border-indigo-500/30"
                            disabled={uploading}
                        >
                            Skip & Enter Manually
                        </button>
                        <button
                            onClick={handleUploadAndAnalyze}
                            disabled={!hasRequiredDocs || uploading}
                            className={`
                                flex-[2] px-8 py-3 rounded-lg font-bold text-white transition-all
                                ${!hasRequiredDocs || uploading
                                    ? 'bg-gray-700 cursor-not-allowed opacity-50'
                                    : 'bg-zeno-cyan hover:bg-cyan-600 shadow-lg shadow-cyan-900/20'
                                }
                            `}
                        >
                            {uploading ? 'Processing...' : 'Upload & Analyze'}
                        </button>
                    </div>
                </div>
            )}

            {/* Step 3: Review & Edit */}
            {step === 3 && (
                <div className="bg-zeno-blue/20 rounded-xl border border-white/5 p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-semibold text-white">Review Extracted Data</h2>
                        <div className="text-xs px-3 py-1 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                            AI Extraction Complete
                        </div>
                    </div>

                    {missingDocsWarning && (
                        <div className="mb-6 bg-yellow-500/10 border border-yellow-500/50 rounded-lg p-4 flex items-start">
                            <div className="text-yellow-500 mr-3 text-xl">⚠️</div>
                            <div>
                                <h3 className="text-yellow-500 font-semibold mb-1">Missing Documents Detected</h3>
                                <p className="text-yellow-200/80 text-sm">{missingDocsWarning}</p>
                            </div>
                        </div>
                    )}

                    {submitError && (
                        <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-start gap-3">
                            <div className="text-xl">⚠️</div>
                            <div>
                                <h4 className="font-bold text-red-400 text-sm">{submitError.title}</h4>
                                <p className="text-gray-300 text-sm mt-1 whitespace-pre-wrap">{submitError.message}</p>
                            </div>
                        </div>
                    )}

                    {/* Add More Documents & Re-Analyze Section */}
                    <div className="mb-6 p-4 bg-indigo-900/20 border border-indigo-500/30 rounded-lg">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                </svg>
                                <h3 className="text-sm font-semibold text-indigo-300">Add More Documents</h3>
                            </div>
                            <span className="text-xs text-gray-500">Upload missing documents and re-analyze</span>
                        </div>

                        <div className="flex gap-3 items-start">
                            <div className="flex-1">
                                <input
                                    type="file"
                                    id="additional-docs"
                                    className="hidden"
                                    multiple
                                    accept=".pdf,image/*"
                                    onChange={(e) => {
                                        if (e.target.files) {
                                            setAdditionalFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                                        }
                                    }}
                                />
                                <label
                                    htmlFor="additional-docs"
                                    className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-indigo-500/40 rounded-lg cursor-pointer hover:border-indigo-500/70 hover:bg-indigo-500/5 transition-all"
                                >
                                    <span className="text-indigo-400">📄</span>
                                    <span className="text-sm text-gray-300">
                                        {additionalFiles.length > 0
                                            ? `${additionalFiles.length} file(s) selected`
                                            : 'Click to add more files (Credit Report, etc.)'}
                                    </span>
                                </label>
                                {additionalFiles.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {additionalFiles.map((file, i) => (
                                            <div key={i} className="flex items-center gap-1 bg-indigo-900/30 px-2 py-1 rounded text-xs text-indigo-300">
                                                <span>{file.name}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => setAdditionalFiles(prev => prev.filter((_, idx) => idx !== i))}
                                                    className="text-red-400 hover:text-red-300 ml-1"
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={handleReanalyze}
                                disabled={additionalFiles.length === 0 || reanalyzing}
                                className={`px-4 py-3 rounded-lg font-medium text-sm transition-all whitespace-nowrap ${additionalFiles.length > 0 && !reanalyzing
                                    ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                                    : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                    }`}
                            >
                                {reanalyzing ? (
                                    <span className="flex items-center gap-2">
                                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                        Analyzing...
                                    </span>
                                ) : (
                                    '🔄 Re-Analyze'
                                )}
                            </button>
                        </div>
                    </div>

                    {identityReport.length > 0 && (
                        <div className="mb-8 p-4 bg-zeno-navy/50 border border-white/5 rounded-lg animate-in slide-in-from-top-2 duration-300">
                            <h3 className="text-sm font-bold text-zeno-cyan uppercase tracking-wider mb-3 flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                Document Identity Verification Report
                            </h3>
                            <div className="overflow-hidden rounded border border-white/10">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-white/5 text-gray-400">
                                        <tr>
                                            <th className="px-4 py-2 font-medium">Document Source</th>
                                            <th className="px-4 py-2 font-medium">ID Found</th>
                                            <th className="px-4 py-2 font-medium">Name Found</th>
                                            <th className="px-4 py-2 font-medium">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {identityReport.map((item, idx) => (
                                            <tr key={idx} className="hover:bg-white/5 transition-colors">
                                                <td className="px-4 py-2 text-gray-300 w-1/3">
                                                    {item.sourceDocument}
                                                    {item.pageNumber && <span className="text-xs text-gray-500 ml-2">(Pg {item.pageNumber})</span>}
                                                </td>
                                                <td className="px-4 py-2 font-mono text-gray-300">{item.extractedId || '-'}</td>
                                                <td className="px-4 py-2 text-gray-300 uppercase">{item.extractedName || '-'}</td>
                                                <td className="px-4 py-2">
                                                    {item.matchStatus === 'MATCH' ? (
                                                        <span className="inline-flex items-center gap-1 text-green-400 text-xs font-bold bg-green-500/10 px-2 py-1 rounded">
                                                            ✓ MATCH
                                                        </span>
                                                    ) : item.matchStatus === 'MISMATCH' ? (
                                                        <span className="inline-flex items-center gap-1 text-red-400 text-xs font-bold bg-red-500/10 px-2 py-1 rounded">
                                                            ✕ MISMATCH
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-500 text-xs">-</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {fieldVerification.length > 0 && (
                        <div className="mb-8 p-4 bg-zeno-navy/50 border border-white/5 rounded-lg animate-in slide-in-from-top-2 duration-300">
                            <h3 className="text-sm font-bold text-yellow-400 uppercase tracking-wider mb-1 flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                                AI Extraction Verification — Please Review
                            </h3>
                            <p className="text-xs text-gray-400 mb-3">AI found these values across your documents. Fields with differences are highlighted — verify and correct the form below if needed.</p>
                            <div className="space-y-2">
                                {fieldVerification.map((item: any, idx: number) => (
                                    <div key={idx} className={`flex items-start gap-3 p-3 rounded text-sm ${item.consistent ? 'bg-green-500/5 border border-green-500/10' : 'bg-yellow-500/10 border border-yellow-500/20'}`}>
                                        <span className={`mt-0.5 text-xs font-bold shrink-0 ${item.consistent ? 'text-green-400' : 'text-yellow-400'}`}>
                                            {item.consistent ? '✓' : '⚠'}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <span className={`font-semibold ${item.consistent ? 'text-green-300' : 'text-yellow-300'}`}>{item.field}:</span>
                                            <span className="text-gray-300 ml-2">Using <span className="font-mono text-white">{item.chosenValue}</span></span>
                                            <p className="text-gray-400 text-xs mt-0.5">{item.note}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        {/* Personal Info */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold text-zeno-cyan uppercase tracking-wider mb-2">Personal Information</h3>

                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Surname</label>
                                <input
                                    type="text"
                                    value={formData.surname}
                                    onChange={(e) => setFormData({ ...formData, surname: e.target.value })}
                                    className="w-full px-3 py-2 bg-zeno-navy border border-white/10 rounded text-white focus:border-zeno-cyan focus:outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Full Names</label>
                                <input
                                    type="text"
                                    value={formData.names}
                                    onChange={(e) => setFormData({ ...formData, names: e.target.value })}
                                    className="w-full px-3 py-2 bg-zeno-navy border border-white/10 rounded text-white focus:border-zeno-cyan focus:outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-xs text-gray-500 mb-1">ID Number</label>
                                <input
                                    type="text"
                                    value={formData.idNumber}
                                    onChange={(e) => setFormData({ ...formData, idNumber: e.target.value })}
                                    className={`w-full px-3 py-2 bg-zeno-navy border border-white/10 rounded text-white focus:border-zeno-cyan focus:outline-none ${!formData.idNumber && 'border-red-500/50'}`}
                                />
                            </div>

                            {/* Contact Info */}
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Cell Number</label>
                                    <input
                                        type="text"
                                        value={formData.cellNumber}
                                        onChange={(e) => setFormData({ ...formData, cellNumber: e.target.value })}
                                        className="w-full px-3 py-2 bg-zeno-navy border border-white/10 rounded text-white focus:border-zeno-cyan focus:outline-none"
                                    />
                                    {cellVerification && !cellVerification.allMatch && (
                                        <div className="text-[10px] text-yellow-500 mt-1">
                                            ⚠️ Found different numbers in docs
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">
                                        Email <span className="text-red-400">*</span>
                                    </label>
                                    <input
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        className={`w-full px-3 py-2 bg-zeno-navy border rounded text-white focus:border-zeno-cyan focus:outline-none ${!formData.email ? 'border-red-500/70' : 'border-white/10'}`}
                                    />
                                    {!formData.email && (
                                        <div className="text-[10px] text-red-400 mt-1">Email is required</div>
                                    )}
                                </div>
                            </div>

                            {/* Alternative Contact Info */}
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Alternative Cell Number</label>
                                    <input
                                        type="text"
                                        value={formData.alternativePhone}
                                        onChange={(e) => setFormData({ ...formData, alternativePhone: e.target.value })}
                                        className="w-full px-3 py-2 bg-zeno-navy border border-white/10 rounded text-white focus:border-zeno-cyan focus:outline-none"
                                        placeholder="Optional"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Alternative Email</label>
                                    <input
                                        type="email"
                                        value={formData.alternativeEmail}
                                        onChange={(e) => setFormData({ ...formData, alternativeEmail: e.target.value })}
                                        className="w-full px-3 py-2 bg-zeno-navy border border-white/10 rounded text-white focus:border-zeno-cyan focus:outline-none"
                                        placeholder="Optional"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Financial Info */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold text-zeno-cyan uppercase tracking-wider mb-2">Employment & Financial</h3>

                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Employer</label>
                                <input
                                    type="text"
                                    value={formData.employer}
                                    onChange={(e) => setFormData({ ...formData, employer: e.target.value })}
                                    className="w-full px-3 py-2 bg-zeno-navy border border-white/10 rounded text-white focus:border-zeno-cyan focus:outline-none"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Gross Salary</label>
                                    <input
                                        type="number"
                                        value={formData.grossSalary}
                                        onChange={(e) => setFormData({ ...formData, grossSalary: e.target.value })}
                                        className="w-full px-3 py-2 bg-zeno-navy border border-white/10 rounded text-white focus:border-zeno-cyan focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Net Salary</label>
                                    <input
                                        type="number"
                                        value={formData.netSalary}
                                        onChange={(e) => setFormData({ ...formData, netSalary: e.target.value })}
                                        className="w-full px-3 py-2 bg-zeno-navy border border-white/10 rounded text-white focus:border-zeno-cyan focus:outline-none"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Salary Date</label>
                                <input
                                    type="date"
                                    value={formData.salaryPayDate}
                                    onChange={(e) => setFormData({ ...formData, salaryPayDate: e.target.value })}
                                    className="w-full px-3 py-2 bg-zeno-navy border border-white/10 rounded text-white focus:border-zeno-cyan focus:outline-none"
                                />
                                {(() => {
                                    const salaryVerif = fieldVerification.find((v: any) => v.field === 'Salary Date');
                                    if (!salaryVerif || salaryVerif.totalOccurrences === 0) return null;
                                    if (salaryVerif.consistent) {
                                        return (
                                            <p className="mt-1 text-xs text-green-400">
                                                ✓ {salaryVerif.allValues.length >= 2
                                                    ? 'Found in Payslip and Bank Statement — dates are consistent'
                                                    : `Found in ${salaryVerif.allValues[0]?.source}`}
                                            </p>
                                        );
                                    }
                                    // Discrepancy — show clickable options
                                    return (
                                        <div className="mt-2 p-2 bg-yellow-900/30 border border-yellow-500/30 rounded">
                                            <p className="text-xs text-yellow-400 mb-2">
                                                ⚠ Different dates found — select the correct one:
                                            </p>
                                            <div className="flex flex-col gap-1">
                                                {salaryVerif.allValues.map((occ: any) => (
                                                    <button
                                                        key={occ.source}
                                                        type="button"
                                                        onClick={() => setFormData(prev => ({ ...prev, salaryPayDate: occ.value }))}
                                                        className={`text-left px-3 py-1.5 rounded text-xs transition-all ${
                                                            formData.salaryPayDate === occ.value
                                                                ? 'bg-zeno-cyan text-black font-semibold'
                                                                : 'bg-white/5 text-white hover:bg-white/10'
                                                        }`}
                                                    >
                                                        <span className="text-gray-400 mr-2">{occ.source}:</span>
                                                        {occ.value}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>

                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Client Category</label>
                                <select
                                    value={formData.category}
                                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                    className="w-full px-3 py-2 bg-zeno-navy border border-white/10 rounded text-white focus:border-zeno-cyan focus:outline-none"
                                >
                                    <option value="Standard">Standard</option>
                                    <option value="Payroll Single">Payroll Single (R4950)</option>
                                    <option value="Non-Payroll Single">Non-Payroll Single (R5500)</option>
                                    <option value="Joint">Joint Application (R8500)</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Service Fee (R)</label>
                                <input
                                    type="number"
                                    value={formData.serviceFee}
                                    onChange={(e) => setFormData({ ...formData, serviceFee: e.target.value })}
                                    className="w-full px-3 py-2 bg-zeno-navy border border-white/10 rounded text-white focus:border-zeno-cyan focus:outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Stats & Metadata */}
                    <div className="mb-8 p-4 bg-zeno-navy/50 rounded-lg">
                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Case Metadata</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Closed Accounts</label>
                                <input
                                    type="number"
                                    value={formData.closedAccounts}
                                    onChange={(e) => setFormData({ ...formData, closedAccounts: parseInt(e.target.value) || 0 })}
                                    className="w-full px-3 py-2 bg-zeno-navy border border-white/10 rounded text-white text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Open Accounts</label>
                                <input
                                    type="number"
                                    value={formData.openAccounts}
                                    onChange={(e) => setFormData({ ...formData, openAccounts: parseInt(e.target.value) || 0 })}
                                    className="w-full px-3 py-2 bg-zeno-navy border border-white/10 rounded text-white text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Affordability</label>
                                <div className={`px-3 py-2 rounded text-sm font-bold ${formData.affordabilityStatus === 'Affordable' ? 'text-green-400 bg-green-900/20' :
                                    formData.affordabilityStatus === 'Not Affordable' ? 'text-red-400 bg-red-900/20' :
                                        'text-gray-400 bg-gray-800'
                                    }`}>
                                    {formData.affordabilityStatus || 'Unknown'}
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Balance Exposure (R)</label>
                                <input
                                    type="number"
                                    value={formData.totalDebtAmount}
                                    onChange={(e) => setFormData({ ...formData, totalDebtAmount: e.target.value })}
                                    className="w-full px-3 py-2 bg-zeno-navy border border-white/10 rounded text-white text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Monthly Installment (R)</label>
                                <input
                                    type="number"
                                    value={formData.totalMonthlyInstallment}
                                    onChange={(e) => setFormData({ ...formData, totalMonthlyInstallment: e.target.value })}
                                    className="w-full px-3 py-2 bg-zeno-navy border border-white/10 rounded text-white text-sm"
                                />
                            </div>
                        </div>

                        {/* Credit Bureau Restructuring Info */}
                        <div className="mt-4 pt-4 border-t border-white/5">
                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Credit Bureau Restructuring Info</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">CB NCRDC No</label>
                                    <input
                                        type="text"
                                        value={formData.cb_ncrdcNo}
                                        onChange={(e) => setFormData({ ...formData, cb_ncrdcNo: e.target.value })}
                                        className="w-full px-3 py-2 bg-zeno-navy border border-white/10 rounded text-white text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Debt Counsellor</label>
                                    <input
                                        type="text"
                                        value={formData.cb_debtCounsellor}
                                        onChange={(e) => setFormData({ ...formData, cb_debtCounsellor: e.target.value })}
                                        className="w-full px-3 py-2 bg-zeno-navy border border-white/10 rounded text-white text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Contact No</label>
                                    <input
                                        type="text"
                                        value={formData.cb_contactNo}
                                        onChange={(e) => setFormData({ ...formData, cb_contactNo: e.target.value })}
                                        className="w-full px-3 py-2 bg-zeno-navy border border-white/10 rounded text-white text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Status</label>
                                    <input
                                        type="text"
                                        value={formData.cb_status}
                                        onChange={(e) => setFormData({ ...formData, cb_status: e.target.value })}
                                        className="w-full px-3 py-2 bg-zeno-navy border border-white/10 rounded text-white text-sm"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <button
                            onClick={() => { setStep(2); window.scrollTo({ top: 0, behavior: 'instant' }); }}
                            className="flex-1 px-4 py-3 rounded-lg font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-all"
                            disabled={submitting}
                        >
                            Back
                        </button>
                        <button
                            onClick={() => handleSubmit(false)}
                            disabled={submitting}
                            className={`
                                flex-[2] px-8 py-3 rounded-lg font-bold text-white transition-all
                                ${submitting
                                    ? 'bg-zeno-cyan/50 cursor-wait'
                                    : 'bg-zeno-cyan hover:bg-cyan-600 shadow-lg shadow-cyan-900/20'
                                }
                            `}
                        >
                            {submitting ? 'Creating Case...' : 'Create Case'}
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

                        {/* Option 1: Update existing record */}
                        <div className="mb-4 p-4 bg-amber-900/20 border border-amber-500/30 rounded-lg">
                            <p className="text-white font-medium mb-2">Option 1: Update Existing Record</p>
                            <p className="text-sm text-gray-400 mb-3">This will merge the new documents and financial data into the existing client's file.</p>
                            <button
                                onClick={() => { setDuplicateError(null); setPrefixedIdInput(''); handleSubmit(true); }}
                                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-colors font-medium"
                            >
                                Update Existing Record
                            </button>
                        </div>

                        {/* Option 2: Capture with prefix */}
                        {duplicateError.allowPrefixedId && (
                            <div className="mb-4 p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                                <p className="text-white font-medium mb-2">Option 2: Create New Record with Prefixed ID</p>
                                <p className="text-sm text-gray-400 mb-3">
                                    Add a prefix to make the ID unique (e.g., <span className="text-blue-300 font-mono">DRL</span> for "Debt Review Letsatsi client").
                                </p>
                                <div className="flex gap-2 items-center mb-3">
                                    <input
                                        type="text"
                                        value={prefixedIdInput || duplicateError.suggestedIdNumber || ''}
                                        onChange={(e) => setPrefixedIdInput(e.target.value.toUpperCase())}
                                        placeholder={duplicateError.suggestedIdNumber || `DRL${duplicateError.originalIdNumber}`}
                                        className="flex-1 bg-zeno-dark border border-blue-500/50 rounded-lg px-4 py-2 text-white font-mono focus:outline-none focus:border-blue-400"
                                    />
                                </div>
                                <p className="text-xs text-gray-500 mb-3">
                                    Common prefixes: <span className="text-blue-400">DRL</span> (Debt Review Letsatsi), <span className="text-blue-400">DRS</span> (Debt Review Shosholoza), <span className="text-blue-400">DUP</span> (Duplicate)
                                </p>
                                <button
                                    onClick={() => {
                                        const newIdNumber = prefixedIdInput || duplicateError.suggestedIdNumber;
                                        if (newIdNumber && newIdNumber !== duplicateError.originalIdNumber) {
                                            // Update the form with the new prefixed ID
                                            setFormData(prev => ({ ...prev, idNumber: newIdNumber }));
                                            setDuplicateError(null);
                                            setPrefixedIdInput('');
                                            // Re-submit with the new ID
                                            setTimeout(() => handleSubmit(false), 100);
                                        } else {
                                            alert('Please enter a valid prefixed ID number');
                                        }
                                    }}
                                    disabled={!(prefixedIdInput || duplicateError.suggestedIdNumber)}
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
