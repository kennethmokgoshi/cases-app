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
// {mainSource} - Main source/referral (e.g., "Letsatsi")

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

If you have any immediate questions, you may contact them at 012 035 1824.

Kind Regards,
{partnerUserName}
{mainSource}

(In partnership with Zenowethu Debt Management)`,
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

**What This Service Involves:**
To successfully complete your {services}, our team will carry out the following on your behalf:

1. Obtain your full file from your previous debt counsellor (including all forms, court orders, and account schedules)
2. Submit a clearance request to the NCR Debt Help System (DHS) for formal confirmation that your debt review has been concluded
3. Request your updated credit reports from all major credit bureaux (TransUnion, Experian, Compuscan)
4. Formally dispute and request the removal of all debt review flags and adverse listings from your credit profile
5. Obtain settlement/clearance letters from credit providers where applicable
6. Confirm in writing once all flags have been successfully removed

Our team is now reviewing your file and will be in touch with you directly within 24-48 hours. If any additional information is required, we will contact you.

If you have any immediate questions in the meantime, please do not hesitate to reach out to us at {phone}.

Kind Regards,
{partnerUserName}
{companyName}`,
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

**What This Service Involves:**
To successfully complete your {services}, our team will carry out the following on your behalf:

1. Obtain your full file from your previous debt counsellor (including all forms, court orders, and account schedules)
2. Submit a clearance request to the NCR Debt Help System (DHS) for formal confirmation that your debt review has been concluded
3. Request your updated credit reports from all major credit bureaux (TransUnion, Experian, Compuscan)
4. Formally dispute and request the removal of all debt review flags and adverse listings from your credit profile
5. Obtain settlement/clearance letters from credit providers where applicable
6. Confirm in writing once all flags have been successfully removed

Our team is now reviewing your file and will be in touch with you directly within 24-48 hours. If any additional information is required, we will contact you.

If you have any immediate questions in the meantime, please do not hesitate to reach out to us at {phone}.

Kind Regards,
{partnerUserName}
{companyName}`,
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
        emailSubject: 'File Transfer Request: {clientName} (ID: {idNumber}) — Documents Required',
        emailTemplate: `Dear {dcName},

I hope this message finds you well. Thank you so much for the work you have already put into managing the debt review matter for {clientName} (ID: {idNumber}) — we genuinely appreciate the effort and dedication that goes into supporting consumers through this process.

We are writing to kindly request the transfer of the complete consumer file to Zenowethu Debt Management (NCRDC3693), as the consumer has approached us to continue with their debt review matter.

Please could you assist us by providing the following documents at your earliest convenience:

1. Form 16 — Application for Debt Review
2. Form 17.1 — Notification to Credit Providers and Payment Distribution Agency
3. Form 17.2 — Rejection of Application for Debt Review (if applicable)
4. Form 17.7 — Notice to Credit Bureaux
5. The complete consumer file, including all correspondence and supporting documentation
6. Any court orders, consent orders, or restructuring proposals in place
7. All credit provider account schedules and statements on record
8. Any other documents relevant to this consumer's debt review matter

Consumer Details:
• Full Name: {clientName}
• ID Number: {idNumber}
• Our Reference: {fileNumber}

Please do not hesitate to reach out should you require any further information or authorisation from the consumer. We are happy to assist in making this transition as smooth as possible.

Thank you very much for your cooperation and assistance — it is truly appreciated.

Kind regards,
{companyName} Team
Tel: {phone}`,
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

    // ===== WEBSITE LEAD =====
    {
        statusCode: 'WEBSITE_LEAD',
        statusName: 'New Website Lead',
        smsTemplate: `New website lead: {clientName} | {service} | {phone}`,
        emailSubject: 'New Website Lead — {clientName} ({service})',
        emailTemplate: `A new lead has been submitted via the Zenowethu website assessment form.

Name:    {clientName}
Service: {service}
Phone:   {phone}
Email:   {email}
ID No:   {idNumber}
POPIA:   {popiaConsent}

View and action this lead in the Cases app:
{leadsUrl}

---
{companyName} | Automated Lead Notification`,
        sendToClient: false,
        sendToPartner: false,
        isUrgent: true },

    // ===== INTERNAL AUTOMATION ALERTS =====
    {
        statusCode: 'ACCEPTED_MANAGER',
        statusName: 'File Accepted — Manager Alert',
        smsTemplate: 'ALERT: Case {fileNumber} for {clientName} has been ACCEPTED via DHS. Please review next steps.',
        emailSubject: 'File Accepted: {fileNumber} — {clientName}',
        emailTemplate: `Dear Manager,

Case {fileNumber} for {clientName} has been ACCEPTED via the NCR Debt Help System (DHS).

This means the transfer request was approved and the file is now moving to the next stage.

Please review the case and ensure all follow-up actions are taken promptly.

Case Link: {caseUrl}

