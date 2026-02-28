/**
 * DHS (NCR Debt Help System) — Type Definitions
 * Single source of truth for all DHS data contracts.
 */

export type DHSTransferStatus =
    | 'NOT_REQUESTED'
    | 'PENDING'
    | 'ACCEPTED'
    | 'AUTO_TRANSFERRED'
    | 'DECLINED';

export interface DHSConsumerInfo {
    identityNo: string;
    surname: string;
    firstNames: string;
    gender: string;
    status: string;
    transferIndicator: string;
    debtCounsellor: string;
    province: string;
}

export interface DHSDebtCounsellorInfo {
    ncrRegistrationNo: string;
    fullName: string;
    tradingName: string;
    tel: string;
    mobile: string;
    fax: string;
    email: string;
    province: string;
    operatingStatus: string;
}

export interface DHSDetailedInfo {
    // Main Table Fields
    identityNo: string;
    surname: string;
    firstNames: string;
    gender: string;
    status: string; // "PREVIOUS STATUS" / "STATUS"
    transferIndicator: string;
    debtCounsellorName: string; // From table "DEBT COUN."
    province: string;

    // Pop-up Fields (Dept Counsellor Details)
    ncrdcNo: string; // "NCR Registration No"
    dcFullName: string; // "Full Name"
    dcTradingName: string; // "Trading Name"
    dcOperatingStatus: string; // "Operating Status"
    dcMobile: string; // "Mobile"
    dcEmail: string; // "Email"

    // Other Logic Fields
    requestStatus?: string; // From Manage Requests page (optional logic)
    daysCounter?: string; // From Manage Requests page (optional logic)
}

export interface DHSTransferCheckResult {
    found: boolean;
    status: DHSTransferStatus;
    daysCounter?: string;        // "New", "1 Day(s)", "2 Day(s)", etc.
    requestStatus?: string;      // "Pending", "Auto Transferred", etc.
    combinedStatus?: string;     // "Pending - New", "Pending - 2 Days", "Auto Transferred"
    consumer?: DHSConsumerInfo;
    debtCounsellor?: DHSDebtCounsellorInfo;
    declineReason?: string;
    message?: string;
}

export interface DHSTransferRequestResult {
    success: boolean;
    message: string;
    requestId?: string;
}
