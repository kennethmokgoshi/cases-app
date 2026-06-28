/**
 * Zenowethu Workflow Status System
 * Organized from 80 statuses into logical categories
 * Time-based statuses are consolidated with a daysInStatus field
 */

export type StatusCategory =
    | 'BEGINNING'
    | 'OVERDUE'
    | 'IN_PROGRESS'
    | 'DETOUR'
    | 'ADVANCED'
    | 'ADVANCED_DETOUR'
    | 'ADVANCED_PROGRESS'
    | 'COMPLETED'
    | 'PAYING'
    | 'SETTLED'
    | 'LOST';

export type WorkflowStatus = {
    code: string;
    name: string;
    category: StatusCategory;
    description: string;
    slaEnabled: boolean;     // Auto-calculate deadline?
    slaDays?: number;        // Business days for SLA
    isOverdueState: boolean; // Is this the "Overdue" status?
    allowedNextStates?: string[]; // Optional: restrict transitions
};

export const WORKFLOW_STATUSES: WorkflowStatus[] = [
    // 1. BEGINNING
    {
        code: 'NEW_LEAD',
        name: 'New Lead',
        category: 'BEGINNING',
        description: 'Newly captured client or prospect',
        slaEnabled: true,
        slaDays: 2,
        isOverdueState: false },
    {
        code: 'XDS_LEAD',
        name: 'XDS Lead',
        category: 'BEGINNING',
        description: 'Lead automatically created from XDS credit bureau history',
        slaEnabled: true,
        slaDays: 2,
        isOverdueState: false },
    {
        code: 'NEW_ENQUIRY',
        name: 'New Enquiry',
        category: 'BEGINNING',
        description: 'Client just enquired about services',
        slaEnabled: true,
        slaDays: 1,
        isOverdueState: false },
    {
        code: 'PENDING_REVIEW',
        name: 'Pending Review',
        category: 'BEGINNING',
        description: 'Lead awaiting initial review by staff',
        slaEnabled: true,
        slaDays: 1,
        isOverdueState: false },
    {
        code: 'OUTSTANDING_DOCS',
        name: 'Outstanding Documents',
        category: 'BEGINNING',
        description: 'Missing required documents',
        slaEnabled: true,
        slaDays: 5,
        isOverdueState: false },
    {
        code: 'NOT_LINKED',
        name: 'Not Linked on DHS',
        category: 'BEGINNING',
        description: 'ID number was not found on the NCR Debt Help System',
        slaEnabled: true,
        slaDays: 1,
        isOverdueState: false },
    {
        code: 'NOT_REQUESTED_VIA_DHS',
        name: 'Not Requested via DHS',
        category: 'BEGINNING',
        description: 'ID linked on DHS but no transfer request submitted yet',
        slaEnabled: true,
        slaDays: 3,
        isOverdueState: false },

    // 2. OVERDUE
    {
        code: 'OVERDUE',
        name: 'Overdue',
        category: 'OVERDUE',
        description: 'CRITICAL: Deadline passed, requires immediate attention',
        slaEnabled: false,
        isOverdueState: true },

    // 3. IN PROGRESS
    {
        code: 'REQUESTED_VIA_DHS',
        name: 'Requested via DHS',
        category: 'IN_PROGRESS',
        description: 'Transfer requested through Debt Help System',
        slaEnabled: true,
        slaDays: 7,
        isOverdueState: false },
    {
        code: 'DOCUMENTS_EMAILED',
        name: 'Documents Emailed',
        category: 'IN_PROGRESS',
        description: 'Required documents sent after DHS rejection',
        slaEnabled: true,
        slaDays: 5,
        isOverdueState: false },
    {
        code: 'CONSUMER_CONTACTED_DC',
        name: 'Consumer Contacted DC',
        category: 'IN_PROGRESS',
        description: 'Consumer contacted debt counsellor about transfer',
        slaEnabled: true,
        slaDays: 3,
        isOverdueState: false },
    {
        code: 'INVOICE_REQUESTED_DC',
        name: 'Invoice Requested from DC',
        category: 'IN_PROGRESS',
        description: 'Requested invoice from debt counsellor for owed fees',
        slaEnabled: true,
        slaDays: 5,
        isOverdueState: false },
    {
        code: 'INVOICE_SENT_CONSUMER',
        name: 'Invoice sent to Consumer',
        category: 'IN_PROGRESS',
        description: 'Invoice forwarded to consumer for payment',
        slaEnabled: true,
        slaDays: 7,
        isOverdueState: false },
    {
        code: 'DISPUTED',
        name: 'Disputed',
        category: 'IN_PROGRESS',
        description: 'Dispute submitted to credit bureaus',
        slaEnabled: true,
        slaDays: 20,
        isOverdueState: false },
    {
        code: 'IN_PROGRESS',
        name: 'In Progress',
        category: 'IN_PROGRESS',
        description: 'Generic in-progress state',
        slaEnabled: false,
        isOverdueState: false },

    // 4. DETOUR STAGE
    {
        code: 'REJECTED_EMAIL_DOCS',
        name: 'Rejected-Email Documents',
        category: 'DETOUR',
        description: 'DHS rejected - need to email signed consent & ID',
        slaEnabled: true,
        slaDays: 3,
        isOverdueState: false },
    {
        code: 'REJECTED_NOT_CONSENT',
        name: 'Rejected - Not yet Consent',
        category: 'DETOUR',
        description: 'DHS rejected - consumer not consenting',
        slaEnabled: true,
        slaDays: 7,
        isOverdueState: false },
    {
        code: 'REJECTED_OWES_FEES',
        name: 'Rejected - Owes Fees',
        category: 'DETOUR',
        description: 'DHS rejected - consumer owes fees to previous DC',
        slaEnabled: true,
        slaDays: 2,
        isOverdueState: false },
    {
        code: 'DEBT_BUSTERS_REJECTED',
        name: 'Debt-Busters Rejected',
        category: 'DETOUR',
        description: 'File rejected by Debt-Busters via DHS',
        slaEnabled: true,
        slaDays: 3,
        isOverdueState: false },
    {
        code: 'OCTOGEN_REJECTED',
        name: 'Octogen Rejected',
        category: 'DETOUR',
        description: 'File rejected by Octogen via DHS',
        slaEnabled: true,
        slaDays: 3,
        isOverdueState: false },
    { code: 'IRFDC_1M', name: '1 Mnth IRfDC', category: 'DETOUR', description: 'Invoice Requested from DC - 1 Month', slaEnabled: false, isOverdueState: false },
    { code: 'IRFDC_2M', name: '2 Mnth IRfDC', category: 'DETOUR', description: 'Invoice Requested from DC - 2 Months', slaEnabled: false, isOverdueState: false },
    { code: 'IRFDC_3M', name: '3 Mnth IRfDC', category: 'DETOUR', description: 'Invoice Requested from DC - 3 Months', slaEnabled: false, isOverdueState: false },
    { code: 'IRFDC_4M_PLUS', name: '4+ Mnth IRfDC', category: 'DETOUR', description: 'Invoice Requested from DC - 4+ Months', slaEnabled: false, isOverdueState: false },
    { code: 'RNYC_1M', name: '1 Mnth RNyC', category: 'DETOUR', description: 'Rejected Not yet Consent - 1 Month', slaEnabled: false, isOverdueState: false },
    { code: 'RNYC_2M', name: '2 Mnth RNyC', category: 'DETOUR', description: 'Rejected Not yet Consent - 2 Months', slaEnabled: false, isOverdueState: false },
    { code: 'RNYC_3M', name: '3 Mnth RNyC', category: 'DETOUR', description: 'Rejected Not yet Consent - 3 Months', slaEnabled: false, isOverdueState: false },
    { code: 'RNYC_4M_PLUS', name: '4+ Mnth RNyC', category: 'DETOUR', description: 'Rejected Not yet Consent - 4+ Months', slaEnabled: false, isOverdueState: false },
    { code: 'INVSNT_1M', name: '1 Mnth InvSnT', category: 'DETOUR', description: 'Invoice sent to Consumer - 1 Month', slaEnabled: false, isOverdueState: false },
    { code: 'INVSNT_2M', name: '2 Mnth InvSnT', category: 'DETOUR', description: 'Invoice sent to Consumer - 2 Months', slaEnabled: false, isOverdueState: false },
    { code: 'INVSNT_3M', name: '3 Mnth InvSnT', category: 'DETOUR', description: 'Invoice sent to Consumer - 3 Months', slaEnabled: false, isOverdueState: false },
    { code: 'INVSNT_4M_PLUS', name: '4+ Mnth InvSnT', category: 'DETOUR', description: 'Invoice sent to Consumer - 4+ Months', slaEnabled: false, isOverdueState: false },
    {
        code: 'FEES_TOO_HIGH',
        name: 'Fees Too High',
        category: 'DETOUR',
        description: 'After-care fees too expensive for client',
        slaEnabled: false,
        isOverdueState: false },
    {
        code: 'CASE_REJECTED',
        name: 'Case Rejected',
        category: 'DETOUR',
        description: 'Case rejected by magistrate - documents missing',
        slaEnabled: true,
        slaDays: 3,
        isOverdueState: false },
    {
        code: 'DECLINED_VIA_DHS',
        name: 'Declined via DHS',
        category: 'DETOUR',
        description: 'Transfer request declined by current debt counsellor via DHS',
        slaEnabled: true,
        slaDays: 3,
        isOverdueState: false },

    // 5. ADVANCED STAGE
    {
        code: 'ZDM_CLIENT',
        name: 'ZDM Client',
        category: 'ADVANCED',
        description: 'Consumer is already registered with Zenowethu Debt Management (NCRDC3693) on DHS — no transfer needed',
        slaEnabled: true,
        slaDays: 3,
        isOverdueState: false },
    {
        code: 'FORM_177_SENT',
        name: 'Form 17.7 Sent',
        category: 'ADVANCED',
        description: 'Form 17.7 received, awaiting DHS acceptance',
        slaEnabled: true,
        slaDays: 5,
        isOverdueState: false },
    {
        code: 'ACCEPTED_VIA_DHS',
        name: 'Accepted via DHS',
        category: 'ADVANCED',
        description: 'Transfer accepted through DHS',
        slaEnabled: true,
        slaDays: 2,
        isOverdueState: false },
    {
        code: 'ACCEPTED_FORM_177',
        name: 'Accepted and Form 17.7 sent',
        category: 'ADVANCED',
        description: 'Accepted and form 17 received',
        slaEnabled: true,
        slaDays: 3,
        isOverdueState: false },
    {
        code: 'READY_COURT_DATE',
        name: 'Ready for Court date',
        category: 'ADVANCED',
        description: 'File ready, awaiting court date allocation',
        slaEnabled: true,
        slaDays: 5,
        isOverdueState: false },
    {
        code: 'COURT_ORDER_GRANTED',
        name: 'Court Granted',
        category: 'ADVANCED',
        description: 'Court order obtained successfully',
        slaEnabled: true,
        slaDays: 2,
        isOverdueState: false },
    {
        code: 'READY_FOR_DISPUTE',
        name: 'Ready for Dispute',
        category: 'ADVANCED',
        description: 'All documents ready for credit bureau dispute',
        slaEnabled: true,
        slaDays: 2,
        isOverdueState: false },
    {
        code: 'APPROVED',
        name: 'Approved',
        category: 'ADVANCED',
        description: 'Case approved for processing',
        slaEnabled: true,
        slaDays: 2,
        isOverdueState: false },
    {
        code: 'COURT_DATE_GRANTED',
        name: 'Court Date Granted',
        category: 'ADVANCED',
        description: 'Court date obtained',
        slaEnabled: true,
        slaDays: 7,
        isOverdueState: false },
    {
        code: 'READY_FOR_COURT',
        name: 'Ready for Court',
        category: 'ADVANCED',
        description: 'All documents ready for court appearance',
        slaEnabled: false,
        isOverdueState: false },

    // 6. ADVANCED DETOUR
    {
        code: 'READY_TO_CONSENT',
        name: 'Ready to Consent',
        category: 'ADVANCED_DETOUR',
        description: 'Transfer accepted — acceptance email sent; awaiting consumer consent to begin debt review removal',
        slaEnabled: true,
        slaDays: 3,
        isOverdueState: false },
    {
        code: 'NEGATIVE_OUTCOME',
        name: 'Negative dispute outcome',
        category: 'ADVANCED_DETOUR',
        description: 'Dispute rejected by bureaus',
        slaEnabled: true,
        slaDays: 2,
        isOverdueState: false },
    { code: 'CLEARED_1M', name: '1 Month Cleared', category: 'ADVANCED_DETOUR', description: 'Cleared on bureaus - 1 Month', slaEnabled: false, isOverdueState: false },
    { code: 'CLEARED_2M', name: '2 Months Cleared', category: 'ADVANCED_DETOUR', description: 'Cleared on bureaus - 2 Months', slaEnabled: false, isOverdueState: false },
    { code: 'CLEARED_3M', name: '3 Months Cleared', category: 'ADVANCED_DETOUR', description: 'Cleared on bureaus - 3 Months', slaEnabled: false, isOverdueState: false },
    { code: 'CLEARED_4M_PLUS', name: '4+ Months Cleared', category: 'ADVANCED_DETOUR', description: 'Cleared on bureaus - 4+ Months', slaEnabled: false, isOverdueState: false },
    {
        code: 'NOT_CLEARED_BUREAUS',
        name: 'Not Cleared on Bureaus',
        category: 'ADVANCED_DETOUR',
        description: 'DHS shows removed but still on 1+ bureaus',
        slaEnabled: true,
        slaDays: 5,
        isOverdueState: false },
    {
        code: 'LEGAL_FEES_WITHDREW',
        name: 'Legal Fees Withdrew',
        category: 'ADVANCED_DETOUR',
        description: 'Letsatsi - client not ready to pay legal fees',
        slaEnabled: false,
        isOverdueState: false },
    {
        code: 'PARKED',
        name: 'Parked Client',
        category: 'ADVANCED_DETOUR',
        description: 'File temporarily parked',
        slaEnabled: false,
        isOverdueState: false },
    {
        code: 'CL_HANDED_OVER',
        name: 'CL Handed Over',
        category: 'ADVANCED_DETOUR',
        description: 'Cleared but not yet paid',
        slaEnabled: true,
        slaDays: 7,
        isOverdueState: false },
    {
        code: 'QUOTE_REJECTED',
        name: 'Quote Rejected',
        category: 'ADVANCED_DETOUR',
        description: 'Client rejected quote',
        slaEnabled: false,
        isOverdueState: false },
    {
        code: 'COURT_POSTPONED',
        name: 'Court Postponed',
        category: 'ADVANCED_DETOUR',
        description: 'Court date postponed',
        slaEnabled: true,
        slaDays: 5,
        isOverdueState: false },

    // 7. ADVANCED PROGRESS
    {
        code: 'FOLLOWED_UP',
        name: 'Followed up on Outcome',
        category: 'ADVANCED_PROGRESS',
        description: 'Following up on rejected dispute',
        slaEnabled: true,
        slaDays: 5,
        isOverdueState: false },
    {
        code: 'POSITIVE_OUTCOME',
        name: 'Positive Dispute outcome',
        category: 'ADVANCED_PROGRESS',
        description: 'Dispute successful',
        slaEnabled: true,
        slaDays: 2,
        isOverdueState: false },
    {
        code: 'READY_CLEARANCE',
        name: 'Ready for Clearance',
        category: 'ADVANCED_PROGRESS',
        description: 'All done, waiting for flag to clear on bureaus',
        slaEnabled: true,
        slaDays: 7,
        isOverdueState: false },

    // 8. COMPLETED
    {
        code: 'COMPLETED',
        name: 'Completed',
        category: 'COMPLETED',
        description: 'Work completed',
        slaEnabled: true,
        slaDays: 2,
        isOverdueState: false },
    {
        code: 'SUBMITTED',
        name: 'Submitted',
        category: 'COMPLETED',
        description: 'Submitted to Letsatsi, awaiting status change',
        slaEnabled: true,
        slaDays: 5,
        isOverdueState: false },
    {
        code: 'CLOSED',
        name: 'Closed',
        category: 'COMPLETED',
        description: 'Letsatsi confirmed - loan code created, ready for collection',
        slaEnabled: true,
        slaDays: 2,
        isOverdueState: false },
    {
        code: 'CL_TELE_MANDATE_READY',
        name: 'CL Tele Mandate',
        category: 'COMPLETED',
        description: 'Letsatsi - consumer ready for phone payment arrangement',
        slaEnabled: true,
        slaDays: 3,
        isOverdueState: false },
    {
        code: 'CL_NOT_CONTACTED',
        name: 'CL Not Contacted',
        category: 'COMPLETED',
        description: 'Closed but consumer not contacted for 2+ weeks',
        slaEnabled: true,
        slaDays: 3,
        isOverdueState: false },
    {
        code: 'CL_NOT_INTERESTED',
        name: 'CL Not Intrested',
        category: 'COMPLETED',
        description: 'Consumer not interested in clearance certificate',
        slaEnabled: false,
        isOverdueState: false },
    {
        code: 'CL_BRANCH_READY',
        name: 'CL Branch Ready',
        category: 'COMPLETED',
        description: 'Consumer promised to collect clearance at branch',
        slaEnabled: true,
        slaDays: 7,
        isOverdueState: false },
    {
        code: 'CL_NOT_AVAILABLE',
        name: 'CL not available',
        category: 'COMPLETED',
        description: 'Consumer unable to visit branch, no commitment',
        slaEnabled: true,
        slaDays: 5,
        isOverdueState: false },
    {
        code: 'CL_INVOICED_PENDING',
        name: 'CL invoiced and pending',
        category: 'COMPLETED',
        description: 'Invoiced on 1st, awaiting payment on 15th',
        slaEnabled: false,
        isOverdueState: false },
    {
        code: 'CL_READY_INVOICING',
        name: 'CL ready for invoicing',
        category: 'COMPLETED',
        description: 'On mid-month collection sheet, not yet collected',
        slaEnabled: true,
        slaDays: 3,
        isOverdueState: false },

    // 9. PAYING
    {
        code: 'UP_TO_DATE',
        name: 'Up-to-Date',
        category: 'PAYING',
        description: 'Payments up to date',
        slaEnabled: false,
        isOverdueState: false },
    {
        code: 'ARREARS_1M',
        name: '1 Month in arrears',
        category: 'PAYING',
        description: '30+ days behind on payments',
        slaEnabled: true,
        slaDays: 7,
        isOverdueState: false },
    {
        code: 'ARREARS_2M',
        name: '2 Months in Arrears',
        category: 'PAYING',
        description: '60+ days behind on payments',
        slaEnabled: true,
        slaDays: 7,
        isOverdueState: false },
    {
        code: 'ARREARS_3M',
        name: '3 Months in Arrears',
        category: 'PAYING',
        description: '90+ days behind on payments',
        slaEnabled: true,
        slaDays: 5,
        isOverdueState: false },
    {
        code: 'ARREARS_4M_PLUS',
        name: '4+ Months in Arrears',
        category: 'PAYING',
        description: '120+ days behind on payments',
        slaEnabled: true,
        slaDays: 3,
        isOverdueState: false },
    {
        code: 'COLLECTION_HANDED_OVER',
        name: 'Collection Handed-Over',
        category: 'PAYING',
        description: 'Client stopped paying, handed over to collections',
        slaEnabled: false,
        isOverdueState: false },
    {
        code: 'PAYING',
        name: 'Paying',
        category: 'PAYING',
        description: 'Client is making payments',
        slaEnabled: false,
        isOverdueState: false },
    {
        code: 'WAITING_R350',
        name: 'Waiting for R350',
        category: 'PAYING',
        description: 'Client confirmed they will pay R350',
        slaEnabled: true,
        slaDays: 5,
        isOverdueState: false },
    {
        code: 'PAID_R350',
        name: 'Paid R350',
        category: 'PAYING',
        description: 'R350 received, file ready for work',
        slaEnabled: true,
        slaDays: 1,
        isOverdueState: false },
    {
        code: 'FEES_CONSENT',
        name: 'Fees Consent',
        category: 'PAYING',
        description: 'Client consented to pay fees after flag removal',
        slaEnabled: false,
        isOverdueState: false },

    // 10. SETTLED
    {
        code: 'SETTLED_SUCCESS',
        name: 'Settled Successfully',
        category: 'SETTLED',
        description: 'Case settled and all fees paid',
        slaEnabled: false,
        isOverdueState: false },
    {
        code: 'SETTLED',
        name: 'Settled',
        category: 'SETTLED',
        description: 'Debt settled with creditor, case closed/lost',
        slaEnabled: false,
        isOverdueState: false },

    // 11. LOST CASES
    {
        code: 'NOT_POTENTIAL',
        name: 'Not Pontential - Withdrew',
        category: 'LOST',
        description: 'Consumer withdrew or not interested',
        slaEnabled: false,
        isOverdueState: false },
    {
        code: 'CANCELLED',
        name: 'Cancelled',
        category: 'LOST',
        description: 'Case cancelled for any reason',
        slaEnabled: false,
        isOverdueState: false },
    {
        code: 'AFTERCARE_FEES_WITHDREW',
        name: 'AfterCare Fees Withdrew',
        category: 'LOST',
        description: 'Client withdrew due to after-care fees',
        slaEnabled: false,
        isOverdueState: false },
];

