'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from '@zenowethu/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { WORKFLOW_STATUSES, getStatusByCode, STATUS_CATEGORIES } from '@zenowethu/shared-lib';
import { calculateSlaDeadline } from '@zenowethu/shared-lib';
import { SERVICES_MAP } from '@zenowethu/config';
import { ActivityTab } from '@zenowethu/ui';
import { DocumentsTab } from '@zenowethu/ui';
import { CommunicationHub } from '@zenowethu/ui';
import { ProjectMembersModal } from '@zenowethu/ui';
import { MoveCaseModal } from '@zenowethu/ui';
import { EditServicesModal } from '@zenowethu/ui';
import { CompareAnalysisModal } from '@zenowethu/ui';
import { SendPoaModal } from '@zenowethu/ui';
import { RichTextEditor } from '@zenowethu/ui';
import { AIPlanTab } from '@zenowethu/ui';
import { DebtReviewTab } from './DebtReviewTab';
import { SavingsAuditCard } from './SavingsAuditCard';
import { SavingsAuditResult } from '@zenowethu/shared-lib';
import SendQuoteModal from './SendQuoteModal';

// Client-side logger (avoid importing createLogger from shared-lib)
const createLogger = (name: string) => ({
    info: (...args: any[]) => console.log(`[${name}]`, ...args),
    error: (...args: any[]) => console.error(`[${name}]`, ...args),
    warn: (...args: any[]) => console.warn(`[${name}]`, ...args),
    debug: (...args: any[]) => console.debug(`[${name}]`, ...args),
});

type CaseDetail = {
    id: string;
    fileNumber: string;
    status: string;
    statusEntryDate: string;
    deadline: string | null;
    isOverdue: boolean;
    daysInStatus: number;
    serviceFee: string | null;
    zenowethuShare: string | null;
    isInvoiced: boolean;
    services: string | null; // JSON array of service IDs
    // Credit Bureau Data
    openAccounts: number;
    closedAccounts: number;
    prescribedAccounts: number;
    // B2B/B2C Classification
    acquisitionType: string;
    partnerName: string | null;
    partnerBranch: string | null;
    r350Status: string;
    serviceFeeCollectedBy: string;
    partnerSplitPercent: number;
    // DHS Information
    ncrdcNo: string | null;
    ncrSysRef: string | null;
    dhsStatus: string | null;
    dhsDaysCounter: string | null;
    debtCounsellorName: string | null;
    dcTradingName: string | null;
    dcEmail: string | null;
    dcOperatingStatus: string | null;
    dcMobile: string | null;
    consumerDhsStatus: string | null;
    dhsPreviousStatus: string | null;
    dhsStatusDate: string | null;
    dhsApplicationDate: string | null;
    // NCT Information
    nctCaseNumber: string | null;
    nctStatus: string | null;
    nctFilingDate: string | null;
    nctLastUpdated: string | null;
    nctEPurseBalance: string | number | null;
    // CB Fields
    cb_ncrdcNo: string | null;
    cb_debtCounsellor: string | null;
    cb_contactNo: string | null;
    cb_applicationDate: string | null;
    cb_status: string | null;
    cb_statusDate: string | null;
    totalDebtAmount: string | number | null;
    totalMonthlyInstallment: string | number | null;

    debtReviewDate: string | null;
    lastKnownEmail: string | null;

    createdAt: string;
    updatedAt: string;
    nextUpdate: string | null;
    category: string;

    // Tasks & Issues
    todos: string | null; // JSON
    declineReason: string | null;
    declineReasonAttended: boolean;
    description: string | null; // Rich text description

    client: {
        id: string;
        firstName: string;
        lastName: string;
        idNumber: string;
        email: string | null;
        phone: string | null;
        alternativePhone: string | null;
        alternativePhone2: string | null;
        whatsappNumber: string | null;
        telegramNumber: string | null;
        address: string | null;
        type: string;
        employer: string | null;
        grossSalary: string | number | null;
        netSalary: string | number | null;
    };
    projects: Array<{
        isPrimary: boolean;
        project: {
            id: string;
            name: string;
            type: string;
            parent?: { id: string; name: string } | null;
            members?: Array<{
                userId: string;
                role: string;
                user: {
                    firstName: string;
                    lastName: string;
                    email: string;
                }
            }>;
        };
    }>;
    workflowLogs: Array<{
        id: string;
        fromStatus: string | null;
        toStatus: string;
        timestamp: string;
        notes: string | null;
    }>;
    documents: Array<{
        id: string;
        type: string;
        fileName: string;
        fileUrl: string;
        extractedData: string | null;
        uploadedAt: string;
    }>;
    assignments?: Array<{
        userId: string;
        user: {
            id: string;
            firstName: string;
            lastName: string;
            email: string;
            avatarUrl: string | null;
        };
    }>;
    savingsAudit?: SavingsAuditResult | null;
};

type NotificationEntry = {
    id: string;
    channel: string;
    recipient: string;
    recipientType: string;
    statusCode: string;
    message: string;
    success: boolean;
    error: string | null;
    provider: string;
    sentAt: string;
};

type EditFormData = {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    alternativePhone: string;
    alternativePhone2: string;
    whatsappNumber: string;
    telegramNumber: string;
    address: string;
    serviceFee: string;
    partnerName: string;
    partnerBranch: string;
    partnerSplitPercent: string;
    // DHS fields
    ncrdcNo: string;
    dhsStatus: string;
    debtCounsellorName: string;
    dcTradingName: string;
    dcEmail: string;
    dcOperatingStatus: string;
    dcMobile: string;
    consumerDhsStatus: string;
    dhsPreviousStatus: string;
    declineReason: string;
    declineReasonAttended: boolean;
    // Credit Bureau Info
    totalDebtAmount: string; // Keep as string for input
    totalMonthlyInstallment: string;
    openAccounts: string;
    closedAccounts: string;
    // CB specific
    cb_ncrdcNo: string;
    cb_debtCounsellor: string;
    cb_contactNo: string;
    cb_applicationDate: string;
    cb_status: string;
    cb_statusDate: string;
    idNumber: string;
    category: string;
};