Regards,
Zenowethu System`,
        sendToClient: false,
        sendToPartner: false,
        isUrgent: true },
    {
        statusCode: 'CASE_ASSIGNED',
        statusName: 'New Case Assigned',
        smsTemplate: 'Hi {assigneeName}, case {fileNumber} for {clientName} has been assigned to you. Please review.',
        emailSubject: 'New Case Assigned: {fileNumber} — {clientName}',
        emailTemplate: `Hi {assigneeName},

A new case has been assigned to you:

  Client:      {clientName}
  File Number: {fileNumber}
  Service:     {services}

Please log in and review the case at your earliest convenience.

Case Link: {caseUrl}

Regards,
Zenowethu System`,
        sendToClient: false,
        sendToPartner: false,
        isUrgent: false },
    {
        statusCode: 'STALE_CASE',
        statusName: 'Stale Case Alert',
        smsTemplate: 'ALERT: Case {fileNumber} for {clientName} has had no activity for {daysStale} days. Please review.',
        emailSubject: 'Stale Case Alert: {fileNumber} — No Activity for {daysStale} Days',
        emailTemplate: `Dear Manager,

The following case has had no activity for {daysStale} days and may require attention:

  Client:      {clientName}
  File Number: {fileNumber}
  Last Update: {lastUpdate}
  Status:      {status}

Please review the case and take the appropriate action.

Case Link: {caseUrl}

Regards,
Zenowethu System`,
        sendToClient: false,
        sendToPartner: false,
        isUrgent: false },
    {
        statusCode: 'DOCUMENT_EXPIRY',
        statusName: 'Document Expiry Alert',
        smsTemplate: 'ALERT: Case {fileNumber} — documents may be outdated (older than 3 months). Please request fresh documents.',
        emailSubject: 'Document Expiry Alert: {fileNumber} — {clientName}',
        emailTemplate: `Dear Staff,

The following case has documents that are older than 3 months and may need to be refreshed:

  Client:      {clientName}
  File Number: {fileNumber}
  Expired Documents: {expiredDocs}

Please request fresh documents from the client.

Case Link: {caseUrl}

Regards,
Zenowethu System`,
        sendToClient: false,
        sendToPartner: false,
        isUrgent: false },
    {
        statusCode: 'R350_REMINDER',
        statusName: 'R350 Payment Reminder',
        smsTemplate: 'REMINDER: Case {fileNumber} for {clientName} has a pending R350 payment that is overdue. Please follow up.',
        emailSubject: 'R350 Payment Overdue: {fileNumber} — {clientName}',
        emailTemplate: `Dear Manager,

The following case has an R350 payment that has been pending for over 30 days:

  Client:      {clientName}
  File Number: {fileNumber}
  R350 Status: {r350Status}
  Days Pending: {daysPending}

Please follow up with the client or update the payment status.

Case Link: {caseUrl}