export function getStatusByCode(code: string): WorkflowStatus | undefined {
    return WORKFLOW_STATUSES.find(s => s.code === code);
}

export function getStatusesByCategory(category: StatusCategory): WorkflowStatus[] {
    return WORKFLOW_STATUSES.filter(s => s.category === category);
}

export const STATUS_CATEGORIES: { code: StatusCategory; name: string; color: string }[] = [
    { code: 'BEGINNING', name: '1. Beginning stage', color: 'blue' },
    { code: 'OVERDUE', name: '2. Over-Due Files', color: 'red' },
    { code: 'IN_PROGRESS', name: '3. In Progress', color: 'cyan' },
    { code: 'DETOUR', name: '4. Detour Stage', color: 'orange' },
    { code: 'ADVANCED', name: '5. Advanced Stage', color: 'indigo' },
    { code: 'ADVANCED_DETOUR', name: '6. Advanced Detour', color: 'amber' },
    { code: 'ADVANCED_PROGRESS', name: '7. Advanced Progress', color: 'teal' },
    { code: 'COMPLETED', name: '8. Completed', color: 'green' },
    { code: 'PAYING', name: '9. Paying', color: 'teal' },
    { code: 'SETTLED', name: '10. Settled', color: 'emerald' },
    { code: 'LOST', name: '11. Lost Cases', color: 'gray' },
];

/**
 * Formats a status code into a human-readable name.
 * Looks up the name in WORKFLOW_STATUSES or falls back to Title Case.
 */
export function formatStatus(code: string | null | undefined): string {
    if (!code) return 'Initial';
    
    const status = getStatusByCode(code);
    if (status) return status.name;
    
    // Fallback: convert SNAKE_CASE to Title Case
    return code
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