export default function CaseDetailPage() {
    const log = createLogger('apps/cases/case-detail');

    const params = useParams();
    const router = useRouter();
    const { data: session } = useSession();
    const isAdmin     = session?.user?.isAdmin === true;
    const isExecutive = session?.user?.isExecutive === true;
    const isFinance   = (session?.user as any)?.role?.toUpperCase() === 'FINANCE';
    const canCreateInvoice = isAdmin || isExecutive || isFinance;

    const [caseData, setCaseData] = useState<CaseDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(false);
    const [notifications, setNotifications] = useState<NotificationEntry[]>([]);
    const [sendingNotification, setSendingNotification] = useState(false);
    const [sendingDCNotification, setSendingDCNotification] = useState<'FILE' | 'INVOICE' | null>(null);
    const [sendingFileRequests, setSendingFileRequests] = useState(false);
    const [fileRequestResult, setFileRequestResult] = useState<{ bureausSent: number; providersSent: number; failures: number; message: string } | null>(null);
    const [sendingAllRequests, setSendingAllRequests] = useState(false);
    const [allRequestsResult, setAllRequestsResult] = useState<{ dcSent: boolean; bureausSent: number; providersSent: number; failures: number; lines: string[] } | null>(null);
    const [sendingDrrRequests, setSendingDrrRequests] = useState(false);
    const [drrRequestResult, setDrrRequestResult] = useState<{ bureausSent: number; providersSent: number; dcSent: boolean; failures: number; message: string } | null>(null);
    const [useAiDraft, setUseAiDraft] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    // DHS automation states
    const [dhsLoading, setDhsLoading] = useState(false);
    const [checkRequestLoading, setCheckRequestLoading] = useState(false);
    const [nctLoading, setNctLoading] = useState(false);
    const [dhsMessage, setDhsMessage] = useState<{ type: 'success' | 'error' | 'info' | 'warning'; text: string } | null>(null);
    const [nctMessage, setNctMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
    const [isEditingDhs, setIsEditingDhs] = useState(false);
    const [isEditingNct, setIsEditingNct] = useState(false);
    const [isEditingCreditInfo, setIsEditingCreditInfo] = useState(false);
    const [isReferring, setIsReferring] = useState(false);
    const [editForm, setEditForm] = useState<EditFormData>({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        alternativePhone: '',
        alternativePhone2: '',
        whatsappNumber: '',
        telegramNumber: '',
        address: '',
        serviceFee: '',
        partnerName: '',
        partnerBranch: '',
        partnerSplitPercent: '',
        // DHS fields
        ncrdcNo: '',
        dhsStatus: '',
        debtCounsellorName: '',
        dcTradingName: '',
        dcEmail: '',
        dcOperatingStatus: '',
        dcMobile: '',
        consumerDhsStatus: '',
        dhsPreviousStatus: '',
        declineReason: '',
        declineReasonAttended: false,
        totalDebtAmount: '',
        totalMonthlyInstallment: '',
        openAccounts: '',
        closedAccounts: '',
        cb_ncrdcNo: '',
        cb_debtCounsellor: '',
        cb_contactNo: '',
        cb_applicationDate: '',
        cb_status: '',
        cb_statusDate: '',
        idNumber: '',
        category: ''
    });

    const [mounted, setMounted] = useState(false);
    const [requestingTransfer, setRequestingTransfer] = useState(false);
    const [transferStatus, setTransferStatus] = useState('');
    const [autoFillLoading, setAutoFillLoading] = useState(false);
    const [autoFillMessage, setAutoFillMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
    const [uploadingDocType, setUploadingDocType] = useState<string | null>(null);

    const [viewingProjectMembers, setViewingProjectMembers] = useState<{ id: string; name: string; members?: any[] } | null>(null);
    // Modals
    const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
    const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
    const [isEditServicesOpen, setIsEditServicesOpen] = useState(false);
    const [isManageAssignmentsOpen, setIsManageAssignmentsOpen] = useState(false);
    const [showCompareModal, setShowCompareModal] = useState(false);
    const [isPoaModalOpen, setIsPoaModalOpen]     = useState(false);
    const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
    const [activeDetailTab, setActiveDetailTab] = useState<'ACTIVITY' | 'DOCUMENTS' | 'COMMUNICATION' | 'AI_PLAN' | 'DEBT_REVIEW'>('ACTIVITY');
    // DC pre-send confirmation
    const [dcConfirmPending, setDcConfirmPending] = useState<'FILE_REQUEST' | 'INVOICE_REQUEST' | null>(null);

    // Tasks & Decline Reason State
    // Tasks & Decline Reason State
    type Task = {
        id: string;
        text: string;
        done: boolean;
        createdBy?: string; // User Name
        createdAt?: string;
        completedBy?: string; // User Name
        completedAt?: string;
    };
    const [tasks, setTasks] = useState<Task[]>([]);
    const [newTaskText, setNewTaskText] = useState(''); // State for new task input
    const [isSavingTasks, setIsSavingTasks] = useState(false); // Separate local state for decline reason
    const [declineReason, setDeclineReason] = useState('');
    const [declineReasonAttended, setDeclineReasonAttended] = useState(false);
    const [isSavingDecline, setIsSavingDecline] = useState(false);
    const [isAddingDeclineReason, setIsAddingDeclineReason] = useState(false);

    const [description, setDescription] = useState('');
    const [originalDescription, setOriginalDescription] = useState(''); // Track original for cancel
    const [activityUpdate, setActivityUpdate] = useState(0); // Trigger for ActivityTab refresh

    const [isSavingDescription, setIsSavingDescription] = useState(false);



    // Track client-side hydration
    useEffect(() => {
        setMounted(true);
    }, []);

    // Initial Data Load
    useEffect(() => {
        if (caseData) {
            try {
                setTasks(caseData.todos ? JSON.parse(caseData.todos) : []);
                setDeclineReason(caseData.declineReason || '');
                setDeclineReasonAttended(caseData.declineReasonAttended || false);
                const desc = caseData.description || '';
                setDescription(desc);
                setOriginalDescription(desc);
            } catch (e) {
                setTasks([]);
                setDescription('');
            }
        }
    }, [caseData]);

    const fetchCase = useCallback(async () => {
        if (!params.id) return;
        setLoading(true);
        try {
            const response = await fetch(`/api/cases/${params.id}`);
            if (!response.ok) {
                // Case not found or error - redirect to cases list
                router.push('/cases');
                return;
            }
            const data = await response.json();
            setCaseData(data);
        } catch (error) {
            log.error({ err: error }, 'Error fetching case:', error);
            // On any error, redirect to cases list
            router.push('/cases');
        } finally {
            setLoading(false);
        }
    }, [params.id, router]);

    useEffect(() => {
        fetchCase();
    }, [fetchCase]);

    const handleUpdateAssignments = async (userIds: string[]) => {
        try {
            const response = await fetch(`/api/cases/${params.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ assignments: userIds })
            });

            if (!response.ok) throw new Error('Failed to update assignments');

            const updatedCase = await response.json();
            setCaseData(updatedCase);
            setIsManageAssignmentsOpen(false);
            setActivityUpdate(prev => prev + 1);
        } catch (error) {
            log.error({ err: error }, 'Error updating assignments:', error);
            alert('Failed to update assignments');
        }
    };

    const handleSaveServices = async (selectedServices: string[]) => {
        try {
            const response = await fetch(`/api/cases/${params.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ services: selectedServices })
            });

            if (!response.ok) throw new Error('Failed to update services');

            const updatedCase = await response.json();
            setCaseData(prev => prev ? { ...prev, services: updatedCase.services } : null);
            router.refresh();
        } catch (error) {
            log.error({ err: error }, 'Error updating services:', error);
            alert('Failed to update services');
        }
    };
    useEffect(() => {
        const fetchNotifications = async () => {
            try {
                const res = await fetch(`/api/cases/${params.id}/notifications`);
                if (res.ok) {
                    const data = await res.json();
                    setNotifications(data);
                }
            } catch (error) {
                log.error({ err: error }, 'Failed to fetch notifications', error);
            }
        };

        if (params.id) {
            fetchNotifications();
        }
    }, [params.id]);

    // Separate fetch function for manual updates (outside useEffect)
    const refreshCaseData = async () => {
        try {
            const res = await fetch(`/api/cases/${params.id}`);
            if (res.ok) {
                const data = await res.json();
                setCaseData(data);
            }
        } catch (error) {
            log.error({ err: error }, 'Failed to refresh case', error);
        }
    };
 
    // Auto-calculate Fee based on Category & Partner
    useEffect(() => {
        if (!isEditing || !caseData?.services) return;
 
        try {
            const services = JSON.parse(caseData.services) as string[];
            const isDebtRemoval = services.includes('debt_review_flag_removal');
 
            if (isDebtRemoval) {
                const isLetsatsi = (editForm.partnerName || '').toLowerCase().includes('letsatsi');
                let suggestedFee = editForm.serviceFee;
 
                switch (editForm.category) {
                    case 'Non-Payroll Single':
                        suggestedFee = '5500';
                        break;
                    case 'Non-Payroll Joint':
                        suggestedFee = '8500';
                        break;
                    case 'Payroll Single':
                        suggestedFee = isLetsatsi ? '4950' : '5500';
                        break;
                    case 'Payroll Joint':
                        suggestedFee = '8500';
                        break;
                }
 
                // Only update if current fee is different, but respect user manual entry
                // Actually, if category changes, we should probably update it automatically
                if (suggestedFee !== editForm.serviceFee) {
                    setEditForm(prev => ({ ...prev, serviceFee: suggestedFee }));
                }
            }
        } catch (e) {
            log.error('Error parsing services for fee calculation', e);
        }
    }, [editForm.category, editForm.partnerName, isEditing, caseData?.services, editForm.serviceFee]);

    const handleStatusChange = async (newStatus: string) => {
        if (!caseData) return;

        setUpdating(true);
        try {
            const res = await fetch(`/api/cases/${params.id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newStatus })
            });

            if (!res.ok) throw new Error('Failed to update status');

            const updatedCase = await res.json();
            setCaseData(updatedCase);
        } catch (error) {
            log.error({ err: error }, 'Failed to update status', error);
            alert('Failed to update status. Please try again.');
        } finally {
            setUpdating(false);
        }
    };

    const handleSaveDescription = async () => {
        setIsSavingDescription(true);
        try {
            const res = await fetch(`/api/cases/${params.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ description: description })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({ error: 'Unknown server error' }));
                throw new Error(errData.error || errData.details || 'Failed to save description');
            }

            // Update original description on success
            setOriginalDescription(description);

            // Refresh case data and trigger activity update
            fetchCase();
            setActivityUpdate(prev => prev + 1);
        } catch (error: any) {
            log.error({ err: error }, 'Error saving description:', error);
            alert(`Failed to save: ${error.message}`);
        } finally {
            setIsSavingDescription(false);
        }
    };

    const handleCancelDescription = () => {
        setDescription(originalDescription);
    };

    const handleSendNotification = async () => {
        if (!caseData) return;

        setSendingNotification(true);
        try {
            const res = await fetch(`/api/cases/${params.id}/notifications`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ statusCode: caseData.status })
            });

            const result = await res.json();

            if (result.success) {
                alert('Notification sent successfully!');
                // Refresh notifications
                const notifRes = await fetch(`/api/cases/${params.id}/notifications`);
                if (notifRes.ok) {
                    const data = await notifRes.json();
                    setNotifications(data);
                }
            } else {
                alert(`Failed to send notification: ${result.errors?.join(', ') || 'Unknown error'}`);
            }
        } catch (error) {
            log.error({ err: error }, 'Failed to send notification', error);
            alert('Failed to send notification. Please try again.');
        } finally {
            setSendingNotification(false);
        }
    };

    const handleSendFileRequests = async () => {
        if (!caseData) return;
        setSendingFileRequests(true);
        setFileRequestResult(null);
        try {
            const res = await fetch(`/api/cases/${params.id}/send-file-requests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ useAiDraft }),
            });
            const data = await res.json();
            if (res.ok) {
                const { bureausSent, providersSent, totalFailures } = data.summary;
                const parts = [];
                if (bureausSent > 0) parts.push(`${bureausSent} bureau${bureausSent !== 1 ? 's' : ''}`);
                if (providersSent > 0) parts.push(`${providersSent} provider${providersSent !== 1 ? 's' : ''}`);
                const message = parts.length > 0
                    ? `Sent to ${parts.join(' + ')}${totalFailures > 0 ? ` (${totalFailures} failed)` : ''}`
                    : 'No recipients found — add provider emails in admin settings.';
                setFileRequestResult({ bureausSent, providersSent, failures: totalFailures, message });
                if (bureausSent > 0 || providersSent > 0) setActivityUpdate(prev => prev + 1);
            } else {
                setFileRequestResult({ bureausSent: 0, providersSent: 0, failures: 1, message: data.error || 'Failed to send' });
            }
        } catch {
            setFileRequestResult({ bureausSent: 0, providersSent: 0, failures: 1, message: 'Connection failed. Please try again.' });
        } finally {
            setSendingFileRequests(false);
        }
    };

    const handleSendAllFileRequests = async () => {
        if (!caseData) return;
        setSendingAllRequests(true);
        setAllRequestsResult(null);

        const [dcRes, bureauRes] = await Promise.allSettled([
            // DC file request — only if dcEmail is set
            caseData.dcEmail
                ? fetch(`/api/cases/${params.id}/dc-notification`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ type: 'FILE_REQUEST' }),
                  })
                : Promise.resolve(null),
            // Bureau + provider emails
            fetch(`/api/cases/${params.id}/send-file-requests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ useAiDraft }),
            }),
        ]);

        const lines: string[] = [];
        let dcSent = false;
        let bureausSent = 0;
        let providersSent = 0;
        let failures = 0;

        // DC result
        if (caseData.dcEmail) {
            if (dcRes.status === 'fulfilled' && dcRes.value !== null) {
                const r = dcRes.value as Response;
                if (r.ok) {
                    dcSent = true;
                    lines.push(`DC (${caseData.dcEmail}): sent`);
                } else {
                    failures++;
                    const d = await r.json().catch(() => ({}));
                    lines.push(`DC: failed — ${(d as any).error || 'unknown error'}`);
                }
            } else {
                failures++;
                lines.push(`DC: failed — connection error`);
            }
        } else {
            lines.push(`DC: skipped (no email on file)`);
        }

        // Bureau + provider result
        if (bureauRes.status === 'fulfilled') {
            const r = bureauRes.value as Response;
            const d = await r.json().catch(() => ({}));
            if (r.ok) {
                bureausSent = (d as any).summary?.bureausSent ?? 0;
                providersSent = (d as any).summary?.providersSent ?? 0;
                const bfailures = (d as any).summary?.totalFailures ?? 0;
                failures += bfailures;
                if (bureausSent > 0) lines.push(`Bureaus: sent to ${bureausSent}`);
                else lines.push(`Bureaus: no recipients configured`);
                if (providersSent > 0) lines.push(`Providers: sent to ${providersSent}`);
                else lines.push(`Providers: none with email on file`);
                if (bfailures > 0) lines.push(`${bfailures} delivery failure(s)`);
            } else {
                failures++;
                lines.push(`Bureaus/Providers: failed — ${(d as any).error || 'unknown error'}`);
            }
        } else {
            failures++;
            lines.push(`Bureaus/Providers: failed — connection error`);
        }

        setAllRequestsResult({ dcSent, bureausSent, providersSent, failures, lines });
        if (dcSent || bureausSent > 0 || providersSent > 0) setActivityUpdate(prev => prev + 1);
        setSendingAllRequests(false);
    };

    // Show confirmation modal before sending — actual send happens in confirmDCNotification
    const handleDCNotification = (type: 'FILE_REQUEST' | 'INVOICE_REQUEST') => {
        if (!caseData || !caseData.dcEmail) return;
        setDcConfirmPending(type);
    };

    const confirmDCNotification = async () => {
        if (!caseData || !dcConfirmPending) return;
        const type = dcConfirmPending;
        setDcConfirmPending(null);
        setSendingDCNotification(type === 'FILE_REQUEST' ? 'FILE' : 'INVOICE');
        try {
            const res = await fetch(`/api/cases/${params.id}/dc-notification`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type })
            });

            const result = await res.json();

            if (res.ok) {
                alert(result.message || 'Notification sent successfully!');
                setActivityUpdate(prev => prev + 1);
            } else {
                alert(`Failed: ${result.error || 'Unknown error'}`);
            }
        } catch (error) {
            log.error({ err: error }, 'Failed to send DC notification', error);
            alert('Connection failed. Please try again.');
        } finally {
            setSendingDCNotification(null);
        }
    };

    const handleSendDrrFileRequests = async () => {
        if (!caseData) return;
        setSendingDrrRequests(true);
        setDrrRequestResult(null);
        try {
            const res = await fetch(`/api/cases/${params.id}/send-drr-requests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            if (res.ok) {
                const { bureausSent, providersSent, dcSent, totalFailures } = data.summary;
                const parts = [];
                if (dcSent) parts.push('Debt Counsellor');
                if (bureausSent > 0) parts.push(`${bureausSent} bureau${bureausSent !== 1 ? 's' : ''}`);
                if (providersSent > 0) parts.push(`${providersSent} provider${providersSent !== 1 ? 's' : ''}`);
                
                const message = parts.length > 0
                    ? `DRR files requested from ${parts.join(', ')}${totalFailures > 0 ? ` (${totalFailures} failed)` : ''}`
                    : 'No recipients found.';
                
                setDrrRequestResult({ bureausSent, providersSent, dcSent, failures: totalFailures, message });
                setActivityUpdate(prev => prev + 1);
            } else {
                setDrrRequestResult({ bureausSent: 0, providersSent: 0, dcSent: false, failures: 1, message: data.error || 'Failed to send' });
            }
        } catch {
            setDrrRequestResult({ bureausSent: 0, providersSent: 0, dcSent: false, failures: 1, message: 'Connection failed. Please try again.' });
        } finally {
            setSendingDrrRequests(false);
        }
    };

    // Start editing - populate form with current data
    const startEditing = () => {
        if (!caseData) return;
        setEditForm({
            firstName: caseData.client.firstName || '',
            lastName: caseData.client.lastName || '',
            email: caseData.client.email || '',
            phone: caseData.client.phone || '',
            alternativePhone: caseData.client.alternativePhone || '',
            alternativePhone2: caseData.client.alternativePhone2 || '',
            whatsappNumber: caseData.client.whatsappNumber || '',
            telegramNumber: caseData.client.telegramNumber || '',
            address: caseData.client.address || '',
            serviceFee: caseData.serviceFee || '',
            partnerName: caseData.partnerName || '',
            partnerBranch: caseData.partnerBranch || '',
            partnerSplitPercent: caseData.partnerSplitPercent?.toString() || '0',
            // DHS fields
            ncrdcNo: caseData.ncrdcNo || '',
            dhsStatus: caseData.dhsStatus || '',
            debtCounsellorName: caseData.debtCounsellorName || '',
            dcTradingName: caseData.dcTradingName || '',
            dcEmail: caseData.dcEmail || '',
            dcOperatingStatus: caseData.dcOperatingStatus || '',
            dcMobile: caseData.dcMobile || '',
            consumerDhsStatus: caseData.consumerDhsStatus || '',
            dhsPreviousStatus: caseData.dhsPreviousStatus || '',
            // Decline reason fields
            declineReason: caseData.declineReason || '',
            declineReasonAttended: caseData.declineReasonAttended || false,
            // Credit Bureau Info
            totalDebtAmount: caseData.totalDebtAmount?.toString() || '',
            totalMonthlyInstallment: caseData.totalMonthlyInstallment?.toString() || '',
            openAccounts: caseData.openAccounts?.toString() || '',
            closedAccounts: caseData.closedAccounts?.toString() || '',
            // CB specific
            cb_ncrdcNo: caseData.cb_ncrdcNo || '',
            cb_debtCounsellor: caseData.cb_debtCounsellor || '',
            cb_contactNo: caseData.cb_contactNo || '',
            cb_applicationDate: caseData.cb_applicationDate || '',
            cb_status: caseData.cb_status || '',
            cb_statusDate: caseData.cb_statusDate || '',
            idNumber: caseData.client.idNumber || '',
            category: caseData.category || ''
        });
        setIsEditing(true);
    };


    // Cancel editing
    const cancelEditing = () => {
        setIsEditing(false);
    };

    const startEditingDhs = () => {
        if (!caseData) return;
        setEditForm(prev => ({
            ...prev,
            ncrdcNo: caseData.ncrdcNo || '',
            dhsStatus: caseData.dhsStatus || '',
            debtCounsellorName: caseData.debtCounsellorName || '',
            dcTradingName: caseData.dcTradingName || '',
            dcEmail: caseData.dcEmail || '',
            dcOperatingStatus: caseData.dcOperatingStatus || '',
            dcMobile: caseData.dcMobile || '',
            consumerDhsStatus: caseData.consumerDhsStatus || '',
            dhsPreviousStatus: caseData.dhsPreviousStatus || '',
            declineReason: caseData.declineReason || '',
            declineReasonAttended: caseData.declineReasonAttended || false
        }));
        setIsEditingDhs(true);
        setDhsMessage(null);
    };

    const cancelEditingDhs = () => {
        setIsEditingDhs(false);
        setDhsMessage(null);
    };

    const saveDhsChanges = async () => {
        if (!caseData) return;
        setDhsLoading(true);
        try {
            const res = await fetch(`/api/cases/${params.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ncrdcNo: editForm.ncrdcNo || null,
                    dhsStatus: editForm.dhsStatus || null,
                    debtCounsellorName: editForm.debtCounsellorName || null,
                    dcTradingName: editForm.dcTradingName || null,
                    dcEmail: editForm.dcEmail || null,
                    dcOperatingStatus: editForm.dcOperatingStatus || null,
                    dcMobile: editForm.dcMobile || null,
                    consumerDhsStatus: editForm.consumerDhsStatus || null,
                    dhsPreviousStatus: editForm.dhsPreviousStatus || null,
                    declineReason: editForm.declineReason || null,
                    declineReasonAttended: editForm.declineReasonAttended
                })
            });

            if (!res.ok) throw new Error('Failed to save DHS changes');

            const updatedCase = await res.json();
            setCaseData(updatedCase);
            setIsEditingDhs(false);
            setDhsMessage({ type: 'success', text: 'DHS Information updated' });
        } catch (error) {
            log.error({ err: error }, 'Failed to save DHS changes', error);
            setDhsMessage({ type: 'error', text: 'Failed to save changes' });
        } finally {
            setDhsLoading(false);
        }
    };

    const handleRequestTransfer = async () => {
        if (!caseData?.client.idNumber) {
            setDhsMessage({ type: 'error', text: 'Client ID number is required' });
            return;
        }

        setRequestingTransfer(true);
        setTransferStatus('Checking Docs...');

        try {
            const res = await fetch('/api/dhs/lookup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    idNumber: caseData.client.idNumber,
                    caseId: caseData.id,
                    action: 'validate_and_request'
                })
            });
            const result = await res.json();

            if (result.success) {
                const msgType = result.emailSent === false ? 'warning' : 'success';
                setDhsMessage({ type: msgType, text: result.message || 'Transfer Requested successfully!' });

                // Refresh case data
                const caseRes = await fetch(`/api/cases/${params.id}`);
                const updatedCase = await caseRes.json();
                setCaseData(updatedCase);
            } else {
                setDhsMessage({ type: 'error', text: result.message || 'Failed to request transfer' });
            }
        } catch (error) {
            log.error({ err: error }, 'Transfer request error:', error);
            setDhsMessage({ type: 'error', text: 'Connection failed' });
        } finally {
            setRequestingTransfer(false);
            setTransferStatus('');
        }
    };

    const handleAutoFillDhs = async () => {
        if (!caseData?.client.idNumber) {
            setAutoFillMessage({ type: 'error', text: 'Client ID number is required' });
            return;
        }
        setAutoFillLoading(true);
        setAutoFillMessage(null);

        try {
            const res = await fetch('/api/dhs/lookup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    idNumber: caseData.client.idNumber,
                    caseId: caseData.id,
                    action: 'auto_fill'
                })
            });
            const result = await res.json();

            if (result.success) {
                // Refresh case data
                const caseRes = await fetch(`/api/cases/${params.id}`);
                const updatedCase = await caseRes.json();
                setCaseData(updatedCase);

                // Update edit form for immediate visual feedback
                setEditForm(prev => ({
                    ...prev,
                    ncrdcNo:            result.data.ncrdcNo            || prev.ncrdcNo,
                    debtCounsellorName: result.data.debtCounsellorName || prev.debtCounsellorName,
                    dcTradingName:      result.data.dcTradingName      || prev.dcTradingName,
                    dcEmail:            result.data.dcEmail            || prev.dcEmail,
                    dcOperatingStatus:  result.data.dcOperatingStatus  || prev.dcOperatingStatus,
                    dcMobile:           result.data.dcMobile           || prev.dcMobile,
                    consumerDhsStatus:  result.data.status             || prev.consumerDhsStatus,
                    dhsPreviousStatus:  result.data.status             || prev.dhsPreviousStatus,
                }));

                const filled  = (result.filledFields  as string[] | undefined) ?? [];
                const missing = (result.emptyFields   as string[] | undefined) ?? [];

                if (missing.length > 0) {
                    setAutoFillMessage({
                        type: 'info',
                        text: `Partial fill — populated: ${filled.join(', ')}. Not found in DHS: ${missing.join(', ')}.`,
                    });
                } else {
                    setAutoFillMessage({ type: 'success', text: `Auto-filled successfully — ${filled.length} fields populated.` });
                }
                setIsEditingDhs(true);
            } else {
                // Build a helpful message that includes what DHS returned (if anything)
                const missing = (result.emptyFields as string[] | undefined) ?? [];
                const baseMsg = result.message || 'Failed to auto-fill DHS info.';
                const hint    = missing.length > 0
                    ? ` Fields not returned by DHS: ${missing.join(', ')}.`
                    : '';
                setAutoFillMessage({ type: 'error', text: baseMsg + hint });
            }
        } catch (error) {
            log.error({ err: error }, 'Auto-fill error:', error);
            setAutoFillMessage({ type: 'error', text: 'Failed to connect to DHS service' });
        } finally {
            setAutoFillLoading(false);
        }
    };

    const handleDocUpload = async (file: File, docType: string) => {
        if (!caseData) return;
        setUploadingDocType(docType);
        try {
            const formData = new FormData();
            formData.append('caseId', caseData.id);
            if (docType === 'COMBINED') {
                formData.append('combined', 'true');
                formData.append('file', file);
            } else {
                formData.append(`file_${docType}`, file);
            }
            const res = await fetch('/api/documents/upload', { method: 'POST', body: formData });
            const result = await res.json();
            if (res.ok) {
                const caseRes = await fetch(`/api/cases/${params.id}`);
                const updatedCase = await caseRes.json();
                setCaseData(updatedCase);
                setDhsMessage({ type: 'success', text: `${docType === 'COMBINED' ? 'Combined file' : docType} uploaded — AI is extracting documents.` });
            } else {
                setDhsMessage({ type: 'error', text: result.error || 'Upload failed' });
            }
        } catch (error) {
            log.error({ err: error }, 'Doc upload error:', error);
            setDhsMessage({ type: 'error', text: 'Upload failed' });
        } finally {
            setUploadingDocType(null);
        }
    };



    // Credit Bureau Handlers
    const startEditingCreditInfo = () => {
        if (!caseData) return;
        setEditForm(prev => ({
            ...prev,
            ncrdcNo: caseData.ncrdcNo || '',
            debtCounsellorName: caseData.debtCounsellorName || '',
            dcMobile: caseData.dcMobile || '',
            consumerDhsStatus: caseData.consumerDhsStatus || '',
            totalDebtAmount: caseData.totalDebtAmount?.toString() || '',
            totalMonthlyInstallment: caseData.totalMonthlyInstallment?.toString() || '',
            openAccounts: caseData.openAccounts?.toString() || '',
            closedAccounts: caseData.closedAccounts?.toString() || '',
            cb_ncrdcNo: caseData.cb_ncrdcNo || '',
            cb_debtCounsellor: caseData.cb_debtCounsellor || '',
            cb_contactNo: caseData.cb_contactNo || '',
            cb_applicationDate: caseData.cb_applicationDate ? new Date(caseData.cb_applicationDate).toISOString().split('T')[0] : '',
            cb_status: caseData.cb_status || '',
            cb_statusDate: caseData.cb_statusDate ? new Date(caseData.cb_statusDate).toISOString().split('T')[0] : ''
        }));
        setIsEditingCreditInfo(true);
    };

    const cancelEditingCreditInfo = () => {
        setIsEditingCreditInfo(false);
    };

    const saveCreditInfo = async () => {
        if (!caseData) return;
        try {
            const payload = {
                totalDebtAmount: editForm.totalDebtAmount ? parseFloat(editForm.totalDebtAmount) : null,
                totalMonthlyInstallment: editForm.totalMonthlyInstallment ? parseFloat(editForm.totalMonthlyInstallment) : null,
                openAccounts: editForm.openAccounts ? parseInt(editForm.openAccounts) : 0,
                closedAccounts: editForm.closedAccounts ? parseInt(editForm.closedAccounts) : 0,

                cb_ncrdcNo: editForm.cb_ncrdcNo || null,
                cb_debtCounsellor: editForm.cb_debtCounsellor || null,
                cb_contactNo: editForm.cb_contactNo || null,
                cb_applicationDate: editForm.cb_applicationDate ? new Date(editForm.cb_applicationDate).toISOString() : null,
                cb_status: editForm.cb_status || null,
                cb_statusDate: editForm.cb_statusDate ? new Date(editForm.cb_statusDate).toISOString() : null
            };

            const res = await fetch(`/api/cases/${params.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error('Failed to save credit info');

            const updatedCase = await res.json();
            setCaseData(prev => prev ? { ...prev, ...updatedCase } : null);
            setIsEditingCreditInfo(false);
        } catch (error) {
            log.error({ err: error }, 'Failed to save credit info', error);
        }
    };

    // Tasks Handlers
    const handleSaveTasks = async (newTasks: Task[]) => {
        setTasks(newTasks);
        setIsSavingTasks(true);
        try {
            const res = await fetch(`/api/cases/${params.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ todos: JSON.stringify(newTasks) })
            });

            if (res.ok) {
                const updatedCase = await res.json();
                setCaseData(prev => prev ? { ...prev, todos: updatedCase.todos } : null);
                // Trigger activity tab refresh
                setActivityUpdate(prev => prev + 1);
            }
        } catch (error) {
            log.error({ err: error }, 'Failed to save tasks', error);
        } finally {
            setIsSavingTasks(false);
        }
    };

    const handleAddTask = (text: string) => {
        if (!text.trim()) return;
        const newTask: Task = {
            id: Date.now().toString(),
            text,
            done: false,
            createdBy: session?.user?.name || 'Unknown',
            createdAt: new Date().toISOString()
        };
        handleSaveTasks([...tasks, newTask]);
    };

    const handleToggleTask = (taskId: string) => {
        const newTasks = tasks.map(t => {
            if (t.id === taskId) {
                const isDone = !t.done;
                return {
                    ...t,
                    done: isDone,
                    completedBy: isDone ? (session?.user?.name || 'Unknown') : undefined,
                    completedAt: isDone ? new Date().toISOString() : undefined
                };
            }
            return t;
        });
        handleSaveTasks(newTasks);
    };

    const handleDeleteTask = (taskId: string) => {
        const newTasks = tasks.filter(t => t.id !== taskId);
        handleSaveTasks(newTasks);
    };

    // Decline Reason Handler
    const handleSaveDeclineReason = async (reason: string, attended: boolean) => {
        setDeclineReason(reason);
        setDeclineReasonAttended(attended);
        setIsSavingDecline(true); // Don't block UI
        try {
            await fetch(`/api/cases/${params.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    declineReason: reason,
                    declineReasonAttended: attended
                })
            });
        } catch (error) {
            log.error({ err: error }, 'Failed to save decline reason', error);
        } finally {
            setIsSavingDecline(false);
        }
    };

    // Save changes
    const saveChanges = async () => {
        if (!caseData) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/cases/${params.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client: {
                        firstName: editForm.firstName,
                        lastName: editForm.lastName,
                        idNumber: editForm.idNumber,
                        email: editForm.email || null,
                        phone: editForm.phone || null,
                        alternativePhone: editForm.alternativePhone || null,
                        alternativePhone2: editForm.alternativePhone2 || null,
                        whatsappNumber: editForm.whatsappNumber || null,
                        telegramNumber: editForm.telegramNumber || null,
                        address: editForm.address || null
                    },
                    serviceFee: editForm.serviceFee || null,
                    partnerName: editForm.partnerName || null,
                    partnerBranch: editForm.partnerBranch || null,
                    partnerSplitPercent: editForm.partnerSplitPercent ? parseInt(editForm.partnerSplitPercent) : 0,
                    category: editForm.category || null,
                    // DHS fields
                    ncrdcNo: editForm.ncrdcNo || null,
                    dhsStatus: editForm.dhsStatus || null,
                    debtCounsellorName: editForm.debtCounsellorName || null,
                    dcTradingName: editForm.dcTradingName || null,
                    dcEmail: editForm.dcEmail || null,
                    dcOperatingStatus: editForm.dcOperatingStatus || null,
                    dcMobile: editForm.dcMobile || null,
                    consumerDhsStatus: editForm.consumerDhsStatus || null,
                    dhsPreviousStatus: editForm.dhsPreviousStatus || null,
                    declineReason: editForm.declineReason || null,
                    declineReasonAttended: editForm.declineReasonAttended,
                    // Credit Bureau Info
                    totalDebtAmount: editForm.totalDebtAmount ? parseFloat(editForm.totalDebtAmount) : null,
                    totalMonthlyInstallment: editForm.totalMonthlyInstallment ? parseFloat(editForm.totalMonthlyInstallment) : null,
                    openAccounts: editForm.openAccounts ? parseInt(editForm.openAccounts) : 0,
                    closedAccounts: editForm.closedAccounts ? parseInt(editForm.closedAccounts) : 0,
                    cb_ncrdcNo: editForm.cb_ncrdcNo || null,
                    cb_debtCounsellor: editForm.cb_debtCounsellor || null,
                    cb_contactNo: editForm.cb_contactNo || null,
                    cb_applicationDate: editForm.cb_applicationDate || null,
                    cb_status: editForm.cb_status || null,
                    cb_statusDate: editForm.cb_statusDate || null
                })
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || 'Failed to save changes');
            }

            const updatedCase = await res.json();
            setCaseData(updatedCase);
            setIsEditing(false);
            alert('Changes saved successfully!');
        } catch (error) {
            log.error({ err: error }, 'Failed to save changes', error);
            alert(error instanceof Error ? error.message : 'Failed to save changes. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    // Delete case (admin only)
    const handleDelete = async () => {
        if (!caseData || !isAdmin) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/cases/${params.id}`, {
                method: 'DELETE'
            });

            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || 'Failed to delete case');
            }

            // Redirect to cases list after successful deletion
            router.push('/cases');
        } catch (error) {
            log.error({ err: error }, 'Failed to delete case', error);
            alert(error instanceof Error ? error.message : 'Failed to delete case. Please try again.');
            setShowDeleteConfirm(false);
        } finally {
            setDeleting(false);
        }
    };

    // DHS Lookup - Check transfer status
    const handleNCTLookup = async () => {
        if (!caseData || !caseData.nctCaseNumber) return;
        setNctLoading(true);
        setNctMessage(null);
        try {
            const res = await fetch(`/api/nct/status?identifier=${caseData.nctCaseNumber}`);
            const result = await res.json();
            if (result.success) {
                setCaseData(prev => prev ? { ...prev, nctStatus: result.status, nctLastUpdated: new Date().toISOString() } : null);
                setNctMessage({ type: 'success', text: `NCT Status: ${result.status}` });
            } else {
                setNctMessage({ type: 'error', text: result.error || 'Failed to fetch NCT status' });
            }
        } catch (error) {
            log.error({ err: error }, 'NCT Lookup error:', error);
            setNctMessage({ type: 'error', text: 'Connection failed' });
        } finally {
            setNctLoading(false);
        }
    };

    const handleNCTEFile = async () => {
        if (!caseData) return;
        if (!confirm('This will start the eFiling process on NCT CMS. Continue?')) return;
        setNctLoading(true);
        setNctMessage({ type: 'info', text: 'Starting eFiling... please wait.' });
        try {
            const res = await fetch('/api/nct/filing', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ caseId: caseData.id })
            });
            const result = await res.json();
            if (result.success) {
                setCaseData(prev => prev ? { ...prev, nctCaseNumber: result.caseNumber, nctStatus: 'FILED', nctFilingDate: new Date().toISOString() } : null);
                setNctMessage({ type: 'success', text: `Case filed successfully! NCT Ref: ${result.caseNumber}` });
            } else {
                setNctMessage({ type: 'error', text: result.message || result.error || 'eFiling failed' });
            }
        } catch (error) {
            log.error({ err: error }, 'NCT eFiling error:', error);
            setNctMessage({ type: 'error', text: 'eFiling connection failed' });
        } finally {
            setNctLoading(false);
        }
    };

    const handleCheckEPurse = async () => {
        setNctLoading(true);
        try {
            const res = await fetch('/api/nct/epurse');
            const result = await res.json();
            if (result.success) {
                setCaseData(prev => prev ? { ...prev, nctEPurseBalance: result.balance } : null);
                setNctMessage({ type: 'info', text: `ePurse Balance: R${result.balance}` });
            } else {
                setNctMessage({ type: 'error', text: result.error || 'Failed to check ePurse' });
            }
        } catch (error) {
            log.error({ err: error }, 'ePurse error:', error);
        } finally {
            setNctLoading(false);
        }
    };

    // DHS Linkage Check (Link 2)
    const handleDHSLookup = async () => {
        if (!caseData?.client.idNumber) {
            setDhsMessage({ type: 'error', text: 'Client ID number is required' });
            return;
        }
        setDhsLoading(true);
        setDhsMessage(null);
        try {
            const res = await fetch('/api/dhs/lookup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    idNumber: caseData.client.idNumber,
                    caseId: caseData.id,
                    action: 'search'
                })
            });
            const result = await res.json();
            if (result.success) {
                let text = result.found 
                    ? `Linked to DHS. DC: ${result.debtCounsellor?.fullName || 'Unknown'}`
                    : 'Not linked to DHS.';
                
                setDhsMessage({
                    type: result.found ? 'success' : 'info',
                    text: text
                });
            } else {
                setDhsMessage({ type: 'error', text: result.error || 'DHS search failed' });
            }
        } catch (error) {
            setDhsMessage({ type: 'error', text: 'Failed to connect to DHS' });
        } finally {
            setDhsLoading(false);
        }
    };

    // DHS Request Status Check (Link 1)
    const handleCheckRequestStatus = async () => {
        if (!caseData?.client.idNumber) {
            setDhsMessage({ type: 'error', text: 'Client ID number is required' });
            return;
        }
        setCheckRequestLoading(true);
        setDhsMessage(null);
        try {
            const res = await fetch('/api/dhs/lookup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    idNumber: caseData.client.idNumber,
                    caseId: caseData.id,
                    action: 'check_status'
                })
            });
            const result = await res.json();
            if (result.success) {
                // Refresh case data
                const caseRes = await fetch(`/api/cases/${params.id}`);
                const updatedCase = await caseRes.json();
                setCaseData(updatedCase);

                // Build detailed status message
                let statusText = '';
                if (result.found) {
                    statusText = `Status: ${result.status}`;
                    if (result.daysCounter) {
                        statusText += ` (${result.daysCounter})`;
                    }
                    statusText += '. DC info updated.';
                } else {
                    statusText = result.message || 'No transfer request found in DHS';
                }

                setDhsMessage({
                    type: result.status === 'DECLINED' ? 'error' :
                        result.found ? 'success' :
                            (result.message?.includes('Failed') ? 'error' : 'info'),
                    text: statusText
                });
            } else {
                setDhsMessage({ type: 'error', text: result.error || 'DHS status check failed' });
            }
        } catch (error) {
            setDhsMessage({ type: 'error', text: 'Failed to connect to DHS' });
        } finally {
            setCheckRequestLoading(false);
        }
    };



    // DHS Request Transfer
    const handleDHSTransfer = async () => {
        if (!caseData?.client.idNumber) {
            setDhsMessage({ type: 'error', text: 'Client ID number is required' });
            return;
        }
        if (!confirm('This will submit a transfer request to DHS. Continue?')) return;

        setDhsLoading(true);
        setDhsMessage(null);
        try {
            const res = await fetch('/api/dhs/transfer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    caseId: caseData.id,
                    idNumber: caseData.client.idNumber
                })
            });
            const result = await res.json();
            log.info({ result }, 'DHS transfer result:', result);
            if (result.success) {
                // Refresh case data
                const caseRes = await fetch(`/api/cases/${params.id}`);
                const updatedCase = await caseRes.json();
                setCaseData(updatedCase);
                setDhsMessage({ type: 'success', text: 'Transfer request submitted successfully!' });
            } else {
                let errorMsg = result.error || result.message || 'Transfer request failed';
                if (result.details) {
                    const detailsStr = typeof result.details === 'string'
                        ? result.details
                        : JSON.stringify(result.details);
                    errorMsg += `: ${detailsStr}`;
                }
                setDhsMessage({ type: 'error', text: errorMsg });
            }
        } catch (error) {
            log.error({ err: error }, 'DHS transfer error:', error);
            setDhsMessage({ type: 'error', text: 'Failed to submit transfer request' });
        } finally {
            setDhsLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-gray-400">Loading case details...</div>
            </div>
        );
    }

    if (!caseData) {
        return (
            <div className="max-w-7xl mx-auto">
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6 text-center">
                    <p className="text-red-400 text-lg font-medium mb-4">Case not found</p>
                    <Link href="/cases" className="text-zeno-cyan hover:text-cyan-300">
                        ← Back to Cases
                    </Link>
                </div>
            </div>
        );
    }

    const currentStatus = getStatusByCode(caseData.status);
    const primaryProject = caseData.projects.find(p => p.isPrimary);
    const secondaryProjects = caseData.projects.filter(p => !p.isPrimary);
    const hasAIAnalysis = caseData.documents.some(d => d.extractedData !== null);

    // Debt-review-specific features: Form 16 + Debt Review Docs tab only visible for DR/DRR cases
    const caseServiceList: string[] = (() => { try { return JSON.parse(caseData.services ?? '[]'); } catch { return []; } })();
    const isDebtReviewCase = caseServiceList.some(s =>
        s.toLowerCase().includes('debt review') || s.toLowerCase().includes('flag removal')
    );

    return (
        <div className="max-w-7xl mx-auto">
            {/* Sticky Header */}
            <div className="sticky top-16 z-40 bg-[var(--color-bg-primary)] border-b border-white/10 -mx-4 px-4 py-2 mb-8 shadow-lg flex items-center justify-between transition-all">
                <div className="flex items-center gap-3">
                    <Link href="/cases" className="text-gray-400 hover:text-white transition-colors mr-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    </Link>



                    {/* Separator */}
                    <span className="text-gray-600 text-lg mx-1">|</span>



                    {/* Client Name */}
                    <h1 className="text-xl font-bold text-white ml-2">
                        {caseData?.client.firstName} {caseData?.client.lastName}
                    </h1>

                    {/* Client ID */}
                    <span className="text-gray-500 font-normal text-lg ml-1">{caseData?.client.idNumber}</span>

                    {/* Phone */}
                    {caseData?.client.phone && (
                        <span className="text-gray-500 font-normal text-lg ml-3">{caseData.client.phone}</span>
                    )}

                    {/* Email */}
                    {caseData?.client.email && (
                        <span className="text-gray-500 font-normal text-lg ml-3">{caseData.client.email}</span>
                    )}

                    {/* Status Badge */}
                    {caseData?.status && (
                        <span className="ml-4 px-3 py-1 rounded-full text-xs font-bold bg-zeno-cyan/20 text-zeno-cyan border border-zeno-cyan/30 uppercase tracking-wider">
                            {caseData.status.replace(/_/g, ' ')}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    {/* Actions */}
                    {!isEditing && (
                        <div className="flex items-center gap-2">
                            {isDebtReviewCase && (
                                <a
                                    href={`/api/cases/${params.id}/form16`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-3 py-1.5 bg-teal-500/10 border border-teal-500/30 text-teal-400 rounded hover:bg-teal-500/20 text-sm flex items-center gap-2 transition-colors"
                                    title="Download Form 16 — Application for Debt Review"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                    Form 16
                                </a>
                            )}

                            {/* Send POA — top bar shortcut */}
                            {(() => {
                                const svcList: string[] = (() => { try { return JSON.parse(caseData?.services ?? '[]'); } catch { return []; } })();
                                const isDRR    = svcList.some(s => s.toLowerCase().includes('flag removal'));
                                const drrReady = !isDRR || !!(caseData?.ncrdcNo && caseData?.debtCounsellorName);
                                return (
                                    <button
                                        onClick={() => drrReady && setIsPoaModalOpen(true)}
                                        disabled={!drrReady}
                                        title={!drrReady ? 'Run DHS Auto-Fill first — NCRDC No and Debt Counsellor required for DRR cases.' : 'Send pre-filled Power of Attorney to client'}
                                        className={`px-3 py-1.5 rounded text-sm flex items-center gap-2 transition-colors ${
                                            drrReady
                                                ? 'bg-purple-500/10 border border-purple-500/30 text-purple-400 hover:bg-purple-500/20'
                                                : 'bg-white/5 border border-white/10 text-gray-500 cursor-not-allowed opacity-50'
                                        }`}
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                        Send POA
                                    </button>
                                );
                            })()}
                            {/* Send Quote / Invoice — finance, executive, admin only */}
                            {canCreateInvoice && (
                                <button
                                    onClick={() => setIsQuoteModalOpen(true)}
                                    className="px-3 py-1.5 rounded text-sm flex items-center gap-2 transition-colors bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                                    title="Create Invoice or Quotation for this client"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    Send Quote
                                </button>
                            )}

                            {isAdmin && (
                                <button
                                    onClick={() => setShowDeleteConfirm(true)}
                                    className="px-3 py-1.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded hover:bg-red-500/20 text-sm flex items-center gap-2 transition-colors"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                            )}
                            <button
                                onClick={() => setShowCompareModal(true)}
                                className={hasAIAnalysis
                                    ? "px-3 py-1.5 bg-purple-500/10 border border-purple-500/20 text-purple-400 rounded hover:bg-purple-500/20 text-sm flex items-center gap-2 transition-colors"
                                    : "px-3 py-1.5 bg-amber-400 border border-amber-300 text-gray-900 rounded hover:bg-amber-300 text-sm flex items-center gap-2 transition-colors font-semibold shadow-[0_0_12px_rgba(251,191,36,0.5)]"
                                }
                                title={hasAIAnalysis ? "Re-Analyse with AI & Compare" : "Analyse documents with GPT-4o AI"}
                            >
                                {hasAIAnalysis ? (
                                    <>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                                        Re-Analyse
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                                        Analyse with AI
                                    </>
                                )}
                            </button>
                            <button
                                onClick={startEditing}
                                className="px-3 py-1.5 bg-zeno-navy border border-white/10 text-white rounded hover:bg-zeno-navy/80 text-sm flex items-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                Edit
                            </button>
                        </div>
                    )}
                    {isEditing && (
                        <div className="flex gap-2">
                            <button onClick={cancelEditing} className="px-3 py-1.5 text-gray-400 hover:text-white text-sm">Cancel</button>
                            <button onClick={saveChanges} disabled={saving} className="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 text-sm font-medium disabled:opacity-50">
                                {saving ? 'Saving...' : 'Save'}
                            </button>
                        </div>
                    )}
                </div>
            </div>



            {/* Savings Audit Widget - Hero Position */}
            {caseData.savingsAudit && (
                <div className="mb-8 animate-in fade-in slide-in-from-top duration-700">
                    <SavingsAuditCard 
                        data={caseData.savingsAudit} 
                        isReferring={isReferring}
                        onRefer={async () => {
                            if (!confirm('This will submit a referral to DCCP to secure these savings. Continue?')) return;
                            setIsReferring(true);
                            try {
                                const res = await fetch(`/api/cases/${params.id}/dccp-referral`, { method: 'POST' });
                                if (res.ok) {
                                    alert('Referral submitted successfully! DCCP will contact the client.');
                                } else {
                                    alert('Failed to submit referral.');
                                }
                            } catch (e) {
                                alert('Connection error.');
                            } finally {
                                setIsReferring(false);
                            }
                        }}
                    />
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column - Client Info & Projects */}
                <div className="lg:col-span-1 space-y-6">
                    {/* Client Source - Moved to Top */}
                    <div className="bg-zeno-blue/20 rounded-xl border border-white/5 p-6">
                        <h3 className="text-lg font-semibold text-white mb-4">Client Source</h3>
                        {isEditing && caseData.acquisitionType === 'B2B' ? (
                            <div className="space-y-4">
                                <div>
                                    <span className="text-xs text-gray-500 uppercase">Type</span>
                                    <p className="text-[10px] text-gray-500 mt-0.5 mb-1">Origin of the lead</p>
                                    <p className="text-indigo-400 font-medium">🏢 B2B (Partner)</p>
                                </div>
                                <div>
                                    <label className="text-xs text-gray-500 uppercase">Partner Name</label>
                                    <p className="text-[10px] text-gray-500 mt-0.5 mb-1">Referring organization</p>
                                    <input
                                        type="text"
                                        value={editForm.partnerName}
                                        onChange={(e) => setEditForm({ ...editForm, partnerName: e.target.value })}
                                        className="w-full px-3 py-2 bg-zeno-navy border border-white/10 rounded-lg text-white focus:border-zeno-cyan focus:outline-none"
                                        placeholder="Letsatsi"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-500 uppercase">Branch</label>
                                    <p className="text-[10px] text-gray-500 mt-0.5 mb-1">Originating branch</p>
                                    <input
                                        type="text"
                                        value={editForm.partnerBranch}
                                        onChange={(e) => setEditForm({ ...editForm, partnerBranch: e.target.value })}
                                        className="w-full px-3 py-2 bg-zeno-navy border border-white/10 rounded-lg text-white focus:border-zeno-cyan focus:outline-none"
                                        placeholder="Alberton 1"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-500 uppercase">Partner Split %</label>
                                    <span className="text-[10px] text-gray-500 block mt-0.5 mb-1">Revenue Share</span>
                                    <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={editForm.partnerSplitPercent}
                                        onChange={(e) => setEditForm({ ...editForm, partnerSplitPercent: e.target.value })}
                                        className="w-full px-3 py-2 bg-zeno-navy border border-white/10 rounded-lg text-white focus:border-zeno-cyan focus:outline-none"
                                    />
                                    <span className="text-xs text-gray-600 block mt-1">Partner gets {editForm.partnerSplitPercent || 0}%, Zenowethu gets {100 - (parseInt(editForm.partnerSplitPercent) || 0)}%</span>
                                </div>
                                <div>
                                    <label className="text-xs text-gray-500 uppercase">Category</label>
                                    <p className="text-[10px] text-gray-500 mt-0.5 mb-1">Case classification</p>
                                    <select
                                        value={editForm.category}
                                        onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                                        className="w-full px-3 py-2 bg-zeno-navy border border-white/10 rounded-lg text-white focus:border-zeno-cyan focus:outline-none"
                                    >
                                        <option value="">Select Category...</option>
                                        <option value="Non-Payroll Single">Non-Payroll Single</option>
                                        <option value="Non-Payroll Joint">Non-Payroll Joint</option>
                                        <option value="Payroll Single">Payroll Single</option>
                                        <option value="Payroll Joint">Payroll Joint</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs text-gray-500 uppercase">
                                        {(editForm.partnerName || '').toLowerCase().includes('letsatsi') ? 'Service Fee' : 'Quote'}
                                    </label>
                                    <p className="text-[10px] text-gray-500 mt-0.5 mb-1">Total fee charged</p>
                                    <input
                                        type="text"
                                        value={editForm.serviceFee}
                                        onChange={(e) => setEditForm({ ...editForm, serviceFee: e.target.value })}
                                        className="w-full px-3 py-2 bg-zeno-navy border border-white/10 rounded-lg text-white focus:border-zeno-cyan focus:outline-none"
                                        placeholder="R 0.00"
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <span className="text-xs text-gray-500 uppercase">Type</span>
                                    <p className="text-[10px] text-gray-500 mt-0.5 mb-1">Lead Source</p>
                                    <p className={`font-medium ${caseData.acquisitionType === 'B2B' ? 'text-indigo-400' : 'text-cyan-400'}`}>
                                        {caseData.acquisitionType === 'B2B' ? '🏢 B2B (Partner)' : '👤 B2C (Private)'}
                                    </p>
                                </div>
                                {caseData.acquisitionType === 'B2B' && caseData.partnerName && (
                                    <div>
                                        <span className="text-xs text-gray-500 uppercase">Partner</span>
                                        <p className="text-[10px] text-gray-500 mt-0.5 mb-1">Referrer</p>
                                        <p className="text-white">{caseData.partnerName}</p>
                                    </div>
                                )}
                                {caseData.acquisitionType === 'B2B' && caseData.partnerBranch && (
                                    <div>
                                        <span className="text-xs text-gray-500 uppercase">Branch</span>
                                        <p className="text-[10px] text-gray-500 mt-0.5 mb-1">Location</p>
                                        <p className="text-white">{caseData.partnerBranch}</p>
                                    </div>
                                )}
                                <div>
                                    <span className="text-xs text-gray-500 uppercase">R350 Status</span>
                                    <p className="text-[10px] text-gray-500 mt-0.5 mb-1">Admin Fee</p>
                                    <p className={`${caseData.r350Status === 'NOT_APPLICABLE' ? 'text-gray-400' :
                                        caseData.r350Status === 'PAID' ? 'text-green-400' :
                                            caseData.r350Status === 'PENDING' ? 'text-yellow-400' : 'text-white'
                                        }`}>
                                        {caseData.r350Status === 'NOT_APPLICABLE' ? 'N/A (B2B)' :
                                            caseData.r350Status === 'PAID' ? '✅ Paid' :
                                                caseData.r350Status === 'PENDING' ? '⏳ Pending' :
                                                    caseData.r350Status === 'TOLD' ? '📞 Told' : caseData.r350Status}
                                    </p>
                                </div>
                                <div>
                                    <span className="text-xs text-gray-500 uppercase">Service Fee</span>
                                    <p className="text-[10px] text-gray-500 mt-0.5 mb-1">Service Fee</p>
                                    <p className="text-white font-semibold">
                                        {caseData.serviceFee ? `R ${parseFloat(caseData.serviceFee).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'R 0.00'}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Project card — always visible */}
                    <div className="bg-zeno-blue/20 rounded-xl border border-white/5 px-5 py-4">
                        <div className="flex items-center gap-2 mb-3">
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                            </svg>
                            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Project</span>
                        </div>
                        {caseData.projects.length === 0 ? (
                            <p className="text-sm text-gray-600 italic">No project assigned</p>
                        ) : (
                            <div className="space-y-1.5">
                                {caseData.projects.map((cp) => (
                                    <Link
                                        key={cp.project.id}
                                        href={`/cases?projectId=${cp.project.id}`}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${cp.isPrimary ? 'bg-zeno-cyan/10 border border-zeno-cyan/20 hover:bg-zeno-cyan/20' : 'bg-white/5 hover:bg-white/10'}`}
                                    >
                                        <svg className={`w-3.5 h-3.5 shrink-0 ${cp.isPrimary ? 'text-zeno-cyan' : 'text-gray-500'}`} fill="currentColor" viewBox="0 0 20 20">
                                            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                                        </svg>
                                        <span className={`text-sm font-medium leading-tight ${cp.isPrimary ? 'text-zeno-cyan' : 'text-gray-300'}`}>
                                            {(cp.project as any).fullPath || cp.project.name}
                                        </span>
                                        <svg className={`w-3 h-3 ml-auto shrink-0 ${cp.isPrimary ? 'text-zeno-cyan/50' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Client Information -> Contact Information */}
                    <div className="bg-zeno-blue/20 rounded-xl border border-white/5 p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-white">Contact Information</h3>
                        </div>
                        <div className="space-y-3">
                            {isEditing ? (
                                <>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-xs text-gray-500 uppercase">First Name</label>
                                            <input
                                                type="text"
                                                value={editForm.firstName}
                                                onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                                                className="w-full mt-1 px-3 py-2 bg-zeno-navy border border-white/10 rounded-lg text-white focus:border-zeno-cyan focus:outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-gray-500 uppercase">Last Name</label>
                                            <input
                                                type="text"
                                                value={editForm.lastName}
                                                onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                                                className="w-full mt-1 px-3 py-2 bg-zeno-navy border border-white/10 rounded-lg text-white focus:border-zeno-cyan focus:outline-none"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase">ID Number</label>
                                        <input
                                            type="text"
                                            value={editForm.idNumber}
                                            onChange={(e) => setEditForm({ ...editForm, idNumber: e.target.value })}
                                            className="w-full mt-1 px-3 py-2 bg-zeno-navy border border-white/10 rounded-lg text-white font-mono focus:border-zeno-cyan focus:outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase">Email</label>
                                        <input
                                            type="email"
                                            value={editForm.email}
                                            onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                                            className="w-full mt-1 px-3 py-2 bg-zeno-navy border border-white/10 rounded-lg text-white focus:border-zeno-cyan focus:outline-none"
                                            placeholder="client@email.com"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase">Phone</label>
                                        <input
                                            type="tel"
                                            value={editForm.phone}
                                            onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                                            className="w-full mt-1 px-3 py-2 bg-zeno-navy border border-white/10 rounded-lg text-white focus:border-zeno-cyan focus:outline-none"
                                            placeholder="0821234567"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase">Alt. Number 1</label>
                                        <input
                                            type="tel"
                                            value={editForm.alternativePhone}
                                            onChange={(e) => setEditForm({ ...editForm, alternativePhone: e.target.value })}
                                            className="w-full mt-1 px-3 py-2 bg-zeno-navy border border-white/10 rounded-lg text-white focus:border-zeno-cyan focus:outline-none"
                                            placeholder="0821234567"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase">Alt. Number 2</label>
                                        <input
                                            type="tel"
                                            value={editForm.alternativePhone2}
                                            onChange={(e) => setEditForm({ ...editForm, alternativePhone2: e.target.value })}
                                            className="w-full mt-1 px-3 py-2 bg-zeno-navy border border-white/10 rounded-lg text-white focus:border-zeno-cyan focus:outline-none"
                                            placeholder="0821234567"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase flex items-center gap-2">
                                            <span className="text-green-500">📱</span> WhatsApp
                                        </label>
                                        <input
                                            type="tel"
                                            value={editForm.whatsappNumber}
                                            onChange={(e) => setEditForm({ ...editForm, whatsappNumber: e.target.value })}
                                            className="w-full mt-1 px-3 py-2 bg-zeno-navy border border-white/10 rounded-lg text-white focus:border-zeno-cyan focus:outline-none"
                                            placeholder="0821234567"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase flex items-center gap-2">
                                            <span className="text-blue-400">✈️</span> Telegram
                                        </label>
                                        <input
                                            type="text"
                                            value={editForm.telegramNumber}
                                            onChange={(e) => setEditForm({ ...editForm, telegramNumber: e.target.value })}
                                            className="w-full mt-1 px-3 py-2 bg-zeno-navy border border-white/10 rounded-lg text-white focus:border-zeno-cyan focus:outline-none"
                                            placeholder="@username or phone number"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase">Address</label>
                                        <textarea
                                            value={editForm.address}
                                            onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                                            className="w-full mt-1 px-3 py-2 bg-zeno-navy border border-white/10 rounded-lg text-white focus:border-zeno-cyan focus:outline-none resize-none"
                                            rows={2}
                                            placeholder="Street address, city, postal code"
                                        />
                                    </div>
                                </>
                            ) : (
                                <>
                                    {/* Name/ID removed from view mode as they are in header */}
                                    {/* Only contact info remains */}
                                    {caseData.client.email && (
                                        <div>
                                            <label className="text-xs text-gray-500 uppercase">Email</label>
                                            <p className="text-white">{caseData.client.email}</p>
                                        </div>
                                    )}
                                    {caseData.client.phone && (
                                        <div>
                                            <label className="text-xs text-gray-500 uppercase">Phone</label>
                                            <p className="text-white">{caseData.client.phone}</p>
                                        </div>
                                    )}
                                    {caseData.client.alternativePhone && (
                                        <div>
                                            <label className="text-xs text-gray-500 uppercase">Alt. Number 1</label>
                                            <p className="text-white">{caseData.client.alternativePhone}</p>
                                        </div>
                                    )}
                                    {caseData.client.alternativePhone2 && (
                                        <div>
                                            <label className="text-xs text-gray-500 uppercase">Alt. Number 2</label>
                                            <p className="text-white">{caseData.client.alternativePhone2}</p>
                                        </div>
                                    )}
                                    {caseData.client.whatsappNumber && (
                                        <div>
                                            <label className="text-xs text-gray-500 uppercase flex items-center gap-2">
                                                <span className="text-green-500">📱</span> WhatsApp
                                            </label>
                                            <a
                                                href={`https://wa.me/${caseData.client.whatsappNumber.replace(/^0/, '27').replace(/\D/g, '')}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-green-400 hover:text-green-300 transition-colors"
                                            >
                                                {caseData.client.whatsappNumber}
                                            </a>
                                        </div>
                                    )}
                                    {caseData.client.telegramNumber && (
                                        <div>
                                            <label className="text-xs text-gray-500 uppercase flex items-center gap-2">
                                                <span className="text-blue-400">✈️</span> Telegram
                                            </label>
                                            <a
                                                href={caseData.client.telegramNumber.startsWith('@')
                                                    ? `https://t.me/${caseData.client.telegramNumber.substring(1)}`
                                                    : `https://t.me/${caseData.client.telegramNumber.replace(/^0/, '27').replace(/\D/g, '')}`
                                                }
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-400 hover:text-blue-300 transition-colors"
                                            >
                                                {caseData.client.telegramNumber}
                                            </a>
                                        </div>
                                    )}
                                    {caseData.client.address && (
                                        <div>
                                            <label className="text-xs text-gray-500 uppercase">Address</label>
                                            <p className="text-white">{caseData.client.address}</p>
                                        </div>
                                    )}
                                </>
                            )}
                            <div>
                                <label className="text-xs text-gray-500 uppercase font-semibold text-zeno-cyan/70">Case Category</label>
                                <p className="text-white mt-1">
                                    <span className="inline-flex items-center px-3 py-1 rounded-lg text-xs font-bold bg-zeno-cyan/10 text-zeno-cyan border border-zeno-cyan/30">
                                        {caseData.category || 'Not Categorized'}
                                    </span>
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Service Required - Replaces Projects */}
                    <div className="bg-zeno-blue/20 rounded-xl border border-white/5 p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-white">⚙️ Service Required</h3>
                            <button
                                onClick={() => setIsEditServicesOpen(true)}
                                className="text-[10px] text-zeno-cyan hover:underline uppercase font-bold tracking-wider"
                            >
                                Edit Services
                            </button>
                        </div>
                        <div className="space-y-3">
                            {(() => {
                                try {
                                    const services = caseData.services ? JSON.parse(caseData.services) : [];
                                    if (services.length === 0) return <p className="text-sm text-gray-500 italic">No services selected</p>;
                                    if (services.length === 1) {
                                        const sName = SERVICES_MAP[services[0] as keyof typeof SERVICES_MAP];
                                        return (
                                            <div className="p-3 bg-zeno-cyan/10 border border-zeno-cyan/30 rounded-lg">
                                                <p className="text-white font-medium">{sName || services[0]}</p>
                                            </div>
                                        );
                                    }
                                    return (
                                        <div className="p-3 bg-zeno-cyan/10 border border-zeno-cyan/30 rounded-lg">
                                            <div className="flex items-center justify-between">
                                                <p className="text-white font-bold text-lg">2 or More</p>
                                                <span className="px-2 py-0.5 bg-zeno-cyan text-zeno-navy text-[10px] font-bold rounded-full">
                                                    {services.length} Total
                                                </span>
                                            </div>
                                            <div className="mt-2 pt-2 border-t border-zeno-cyan/20 space-y-1">
                                                {services.slice(0, 3).map((sid: string) => {
                                                    const sName = SERVICES_MAP[sid as keyof typeof SERVICES_MAP];
                                                    return (
                                                        <p key={sid} className="text-[11px] text-gray-400">• {sName || sid}</p>
                                                    );
                                                })}
                                                {services.length > 3 && (
                                                    <p className="text-[11px] text-zeno-cyan/60 italic">+{services.length - 3} more...</p>
                                                )}
                                            </div>
                                        </div>
                                    );
                                } catch (e) {
                                    return <p className="text-sm text-red-400">Error parsing services</p>;
                                }
                            })()}
                        </div>
                    </div>

                    {/* Case Team - New Section */}
                    <div className="bg-zeno-blue/20 rounded-xl border border-white/5 p-6 mt-6">
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h3 className="text-lg font-semibold text-white">Case Team</h3>
                                <p className="text-[10px] text-gray-500 uppercase mt-0.5 tracking-wider">Specifically assigned users</p>
                            </div>
                            <button
                                onClick={() => setIsManageAssignmentsOpen(true)}
                                className="p-1.5 text-zeno-cyan hover:bg-zeno-cyan/10 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6-0H6" />
                                </svg>
                                Manage
                            </button>
                        </div>
                        <div className="space-y-3">
                            {caseData.assignments && caseData.assignments.length > 0 ? (
                                caseData.assignments.map((assignment) => (
                                    <div key={assignment.userId} className="flex items-center gap-3 p-2 bg-white/5 rounded-lg border border-white/5 group hover:border-zeno-cyan/30 transition-all">
                                        <div className="w-8 h-8 rounded-full bg-zeno-cyan/20 flex items-center justify-center text-zeno-cyan font-bold border border-zeno-cyan/30">
                                            {assignment.user.firstName[0]}{assignment.user.lastName[0]}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-white truncate">{assignment.user.firstName} {assignment.user.lastName}</p>
                                            <p className="text-[10px] text-gray-400 truncate">{assignment.user.email}</p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-6 px-4 bg-white/5 rounded-lg border border-dashed border-white/10">
                                    <p className="text-sm text-gray-500 italic mb-2">No users assigned to this case specifically.</p>
                                    <p className="text-[10px] text-gray-600">Assigned users get priority access and notifications for this record.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Services Required - Moved to Left Column */}
                    {caseData && (
                        <div className="bg-zeno-blue/20 rounded-xl border border-white/5 p-6 mt-6">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-semibold text-white">Services Required</h3>
                                <button
                                    onClick={() => setIsEditServicesOpen(true)}
                                    className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                                    title="Edit Services"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {(() => {
                                    try {
                                        const services = caseData.services ? JSON.parse(caseData.services) : [];
                                        if (services.length === 0) {
                                            return <span className="text-gray-500 italic text-sm">No services selected</span>;
                                        }
                                        return services.map((serviceId: string) => (
                                            <span
                                                key={serviceId}
                                                className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30"
                                            >
                                                {SERVICES_MAP[serviceId] || serviceId}
                                            </span>
                                        ));
                                    } catch {
                                        return <span className="text-gray-400">Unable to load services</span>;
                                    }
                                })()}
                            </div>
                        </div>
                    )}




                    {/* Modals */}
                    {caseData && (
                        <EditServicesModal
                            isOpen={isEditServicesOpen}
                            onClose={() => setIsEditServicesOpen(false)}
                            currentServices={caseData.services ? JSON.parse(caseData.services) : []}
                            onSave={handleSaveServices}
                        />
                    )}

                    {caseData && (
                        <CaseAssignmentsModal
                            isOpen={isManageAssignmentsOpen}
                            onClose={() => setIsManageAssignmentsOpen(false)}
                            currentAssignments={caseData.assignments?.map(a => a.userId) || []}
                            projectMembers={(() => {
                                // Extract all unique members from all projects
                                const memberMap = new Map();
                                caseData.projects.forEach(cp => {
                                    cp.project.members?.forEach(m => {
                                        memberMap.set(m.userId, m.user);
                                    });
                                });
                                return Array.from(memberMap.entries()).map(([id, user]) => ({ id, ...user }));
                            })()}
                            onSave={handleUpdateAssignments}
                        />
                    )}


                </div>

                {/* Right Column - Status & Timeline */}
                <div className="lg:col-span-2 space-y-6">

                    {/* Case Description */}
                    <div className="bg-zeno-blue/20 rounded-xl border border-white/5 p-6">
                        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                            Case Description
                            {isSavingDescription && <span className="text-xs text-zeno-cyan font-normal animate-pulse">Saving...</span>}
                        </h3>
                        {/* Use a key to force re-render if needed, but react-quill handles value updates */}
                        <div className="bg-zeno-navy rounded-lg border border-white/10 overflow-hidden">
                            <RichTextEditor
                                value={description}
                                onChange={(val) => {
                                    // Debounce could be added here if needed, but onBlur isn't supported easily by standard Quill wrapper without custom handling.
                                    // For now, we update state, and we could add a save button or debounce.
                                    // Let's implement a debounce save effect or just update usage.
                                    // Actually, standard practice for text editors is autosave or save button.
                                    // Let's keep it simple: update state, and use a debounced effect usually.
                                    // For this iteration, I'll update state and trigger save with a debounce from the component or a manual save button?
                                    // User asked for "like a text box". Real-time saving might be too heavy.
                                    // Let's add a "Save" button or use debounce.
                                    // A debounced save within the change handler is best for UX.
                                    setDescription(val);
                                }}
                            />
                            {/* Debounce save logic needs to be implemented or we use a manual save. Given "Text Box" request, usually implies direct interaction.
                                Let's add a debounced save in useEffect or similar.
                                OR simply save on blur if we could.
                                Let's add a small "Save Description" button for explicit action to ensure reliability first, or auto-save.
                                I'll implement auto-save with debounce in useEffect.
                             */}
                        </div>
                        {/* Manual Save/Cancel Buttons */}
                        {description !== originalDescription && (
                            <div className="flex justify-end items-center gap-2 mt-3">
                                <button
                                    onClick={handleCancelDescription}
                                    className="px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                                    disabled={isSavingDescription}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveDescription}
                                    className="px-3 py-1.5 text-xs font-medium bg-zeno-cyan/10 text-zeno-cyan hover:bg-zeno-cyan/20 rounded-lg transition-colors disabled:opacity-50"
                                    disabled={isSavingDescription}
                                >
                                    {isSavingDescription ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        )}
                    </div>





                    {/* Case Tasks */}
                    <div className="bg-zeno-blue/20 rounded-xl border border-white/5 p-6">
                        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                            Case Tasks
                            {isSavingTasks && <span className="text-xs text-zeno-cyan font-normal animate-pulse">Saving...</span>}
                        </h3>

                        <div className="flex gap-2 mb-4">
                            <input
                                type="text"
                                value={newTaskText}
                                onChange={(e) => setNewTaskText(e.target.value)}
                                placeholder="Add a new task..."
                                className="flex-1 bg-zeno-navy border border-white/10 rounded-lg px-3 py-2 text-white focus:border-zeno-cyan focus:outline-none placeholder-gray-500"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        handleAddTask(newTaskText);
                                        setNewTaskText('');
                                    }
                                }}
                            />
                            <button
                                className="bg-zeno-cyan/10 hover:bg-zeno-cyan/20 text-zeno-cyan px-3 py-2 rounded-lg transition-colors"
                                onClick={() => {
                                    handleAddTask(newTaskText);
                                    setNewTaskText('');
                                }}
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            </button>
                        </div>

                        <div className="space-y-2">
                            {tasks.length === 0 && <p className="text-sm text-gray-500 italic">No tasks added yet.</p>}
                            {tasks.map(task => (
                                <div key={task.id} className="flex items-start gap-3 p-2 hover:bg-white/5 rounded-lg group transition-colors">
                                    <div className="pt-0.5">
                                        <input
                                            type="checkbox"
                                            checked={task.done}
                                            onChange={() => handleToggleTask(task.id)}
                                            className="w-4 h-4 rounded border-gray-600 bg-zeno-navy text-zeno-cyan focus:ring-zeno-cyan focus:ring-offset-0 cursor-pointer"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <span className={`text-sm block ${task.done ? 'text-gray-500 line-through' : 'text-gray-200'}`}>
                                            {task.text}
                                        </span>
                                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[10px] text-gray-500">
                                            {task.createdBy && (
                                                <span>Created by {task.createdBy} on {new Date(task.createdAt || '').toLocaleDateString()}</span>
                                            )}
                                            {task.done && task.completedBy && (
                                                <span className="text-green-500/70">Completed by {task.completedBy}</span>
                                            )}
                                        </div>
                                    </div>
                                    {isAdmin && (
                                        <button
                                            onClick={() => handleDeleteTask(task.id)}
                                            className="text-gray-500 hover:text-red-400 transition-colors p-1"
                                            title="Delete Task"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>


                    {/* Current Status & Transition */}
                    <div className="bg-zeno-blue/20 rounded-xl border border-white/5 p-6">
                        <h3 className="text-lg font-semibold text-white mb-4">Workflow Status</h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                            <div>
                                <label className="text-xs text-gray-500 uppercase mb-2 block">Current Status</label>
                                <div className="p-4 bg-zeno-navy rounded-lg border border-white/10">
                                    <p className="text-white font-semibold text-lg">{currentStatus?.name || caseData.status}</p>
                                    <p className="text-xs text-gray-400 mt-1">{currentStatus?.description}</p>
                                    {/* Deadline removed as requested */}
                                </div>
                            </div>

                            <div>
                                <label className="text-xs text-gray-500 uppercase mb-2 block">Change Status</label>
                                <select
                                    onChange={(e) => e.target.value && handleStatusChange(e.target.value)}
                                    disabled={updating}
                                    className="w-full px-4 py-3 bg-zeno-navy border border-white/10 rounded-lg text-white focus:border-zeno-cyan focus:outline-none disabled:opacity-50"
                                >
                                    <option value="">Select new status...</option>
                                    {STATUS_CATEGORIES.map(cat => (
                                        <optgroup key={cat.code} label={cat.name}>
                                            {WORKFLOW_STATUSES.filter(s => s.category === cat.code).map(status => (
                                                <option key={status.code} value={status.code}>
                                                    {status.name}
                                                </option>
                                            ))}
                                        </optgroup>
                                    ))}
                                </select>
                                {updating && <p className="text-xs text-zeno-cyan mt-2">Updating...</p>}
                            </div>
                        </div>

                        <div className="grid grid-cols-4 gap-4 text-sm">
                            <div>
                                <label className="text-xs text-gray-500 uppercase">Status Entry Date</label>
                                <p className="text-white">{mounted ? new Date(caseData.statusEntryDate).toLocaleDateString() : ''}</p>
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 uppercase">Days in Status</label>
                                <p className="text-white font-semibold">{caseData.daysInStatus} days</p>
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 uppercase">File Created</label>
                                <p className="text-white">{mounted ? new Date(caseData.createdAt).toLocaleDateString() : ''}</p>
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 uppercase">Next Update</label>
                                <p className={`font-medium ${mounted && caseData.nextUpdate && new Date(caseData.nextUpdate) < new Date() ? 'text-red-400' : 'text-zeno-cyan'}`}>
                                    {mounted ? (() => {
                                        if (caseData.nextUpdate) {
                                            return new Date(caseData.nextUpdate).toLocaleDateString();
                                        }
                                        const nextUpdate = new Date();
                                        nextUpdate.setDate(nextUpdate.getDate() + 5);
                                        return nextUpdate.toLocaleDateString();
                                    })() : ''}
                                </p>
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 uppercase">Last Update</label>
                                <p className="text-white">
                                    {mounted ? `${new Date(caseData.updatedAt).toLocaleDateString()} ${new Date(caseData.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Workflow Timeline */}


                    {/* Communication Hub Preview (Replaces old Notifications) */}
                    <div className="bg-zeno-blue/20 rounded-xl border border-white/5 p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                <span>🗣️</span> Quick Communication
                            </h3>
                            <button
                                onClick={() => setActiveDetailTab('COMMUNICATION')}
                                className="text-xs text-zeno-cyan hover:underline font-bold uppercase tracking-wider"
                            >
                                Open Full Hub
                            </button>
                        </div>

                        {!caseData.client.phone && !caseData.client.email ? (
                            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4">
                                <p className="text-red-400 text-[11px] font-bold uppercase">⚠️ Missing Client Contact Data</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="p-3 bg-zeno-navy rounded-lg border border-white/10">
                                    <p className="text-xs text-gray-500 mb-2">Last Message Recipient:</p>
                                    <p className="text-sm text-white font-medium">{caseData.client.phone || caseData.client.email}</p>
                                </div>
                                <button
                                    onClick={() => setActiveDetailTab('COMMUNICATION')}
                                    className="w-full py-2 bg-zeno-cyan text-zeno-navy font-bold rounded-lg hover:bg-cyan-400 transition-all text-sm"
                                >
                                    Draft a Message
                                </button>
                            </div>
                        )}
                    </div>

                    {/* DHS Information - Only show for Debt Review Flag Removal */}
                    {(() => {
                        let showDhsSection = false;
                        try {
                            const services = caseData.services ? JSON.parse(caseData.services) : [];
                            showDhsSection = services.includes('debt_review_flag_removal');
                        } catch (e) {
                            log.error({ err: e }, 'Error parsing services for DHS check');
                        }

                        if (!showDhsSection) return null;

                        return (
                            <div className="bg-zeno-blue/20 rounded-xl border border-white/5 p-6 shadow-sm">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-lg font-semibold text-white">🏛️ DHS Information</h3>
                                    <div className="flex gap-2 items-start">
                                        <div className="flex flex-col items-end gap-1">
                                            <button
                                                onClick={handleAutoFillDhs}
                                                disabled={autoFillLoading}
                                                className="px-3 py-1 bg-indigo-600 border border-indigo-500/50 text-white rounded hover:bg-indigo-700 disabled:opacity-70 disabled:cursor-not-allowed transition-colors text-sm flex items-center gap-2"
                                                title="Populate fields from DHS portal"
                                            >
                                                {autoFillLoading ? (
                                                    <>
                                                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                        Auto-filling...
                                                    </>
                                                ) : (
                                                    <>
                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                                        Auto-fill
                                                    </>
                                                )}
                                            </button>
                                            {autoFillMessage && (
                                                <div className={`text-[10px] px-2 py-1 rounded max-w-[260px] text-right leading-relaxed ${
                                                    autoFillMessage.type === 'error'   ? 'text-red-400 bg-red-500/10 border border-red-500/20' :
                                                    autoFillMessage.type === 'success' ? 'text-green-400 bg-green-500/10 border border-green-500/20' :
                                                                                         'text-amber-300 bg-amber-500/10 border border-amber-500/20'
                                                }`}>
                                                    {autoFillMessage.text}
                                                </div>
                                            )}
                                        </div>
                                        {!isEditing && (
                                            isEditingDhs ? (
                                                <div className="flex items-center gap-2">
                                                    <button onClick={cancelEditingDhs} className="text-gray-400 hover:text-white text-sm">Cancel</button>
                                                    <button onClick={saveDhsChanges} className="text-green-400 hover:text-green-300 text-sm font-medium">Save</button>
                                                </div>
                                            ) : (
                                                <button onClick={startEditingDhs} className="text-gray-400 hover:text-white p-1 rounded hover:bg-white/5 transition-colors" title="Edit DHS Info">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                                </button>
                                            )
                                        )}
                                    </div>
                                </div>

                                {/* ── File Requests Panel ── */}
                                <div className="mb-4 rounded-lg border border-white/10 overflow-hidden">
                                    {/* Primary: Send All */}
                                    <div className="p-3 bg-gradient-to-r from-cyan-500/10 to-indigo-500/10 border-b border-white/5">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className="text-[10px] text-white font-bold uppercase tracking-wide">File Requests</span>
                                            {/* AI Draft toggle */}
                                            <button
                                                onClick={() => setUseAiDraft(v => !v)}
                                                title={useAiDraft ? 'AI-drafted letters enabled — click to use standard templates' : 'Standard templates — click to enable AI drafting'}
                                                className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wide transition-all ${
                                                    useAiDraft
                                                        ? 'bg-violet-500/20 border-violet-500/40 text-violet-300 hover:bg-violet-500/30'
                                                        : 'bg-white/5 border-white/10 text-gray-500 hover:bg-white/10'
                                                }`}
                                            >
                                                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                                                {useAiDraft ? 'AI On' : 'AI Off'}
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-gray-400 mb-2 leading-relaxed">
                                            Sends file-request emails to the Debt Counsellor{caseData.dcEmail ? ` (${caseData.dcEmail})` : ' (no email on file)'}, credit bureaus and all linked credit providers in one action.
                                        </p>
                                        
                                        {/* Validation Check */}
                                        {(() => {
                                            const hasDhsInfo    = !!caseData.ncrdcNo || !!caseData.debtCounsellorName;
                                            const hasCreditInfo = !!caseData.openAccounts || !!caseData.totalDebtAmount;
                                            const hasIdDoc      = caseData.documents?.some((d: any) => d.type === 'ID');
                                            const hasPoaDoc     = caseData.documents?.some((d: any) => d.type === 'POA' || d.type === 'ZENOWETHU_POA');
                                            const isReady       = hasDhsInfo && hasCreditInfo;
                                            const hasActions    = !isReady || !hasIdDoc || !hasPoaDoc;

                                            return (
                                                <div className="space-y-2">
                                                    {hasActions && (
                                                        <div className="bg-amber-500/10 border border-amber-500/30 rounded p-2 mb-2">
                                                            <p className="text-[9px] text-amber-300 font-bold uppercase mb-1">⚠️ Action Required</p>
                                                            <ul className="text-[9px] text-amber-400/80 list-disc list-inside space-y-0.5">
                                                                {!hasDhsInfo    && <li>Click &quot;Auto-fill&quot; to pull DHS Information</li>}
                                                                {!hasCreditInfo && <li>Upload &amp; Analyze a Credit Report first</li>}
                                                                {!hasIdDoc      && <li>Upload client <strong>ID Document</strong> (Documents tab)</li>}
                                                                {!hasPoaDoc     && <li>Upload signed <strong>POA</strong> (Documents tab)</li>}
                                                            </ul>
                                                        </div>
                                                    )}
                                                    <button
                                                        onClick={handleSendAllFileRequests}
                                                        disabled={!isReady || sendingAllRequests || sendingDCNotification !== null || sendingFileRequests || sendingDrrRequests}
                                                        className={`w-full py-2 px-3 border rounded text-xs font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${
                                                            isReady 
                                                                ? 'bg-gradient-to-r from-cyan-600/30 to-indigo-600/30 border-cyan-500/30 text-white hover:from-cyan-600/40 hover:to-indigo-600/40' 
                                                                : 'bg-zinc-800 border-zinc-700 text-zinc-500'
                                                        }`}
                                                    >
                                                        {sendingAllRequests ? (
                                                            <>
                                                                <span className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full" />
                                                                Sending all requests...
                                                            </>
                                                        ) : (
                                                            <>
                                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                                                                {isReady ? 'Send All File Requests' : 'Information Incomplete'}
                                                            </>
                                                        )}
                                                    </button>

                                                    {/* Specialized DRR Trigger */}
                                                    {caseData.dhsStatus === 'D3' && (
                                                        <button
                                                            onClick={handleSendDrrFileRequests}
                                                            disabled={sendingDrrRequests || sendingAllRequests}
                                                            className="w-full py-2 px-3 bg-gradient-to-r from-amber-600/40 to-red-600/40 border border-amber-500/30 text-white rounded text-xs font-bold hover:from-amber-600/50 hover:to-red-600/50 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                                        >
                                                            {sendingDrrRequests ? (
                                                                <>
                                                                    <span className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full" />
                                                                    Requesting DRR Files...
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                                                    Request Debt Review Removal Files
                                                                </>
                                                            )}
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                        {allRequestsResult && (
                                            <div className={`mt-2 text-[10px] px-2 py-1.5 rounded leading-relaxed space-y-0.5 ${
                                                allRequestsResult.failures > 0 && !allRequestsResult.dcSent && allRequestsResult.bureausSent === 0 && allRequestsResult.providersSent === 0
                                                    ? 'text-red-400 bg-red-500/10 border border-red-500/20'
                                                    : allRequestsResult.failures > 0
                                                        ? 'text-yellow-400 bg-yellow-500/10 border border-yellow-500/20'
                                                        : 'text-green-400 bg-green-500/10 border border-green-500/20'
                                            }`}>
                                                {allRequestsResult.lines.map((line, i) => (
                                                    <div key={i}>• {line}</div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Individual actions */}
                                    <div className="p-3 bg-black/20 space-y-2">
                                        <span className="text-[9px] text-gray-600 font-semibold uppercase tracking-wider">Individual Actions</span>
                                        {/* DC actions */}
                                        {caseData.dcEmail && (
                                            <div className="grid grid-cols-2 gap-2">
                                                <button
                                                    onClick={() => handleDCNotification('FILE_REQUEST')}
                                                    disabled={sendingDCNotification !== null || sendingAllRequests}
                                                    className="py-1.5 px-3 bg-indigo-600/20 border border-indigo-600/40 text-indigo-300 rounded text-xs font-semibold hover:bg-indigo-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                                >
                                                    {sendingDCNotification === 'FILE' ? (
                                                        <span className="animate-spin h-3 w-3 border-2 border-indigo-300 border-t-transparent rounded-full" />
                                                    ) : (
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                                    )}
                                                    DC: Request File
                                                </button>
                                                <button
                                                    onClick={() => handleDCNotification('INVOICE_REQUEST')}
                                                    disabled={sendingDCNotification !== null || sendingAllRequests}
                                                    className="py-1.5 px-3 bg-indigo-600/20 border border-indigo-600/40 text-indigo-300 rounded text-xs font-semibold hover:bg-indigo-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                                >
                                                    {sendingDCNotification === 'INVOICE' ? (
                                                        <span className="animate-spin h-3 w-3 border-2 border-indigo-300 border-t-transparent rounded-full" />
                                                    ) : (
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                                    )}
                                                    DC: Request Invoice
                                                </button>
                                            </div>
                                        )}
                                        {/* Bureau + provider only */}
                                        <button
                                            onClick={handleSendFileRequests}
                                            disabled={sendingFileRequests || sendingAllRequests}
                                            className="w-full py-1.5 px-3 bg-cyan-600/20 border border-cyan-600/40 text-cyan-300 rounded text-xs font-semibold hover:bg-cyan-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {sendingFileRequests ? (
                                                <>
                                                    <span className="animate-spin h-3 w-3 border-2 border-cyan-300 border-t-transparent rounded-full" />
                                                    Sending...
                                                </>
                                            ) : (
                                                <>
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                                                    Bureaus &amp; Providers Only
                                                </>
                                            )}
                                        </button>
                                        {fileRequestResult && (
                                            <div className={`text-[10px] px-2 py-1 rounded leading-relaxed ${
                                                fileRequestResult.failures > 0 && fileRequestResult.bureausSent === 0 && fileRequestResult.providersSent === 0
                                                    ? 'text-red-400 bg-red-500/10 border border-red-500/20'
                                                    : fileRequestResult.failures > 0
                                                        ? 'text-yellow-400 bg-yellow-500/10 border border-yellow-500/20'
                                                        : 'text-green-400 bg-green-500/10 border border-green-500/20'
                                            }`}>
                                                {fileRequestResult.message}
                                            </div>
                                        )}

                                        {/* Send POA Button */}
                                        {(() => {
                                            // Only gate on NCRDC/DC details for Debt Review Flag Removal cases
                                            const svcList: string[] = (() => { try { return JSON.parse(caseData?.services ?? '[]'); } catch { return []; } })();
                                            const isDRR     = svcList.some(s => s.toLowerCase().includes('flag removal'));
                                            const drrReady  = !isDRR || !!(caseData?.ncrdcNo && caseData?.debtCounsellorName);
                                            const hasId     = caseData?.documents?.some((d: any) => d.type === 'ID');
                                            const hasPoa    = caseData?.documents?.some((d: any) => d.type === 'POA' || d.type === 'ZENOWETHU_POA');
                                            const docsMissing = !hasId || !hasPoa;
                                            return (
                                                <div className="pt-1 border-t border-white/5">
                                                    <p className="text-[10px] text-gray-500 mb-1.5 font-semibold uppercase tracking-wide">Power of Attorney</p>
                                                    <button
                                                        onClick={() => drrReady && setIsPoaModalOpen(true)}
                                                        disabled={!drrReady}
                                                        title={!drrReady ? 'Run DHS Auto-Fill first — NCRDC No and Debt Counsellor are required for Debt Review Flag Removal cases.' : undefined}
                                                        className={`w-full py-1.5 px-3 rounded text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
                                                            drrReady
                                                                ? 'bg-purple-600/20 border border-purple-600/40 text-purple-300 hover:bg-purple-600/30 cursor-pointer'
                                                                : 'bg-white/5 border border-white/10 text-gray-500 cursor-not-allowed opacity-60'
                                                        }`}
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                        </svg>
                                                        Send POA to Client
                                                        {!drrReady && <span className="ml-1 text-[10px] text-gray-500">(DHS required)</span>}
                                                    </button>
                                                    {!drrReady && (
                                                        <p className="text-[10px] text-amber-500/80 mt-1 text-center">
                                                            Run DHS Auto-Fill to set NCRDC No &amp; Debt Counsellor
                                                        </p>
                                                    )}
                                                    {/* ID + POA document alert — applies to every case */}
                                                    {docsMissing && (
                                                        <div className="mt-1.5 rounded bg-amber-500/10 border border-amber-500/30 px-2.5 py-2">
                                                            <p className="text-[9px] text-amber-300 font-bold uppercase mb-0.5">⚠ Documents Required</p>
                                                            <p className="text-[9px] text-amber-400/80 leading-relaxed">
                                                                {[!hasId && 'ID Document', !hasPoa && 'Signed POA'].filter(Boolean).join(' and ')} must be uploaded before the DHS transfer request can be submitted.
                                                            </p>
                                                            <p className="text-[9px] text-amber-400/60 mt-0.5">Upload under the <strong>Documents</strong> tab.</p>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>

                                {isEditing || isEditingDhs ? (
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs text-gray-400 mb-1">NCRDC NO</label>
                                                <input
                                                    type="text"
                                                    value={editForm.ncrdcNo}
                                                    onChange={(e) => setEditForm(prev => ({ ...prev, ncrdcNo: e.target.value }))}
                                                    className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-sm text-white focus:border-cyan-500 focus:outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-gray-400 mb-1">PREVIOUS STATUS</label>
                                                <input
                                                    type="text"
                                                    value={editForm.dhsPreviousStatus}
                                                    onChange={(e) => setEditForm(prev => ({ ...prev, dhsPreviousStatus: e.target.value }))}
                                                    placeholder="Previous Status"
                                                    className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-sm text-white focus:border-cyan-500 focus:outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-gray-400 mb-1">CONSUMER DHS STATUS</label>
                                                <input
                                                    type="text"
                                                    value={editForm.consumerDhsStatus}
                                                    onChange={(e) => setEditForm(prev => ({ ...prev, consumerDhsStatus: e.target.value }))}
                                                    placeholder="Consumer Status"
                                                    className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-sm text-white focus:border-cyan-500 focus:outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-gray-400 mb-1">REQUEST STATUS</label>
                                                <select
                                                    value={editForm.dhsStatus}
                                                    onChange={(e) => setEditForm(prev => ({ ...prev, dhsStatus: e.target.value }))}
                                                    className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-sm text-white focus:border-cyan-500 focus:outline-none"
                                                >
                                                    <option value="">Select status...</option>
                                                    <option value="NOT_REQUESTED">Not Requested</option>
                                                    <option value="PENDING">Pending</option>
                                                    <option value="DECLINED">Declined</option>
                                                    <option value="AUTO_TRANSFERRED">Auto Transferred</option>
                                                    <option value="ACCEPTED">Accepted</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs text-gray-400 mb-1">DEBT COUNSELLOR NAME</label>
                                                <input
                                                    type="text"
                                                    value={editForm.debtCounsellorName}
                                                    onChange={(e) => setEditForm(prev => ({ ...prev, debtCounsellorName: e.target.value }))}
                                                    className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-sm text-white focus:border-cyan-500 focus:outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-gray-400 mb-1">DC TRADING NAME</label>
                                                <input
                                                    type="text"
                                                    value={editForm.dcTradingName}
                                                    onChange={(e) => setEditForm(prev => ({ ...prev, dcTradingName: e.target.value }))}
                                                    className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-sm text-white focus:border-cyan-500 focus:outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-gray-400 mb-1">OPERATING STATUS</label>
                                                <input
                                                    type="text"
                                                    value={editForm.dcOperatingStatus}
                                                    onChange={(e) => setEditForm(prev => ({ ...prev, dcOperatingStatus: e.target.value }))}
                                                    className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-sm text-white focus:border-cyan-500 focus:outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-gray-400 mb-1">MOBILE</label>
                                                <input
                                                    type="text"
                                                    value={editForm.dcMobile}
                                                    onChange={(e) => setEditForm(prev => ({ ...prev, dcMobile: e.target.value }))}
                                                    className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-sm text-white focus:border-cyan-500 focus:outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-gray-400 mb-1">DC EMAIL</label>
                                                <input
                                                    type="text"
                                                    value={editForm.dcEmail}
                                                    onChange={(e) => setEditForm(prev => ({ ...prev, dcEmail: e.target.value }))}
                                                    className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-sm text-white focus:border-cyan-500 focus:outline-none"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <div className="text-xs text-gray-400 mb-1">NCRDC NO</div>
                                                <div className="text-sm text-white font-medium">{caseData.ncrdcNo || 'Not set'}</div>
                                            </div>
                                            {caseData.ncrSysRef && (
                                                <div>
                                                    <div className="text-xs text-gray-400 mb-1">NCR SYS REF</div>
                                                    <div className="text-sm text-white font-mono">{caseData.ncrSysRef}</div>
                                                </div>
                                            )}
                                            <div>
                                                <div className="text-xs text-gray-400 mb-1">PREVIOUS STATUS</div>
                                                <div className="text-sm text-white font-medium">{caseData.dhsPreviousStatus || 'Not set'}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-gray-400 mb-1">STATUS</div>
                                                <div className="text-sm text-white font-medium">{caseData.consumerDhsStatus || 'Not set'}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-gray-400 mb-1">REQUEST STATUS</div>
                                                <div className="text-sm text-white font-medium">{caseData.dhsStatus || 'Not set'}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-gray-400 mb-1">DAYS COUNTER</div>
                                                <div className="text-sm text-white font-medium">{caseData.dhsDaysCounter || 'Not set'}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-gray-400 mb-1">DEBT COUNSELLOR</div>
                                                <div className="text-sm text-white font-medium">{caseData.debtCounsellorName || 'Not set'}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-gray-400 mb-1">TRADING NAME</div>
                                                <div className="text-sm text-white font-medium">{caseData.dcTradingName || 'Not set'}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-gray-400 mb-1">OPERATING STATUS</div>
                                                <div className="text-sm text-white font-medium">{caseData.dcOperatingStatus || 'Not set'}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-gray-400 mb-1">MOBILE</div>
                                                <div className="text-sm text-white font-medium">{caseData.dcMobile || 'Not set'}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-gray-400 mb-1">DC TEL</div>
                                                <div className="text-sm text-white font-medium">{caseData.dcTel || 'Not set'}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-gray-400 mb-1">DC EMAIL</div>
                                                <div className="text-sm text-white font-medium">{caseData.dcEmail || 'Not set'}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-gray-400 mb-1">DC LAST USED EMAIL</div>
                                                <div className="text-sm text-white font-medium">{caseData.lastKnownEmail || 'Not set'}</div>
                                            </div>
                                            <div className="col-span-2">
                                                <div className="flex gap-2 flex-wrap pt-2">
                                                    <button
                                                        onClick={handleDHSLookup}
                                                        disabled={dhsLoading}
                                                        className="px-3 py-1.5 bg-zeno-navy border border-white/10 text-white rounded hover:bg-white/5 transition-colors text-sm flex items-center gap-2"
                                                    >
                                                        {dhsLoading ? <div className="animate-spin h-3 w-3 border-2 border-white/20 border-t-white rounded-full"></div> : 'Check DHS'}
                                                    </button>
                                                    <button
                                                        onClick={handleCheckRequestStatus}
                                                        disabled={checkRequestLoading}
                                                        className="px-3 py-1.5 bg-zeno-navy border border-white/10 text-white rounded hover:bg-white/5 transition-colors text-sm flex items-center gap-2"
                                                    >
                                                        {checkRequestLoading ? <div className="animate-spin h-3 w-3 border-2 border-white/20 border-t-white rounded-full"></div> : 'Check Request Status'}
                                                    </button>
                                                    {(() => {
                                                        const status = caseData.dhsStatus?.toUpperCase();
                                                        if (status !== 'PENDING' && status !== 'DECLINED') return null;
                                                        return (
                                                            <button
                                                                onClick={handleRequestTransfer}
                                                                disabled={requestingTransfer}
                                                                className="px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors text-sm"
                                                            >
                                                                {requestingTransfer ? 'Requesting...' : 'Request Transfer'}
                                                            </button>
                                                        );
                                                    })()}
                                                </div>

                                                {/* Document readiness check — shown when transfer has NOT been requested yet */}
                                                {(() => {
                                                    const s = (caseData.dhsStatus || '').toUpperCase().replace(/[\s_]+/g, '');
                                                    if (s !== '' && s !== 'NOTREQUESTED') return null;
                                                    const hasId = caseData.documents.some(d => d.type === 'ID');
                                                    const hasPoa = caseData.documents.some(d => d.type === 'POA' || d.type === 'ZENOWETHU_POA');
                                                    const hasCombined = caseData.documents.some(d => d.type === 'COMBINED' || d.type === 'OTHER');

                                                    if (hasId && hasPoa) {
                                                        return (
                                                            <div className="mt-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                                                                <div className="flex items-center gap-2 mb-1.5">
                                                                    <div className="w-1.5 h-1.5 bg-green-400 rounded-full"></div>
                                                                    <span className="text-xs text-green-400 font-semibold">Ready to Request Transfer</span>
                                                                </div>
                                                                <p className="text-[11px] text-gray-400 mb-2">ID and POA documents are present.</p>
                                                                <button
                                                                    onClick={handleRequestTransfer}
                                                                    disabled={requestingTransfer}
                                                                    className="px-3 py-1.5 bg-green-600/80 border border-green-500/40 text-white rounded text-xs font-semibold hover:bg-green-600 transition-colors flex items-center gap-1.5 disabled:opacity-60"
                                                                >
                                                                    {requestingTransfer ? (
                                                                        <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Requesting...</>
                                                                    ) : (
                                                                        <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>Request Transfer</>
                                                                    )}
                                                                </button>
                                                            </div>
                                                        );
                                                    }

                                                    const missingDocs: string[] = [];
                                                    if (!hasId) missingDocs.push('ID');
                                                    if (!hasPoa) missingDocs.push('POA');

                                                    return (
                                                        <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                                                            <div className="flex items-center gap-2 mb-1.5">
                                                                <div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse"></div>
                                                                <span className="text-xs text-amber-400 font-semibold">Documents Required Before Requesting</span>
                                                            </div>
                                                            <p className="text-[11px] text-gray-400 mb-3">
                                                                Missing: <span className="text-amber-300 font-medium">{missingDocs.join(' & ')}</span>
                                                                {hasCombined && ' — or extract from combined file below.'}
                                                            </p>
                                                            <div className="flex flex-wrap gap-2">
                                                                {!hasId && (
                                                                    <label className={`px-2.5 py-1.5 bg-amber-600/20 border border-amber-600/40 text-amber-300 rounded text-xs cursor-pointer hover:bg-amber-600/30 transition-all flex items-center gap-1.5 ${uploadingDocType === 'ID' ? 'opacity-70 pointer-events-none' : ''}`}>
                                                                        {uploadingDocType === 'ID'
                                                                            ? <span className="w-3 h-3 border border-amber-300 border-t-transparent rounded-full animate-spin inline-block" />
                                                                            : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                                                        }
                                                                        Upload ID
                                                                        <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => { if (e.target.files?.[0]) handleDocUpload(e.target.files[0], 'ID'); e.target.value = ''; }} />
                                                                    </label>
                                                                )}
                                                                {!hasPoa && (
                                                                    <label className={`px-2.5 py-1.5 bg-amber-600/20 border border-amber-600/40 text-amber-300 rounded text-xs cursor-pointer hover:bg-amber-600/30 transition-all flex items-center gap-1.5 ${uploadingDocType === 'POA' ? 'opacity-70 pointer-events-none' : ''}`}>
                                                                        {uploadingDocType === 'POA'
                                                                            ? <span className="w-3 h-3 border border-amber-300 border-t-transparent rounded-full animate-spin inline-block" />
                                                                            : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                                                        }
                                                                        Upload POA
                                                                        <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => { if (e.target.files?.[0]) handleDocUpload(e.target.files[0], 'POA'); e.target.value = ''; }} />
                                                                    </label>
                                                                )}
                                                                <label className={`px-2.5 py-1.5 bg-purple-600/20 border border-purple-600/40 text-purple-300 rounded text-xs cursor-pointer hover:bg-purple-600/30 transition-all flex items-center gap-1.5 ${uploadingDocType === 'COMBINED' ? 'opacity-70 pointer-events-none' : ''}`}>
                                                                    {uploadingDocType === 'COMBINED'
                                                                        ? <span className="w-3 h-3 border border-purple-300 border-t-transparent rounded-full animate-spin inline-block" />
                                                                        : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                                                    }
                                                                    Upload Combined File
                                                                    <input type="file" className="hidden" accept=".pdf" onChange={(e) => { if (e.target.files?.[0]) handleDocUpload(e.target.files[0], 'COMBINED'); e.target.value = ''; }} />
                                                                </label>
                                                            </div>
                                                            <p className="text-[10px] text-gray-500 mt-2">Upload a combined PDF — the system will extract the ID and POA automatically.</p>
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {dhsMessage && (
                                    <div className={`mt-3 p-2 rounded text-sm ${
                                        dhsMessage.type === 'success' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                                        dhsMessage.type === 'warning' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                                        'bg-red-500/20 text-red-400 border border-red-500/30'
                                    }`}>
                                        {dhsMessage.text}
                                    </div>
                                )}

                                {/* NCT Information Section (Parallel with DHS) */}
                                <div className="bg-zeno-navy/40 rounded-xl border border-white/5 p-6 mt-6">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-lg font-semibold text-white">⚖️ NCT Information</h3>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={handleCheckEPurse}
                                                disabled={nctLoading}
                                                className="px-3 py-1 bg-zeno-navy border border-white/10 text-white rounded hover:bg-white/5 transition-colors text-sm flex items-center gap-2"
                                                title="Check ePurse Balance"
                                            >
                                                💰 Balance
                                            </button>
                                            {isAdmin && !isEditingNct && (
                                                <button
                                                    onClick={() => setIsEditingNct(true)}
                                                    className="text-gray-400 hover:text-white p-1 rounded hover:bg-white/5 transition-colors"
                                                    title="Edit NCT Info"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mb-6">
                                        <div>
                                            <div className="text-xs text-gray-400 mb-1">NCT CASE NUMBER</div>
                                            <div className="text-sm text-white font-medium">{caseData.nctCaseNumber || 'Not set'}</div>
                                        </div>
                                        <div>
                                            <div className="text-xs text-gray-400 mb-1">NCT STATUS</div>
                                            <div className="text-sm text-zeno-cyan font-bold uppercase tracking-wide">
                                                {caseData.nctStatus || 'UNFILED'}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-xs text-gray-400 mb-1">FILING DATE</div>
                                            <div className="text-sm text-white font-medium">
                                                {caseData.nctFilingDate ? new Date(caseData.nctFilingDate).toLocaleDateString() : 'Not filed'}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-xs text-gray-400 mb-1">EPURSE BALANCE</div>
                                            <div className="text-sm text-green-400 font-bold">
                                                {caseData.nctEPurseBalance !== null ? `R${caseData.nctEPurseBalance}` : 'Unknown'}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-xs text-gray-400 mb-1">LAST UPDATED</div>
                                            <div className="text-sm text-gray-500 font-medium">
                                                {caseData.nctLastUpdated ? new Date(caseData.nctLastUpdated).toLocaleString() : 'Never'}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex gap-2 flex-wrap pt-3 border-t border-white/5">
                                        <button
                                            onClick={handleNCTLookup}
                                            disabled={nctLoading || !caseData.nctCaseNumber}
                                            className="px-3 py-2 bg-zeno-navy border border-white/10 text-white rounded-lg hover:bg-zeno-navy/80 transition-colors text-sm flex items-center gap-2 disabled:opacity-50"
                                        >
                                            {nctLoading ? (
                                                <div className="animate-spin h-4 w-4 rounded-full border-2 border-white/20 border-t-white"></div>
                                            ) : (
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                            )}
                                            Track NCT Status
                                        </button>

                                        {(!caseData.nctCaseNumber || caseData.nctStatus === 'UNFILED') && (
                                            <button
                                                onClick={handleNCTEFile}
                                                disabled={nctLoading}
                                                className="px-3 py-2 bg-zeno-cyan text-zeno-navy font-bold rounded-lg hover:bg-cyan-400 transition-all text-sm flex items-center gap-2"
                                            >
                                                🏛️ NCT eFiling
                                            </button>
                                        )}
                                    </div>
                                    {nctMessage && (
                                        <div className={`mt-3 p-2 rounded text-sm ${nctMessage.type === 'success' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                                            {nctMessage.text}
                                        </div>
                                    )}
                                </div>

                                {/* Decline Reason Section */}
                                {(() => {
                                    const isDeclined = ['DECLINED', 'CANCELLED', 'REJECTED'].includes(caseData?.status || '') ||
                                        caseData?.dhsStatus?.toUpperCase().includes('DECLINED') ||
                                        caseData?.consumerDhsStatus?.toUpperCase().includes('DECLINED');
                                    const hasReason = !!caseData.declineReason;
                                    const showInput = isEditingDhs || isAddingDeclineReason || hasReason;

                                    if (!isDeclined && !hasReason && !isEditingDhs) return null;

                                    return (
                                        <div className="mt-6 pt-6 border-t border-white/10">
                                            <div className="flex items-center justify-between mb-3">
                                                <h4 className="text-sm font-semibold text-red-400 flex items-center gap-2">
                                                    <span>🚩</span> Decline Reason
                                                </h4>
                                                {!showInput && (
                                                    <button
                                                        onClick={() => { setIsAddingDeclineReason(true); setIsEditingDhs(true); }}
                                                        className="text-xs text-white bg-red-500/20 border border-red-500/50 px-2 py-1 rounded hover:bg-red-500/30 transition-colors"
                                                    >
                                                        + Add Reason
                                                    </button>
                                                )}
                                                {(showInput || isEditingDhs) && isEditingDhs && (
                                                    <label className="text-xs text-gray-400 flex items-center gap-1.5 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={editForm.declineReasonAttended}
                                                            onChange={(e) => setEditForm(prev => ({ ...prev, declineReasonAttended: e.target.checked }))}
                                                            className="rounded border-white/10 bg-zeno-navy text-zeno-cyan w-3 h-3"
                                                        />
                                                        Attended To
                                                    </label>
                                                )}
                                            </div>
                                            {showInput && (
                                                isEditingDhs ? (
                                                    <textarea
                                                        value={editForm.declineReason}
                                                        onChange={(e) => setEditForm(prev => ({ ...prev, declineReason: e.target.value }))}
                                                        placeholder="Enter reason..."
                                                        className="w-full h-20 bg-black/50 border border-white/10 rounded-lg p-3 text-sm text-white focus:border-red-500/50 focus:outline-none resize-none"
                                                    />
                                                ) : (
                                                    <div className="text-sm text-white bg-red-900/10 p-3 rounded-lg border border-red-500/20 min-h-[3rem]">
                                                        {caseData.declineReason}
                                                        {caseData.declineReasonAttended && <span className="ml-2 text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded border border-green-500/30 uppercase font-bold">Attended</span>}
                                                    </div>
                                                )
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                        );
                    })()}



                    {/* Credit Bureau Information */}
                    <div className="mt-8 bg-zeno-blue/20 rounded-xl border border-white/5 p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-semibold text-white">Credit Bureau Info</h3>
                            {!isEditingCreditInfo ? (
                                <button onClick={startEditingCreditInfo} className="text-gray-400 hover:text-white p-1 rounded hover:bg-white/5 transition-colors" title="Edit Credit Info">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                </button>
                            ) : (
                                <div className="flex gap-2">
                                    <button onClick={cancelEditingCreditInfo} className="px-3 py-1.5 text-gray-400 hover:text-white text-sm">Cancel</button>
                                    <button onClick={saveCreditInfo} className="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 text-sm font-medium">Save</button>
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Accounts Summary */}
                            <div>
                                <h4 className="text-sm font-medium text-zeno-cyan uppercase tracking-wider mb-4 border-b border-white/10 pb-2">Accounts Summary</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase block mb-1">Balance Exposure</label>
                                        {isEditing || isEditingCreditInfo ? (
                                            <input
                                                type="text"
                                                value={editForm.totalDebtAmount}
                                                onChange={(e) => setEditForm(prev => ({ ...prev, totalDebtAmount: e.target.value }))}
                                                className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-sm text-white focus:border-zeno-cyan focus:outline-none"
                                                placeholder="0.00"
                                            />
                                        ) : (
                                            <p className="text-white font-mono">{caseData.totalDebtAmount ? `R ${parseFloat(caseData.totalDebtAmount.toString()).toFixed(2)}` : 'R 0.00'}</p>
                                        )}
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase block mb-1">Monthly Instalment</label>
                                        {isEditing || isEditingCreditInfo ? (
                                            <input
                                                type="text"
                                                value={editForm.totalMonthlyInstallment}
                                                onChange={(e) => setEditForm(prev => ({ ...prev, totalMonthlyInstallment: e.target.value }))}
                                                className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-sm text-white focus:border-zeno-cyan focus:outline-none"
                                                placeholder="0.00"
                                            />
                                        ) : (
                                            <p className="text-white font-mono">{caseData.totalMonthlyInstallment ? `R ${parseFloat(caseData.totalMonthlyInstallment.toString()).toFixed(2)}` : 'R 0.00'}</p>
                                        )}
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase block mb-1">Active Accounts</label>
                                        {isEditing || isEditingCreditInfo ? (
                                            <input
                                                type="number"
                                                value={editForm.openAccounts}
                                                onChange={(e) => setEditForm(prev => ({ ...prev, openAccounts: e.target.value }))}
                                                className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-sm text-white focus:border-zeno-cyan focus:outline-none"
                                            />
                                        ) : (
                                            <p className="text-white font-mono">{caseData.openAccounts || 0}</p>
                                        )}
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase block mb-1">Closed Accounts</label>
                                        {isEditing || isEditingCreditInfo ? (
                                            <input
                                                type="number"
                                                value={editForm.closedAccounts}
                                                onChange={(e) => setEditForm(prev => ({ ...prev, closedAccounts: e.target.value }))}
                                                className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-sm text-white focus:border-zeno-cyan focus:outline-none"
                                            />
                                        ) : (
                                            <p className="text-white font-mono">{caseData.closedAccounts || 0}</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Restructuring */}
                            <div>
                                <h4 className="text-sm font-medium text-zeno-cyan uppercase tracking-wider mb-4 border-b border-white/10 pb-2">Restructuring</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase block mb-1">Registration No.</label>
                                        {isEditing || isEditingCreditInfo ? (
                                            <input
                                                type="text"
                                                value={editForm.cb_ncrdcNo}
                                                onChange={(e) => setEditForm(prev => ({ ...prev, cb_ncrdcNo: e.target.value }))}
                                                className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-sm text-white focus:border-zeno-cyan focus:outline-none"
                                            />
                                        ) : (
                                            <p className="text-white">{caseData.cb_ncrdcNo || '-'}</p>
                                        )}
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase block mb-1">Contact</label>
                                        {isEditing || isEditingCreditInfo ? (
                                            <input
                                                type="text"
                                                value={editForm.cb_debtCounsellor}
                                                onChange={(e) => setEditForm(prev => ({ ...prev, cb_debtCounsellor: e.target.value }))}
                                                className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-sm text-white focus:border-zeno-cyan focus:outline-none"
                                            />
                                        ) : (
                                            <p className="text-white">{caseData.cb_debtCounsellor || '-'}</p>
                                        )}
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase block mb-1">Contact No</label>
                                        {isEditing || isEditingCreditInfo ? (
                                            <input
                                                type="text"
                                                value={editForm.cb_contactNo}
                                                onChange={(e) => setEditForm(prev => ({ ...prev, cb_contactNo: e.target.value }))}
                                                className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-sm text-white focus:border-zeno-cyan focus:outline-none"
                                            />
                                        ) : (
                                            <p className="text-white">{caseData.cb_contactNo || '-'}</p>
                                        )}
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase block mb-1">Application Date</label>
                                        {isEditing || isEditingCreditInfo ? (
                                            <input
                                                type="date"
                                                value={editForm.cb_applicationDate}
                                                onChange={(e) => setEditForm(prev => ({ ...prev, cb_applicationDate: e.target.value }))}
                                                className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-sm text-white focus:border-zeno-cyan focus:outline-none"
                                            />
                                        ) : (
                                            <p className="text-white">{caseData.cb_applicationDate ? new Date(caseData.cb_applicationDate).toLocaleDateString() : '-'}</p>
                                        )}
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase block mb-1">Status Description</label>
                                        {isEditing || isEditingCreditInfo ? (
                                            <input
                                                type="text"
                                                value={editForm.cb_status}
                                                onChange={(e) => setEditForm(prev => ({ ...prev, cb_status: e.target.value }))}
                                                className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-sm text-white focus:border-zeno-cyan focus:outline-none"
                                            />
                                        ) : (
                                            <p className="text-white">{caseData.cb_status || '-'}</p>
                                        )}
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase block mb-1">Status Date</label>
                                        {isEditing || isEditingCreditInfo ? (
                                            <input
                                                type="date"
                                                value={editForm.cb_statusDate}
                                                onChange={(e) => setEditForm(prev => ({ ...prev, cb_statusDate: e.target.value }))}
                                                className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-sm text-white focus:border-zeno-cyan focus:outline-none"
                                            />
                                        ) : (
                                            <p className="text-white">{caseData.cb_statusDate ? new Date(caseData.cb_statusDate).toLocaleDateString() : '-'}</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div >

                    {/* Enhanced Case Utilities - Tabbed Interface */}
                    < div className="mt-12 bg-zeno-blue/10 rounded-2xl border border-white/5 overflow-hidden shadow-2xl" >
                        <nav className="flex bg-zeno-navy/80 border-b border-white/5">
                            <button
                                onClick={() => setActiveDetailTab('ACTIVITY')}
                                className={`flex-1 px-6 py-4 text-sm font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-2 ${activeDetailTab === 'ACTIVITY'
                                    ? 'text-zeno-cyan border-b-2 border-zeno-cyan bg-zeno-cyan/5'
                                    : 'text-gray-500 hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                <span>💬</span> Activity & Journal
                            </button>
                            <button
                                onClick={() => setActiveDetailTab('DOCUMENTS')}
                                className={`flex-1 px-6 py-4 text-sm font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-2 ${activeDetailTab === 'DOCUMENTS'
                                    ? 'text-zeno-cyan border-b-2 border-zeno-cyan bg-zeno-cyan/5'
                                    : 'text-gray-500 hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                <span>📁</span> Documents
                            </button>
                            <button
                                onClick={() => setActiveDetailTab('COMMUNICATION')}
                                className={`flex-1 px-6 py-4 text-sm font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-2 ${activeDetailTab === 'COMMUNICATION'
                                    ? 'text-zeno-cyan border-b-2 border-zeno-cyan bg-zeno-cyan/5'
                                    : 'text-gray-500 hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                <span>🗣️</span> Comm Hub
                            </button>
                            <button
                                onClick={() => setActiveDetailTab('AI_PLAN')}
                                className={`flex-1 px-6 py-4 text-sm font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-2 ${activeDetailTab === 'AI_PLAN'
                                    ? 'text-zeno-cyan border-b-2 border-zeno-cyan bg-zeno-cyan/5'
                                    : 'text-gray-500 hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                <span>🤖</span> AI Plan
                            </button>
                            {isDebtReviewCase && (
                                <button
                                    onClick={() => setActiveDetailTab('DEBT_REVIEW')}
                                    className={`flex-1 px-6 py-4 text-sm font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-2 ${activeDetailTab === 'DEBT_REVIEW'
                                        ? 'text-zeno-cyan border-b-2 border-zeno-cyan bg-zeno-cyan/5'
                                        : 'text-gray-500 hover:text-white hover:bg-white/5'
                                        }`}
                                >
                                    <span>📄</span> Debt Review Docs
                                </button>
                            )}
                        </nav>

                        <div className="p-8">
                            {activeDetailTab === 'ACTIVITY' && (
                                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                                    <ActivityTab caseId={caseData.id} fileNumber={caseData.fileNumber} lastUpdate={activityUpdate} />
                                </div>
                            )}
                            {activeDetailTab === 'DOCUMENTS' && (
                                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                                    <DocumentsTab caseId={caseData.id} />
                                </div>
                            )}
                            {activeDetailTab === 'COMMUNICATION' && (
                                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                                    <CommunicationHub
                                        caseId={caseData.id}
                                        clientEmail={caseData.client.email}
                                        clientPhone={caseData.client.phone || caseData.client.whatsappNumber}
                                    />
                                </div>
                            )}
                            {activeDetailTab === 'AI_PLAN' && (
                                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                                    <AIPlanTab caseId={caseData.id} acquisitionType={caseData.acquisitionType} />
                                </div>
                            )}
                            {isDebtReviewCase && activeDetailTab === 'DEBT_REVIEW' && (
                                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                                    <DebtReviewTab
                                        caseId={caseData.id}
                                        canApprove={!!(session?.user?.isAdmin || session?.user?.isExecutive || (session?.user as any)?.isSeniorManager || (session?.user as any)?.role === 'MANAGER')}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div >
            </div >



            {/* Delete Confirmation Modal */}
            {
                showDeleteConfirm && (
                    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
                        <div className="bg-zeno-gray border border-red-500/30 rounded-xl p-6 max-w-md w-full mx-4">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center">
                                    <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-white">Delete Case</h3>
                                    <p className="text-gray-400 text-sm">This action cannot be undone</p>
                                </div>
                            </div>

                            <p className="text-gray-300 mb-6">
                                Are you sure you want to delete case <span className="font-bold text-white">{caseData.fileNumber}</span>?
                                This will permanently remove all associated data including:
                            </p>
                            <ul className="text-sm text-gray-400 mb-6 list-disc list-inside space-y-1">
                                <li>Client information</li>
                                <li>Status history</li>
                                <li>All documents</li>
                                <li>Activity logs & comments</li>
                                <li>Notification history</li>
                            </ul>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowDeleteConfirm(false)}
                                    disabled={deleting}
                                    className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 transition-colors disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleDelete}
                                    disabled={deleting}
                                    className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {deleting ? (
                                        <>
                                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                                            Deleting...
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                            Delete Case
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Modals */}
            {
                viewingProjectMembers && (
                    <ProjectMembersModal
                        project={viewingProjectMembers}
                        isOpen={!!viewingProjectMembers}
                        onClose={() => setViewingProjectMembers(null)}
                        onUpdate={refreshCaseData}
                        currentUserId={session?.user?.id}
                        isAdmin={isAdmin}
                    />
                )
            }

            <EditServicesModal
                isOpen={isEditServicesOpen}
                onClose={() => setIsEditServicesOpen(false)}
                currentServices={caseData?.services ? JSON.parse(caseData.services) : []}
                onSave={handleSaveServices}
            />

            <MoveCaseModal
                isOpen={isMoveModalOpen}
                onClose={() => setIsMoveModalOpen(false)}
                selectedCaseIds={caseData ? [caseData.id] : []}
                onSuccess={() => {
                    refreshCaseData();
                }}
            />

            {/* Send Quote / Invoice Modal */}
            {caseData && canCreateInvoice && (
                <SendQuoteModal
                    isOpen={isQuoteModalOpen}
                    onClose={() => setIsQuoteModalOpen(false)}
                    caseId={caseData.id}
                    clientId={caseData.client.id}
                    clientName={`${caseData.client.firstName} ${caseData.client.lastName}`.trim()}
                    clientEmail={caseData.client.email}
                    services={caseData.services}
                />
            )}

            {/* Send POA Modal */}
            {caseData && (
                <SendPoaModal
                    isOpen={isPoaModalOpen}
                    onClose={() => setIsPoaModalOpen(false)}
                    caseId={caseData.id}
                    clientName={`${caseData.client?.firstName ?? ''} ${caseData.client?.lastName ?? ''}`.trim()}
                    clientEmail={caseData.client?.email}
                    clientPhone={caseData.client?.whatsappNumber ?? caseData.client?.phone}
                    services={caseData.services}
                    dcName={caseData.debtCounsellorName}
                    dcNcrdcNo={caseData.ncrdcNo}
                />
            )}

            {/* Re-Analyze & Compare Modal */}
            {
                caseData && (
                    <CompareAnalysisModal
                        isOpen={showCompareModal}
                        onClose={() => setShowCompareModal(false)}
                        caseId={caseData.id}
                        caseData={caseData}
                        isFirstAnalysis={!hasAIAnalysis}
                        onUpdateComplete={() => {
                            refreshCaseData();
                            setActivityUpdate(prev => prev + 1);
                        }}
                    />
                )
            }


            {/* DC Pre-Send Confirmation Modal */}
            {dcConfirmPending && caseData && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
                    <div className="bg-[#0e1117] border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg mx-4">
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
                            <div className="flex items-center gap-2.5">
                                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30">
                                    <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="text-sm font-semibold text-white">Confirm Debt Counsellor Details</h3>
                                    <p className="text-[10px] text-gray-500 mt-0.5">
                                        {dcConfirmPending === 'FILE_REQUEST' ? 'File Request' : 'Invoice Request'} — verify before sending
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setDcConfirmPending(null)}
                                className="text-gray-600 hover:text-white transition-colors"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* DC Details grid */}
                        <div className="px-5 py-4 space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { label: 'NCR Registration No', value: caseData.ncrdcNo },
                                    { label: 'Full Name', value: caseData.debtCounsellorName },
                                    { label: 'Trading Name', value: caseData.dcTradingName },
                                    { label: 'Operating Status', value: caseData.dcOperatingStatus },
                                    { label: 'Mobile', value: caseData.dcMobile },
                                    { label: 'Email', value: caseData.dcEmail },
                                ].map(({ label, value }) => (
                                    <div key={label} className="bg-black/20 rounded-lg px-3 py-2">
                                        <p className="text-[9px] text-gray-600 font-semibold uppercase tracking-wider">{label}</p>
                                        <p className={`text-xs mt-0.5 ${value ? 'text-white' : 'text-gray-600 italic'}`}>
                                            {value ?? '—'}
                                        </p>
                                    </div>
                                ))}
                            </div>

                            {!caseData.ncrdcNo && (
                                <p className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-3 py-2">
                                    No NCRDC number on record. Verify this is the correct debt counsellor.
                                </p>
                            )}
                            {caseData.dcOperatingStatus && caseData.dcOperatingStatus !== 'Operating' && (
                                <p className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
                                    Status is &quot;{caseData.dcOperatingStatus}&quot; — confirm before sending.
                                </p>
                            )}

                            <p className="text-[10px] text-gray-500">
                                Email will be sent to: <span className="text-zeno-cyan font-mono">{caseData.dcEmail}</span>
                            </p>
                        </div>

                        {/* Actions */}
                        <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-800">
                            <button
                                onClick={() => setDcConfirmPending(null)}
                                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDCNotification}
                                className="px-5 py-2 bg-indigo-600/20 border border-indigo-600/40 text-indigo-300 rounded text-sm font-semibold hover:bg-indigo-600/30 transition-all flex items-center gap-2"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                                Confirm &amp; Send
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div >
    );
}

function CaseAssignmentsModal({ isOpen, onClose, currentAssignments, projectMembers, onSave }: {
    isOpen: boolean;
    onClose: () => void;
    currentAssignments: string[];
    projectMembers: Array<{ id: string; firstName: string; lastName: string; email: string }>;
    onSave: (userIds: string[]) => void;
}) {
    const [selected, setSelected] = useState<Set<string>>(new Set(currentAssignments));

    useEffect(() => {
        setSelected(new Set(currentAssignments));
    }, [currentAssignments, isOpen]);

    if (!isOpen) return null;

    const toggleUser = (userId: string) => {
        const next = new Set(selected);
        if (next.has(userId)) next.delete(userId);
        else next.add(userId);
        setSelected(next);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-zeno-navy border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
                    <h2 className="text-xl font-bold text-white">Manage Case Team</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                <div className="p-6 max-h-[60vh] overflow-y-auto space-y-2">
                    <div className="bg-zeno-cyan/5 border border-zeno-cyan/10 rounded-xl p-4 mb-4">
                        <p className="text-xs text-zeno-cyan font-medium leading-relaxed">
                            Select users from the project team to assign to this specific case. Assigned users will see this case under "My Cases" and receive specialized notifications.
                        </p>
                    </div>
                    {projectMembers.length === 0 ? (
                        <div className="text-center py-8">
                            <p className="text-sm text-gray-500 italic">No members found in linked projects.</p>
                        </div>
                    ) : (
                        projectMembers.map((member) => (
                            <label key={member.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer group ${selected.has(member.id) ? 'bg-zeno-cyan/10 border-zeno-cyan/50 shadow-sm shadow-zeno-cyan/5' : 'bg-white/5 border-white/5 hover:border-white/20'}`}>
                                <input
                                    type="checkbox"
                                    checked={selected.has(member.id)}
                                    onChange={() => toggleUser(member.id)}
                                    className="w-5 h-5 rounded border-white/10 bg-zeno-blue text-zeno-cyan focus:ring-zeno-cyan/50"
                                />
                                <div className="flex-1 min-w-0">
                                    <p className={`text-sm font-bold truncate ${selected.has(member.id) ? 'text-zeno-cyan' : 'text-white'}`}>{member.firstName} {member.lastName}</p>
                                    <p className="text-[10px] text-gray-500 truncate lowercase">{member.email}</p>
                                </div>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold ${selected.has(member.id) ? 'bg-zeno-cyan text-zeno-navy' : 'bg-white/5 text-gray-500'}`}>
                                    {member.firstName[0]}{member.lastName[0]}
                                </div>
                            </label>
                        ))
                    )}
                </div>
                <div className="p-6 bg-white/5 border-t border-white/5 flex gap-3">
                    <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-transparent border border-white/10 text-white rounded-xl hover:bg-white/5 transition-all text-sm font-bold uppercase tracking-wider">Cancel</button>
                    <button onClick={() => onSave(Array.from(selected))} className="flex-1 px-4 py-2.5 bg-zeno-cyan text-zeno-navy rounded-xl hover:bg-cyan-400 font-bold text-sm uppercase tracking-wider shadow-lg shadow-zeno-cyan/20">Save Changes</button>
                </div>
            </div>
        </div>
    );
}
