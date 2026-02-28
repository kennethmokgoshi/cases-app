/**
 * Zenowethu Workflow Status System
 * Organized from 80 statuses into logical categories
 * Time-based statuses are consolidated with a daysInStatus field
 */

export type StatusCategory =
    | 'INTAKE'           // New leads and R350 payment
    | 'DOCUMENTATION'    // Document collection
    | 'DHS_PROCESS'      // Debt Help System interactions
    | 'LEGAL'            // Court and legal processes
    | 'DISPUTE'          // Credit bureau disputes
    | 'COMPLETION'       // Completed/closed cases
    | 'PAYMENT'          // Payment tracking
    | 'FOLLOW_UP'        // Post-completion follow-up
    | 'INACTIVE';        // Withdrawn/rejected

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
    // INTAKE - New leads and initial payment
    {
        code: 'NEW_LEAD',
        name: 'New Lead',
        category: 'INTAKE',
        description: 'Newly captured client or prospect',
        slaEnabled: true,
        slaDays: 2,
        isOverdueState: false },
    {
        code: 'TOLD_R350',
        name: 'Told about R350',
        category: 'INTAKE',
        description: 'Client informed about R350 fee, awaiting payment',
        slaEnabled: true,
        slaDays: 3,
        isOverdueState: false },
    {
        code: 'WAITING_R350',
        name: 'Waiting for R350',
        category: 'INTAKE',
        description: 'Client confirmed they will pay R350',
        slaEnabled: true,
        slaDays: 5,
        isOverdueState: false },
    {
        code: 'PAID_R350',
        name: 'Paid R350',
        category: 'INTAKE',
        description: 'R350 received, file ready for work',
        slaEnabled: true,
        slaDays: 1,
        isOverdueState: false },
    {
        code: 'FILE_PAID',
        name: 'File Paid',
        category: 'INTAKE',
        description: 'R350 has been paid and confirmed',
        slaEnabled: true,
        slaDays: 1,
        isOverdueState: false },

    // DOCUMENTATION
    {
        code: 'OUTSTANDING_DOCS',
        name: 'Outstanding Documents',
        category: 'DOCUMENTATION',
        description: 'Missing required documents',
        slaEnabled: true,
        slaDays: 5,
        isOverdueState: false },
    {
        code: 'NEW_ENQUIRY',
        name: 'New Enquiry',
        category: 'DOCUMENTATION',
        description: 'Client just enquired about services',
        slaEnabled: true,
        slaDays: 1,
        isOverdueState: false },
    {
        code: 'QUOTED',
        name: 'Quoted',
        category: 'DOCUMENTATION',
        description: 'Quote provided to client',
        slaEnabled: true,
        slaDays: 3,
        isOverdueState: false },
    {
        code: 'QUOTE_ACCEPTED',
        name: 'Quote Accepted',
        category: 'DOCUMENTATION',
        description: 'Client accepted quote',
        slaEnabled: true,
        slaDays: 2,
        isOverdueState: false },

    // DHS PROCESS
    {
        code: 'REQUESTED_VIA_DHS',
        name: 'Requested via DHS',
        category: 'DHS_PROCESS',
        description: 'Transfer requested through Debt Help System',
        slaEnabled: true,
        slaDays: 7,
        isOverdueState: false },
    {
        code: 'REJECTED_EMAIL_DOCS',
        name: 'Rejected - Email Documents',
        category: 'DHS_PROCESS',
        description: 'DHS rejected - need to email signed consent & ID',
        slaEnabled: true,
        slaDays: 3,
        isOverdueState: false },
    {
        code: 'DOCUMENTS_EMAILED',
        name: 'Documents Emailed',
        category: 'DHS_PROCESS',
        description: 'Required documents sent after DHS rejection',
        slaEnabled: true,
        slaDays: 5,
        isOverdueState: false },
    {
        code: 'REJECTED_NOT_CONSENT',
        name: 'Rejected - Not Yet Consent',
        category: 'DHS_PROCESS',
        description: 'DHS rejected - consumer not consenting',
        slaEnabled: true,
        slaDays: 7,
        isOverdueState: false },
    {
        code: 'CONSUMER_CONTACTED_DC',
        name: 'Consumer Contacted DC',
        category: 'DHS_PROCESS',
        description: 'Consumer contacted debt counsellor about transfer',
        slaEnabled: true,
        slaDays: 3,
        isOverdueState: false },
    {
        code: 'REJECTED_OWES_FEES',
        name: 'Rejected - Owes Fees',
        category: 'DHS_PROCESS',
        description: 'DHS rejected - consumer owes fees to previous DC',
        slaEnabled: true,
        slaDays: 2,
        isOverdueState: false },
    {
        code: 'INVOICE_REQUESTED_DC',
        name: 'Invoice Requested from DC',
        category: 'DHS_PROCESS',
        description: 'Requested invoice from debt counsellor for owed fees',
        slaEnabled: true,
        slaDays: 5,
        isOverdueState: false },
    {
        code: 'INVOICE_SENT_CONSUMER',
        name: 'Invoice Sent to Consumer',
        category: 'DHS_PROCESS',
        description: 'Invoice forwarded to consumer for payment',
        slaEnabled: true,
        slaDays: 7,
        isOverdueState: false },
    {
        code: 'FORM_177_SENT',
        name: 'Form 17.7 Sent',
        category: 'DHS_PROCESS',
        description: 'Form 17.7 received, awaiting DHS acceptance',
        slaEnabled: true,
        slaDays: 5,
        isOverdueState: false },
    {
        code: 'ACCEPTED_VIA_DHS',
        name: 'Accepted via DHS',
        category: 'DHS_PROCESS',
        description: 'Transfer accepted through DHS',
        slaEnabled: true,
        slaDays: 2,
        isOverdueState: false },
    {
        code: 'ACCEPTED_FORM_177',
        name: 'Accepted & Form 17.7 Sent',
        category: 'DHS_PROCESS',
        description: 'Accepted and form 17 received',
        slaEnabled: true,
        slaDays: 3,
        isOverdueState: false },
    {
        code: 'DEBT_BUSTERS_REJECTED',
        name: 'Debt-Busters Rejected',
        category: 'DHS_PROCESS',
        description: 'File rejected by Debt-Busters via DHS',
        slaEnabled: true,
        slaDays: 3,
        isOverdueState: false },
    {
        code: 'OCTOGEN_REJECTED',
        name: 'Octogen Rejected',
        category: 'DHS_PROCESS',
        description: 'File rejected by Octogen via DHS',
        slaEnabled: true,
        slaDays: 3,
        isOverdueState: false },

    // LEGAL
    {
        code: 'DEPOSIT_PAID',
        name: 'Deposit Paid',
        category: 'LEGAL',
        description: 'Client paid deposit for legal services',
        slaEnabled: true,
        slaDays: 3,
        isOverdueState: false },
    {
        code: 'READY_COURT_DATE',
        name: 'Ready for Court Date',
        category: 'LEGAL',
        description: 'File ready, awaiting court date allocation',
        slaEnabled: true,
        slaDays: 5,
        isOverdueState: false },
    {
        code: 'COURT_DATE_GRANTED',
        name: 'Court Date Granted',
        category: 'LEGAL',
        description: 'Court date obtained',
        slaEnabled: true,
        slaDays: 7,
        isOverdueState: false },
    {
        code: 'READY_FOR_COURT',
        name: 'Ready for Court',
        category: 'LEGAL',
        description: 'All documents ready for court appearance',
        slaEnabled: false,
        isOverdueState: false },
    {
        code: 'COURT_POSTPONED',
        name: 'Court Postponed',
        category: 'LEGAL',
        description: 'Court date postponed',
        slaEnabled: true,
        slaDays: 5,
        isOverdueState: false },
    {
        code: 'CASE_REJECTED',
        name: 'Case Rejected',
        category: 'LEGAL',
        description: 'Case rejected by magistrate - documents missing',
        slaEnabled: true,
        slaDays: 3,
        isOverdueState: false },
    {
        code: 'COURT_ORDER_GRANTED',
        name: 'Court Order Granted',
        category: 'LEGAL',
        description: 'Court order obtained successfully',
        slaEnabled: true,
        slaDays: 2,
        isOverdueState: false },

    // DISPUTE
    {
        code: 'READY_FOR_DISPUTE',
        name: 'Ready for Dispute',
        category: 'DISPUTE',
        description: 'All documents ready for credit bureau dispute',
        slaEnabled: true,
        slaDays: 2,
        isOverdueState: false },
    {
        code: 'DISPUTED',
        name: 'Disputed',
        category: 'DISPUTE',
        description: 'Dispute submitted to credit bureaus',
        slaEnabled: true,
        slaDays: 20,
        isOverdueState: false },
    {
        code: 'IN_PROGRESS',
        name: 'In Progress',
        category: 'DISPUTE',
        description: 'Dispute in progress with bureaus',
        slaEnabled: false,
        isOverdueState: false },
    {
        code: 'NEGATIVE_OUTCOME',
        name: 'Negative Dispute Outcome',
        category: 'DISPUTE',
        description: 'Dispute rejected by bureaus',
        slaEnabled: true,
        slaDays: 2,
        isOverdueState: false },
    {
        code: 'FOLLOWED_UP',
        name: 'Followed up on Outcome',
        category: 'DISPUTE',
        description: 'Following up on rejected dispute',
        slaEnabled: true,
        slaDays: 5,
        isOverdueState: false },
    {
        code: 'POSITIVE_OUTCOME',
        name: 'Positive Dispute Outcome',
        category: 'DISPUTE',
        description: 'Dispute successful',
        slaEnabled: true,
        slaDays: 2,
        isOverdueState: false },
    {
        code: 'READY_CLEARANCE',
        name: 'Ready for Clearance',
        category: 'DISPUTE',
        description: 'All done, waiting for flag to clear on bureaus',
        slaEnabled: true,
        slaDays: 7,
        isOverdueState: false },
    {
        code: 'NOT_CLEARED_BUREAUS',
        name: 'Not Cleared on Bureaus',
        category: 'DISPUTE',
        description: 'DHS shows removed but still on 1+ bureaus',
        slaEnabled: true,
        slaDays: 5,
        isOverdueState: false },

    // COMPLETION - Letsatsi specific
    {
        code: 'FEES_CONSENT',
        name: 'Fees Consent',
        category: 'COMPLETION',
        description: 'Client consented to pay fees after flag removal',
        slaEnabled: false,
        isOverdueState: false },
    {
        code: 'COMPLETED',
        name: 'Completed',
        category: 'COMPLETION',
        description: 'Work completed',
        slaEnabled: true,
        slaDays: 2,
        isOverdueState: false },
    {
        code: 'SUBMITTED',
        name: 'Submitted',
        category: 'COMPLETION',
        description: 'Submitted to Letsatsi, awaiting status change',
        slaEnabled: true,
        slaDays: 5,
        isOverdueState: false },
    {
        code: 'CLOSED',
        name: 'Closed',
        category: 'COMPLETION',
        description: 'Letsatsi confirmed - loan code created, ready for collection',
        slaEnabled: true,
        slaDays: 2,
        isOverdueState: false },
    {
        code: 'CL_TELE_MANDATE_READY',
        name: 'CL Tele Mandate Ready',
        category: 'COMPLETION',
        description: 'Letsatsi - consumer ready for phone payment arrangement',
        slaEnabled: true,
        slaDays: 3,
        isOverdueState: false },
    {
        code: 'CL_NOT_CONTACTED',
        name: 'CL Not Contacted',
        category: 'COMPLETION',
        description: 'Closed but consumer not contacted for 2+ weeks',
        slaEnabled: true,
        slaDays: 3,
        isOverdueState: false },
    {
        code: 'CL_NOT_INTERESTED',
        name: 'CL Not Interested',
        category: 'COMPLETION',
        description: 'Consumer not interested in clearance certificate',
        slaEnabled: false,
        isOverdueState: false },
    {
        code: 'CL_BRANCH_READY',
        name: 'CL Branch Ready',
        category: 'COMPLETION',
        description: 'Consumer promised to collect clearance at branch',
        slaEnabled: true,
        slaDays: 7,
        isOverdueState: false },
    {
        code: 'CL_NOT_AVAILABLE',
        name: 'CL Not Available',
        category: 'COMPLETION',
        description: 'Consumer unable to visit branch, no commitment',
        slaEnabled: true,
        slaDays: 5,
        isOverdueState: false },

    // PAYMENT
    {
        code: 'CL_INVOICED_PENDING',
        name: 'CL Invoiced & Pending',
        category: 'PAYMENT',
        description: 'Invoiced on 1st, awaiting payment on 15th',
        slaEnabled: false,
        isOverdueState: false },
    {
        code: 'CL_READY_INVOICING',
        name: 'CL Ready for Invoicing',
        category: 'PAYMENT',
        description: 'On mid-month collection sheet, not yet collected',
        slaEnabled: true,
        slaDays: 3,
        isOverdueState: false },
    {
        code: 'PAYING',
        name: 'Paying',
        category: 'PAYMENT',
        description: 'Client is making payments',
        slaEnabled: false,
        isOverdueState: false },
    {
        code: 'UP_TO_DATE',
        name: 'Up-to-date',
        category: 'PAYMENT',
        description: 'Payments up to date',
        slaEnabled: false,
        isOverdueState: false },
    {
        code: 'ARREARS_1M',
        name: '1 Month in Arrears',
        category: 'PAYMENT',
        description: '30+ days behind on payments',
        slaEnabled: true,
        slaDays: 7,
        isOverdueState: false },
    {
        code: 'ARREARS_2M',
        name: '2 Months in Arrears',
        category: 'PAYMENT',
        description: '60+ days behind on payments',
        slaEnabled: true,
        slaDays: 7,
        isOverdueState: false },
    {
        code: 'ARREARS_3M',
        name: '3 Months in Arrears',
        category: 'PAYMENT',
        description: '90+ days behind on payments',
        slaEnabled: true,
        slaDays: 5,
        isOverdueState: false },
    {
        code: 'ARREARS_4M_PLUS',
        name: '4 or More Months',
        category: 'PAYMENT',
        description: '120+ days behind on payments',
        slaEnabled: true,
        slaDays: 3,
        isOverdueState: false },

    // FOLLOW_UP - Time-based tracking with daysInStatus field
    {
        code: 'CL_CLEARED',
        name: 'CL Cleared (Days Tracked)',
        category: 'FOLLOW_UP',
        description: 'File cleared, tracking days not collected (30/60/90+)',
        slaEnabled: false,
        isOverdueState: false },
    {
        code: 'FEES_CONSENTED',
        name: 'Fees Consented (Days Tracked)',
        category: 'FOLLOW_UP',
        description: 'Fees consent given, tracking days (30/60/90+)',
        slaEnabled: false,
        isOverdueState: false },
    {
        code: 'INV_SENT_CONSUMER',
        name: 'Invoice Sent to Consumer (Days Tracked)',
        category: 'FOLLOW_UP',
        description: 'Invoice sent, tracking days (30/60/90/120+)',
        slaEnabled: false,
        isOverdueState: false },
    {
        code: 'INV_REQ_FROM_DC',
        name: 'Invoice Requested from DC (Days Tracked)',
        category: 'FOLLOW_UP',
        description: 'Invoice requested from DC, tracking days (30/60/90/120+)',
        slaEnabled: false,
        isOverdueState: false },
    {
        code: 'REJ_NOT_CONSENT',
        name: 'Rejected Not Consent (Days Tracked)',
        category: 'FOLLOW_UP',
        description: 'DHS rejection, tracking days (30/60/90/120+)',
        slaEnabled: false,
        isOverdueState: false },
    {
        code: 'CL_HANDED_OVER',
        name: 'CL Handed Over',
        category: 'FOLLOW_UP',
        description: 'Cleared but not yet paid',
        slaEnabled: true,
        slaDays: 7,
        isOverdueState: false },

    // INACTIVE
    {
        code: 'QUOTE_REJECTED',
        name: 'Quote Rejected',
        category: 'INACTIVE',
        description: 'Client rejected quote',
        slaEnabled: false,
        isOverdueState: false },
    {
        code: 'NOT_POTENTIAL',
        name: 'Not Potential - Withdrew',
        category: 'INACTIVE',
        description: 'Consumer withdrew or not interested',
        slaEnabled: false,
        isOverdueState: false },
    {
        code: 'FEES_TOO_HIGH',
        name: 'Fees Too High',
        category: 'INACTIVE',
        description: 'After-care fees too expensive for client',
        slaEnabled: false,
        isOverdueState: false },
    {
        code: 'LEGAL_FEES_WITHDREW',
        name: 'Legal Fees Withdrew',
        category: 'INACTIVE',
        description: 'Letsatsi - client not ready to pay legal fees',
        slaEnabled: false,
        isOverdueState: false },
    {
        code: 'AFTERCARE_FEES_WITHDREW',
        name: 'AfterCare Fees Withdrew',
        category: 'INACTIVE',
        description: 'Client withdrew due to after-care fees',
        slaEnabled: false,
        isOverdueState: false },
    {
        code: 'PARKED',
        name: 'Parked Clients',
        category: 'INACTIVE',
        description: 'File temporarily parked',
        slaEnabled: false,
        isOverdueState: false },

    // OVERDUE - The critical status!
    {
        code: 'OVERDUE',
        name: 'Overdue',
        category: 'INTAKE',
        description: 'CRITICAL: Deadline passed, requires immediate attention',
        slaEnabled: false,
        isOverdueState: true },
];

export function getStatusByCode(code: string): WorkflowStatus | undefined {
    return WORKFLOW_STATUSES.find(s => s.code === code);
}

export function getStatusesByCategory(category: StatusCategory): WorkflowStatus[] {
    return WORKFLOW_STATUSES.filter(s => s.category === category);
}

export const STATUS_CATEGORIES: { code: StatusCategory; name: string; color: string }[] = [
    { code: 'INTAKE', name: 'Intake & Payment', color: 'blue' },
    { code: 'DOCUMENTATION', name: 'Documentation', color: 'purple' },
    { code: 'DHS_PROCESS', name: 'DHS Process', color: 'indigo' },
    { code: 'LEGAL', name: 'Legal & Court', color: 'amber' },
    { code: 'DISPUTE', name: 'Bureau Disputes', color: 'cyan' },
    { code: 'COMPLETION', name: 'Completion', color: 'green' },
    { code: 'PAYMENT', name: 'Payment Tracking', color: 'emerald' },
    { code: 'FOLLOW_UP', name: 'Follow-up', color: 'yellow' },
    { code: 'INACTIVE', name: 'Inactive/Withdrawn', color: 'gray' },
];
