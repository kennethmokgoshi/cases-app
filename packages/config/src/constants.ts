export const SERVICES_MAP: Record<string, string> = {
    'credit_profile_enquiry': 'Credit Profile Enquiry',
    'admin_order_removal': 'Administration Order Removal',
    'admin_order_application': 'Administration Order Application',
    'debt_review_flag_removal': 'Debt Review Flag Removal',
    'debt_review_application': 'Debt Review Application',
    'payment_profile_update': 'Payment Profile Update',
    'paid_accounts_update': 'Paid Accounts Update',
    'prescription_of_accounts': 'Prescription of Accounts',
    'paid_judgments': 'Paid Judgments',
    'paid_defaults': 'Paid Defaults',
    'rescission_unpaid_judgments': 'Rescission of Not Paid Judgments'
};

export const SERVICE_DESCRIPTIONS: Record<string, string> = {
    'debt_review_flag_removal': 'Removal of debt review flag from all major credit bureaus (TransUnion, Experian, XDS, Compuscan)',
    'credit_profile_enquiry': 'Comprehensive credit report and analysis from major bureaus.',
    'admin_order_removal': 'Legal process to rescind and remove an administration order from your credit profile.',
    'paid_judgments': 'Removal of paid judgment listings from all credit bureau records.',
    'paid_defaults': 'Update and removal of settled default listings.'
};

export const BRANDING = {
    appName: 'ZENOWETHU'
};
