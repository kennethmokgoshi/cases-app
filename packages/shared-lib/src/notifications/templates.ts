// Notification Templates for Credit Repair Status Changes
// Each template has SMS (short) and Email (detailed) versions

export type NotificationChannel = 'SMS' | 'EMAIL' | 'WHATSAPP';

export interface NotificationTemplate {
    statusCode: string;
    statusName: string;
    smsTemplate: string;        // Max ~160 chars for single SMS
    emailSubject: string;
    emailTemplate: string;
    sendToClient: boolean;      // Should notify the client?
    sendToPartner: boolean;     // Should notify B2B partner?
    isUrgent: boolean;          // High priority notification
}

// Template variables:
// {clientName} - Client's full name
// {fileNumber} - Case file number
// {status} - Current status name
// {companyName} - Zenowethu or white-label name
// {partnerName} - B2B partner name
// {deadline} - SLA deadline date
// {amount} - Fee amount where applicable
// {phone} - Company contact phone
// {virtualAssistantName} - Virtual assistant name (e.g., "Thandi")
// {services} - Required services (e.g., "Debt Review Flag Removal")
// {mainSource} - Main source/referral (e.g., "Letsatsi Finance")

const TEMPLATES: NotificationTemplate[] = [
    // ===== INTAKE & PAYMENT =====
    // B2B Welcome - Detailed introduction (client may not know Zenowethu)
    {
        statusCode: 'NEW_LEAD_B2B',
        statusName: 'New Lead',
        smsTemplate: `Hi {clientName}, we have received your application for {services}. Zenowethu Debt Management will contact you within 7 Working days. Ref: {fileNumber}`,
        emailSubject: 'Welcome to {mainSource} - Application Received',
        emailTemplate: `Dear {clientName},

Hi This is {partnerUserName} from {mainSource} Head Office

This email serves to confirm that your application for **{services}** has been successfully referred to our trusted service partner, **Zenowethu Debt Management**.

Zenowethu provides specialized credit repair services and will be handling your detailed case assessment and resolution.

**Case Details:**
• Reference Number: {fileNumber}
• Service Requested: {services}

The Zenowethu team has received your file and is currently reviewing it. They will contact you directly within 7 working days if any further information is required.

If you have any immediate questions, you may contact them at 012 345 6789.

Kind Regards,
{partnerUserName}
{mainSource}

(In partnership with Zenowethu Debt Management)


If you no longer wish to receive these emails you may unsubscribe`,
        sendToClient: true,
        sendToPartner: true,
        isUrgent: false },
    // Staff-created Welcome - Zenowethu staff captures case on client's behalf
    {
        statusCode: 'NEW_LEAD_STAFF',
        statusName: 'New Lead',
        smsTemplate: `Hi {clientName}, your file for {services} has been received by {companyName}. Ref: {fileNumber}. We will contact you within 24-48 hours.`,
        emailSubject: 'Application Received - {companyName}',
        emailTemplate: `Dear {clientName},

Hi, my name is {partnerUserName} from {companyName}.

Thank you for your enquiry. I am pleased to confirm that your application for **{services}** has been received and your file has been created.

**Your File Details:**
• Reference Number: {fileNumber}
• Service Requested: {services}
• Status: Application Received

Our team is now reviewing your file and will be in touch with you directly within 24-48 hours. If any additional information is required, we will contact you.

If you have any immediate questions in the meantime, please do not hesitate to reach out to us at {phone}.

Kind Regards,
{partnerUserName}
{companyName}


If you no longer wish to receive these emails you may unsubscribe`,
        sendToClient: true,
        sendToPartner: false,
        isUrgent: false },
    // B2C Welcome - Personal introduction from Zenowethu
    {
        statusCode: 'NEW_LEAD',
        statusName: 'New Lead',
        smsTemplate: 'Hi {clientName}, your credit repair file ({fileNumber}) has been received by {companyName}. We will contact you shortly.',
        emailSubject: 'Welcome to {companyName} - Application Received',
        emailTemplate: `Dear {clientName},

Hi, my name is {partnerUserName} from {companyName}.

Thank you for reaching out to us. I am pleased to confirm that your application for **{services}** has been successfully received and your file has been created.

**Your File Details:**
• Reference Number: {fileNumber}
• Service Requested: {services}
• Status: Application Received

Our team is now reviewing your file and will be in touch with you directly within 24-48 hours. If any additional information is required, we will contact you.

If you have any immediate questions in the meantime, please do not hesitate to reach out to us at {phone}.

Kind Regards,
{partnerUserName}
{companyName}


If you no longer wish to receive these emails you may unsubscribe`,
        sendToClient: true,
        sendToPartner: false,
        isUrgent: false },
    {
        statusCode: 'TOLD_R350',
        statusName: 'Told R350',
        smsTemplate: 'Hi {clientName}, please pay R350 admin fee to proceed with your credit repair ({fileNumber}). Contact {phone} for payment details.',
        emailSubject: 'Action Required: R350 Admin Fee - File #{fileNumber}',
        emailTemplate: `Dear {clientName},

To proceed with your credit repair application, please pay the R350 administration fee.

File Number: {fileNumber}

Payment Details:
• Amount: R350
• Reference: {fileNumber}

Once payment is received, we will begin processing your file immediately.

Contact us at {phone} if you need assistance.

Kind regards,
{companyName} Team`,
        sendToClient: true,
        sendToPartner: false,
        isUrgent: true },
    {
        statusCode: 'PAID_R350',
        statusName: 'R350 Paid',
        smsTemplate: 'Hi {clientName}, R350 payment received for {fileNumber}. Your credit repair process will begin shortly. Thank you!',
        emailSubject: 'Payment Confirmed - File #{fileNumber}',
        emailTemplate: `Dear {clientName},

Thank you! We have received your R350 administration fee.

File Number: {fileNumber}
Payment Status: Confirmed ✓

Your file is now in our active queue and will be processed shortly.

Kind regards,
{companyName} Team`,
        sendToClient: true,
        sendToPartner: false,
        isUrgent: false },
    {
        statusCode: 'OUTSTANDING_DOCS',
        statusName: 'Outstanding Documents',
        smsTemplate: 'Hi {clientName}, we need additional documents for your file {fileNumber}. Please check your email or call {phone}.',
        emailSubject: 'Documents Required - File #{fileNumber}',
        emailTemplate: `Dear {clientName},

We are missing some documents required to process your credit repair file.

File Number: {fileNumber}

Please provide the outstanding documents as soon as possible to avoid delays.

Contact us at {phone} to find out what's needed.

Kind regards,
{companyName} Team`,
        sendToClient: true,
        sendToPartner: true,
        isUrgent: true },
    // ===== DHS PROCESS =====
    {
        statusCode: 'REQUESTED_VIA_DHS',
        statusName: 'Requested via DHS',
        smsTemplate: 'Hi {clientName}, your file {fileNumber} has been submitted to the NCR system. We will update you once processed.',
        emailSubject: 'File Submitted to NCR - #{fileNumber}',
        emailTemplate: `Dear {clientName},

Your credit repair file has been submitted to the National Credit Regulator (NCR) system.

File Number: {fileNumber}
Status: Awaiting NCR Response

This process typically takes 5-10 business days. We will notify you as soon as we receive a response.

Kind regards,
{companyName} Team`,
        sendToClient: true,
        sendToPartner: true,
        isUrgent: false },
    {
        statusCode: 'ACCEPTED',
        statusName: 'DHS Accepted',
        smsTemplate: 'Great news {clientName}! Your file {fileNumber} has been accepted. We will now proceed with credit bureau disputes.',
        emailSubject: 'Good News! File #{fileNumber} Accepted',
        emailTemplate: `Dear {clientName},

Great news! Your file has been accepted and approved for processing.

File Number: {fileNumber}
Status: Accepted ✓

Next Steps:
• We will now submit disputes to the credit bureaus
• This process takes approximately 20 business days
• You will receive updates as we progress

Kind regards,
{companyName} Team`,
        sendToClient: true,
        sendToPartner: true,
        isUrgent: false },
    {
        statusCode: 'REJECTED',
        statusName: 'Rejected',
        smsTemplate: 'Hi {clientName}, unfortunately your file {fileNumber} was rejected. Please call {phone} to discuss options.',
        emailSubject: 'Important: File #{fileNumber} Status Update',
        emailTemplate: `Dear {clientName},

We regret to inform you that your file has been rejected.

File Number: {fileNumber}

Please contact us at {phone} to discuss the reason and explore alternative options.

Kind regards,
{companyName} Team`,
        sendToClient: true,
        sendToPartner: true,
        isUrgent: true },
    // ===== DISPUTE PROCESS =====
    {
        statusCode: 'READY_FOR_DISPUTE',
        statusName: 'Ready for Dispute',
        smsTemplate: 'Hi {clientName}, your file {fileNumber} is ready for dispute submission to credit bureaus.',
        emailSubject: 'Ready for Dispute - File #{fileNumber}',
        emailTemplate: `Dear {clientName},

Your file is now ready to be submitted to the credit bureaus.

File Number: {fileNumber}

We will submit disputes on your behalf and keep you updated on the progress.

Kind regards,
{companyName} Team`,
        sendToClient: true,
        sendToPartner: false,
        isUrgent: false },
    {
        statusCode: 'DISPUTED',
        statusName: 'Disputed',
        smsTemplate: 'Hi {clientName}, disputes have been submitted for your file {fileNumber}. Results expected in 20 business days.',
        emailSubject: 'Disputes Submitted - File #{fileNumber}',
        emailTemplate: `Dear {clientName},

We have submitted disputes to the credit bureaus on your behalf.

File Number: {fileNumber}
Expected Response: 20 business days

We will notify you as soon as we receive the outcomes.

Kind regards,
{companyName} Team`,
        sendToClient: true,
        sendToPartner: true,
        isUrgent: false },
    // ===== COMPLETION =====
    {
        statusCode: 'COMPLETED',
        statusName: 'Completed',
        smsTemplate: 'Congratulations {clientName}! Your credit repair ({fileNumber}) is complete. Your credit record has been cleared!',
        emailSubject: '🎉 Congratulations! File #{fileNumber} Complete',
        emailTemplate: `Dear {clientName},

CONGRATULATIONS! 🎉

Your credit repair process has been successfully completed.

File Number: {fileNumber}
Status: COMPLETE ✓

Your credit record has been cleared. You should see improvements on your credit report within 30 days.

Thank you for trusting {companyName} with your credit repair journey.

Kind regards,
{companyName} Team`,
        sendToClient: true,
        sendToPartner: true,
        isUrgent: false },
    // ===== DOCUMENTS RECEIVED =====
    {
        statusCode: 'DOCUMENTS_RECEIVED',
        statusName: 'Documents Received',
        smsTemplate: 'Hi {clientName}, we have received the documents for your file {fileNumber}. Our team is now reviewing them.',
        emailSubject: 'Documents Received - File #{fileNumber}',
        emailTemplate: `Dear {clientName},

We have successfully received the documents for your credit repair file.

File Number: {fileNumber}
Status: Documents Received ✓

Our team is now conducting a detailed review. We will notify you once this is completed and we proceed to the next step.

Kind regards,
{companyName} Team`,
        sendToClient: true,
        sendToPartner: true,
        isUrgent: false },
    // ===== DEBT COUNSELLOR COMMUNICATION =====
    {
        statusCode: 'REQUEST_FILE_DC',
        statusName: 'Request File from DC',
        smsTemplate: 'N/A',
        emailSubject: 'URGENT: Request for File & Form 17.7 - {clientName} ({idNumber})',
        emailTemplate: `Dear {dcName},

We are attending to the credit repair matter for {clientName} (ID: {idNumber}).

We kindly request you to provide us with the following documents as soon as possible:

1. The complete file for this consumer
2. Form 17.7 (Notice to Credit Bureaux)
3. All supporting documentation on record

Consumer Details:
• Name: {clientName}
• ID Number: {idNumber}
• Ref: {fileNumber}

We look forward to your prompt response.

Kind regards,
{companyName} Team`,
        sendToClient: false,
        sendToPartner: false,
        isUrgent: true },
    {
        statusCode: 'REQUEST_INVOICE_DC',
        statusName: 'Request Invoice from DC',
        smsTemplate: 'N/A',
        emailSubject: 'Request for Invoice: {clientName} ({idNumber}) - Outstanding Fees',
        emailTemplate: `Dear {dcName},

Regarding the matter of {clientName} (ID: {idNumber}), we note that the file was declined due to outstanding fees.

Kindly provide us with the final invoice or a statement of account reflecting the balance due so that we may assist the consumer in resolving this.

Consumer Details:
• Name: {clientName}
• ID Number: {idNumber}
• Ref: {fileNumber}

Kind regards,
{companyName} Team`,
        sendToClient: false,
        sendToPartner: false,
        isUrgent: true },
    // ===== CREDIT BUREAU FILE REQUESTS =====
    {
        statusCode: 'REQUEST_FILE_CREDIT_BUREAU',
        statusName: 'Request File from Credit Bureau',
        smsTemplate: 'N/A',
        emailSubject: 'Formal Request: Consumer Credit Report & Flag Removal - {clientName} (ID: {idNumber})',
        emailTemplate: `Dear Sir/Madam,

RE: FORMAL REQUEST FOR CONSUMER CREDIT REPORT AND FLAG REMOVAL
Consumer: {clientName}
ID Number: {idNumber}
Our Reference: {fileNumber}

We represent the above-mentioned consumer and are currently attending to the removal of a debt review flag on their credit profile.

We kindly request you to provide us with the following within 5 (five) business days:

1. A full copy of the consumer's credit report
2. Confirmation of any debt review or adverse flags currently listed
3. The specific accounts listed under debt review on your bureau
4. Any documentation you require to process the flag removal

Kindly note that the consumer has successfully exited the debt review process and is entitled to have all adverse listings removed in accordance with the National Credit Act, 34 of 2005.

Consumer Details:
• Full Name: {clientName}
• ID Number: {idNumber}
• Our Reference: {fileNumber}

Please respond to this email or contact us at {phone}.

We look forward to your prompt response.

Yours faithfully,
{senderName}
{companyName}
Tel: {phone}`,
        sendToClient: false,
        sendToPartner: false,
        isUrgent: true },

    // ===== CREDIT PROVIDER FILE REQUESTS =====
    {
        statusCode: 'REQUEST_FILE_CREDIT_PROVIDER',
        statusName: 'Request File from Credit Provider',
        smsTemplate: 'N/A',
        emailSubject: 'Formal Request: Account Information & Clearance Certificate - {clientName} (ID: {idNumber})',
        emailTemplate: `Dear Sir/Madam,

RE: FORMAL REQUEST FOR ACCOUNT INFORMATION AND CLEARANCE CERTIFICATE
Consumer: {clientName}
ID Number: {idNumber}
Account Number(s): {accountNumbers}
Our Reference: {fileNumber}

We act on behalf of the above-mentioned consumer and are currently facilitating the finalisation of their debt review matter.

We kindly request the following documentation within 5 (five) business days:

1. Current outstanding balance on the above account(s)
2. Full payment history and account statement
3. Confirmation of whether the account is settled or still active
4. A clearance/settlement letter if the account has been paid up
5. Any notices issued in terms of Section 86 of the National Credit Act

The consumer has provided written authority for us to request this information on their behalf.

Consumer Details:
• Full Name: {clientName}
• ID Number: {idNumber}
• Account Number(s): {accountNumbers}
• Our Reference: {fileNumber}

Please respond to this email or contact us at {phone}.

Yours faithfully,
{senderName}
{companyName}
Tel: {phone}`,
        sendToClient: false,
        sendToPartner: false,
        isUrgent: true },

    // ===== INTERNAL NOTIFICATIONS =====
    {
        statusCode: 'DECLINED_MANAGER',
        statusName: 'Case Declined Alert',
        smsTemplate: 'ALERT: Case {fileNumber} for {clientName} has been declined. Please update the decline reason immediately.',
        emailSubject: 'IMPORTANT: Case Declined - Action Required for {fileNumber}',
        emailTemplate: `Attention Manager,

Case {fileNumber} for {clientName} has been DECLINED by the system/processor.

Please review the case and upload/update the specific decline reason so the team and client can be informed.

File Link: {caseUrl}

Regards,
System Robot`,
        sendToClient: false,
        sendToPartner: false,
        isUrgent: true },
    {
        statusCode: 'NO_MANAGER_ADMIN',
        statusName: 'Missing Project Manager Alert',
        smsTemplate: 'URGENT: Project {projectName} has no manager assigned. Cases may be delayed.',
        emailSubject: 'URGENT: No Manager Assigned to Project {projectName}',
        emailTemplate: `Dear Admin,

The system has detected that the following project currently has NO manager assigned:

Project: {projectName}

Please assign a manager to this project immediately to ensure cases are handled correctly and notifications are received.

Regards,
System Monitoring`,
        sendToClient: false,
        sendToPartner: false,
        isUrgent: true },
    // ===== PAYMENT TRACKING =====
    {
        statusCode: 'ARREARS_1_MONTH',
        statusName: '1 Month Arrears',
        smsTemplate: 'Hi {clientName}, your account {fileNumber} is 1 month in arrears. Please make payment to avoid service delays. Call {phone}.',
        emailSubject: 'Payment Reminder - File #{fileNumber}',
        emailTemplate: `Dear {clientName},

This is a friendly reminder that your account is 1 month in arrears.

File Number: {fileNumber}

Please make payment as soon as possible to avoid delays in your credit repair process.

Contact us at {phone} to arrange payment.

Kind regards,
{companyName} Team`,
        sendToClient: true,
        sendToPartner: false,
        isUrgent: true },
    // ===== OVERDUE =====
    {
        statusCode: 'OVERDUE',
        statusName: 'Overdue Follow-up',
        smsTemplate: 'Hi {clientName}, your file {fileNumber} requires urgent attention. Please contact {phone} immediately.',
        emailSubject: 'Urgent: Action Required - File #{fileNumber}',
        emailTemplate: `Dear {clientName},

Your file requires urgent attention as the deadline has passed.

File Number: {fileNumber}

Please contact us immediately at {phone} to resolve any outstanding matters.

Kind regards,
{companyName} Team`,
        sendToClient: true,
        sendToPartner: true,
        isUrgent: true },
];

export function getTemplateByStatus(statusCode: string): NotificationTemplate | undefined {
    return TEMPLATES.find(t => t.statusCode === statusCode);
}

export function getAllTemplates(): NotificationTemplate[] {
    return TEMPLATES;
}

// Render template with actual values
export function renderTemplate(
    template: string,
    variables: Record<string, string>
): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
        result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value || '');
    }
    return result;
}

