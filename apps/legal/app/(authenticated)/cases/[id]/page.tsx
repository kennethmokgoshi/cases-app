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
import { WorkflowTimeline } from '@zenowethu/ui';
import { ProjectMembersModal } from '@zenowethu/ui';
import { MoveCaseModal } from '@zenowethu/ui';
import { EditServicesModal } from '@zenowethu/ui';
import { CompareAnalysisModal } from '@zenowethu/ui';
import { RichTextEditor } from '@zenowethu/ui';

const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
};

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
    // DHS Information
    ncrdcNo: string | null;
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
            fullPath?: string; // Full hierarchical path: "Letsatsi Alberton 1 December 2025"
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
    employer: string;
    grossSalary: string;
    netSalary: string;
};

export default function CaseDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { data: session } = useSession();
    const isAdmin = session?.user?.isAdmin === true;

    const [caseData, setCaseData] = useState<CaseDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(false);
    const [notifications, setNotifications] = useState<NotificationEntry[]>([]);
    const [sendingNotification, setSendingNotification] = useState(false);
    const [sendingDCNotification, setSendingDCNotification] = useState<'FILE' | 'INVOICE' | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    // DHS automation states
    const [dhsLoading, setDhsLoading] = useState(false);
    const [dhsMessage, setDhsMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
    const [isEditingDhs, setIsEditingDhs] = useState(false);
    const [isEditingCreditInfo, setIsEditingCreditInfo] = useState(false);
    const [editForm, setEditForm] = useState<EditFormData>({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
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
        employer: '',
        grossSalary: '',
        netSalary: ''
    });

    const [mounted, setMounted] = useState(false);
    const [requestingTransfer, setRequestingTransfer] = useState(false);
    const [transferStatus, setTransferStatus] = useState('');

    const [viewingProjectMembers, setViewingProjectMembers] = useState<{ id: string; name: string; members?: any[] } | null>(null);
    // Modals
    const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
    const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
    const [isEditServicesOpen, setIsEditServicesOpen] = useState(false);
    const [showCompareModal, setShowCompareModal] = useState(false);
    const [activeDetailTab, setActiveDetailTab] = useState<'ACTIVITY' | 'DOCUMENTS' | 'COMMUNICATION' | 'TIMELINE'>('ACTIVITY');

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
            if (!response.ok) throw new Error('Failed to fetch case');
            const data = await response.json();
            setCaseData(data);
        } catch (error) {
            logger.error('Error fetching case:', error);
        } finally {
            setLoading(false);
        }
    }, [params.id]);

    useEffect(() => {
        fetchCase();
    }, [fetchCase]);

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
            logger.error('Error updating services:', error);
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
                logger.error('Failed to fetch notifications', error);
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
            logger.error('Failed to refresh case', error);
        }
    };

    const handleStatusChange = async (newStatus: string) => {
        if (!caseData) return;

        setUpdating(true);
        try {
            const res = await fetch(`/api/cases/${params.id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newStatus }) });

            if (!res.ok) throw new Error('Failed to update status');

            const updatedCase = await res.json();
            setCaseData(updatedCase);
        } catch (error) {
            logger.error('Failed to update status', error);
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
                body: JSON.stringify({ description: description }) });

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
            logger.error('Error saving description:', error);
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
                body: JSON.stringify({ statusCode: caseData.status }) });

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
            logger.error('Failed to send notification', error);
            alert('Failed to send notification. Please try again.');
        } finally {
            setSendingNotification(false);
        }
    };

    const handleDCNotification = async (type: 'FILE_REQUEST' | 'INVOICE_REQUEST') => {
        if (!caseData || !caseData.dcEmail) return;

        setSendingDCNotification(type === 'FILE_REQUEST' ? 'FILE' : 'INVOICE');
        try {
            const res = await fetch(`/api/cases/${params.id}/dc-notification`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type }) });

            const result = await res.json();

            if (res.ok) {
                alert(result.message || 'Notification sent successfully!');
                // Trigger activity refresh
                setActivityUpdate(prev => prev + 1);
            } else {
                alert(`Failed: ${result.error || 'Unknown error'}`);
            }
        } catch (error) {
            logger.error('Failed to send DC notification', error);
            alert('Connection failed. Please try again.');
        } finally {
            setSendingDCNotification(null);
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
            employer: caseData.client.employer || '',
            grossSalary: caseData.client.grossSalary?.toString() || '',
            netSalary: caseData.client.netSalary?.toString() || ''
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
            declineReasonAttended: caseData.declineReasonAttended || false }));
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
                    declineReasonAttended: editForm.declineReasonAttended }) });

            if (!res.ok) throw new Error('Failed to save DHS changes');

            const updatedCase = await res.json();
            setCaseData(updatedCase);
            setIsEditingDhs(false);
            setDhsMessage({ type: 'success', text: 'DHS Information updated' });
        } catch (error) {
            logger.error('Failed to save DHS changes', error);
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
                }) });
            const result = await res.json();

            if (result.success) {
                setDhsMessage({ type: 'success', text: result.message || 'Transfer Requested successfully!' });

                // Refresh case data
                const caseRes = await fetch(`/api/cases/${params.id}`);
                const updatedCase = await caseRes.json();
                setCaseData(updatedCase);
            } else {
                setDhsMessage({ type: 'error', text: result.message || 'Failed to request transfer' });
            }
        } catch (error) {
            logger.error('Transfer request error:', error);
            setDhsMessage({ type: 'error', text: 'Connection failed' });
        } finally {
            setRequestingTransfer(false);
            setTransferStatus('');
        }
    };

    const handleAutoFillDhs = async () => {
        if (!caseData?.client.idNumber) {
            setDhsMessage({ type: 'error', text: 'Client ID number is required' });
            return;
        }
        setDhsLoading(true);
        setDhsMessage({ type: 'info', text: 'Scraping DHS details... This may take a minute.' });

        try {
            const res = await fetch('/api/dhs/lookup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    idNumber: caseData.client.idNumber,
                    caseId: caseData.id,
                    action: 'auto_fill'
                }) });
            const result = await res.json();

            if (result.success) {
                // Refresh case data
                const caseRes = await fetch(`/api/cases/${params.id}`);
                const updatedCase = await caseRes.json();
                setCaseData(updatedCase);

                // Update Edit Form for immediate visual feedback if user decides to edit further
                setEditForm(prev => ({
                    ...prev,
                    ncrdcNo: result.data.ncrdcNo || prev.ncrdcNo,
                    // dhsStatus: result.data.status || prev.dhsStatus, // REMOVED: Do not overwrite Request Status with Consumer Status
                    debtCounsellorName: result.data.debtCounsellorName || prev.debtCounsellorName,
                    dcTradingName: result.data.dcTradingName || prev.dcTradingName,
                    dcEmail: result.data.dcEmail || prev.dcEmail,
                    dcOperatingStatus: result.data.dcOperatingStatus || prev.dcOperatingStatus,
                    dcMobile: result.data.dcMobile || prev.dcMobile,
                    consumerDhsStatus: result.data.status || prev.consumerDhsStatus,
                    dhsPreviousStatus: result.data.status || prev.dhsPreviousStatus, // Map scraped Status to Previous Status for history? Or just keep what we have. API updates usage.
                    // Note: result.data includes 'status'.
                }));

                setDhsMessage({ type: 'success', text: 'DHS Information Auto-filled successfully!' });
                setIsEditingDhs(true); // Open edit mode to show populated fields
            } else {
                setDhsMessage({ type: 'error', text: result.message || 'Failed to auto-fill DHS info' });
            }
        } catch (error) {
            logger.error('Auto-fill error:', error);
            setDhsMessage({ type: 'error', text: 'Failed to connect to DHS service' });
        } finally {
            setDhsLoading(false);
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
            cb_statusDate: caseData.cb_statusDate ? new Date(caseData.cb_statusDate).toISOString().split('T')[0] : '' }));
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
                cb_statusDate: editForm.cb_statusDate ? new Date(editForm.cb_statusDate).toISOString() : null };

            const res = await fetch(`/api/cases/${params.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload) });

            if (!res.ok) throw new Error('Failed to save credit info');

            const updatedCase = await res.json();
            setCaseData(prev => prev ? { ...prev, ...updatedCase } : null);
            setIsEditingCreditInfo(false);
        } catch (error) {
            logger.error('Failed to save credit info', error);
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
                body: JSON.stringify({ todos: JSON.stringify(newTasks) }) });

            if (res.ok) {
                const updatedCase = await res.json();
                setCaseData(prev => prev ? { ...prev, todos: updatedCase.todos } : null);
                // Trigger activity tab refresh
                setActivityUpdate(prev => prev + 1);
            }
        } catch (error) {
            logger.error('Failed to save tasks', error);
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
                }) });
        } catch (error) {
            logger.error('Failed to save decline reason', error);
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
                        whatsappNumber: editForm.whatsappNumber || null,
                        telegramNumber: editForm.telegramNumber || null,
                        address: editForm.address || null },
                    serviceFee: editForm.serviceFee || null,
                    partnerName: editForm.partnerName || null,
                    partnerBranch: editForm.partnerBranch || null,
                    partnerSplitPercent: editForm.partnerSplitPercent ? parseInt(editForm.partnerSplitPercent) : 0,
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
                    cb_statusDate: editForm.cb_statusDate || null }) });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || 'Failed to save changes');
            }

            const updatedCase = await res.json();
            setCaseData(updatedCase);
            setIsEditing(false);
            alert('Changes saved successfully!');
        } catch (error) {
            logger.error('Failed to save changes', error);
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
                method: 'DELETE' });

            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || 'Failed to delete case');
            }

            // Redirect to cases list after successful deletion
            router.push('/cases');
        } catch (error) {
            logger.error('Failed to delete case', error);
            alert(error instanceof Error ? error.message : 'Failed to delete case. Please try again.');
            setShowDeleteConfirm(false);
        } finally {
            setDeleting(false);
        }
    };

    // DHS Lookup - Check transfer status
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
                    action: 'check_status'
                }) });
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
                setDhsMessage({ type: 'error', text: result.error || 'DHS lookup failed' });
            }
        } catch (error) {
            setDhsMessage({ type: 'error', text: 'Failed to connect to DHS' });
        } finally {
            setDhsLoading(false);
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
                    idNumber: caseData.client.idNumber }) });
            const result = await res.json();
            logger.info('DHS transfer result:', result);
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
            logger.error('DHS transfer error:', error);
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
                                className="px-3 py-1.5 bg-purple-500/10 border border-purple-500/20 text-purple-400 rounded hover:bg-purple-500/20 text-sm flex items-center gap-2 transition-colors"
                                title="Re-Analyze & Compare"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                                Re-Analyze
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
                                        placeholder="Letsatsi Finance"
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
                                    <label className="text-xs text-gray-500 uppercase">Service Fee</label>
                                    <p className="text-[10px] text-gray-500 mt-0.5 mb-1">Total fee charged</p>
                                    <input
                                        type="text"
                                        value={editForm.serviceFee}
                                        onChange={(e) => setEditForm({ ...editForm, serviceFee: e.target.value })}
                                        className="w-full px-3 py-2 bg-zeno-navy border border-white/10 rounded-lg text-white focus:border-zeno-cyan focus:outline-none"
                                        placeholder="R 2,500.00"
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
                                {caseData.acquisitionType === 'B2B' && (
                                    <div>
                                        <span className="text-xs text-gray-500 uppercase">Fee Split</span>
                                        <p className="text-[10px] text-gray-500 mt-0.5 mb-1">Revenue Share</p>
                                        <p className="text-white">{caseData.partnerSplitPercent}-{100 - caseData.partnerSplitPercent} (Partner-Zenowethu)</p>
                                    </div>
                                )}
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
                                <label className="text-xs text-gray-500 uppercase">Client Type</label>
                                <p className="text-white">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${caseData.client.type === 'Payroll' ? 'bg-green-500/20 text-green-300' : 'bg-blue-500/20 text-blue-300'
                                        }`}>
                                        {caseData.client.type}
                                    </span>
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Projects */}
                    <div className="bg-zeno-blue/20 rounded-xl border border-white/5 p-6">
                        <h3 className="text-lg font-semibold text-white mb-4">Linked Projects</h3>
                        <div className="space-y-2">
                            {primaryProject && (
                                <div className="p-3 bg-zeno-cyan/10 border border-zeno-cyan/30 rounded-lg">
                                    <span className="text-xs text-zeno-cyan font-semibold uppercase">Primary</span>
                                    <div className="mt-1">
                                        <Link
                                            href={`/cases?projectId=${primaryProject.project.id}`}
                                            className="text-white font-medium hover:text-zeno-cyan hover:underline transition-colors inline-flex items-center gap-2 group"
                                            title="View all cases for this project"
                                        >
                                            {(primaryProject.project.fullPath || primaryProject.project.name).replace(/Referrals/i, '').trim()}
                                            <svg className="w-3.5 h-3.5 text-gray-500 group-hover:text-zeno-cyan transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                            </svg>
                                        </Link>
                                    </div>
                                    <div className="mt-3 pt-2 border-t border-zeno-cyan/20">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <div className="flex items-center gap-1">
                                                <span className="text-xs text-zeno-cyan/70 font-medium">Team Members</span>
                                            </div>
                                            <button
                                                onClick={() => setViewingProjectMembers(primaryProject.project)}
                                                className="text-[10px] text-zeno-cyan hover:underline uppercase font-bold tracking-wider"
                                            >
                                                Manage
                                            </button>
                                        </div>
                                        <div className="mb-3">
                                            <button
                                                onClick={() => setIsMoveModalOpen(true)}
                                                className="w-full py-1.5 bg-zeno-cyan/10 border border-zeno-cyan/30 rounded text-xs text-zeno-cyan hover:bg-zeno-cyan/20 transition-colors flex items-center justify-center gap-1.5"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                                                Move to Different Project
                                            </button>
                                        </div>
                                        {primaryProject.project.members && primaryProject.project.members.length > 0 ? (
                                            <div className="space-y-1">
                                                {primaryProject.project.members.map((member) => (
                                                    <div key={member.userId} className="flex items-center gap-2">
                                                        <div
                                                            className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${member.role === 'MANAGER' ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30' : 'bg-zeno-cyan/20 text-zeno-cyan ring-1 ring-zeno-cyan/30'}`}
                                                            title={member.role}
                                                        >
                                                            {member.user.firstName[0]}{member.user.lastName[0]}
                                                        </div>
                                                        <span className="text-xs text-gray-300">
                                                            {member.user.firstName} {member.user.lastName}
                                                        </span>
                                                        {member.role === 'MANAGER' && <span className="text-[9px] text-amber-400 bg-amber-500/10 px-1 rounded border border-amber-500/20">Mgr</span>}
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-xs text-gray-500 italic">No members assigned</div>
                                        )}
                                    </div>
                                </div>
                            )}
                            {secondaryProjects.map((sp, i) => (
                                <div key={i} className="p-3 bg-white/5 border border-white/10 rounded-lg">
                                    <span className="text-xs text-gray-500 uppercase">Secondary</span>
                                    <p className="text-white mt-1">
                                        {(sp.project.fullPath || sp.project.name).replace(/Referrals/i, '').trim()}
                                    </p>
                                    <div className="mt-3 pt-2 border-t border-white/10">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <div className="flex items-center gap-1">
                                                <span className="text-xs text-gray-500 font-medium">Team Members</span>
                                            </div>
                                            <button
                                                onClick={() => setViewingProjectMembers(sp.project)}
                                                className="text-[10px] text-gray-500 hover:text-white hover:underline uppercase font-bold tracking-wider"
                                            >
                                                Manage
                                            </button>
                                        </div>
                                        {sp.project.members && sp.project.members.length > 0 ? (
                                            <div className="space-y-1">
                                                {sp.project.members.map((member) => (
                                                    <div key={member.userId} className="flex items-center gap-2">
                                                        <div
                                                            className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${member.role === 'MANAGER' ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30' : 'bg-gray-500/20 text-gray-300 ring-1 ring-gray-500/30'}`}
                                                            title={member.role}
                                                        >
                                                            {member.user.firstName[0]}{member.user.lastName[0]}
                                                        </div>
                                                        <span className="text-xs text-gray-400">
                                                            {member.user.firstName} {member.user.lastName}
                                                        </span>
                                                        {member.role === 'MANAGER' && <span className="text-[9px] text-amber-500/70 bg-amber-500/5 px-1 rounded border border-amber-500/10">Mgr</span>}
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-xs text-gray-500 italic">No members assigned</div>
                                        )}
                                    </div>
                                </div>
                            ))}
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

                    {/* DHS Information - Only show for Debt Review related services */}
                    {(() => {
                        let showDhsSection = false;
                        try {
                            const services = caseData.services ? JSON.parse(caseData.services) : [];
                            const dhsRelatedServices = ['debt_review_flag_removal', 'debt_review_application'];
                            showDhsSection = services.some((s: string) => dhsRelatedServices.includes(s));
                        } catch (e) {
                            logger.error('Error parsing services for DHS check', e);
                        }

                        if (!showDhsSection) return null;

                        return (
                            <div className="bg-zeno-blue/20 rounded-xl border border-white/5 p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-lg font-semibold text-white">🏛️ DHS Information</h3>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleAutoFillDhs}
                                            className="px-3 py-1 bg-indigo-600 border border-indigo-500/50 text-white rounded hover:bg-indigo-700 transition-colors text-sm flex items-center gap-2"
                                            title="Populate fields from Credit Report"
                                        >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                            Auto-fill
                                        </button>
                                        {!isEditing && (
                                            isEditingDhs ? (
                                                <>
                                                    <button onClick={cancelEditingDhs} className="text-gray-400 hover:text-white text-sm">Cancel</button>
                                                    <button onClick={saveDhsChanges} className="text-green-400 hover:text-green-300 text-sm font-medium">Save</button>
                                                </>
                                            ) : (
                                                <button onClick={startEditingDhs} className="text-gray-400 hover:text-white p-1 rounded hover:bg-white/5 transition-colors" title="Edit DHS Info">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                                </button>
                                            )
                                        )}
                                    </div>
                                </div>

                                {caseData.dcEmail && (
                                    <div className="mb-4 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-[10px] text-indigo-400 font-bold uppercase">Debt Counsellor Actions</span>
                                            <span className="text-[10px] text-gray-500 italic">{caseData.dcEmail}</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                onClick={() => handleDCNotification('FILE_REQUEST')}
                                                disabled={sendingDCNotification !== null}
                                                className="py-1.5 px-3 bg-indigo-600/20 border border-indigo-600/40 text-indigo-300 rounded text-xs font-semibold hover:bg-indigo-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                            >
                                                {sendingDCNotification === 'FILE' ? (
                                                    <span className="animate-spin h-3 w-3 border-2 border-indigo-300 border-t-transparent rounded-full"></span>
                                                ) : (
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                                )}
                                                Request File
                                            </button>
                                            <button
                                                onClick={() => handleDCNotification('INVOICE_REQUEST')}
                                                disabled={sendingDCNotification !== null}
                                                className="py-1.5 px-3 bg-indigo-600/20 border border-indigo-600/40 text-indigo-300 rounded text-xs font-semibold hover:bg-indigo-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                            >
                                                {sendingDCNotification === 'INVOICE' ? (
                                                    <span className="animate-spin h-3 w-3 border-2 border-indigo-300 border-t-transparent rounded-full"></span>
                                                ) : (
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                                )}
                                                Request Invoice
                                            </button>
                                        </div>
                                    </div>
                                )}

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
                                                <label className="block text-xs text-gray-400 mb-1">STATUS</label>
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
                                                <div className="text-xs text-gray-400 mb-1">DC EMAIL</div>
                                                <div className="text-sm text-white font-medium">{caseData.dcEmail || 'Not set'}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-gray-400 mb-1">DC LAST USED EMAIL</div>
                                                <div className="text-sm text-white font-medium">{caseData.lastKnownEmail || 'Not set'}</div>
                                            </div>
                                        </div>

                                        {/* DHS Action Buttons */}
                                        <div className="pt-3 mt-3 border-t border-white/10">
                                            <div className="flex gap-2 flex-wrap">
                                                <button
                                                    onClick={handleDHSLookup}
                                                    disabled={dhsLoading}
                                                    className="px-3 py-2 bg-zeno-navy border border-white/10 text-white rounded-lg hover:bg-zeno-navy/80 transition-colors text-sm flex items-center gap-2 disabled:opacity-50"
                                                >
                                                    {dhsLoading ? (
                                                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                        </svg>
                                                    ) : (
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                                        </svg>
                                                    )}
                                                    Check DHS Status
                                                </button>
                                                {(() => {
                                                    const normalizeStatus = (s: string | null) => s?.toUpperCase().replace(' ', '_');
                                                    const currentDhsStatus = normalizeStatus(caseData.dhsStatus);
                                                    const showRequestButton = !currentDhsStatus ||
                                                        currentDhsStatus === 'NOT_REQUESTED' ||
                                                        currentDhsStatus === 'DECLINED' ||
                                                        currentDhsStatus === 'PENDING';

                                                    if (!showRequestButton) return null;

                                                    return (
                                                        <button
                                                            onClick={handleRequestTransfer}
                                                            disabled={requestingTransfer || dhsLoading}
                                                            className={`px-3 py-2 text-sm flex items-center gap-2 rounded-lg transition-colors disabled:opacity-50 ${requestingTransfer
                                                                ? 'bg-green-600/50 text-white cursor-wait'
                                                                : 'bg-green-600 border border-green-500/50 text-white hover:bg-green-700'}`}
                                                        >
                                                            {requestingTransfer ? (
                                                                <>
                                                                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                                                    {transferStatus || 'Requesting...'}
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                                                    </svg>
                                                                    {caseData.dhsStatus === 'PENDING' ? 'Retry Transfer' : 'Request Transfer'}
                                                                </>
                                                            )}
                                                        </button>
                                                    )
                                                })()}
                                            </div>
                                            {dhsMessage && (
                                                <div className={`mt-3 p-2 rounded text-sm ${dhsMessage.type === 'success' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                                                    dhsMessage.type === 'error' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                                                        'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                                    }`}>
                                                    {dhsMessage.text}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}


                                {/* Decline Reason (Triggered by DHS Decline) */}
                                {(() => {
                                    const isDeclined = ['DECLINED', 'CANCELLED', 'REJECTED'].includes(caseData?.status || '') ||
                                        caseData?.dhsStatus?.toUpperCase().includes('DECLINED') ||
                                        caseData?.consumerDhsStatus?.toUpperCase().includes('DECLINED');

                                    const hasReason = !!caseData.declineReason;
                                    const showInput = isEditingDhs || isAddingDeclineReason || hasReason;

                                    if (!isDeclined && !hasReason && !isEditingDhs) return null;

                                    return (
                                        <div className="mt-4 pt-4 border-t border-white/10">
                                            <div className="flex items-center justify-between mb-2">
                                                <h4 className="text-sm font-semibold text-red-400">Decline Reason</h4>

                                                {!showInput && (
                                                    <button
                                                        onClick={() => {
                                                            setIsAddingDeclineReason(true);
                                                            // Auto-enable edit mode if not already
                                                            if (!isEditingDhs) handleAutoFillDhs(); // Or startEditingDhs
                                                            setIsEditingDhs(true);
                                                        }}
                                                        className="text-xs text-white bg-red-500/20 border border-red-500/50 px-2 py-1 rounded hover:bg-red-500/30 transition-colors"
                                                    >
                                                        + Add Decline Reason
                                                    </button>
                                                )}

                                                {(showInput || isEditingDhs) && (
                                                    <div className="flex items-center gap-2">
                                                        {isEditingDhs ? (
                                                            <label className="text-xs text-gray-400 cursor-pointer select-none flex items-center">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={editForm.declineReasonAttended}
                                                                    onChange={(e) => setEditForm(prev => ({ ...prev, declineReasonAttended: e.target.checked }))}
                                                                    className="mr-2 rounded border-gray-600 bg-zeno-navy text-zeno-cyan focus:ring-zeno-cyan w-3 h-3"
                                                                />
                                                                Attended To
                                                            </label>
                                                        ) : (
                                                            <div className="flex items-center gap-2">
                                                                {caseData.declineReasonAttended && (
                                                                    <span className="text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded border border-green-400/20">
                                                                        Attended To
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            {showInput && (
                                                isEditingDhs ? (
                                                    <textarea
                                                        value={editForm.declineReason}
                                                        onChange={(e) => setEditForm(prev => ({ ...prev, declineReason: e.target.value }))}
                                                        placeholder="Enter reason for decline..."
                                                        className="w-full h-20 bg-black/50 border border-white/10 rounded-lg p-3 text-sm text-white focus:border-red-500/50 focus:outline-none resize-none placeholder-gray-600"
                                                    />
                                                ) : (
                                                    <div className="text-sm text-white bg-black/30 p-3 rounded border border-white/10 min-h-[3rem]">
                                                        {caseData.declineReason || <span className="text-gray-500 italic">No reason provided</span>}
                                                    </div>
                                                )
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                        );
                    })()}

                </div>
            </div>



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
            </div>

            {/* Enhanced Case Utilities - Tabbed Interface */}
            <div className="mt-12 bg-zeno-blue/10 rounded-2xl border border-white/5 overflow-hidden shadow-2xl">
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
                        onClick={() => setActiveDetailTab('TIMELINE')}
                        className={`flex-1 px-6 py-4 text-sm font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-2 ${activeDetailTab === 'TIMELINE'
                            ? 'text-zeno-cyan border-b-2 border-zeno-cyan bg-zeno-cyan/5'
                            : 'text-gray-500 hover:text-white hover:bg-white/5'
                            }`}
                    >
                        <span>🔄</span> Status Timeline
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
                    {activeDetailTab === 'TIMELINE' && (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <WorkflowTimeline workflowLogs={caseData.workflowLogs} />
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
                </div>
            </div>



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

            {/* Re-Analyze & Compare Modal */}
            {caseData && (
                <CompareAnalysisModal
                    isOpen={showCompareModal}
                    onClose={() => setShowCompareModal(false)}
                    caseId={caseData.id}
                    caseData={caseData}
                    onUpdateComplete={() => {
                        refreshCaseData();
                        setActivityUpdate(prev => prev + 1);
                    }}
                />
            )}
        </div >
    );
}