Regards,
Zenowethu System`,
        sendToClient: false,
        sendToPartner: false,
        isUrgent: false },
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

// ─── Branded Email Layout ──────────────────────────────────────────────────

export interface EmailLayoutOptions {
    title?: string;
    previewText?: string;
    button?: {
        text: string;
        url: string;
    };
    hideFooter?: boolean;
    companyName?: string;
    logoUrl?: string;
}

const BRAND_NAVY = '#0d3870';
const BRAND_ORANGE = '#d9701a';
const BRAND_GRAY = '#f4f7f9';

/**
 * Wraps raw content in a professional, branded Zenowethu HTML layout.
 * Optimized for mobile and desktop email clients.
 */
export function renderBrandedEmail(contentHtml: string, options: EmailLayoutOptions = {}): string {
    const companyName = options.companyName || 'Zenowethu Debt Management and Insurance';
    const title = options.title || companyName;
    const previewText = options.previewText || '';
    
    // Convert newlines to <br/> if the content is plain text
    const formattedContent = contentHtml.includes('<p>') ? contentHtml : contentHtml.split('\n').map(l => l.trim() ? `<p>${l}</p>` : '<br/>').join('');

    const ctaButton = options.button ? `
        <div style="padding: 20px 0; text-align: center;">
            <a href="${options.button.url}" style="background-color: ${BRAND_NAVY}; color: #ffffff; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block; font-size: 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">${options.button.text}</a>
        </div>
    ` : '';

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <!--[if mso]>
    <style type="text/css">
        body, table, td, a { font-family: Arial, Helvetica, sans-serif !important; }
    </style>
    <![endif]-->
    <style>
        body { margin: 0; padding: 0; width: 100% !important; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; background-color: ${BRAND_GRAY}; }
        img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
        table { border-collapse: collapse !important; }
        .container { width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; }
        .content { padding: 40px 30px; color: #333333; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 16px; line-height: 1.6; position: relative; }
        .header { background-color: ${BRAND_NAVY}; padding: 35px 30px; text-align: left; }
        .footer { background-color: #f8f9fa; padding: 30px; text-align: center; font-family: Arial, sans-serif; font-size: 12px; color: #6c757d; border-top: 1px solid #eeeeee; }
        .footer a { color: ${BRAND_ORANGE}; text-decoration: none; }
        h1, h2, h3 { color: ${BRAND_NAVY}; margin-top: 0; }
        p { margin-bottom: 1.5em; }
        .accent-bar { height: 4px; background: linear-gradient(to right, ${BRAND_NAVY}, ${BRAND_ORANGE}); }
        @media only screen and (max-width: 600px) {
            .content { padding: 30px 20px !important; }
        }
    </style>
</head>
<body>
    <div style="display: none; max-height: 0px; overflow: hidden;">${previewText}</div>
    <table border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
            <td align="center" style="background-color: ${BRAND_GRAY}; padding: 20px 0;">
                <table border="0" cellpadding="0" cellspacing="0" class="container" style="border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                    <!-- Header -->
                    <tr>
                        <td class="header">
                            <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                <tr>
                                    <td width="70" valign="middle">
                                        <div style="width: 50px; height: 50px; background-color: #ffffff; border-radius: 8px; position: relative; display: flex; align-items: center; justify-content: center;">
                                            <div style="width: 30px; height: 30px; border: 4px solid ${BRAND_NAVY}; transform: rotate(45deg); position: absolute; top: 10px; left: 10px;"></div>
                                            <div style="width: 12px; height: 12px; background-color: ${BRAND_ORANGE}; transform: rotate(45deg); position: absolute; top: 19px; left: 19px;"></div>
                                        </div>
                                    </td>
                                    <td style="padding-left: 20px;" valign="middle">
                                        <div style="color: #ffffff; font-size: 26px; font-weight: bold; font-family: Arial, sans-serif; line-height: 1.1; letter-spacing: 1px;">
                                            ZENOWETHU
                                        </div>
                                        <div style="color: #ffffff; font-size: 13px; font-weight: 500; margin-top: 5px; font-family: Arial, sans-serif; letter-spacing: 0.3px;">
                                            Debt Management | Insurance | Financial Services
                                        </div>
                                        <div style="color: rgba(255,255,255,0.7); font-size: 10px; margin-top: 8px; font-family: Arial, sans-serif; letter-spacing: 0.5px;">
                                            NCRDC3693 | DCASA 0863 | 012 035 1824
                                        </div>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <!-- Accent Bar -->
                    <tr>
                        <td class="accent-bar"></td>
                    </tr>
                    <!-- Main Body with Watermark -->
                    <tr>
                        <td class="content" style="background-image: url('https://cases.zenowethu.co.za/branding/watermark.jpg'); background-repeat: no-repeat; background-position: center; background-size: contain;">
                            <!--[if gte mso 9]>
                            <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;height:400px;">
                                <v:fill type="frame" src="https://cases.zenowethu.co.za/branding/watermark.jpg" color="#ffffff" />
                                <v:textbox inset="0,0,0,0">
                            <![endif]-->
                            <div style="position: relative; z-index: 1;">
                                ${formattedContent}
                                ${ctaButton}
                            </div>
                            <!--[if gte mso 9]>
                                </v:textbox>
                            </v:rect>
                            <![endif]-->
                        </td>
                    </tr>
                    <!-- Footer -->
                    ${options.hideFooter ? '' : `
                    <tr>
                        <td class="footer">
                            <p style="margin: 0 0 10px 0; font-weight: bold; color: ${BRAND_NAVY}; font-size: 14px;">${companyName}</p>
                            <p style="margin: 0 0 5px 0;">Suite 2, Second Floor, Central House, 17 Central Road, Mabopane, 0199</p>
                            <p style="margin: 0 0 5px 0;">Tel: 012 035 1824 | Email: <a href="mailto:notifications@zenowethu.co.za">notifications@zenowethu.co.za</a></p>
                            <p style="margin: 0 0 20px 0;">Web: <a href="https://www.zenowethu.co.za">www.zenowethu.co.za</a></p>
                            
                            <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eeeeee; font-size: 10px; line-height: 1.4; text-align: justify;">
                                <p style="margin: 0;"><strong>Confidentiality & POPIA Notice:</strong> This email and any attachments are confidential and intended solely for the addressee. Zenowethu Debt Management (PTY) LTD is committed to protecting your personal information in accordance with the Protection of Personal Information Act (POPIA). If you have received this email in error, please notify the sender immediately and delete it from your system.</p>
                                <p style="margin: 10px 0 0 0; text-align: center;">Zenowethu Debt Management (PTY) LTD | Reg No: 2013/121120/07 | NCRDC3693</p>
                            </div>
                        </td>
                    </tr>
                    `}
                </table>
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px;">
                    <tr>
                        <td style="padding: 20px; text-align: center; color: #999999; font-size: 11px; font-family: Arial, sans-serif;">
                            &copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;
}


