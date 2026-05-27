export type PlanStatus = 'DRAFT' | 'AWAITING_APPROVAL' | 'APPROVED' | 'IN_PROGRESS' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
export type StepStatus = 'PENDING' | 'IN_PROGRESS' | 'WAITING_FOR_USER' | 'COMPLETED' | 'SKIPPED' | 'FAILED';
export type OwnerApp = 'CASES' | 'LEGAL' | 'INSURANCE' | 'FORENSIC' | 'FINANCE' | 'GHL';
export type StepCategory = 'DOCUMENT_REQUEST' | 'DHS_ACTION' | 'LEGAL_LETTER' | 'INSURANCE' | 'FORENSIC' | 'NOTIFICATION' | 'INTERNAL' | 'CREDIT_BUREAU' | 'GHL_WAIT' | 'NCT_ACTION';
export type ActionType =
  | 'DHS_SEARCH'
  | 'DHS_TRANSFER_REQUEST'
  | 'REQUEST_FILE_FROM_DC'
  | 'STATUS_UPDATE'
  | 'DOCUMENT_REQUEST_CLIENT'
  | 'PRESCRIPTION_CHECK'
  | 'DRAFT_PRESCRIPTION_LETTER'
  | 'SEND_PRESCRIPTION_LETTER'
  | 'DRAFT_LEGAL_LETTER'
  | 'SEND_LEGAL_LETTER'
  | 'BUREAU_DISPUTE'
  | 'INSURANCE_ASSESSMENT'
  | 'DRAFT_CANCELLATION_LETTER'
  | 'SEND_CANCELLATION_LETTER'
  | 'OPEN_FORENSIC_AUDIT'
  | 'RECKLESS_LENDING_ASSESSMENT'
  | 'GENERATE_INVOICE'
  | 'GHL_SEND_SMS'
  | 'GHL_SEND_EMAIL'
  | 'GHL_SEND_WHATSAPP'
  | 'GHL_WAIT_DOCUMENT'
  | 'GHL_WAIT_REPLY'
  | 'NCT_STATUS_CHECK';
export type WaitingForEvent = 'DOCUMENT_RECEIVED' | 'REPLY_RECEIVED' | 'TIMEOUT' | 'USER_ACTION';
export type TimeoutAction = 'ESCALATE' | 'SKIP' | 'FAIL';
export type ChangeType = 'NO_CHANGE' | 'PARTIAL_CHANGE' | 'MAJOR_CHANGE';
export type EventSource = 'GHL' | 'DHS' | 'MANUAL' | 'SYSTEM';
export type EventType = 'DOCUMENT_RECEIVED' | 'REPLY_RECEIVED' | 'TIMEOUT' | 'USER_ACTION' | 'STATUS_CHANGE' | 'DHS_UPDATE';

export interface MissingInfoItem {
  type: 'CREDIT_REPORT' | 'ID_DOCUMENT' | 'POA' | 'PAYSLIP' | 'BANK_STATEMENT' | 'OTHER' | 'FORM_17W' | 'COURT_ORDER';
  description: string;
  isRequired: boolean;
  weight: number;
  impactIfMissing: string;
}

export interface ConfidenceReport {
  score: number;
  canProceed: boolean;
  missingRequired: MissingInfoItem[];
  missingOptional: MissingInfoItem[];
  presentItems: string[];
}

export interface PlanStepDefinition {
  stepNumber: number;
  title: string;
  description: string;
  ownerApp: OwnerApp;
  category: StepCategory;
  actionType: ActionType;
  actionParams: Record<string, unknown>;
  requiresApproval: boolean;
  waitingForEvent?: WaitingForEvent;
  timeoutHours?: number;
  timeoutAction?: TimeoutAction;
}

export interface GeneratedPlan {
  caseType: string;
  summary: string;
  steps: PlanStepDefinition[];
  reasoning: string;
}

export interface PlanEvaluationResult {
  changeType: ChangeType;
  summary: string;
  affectedStepNumbers: number[];
  newSteps?: PlanStepDefinition[];
  updatedSteps?: Array<{ stepNumber: number; changes: Partial<PlanStepDefinition> }>;
  notificationMessage: string;
}

export interface StepExecutionResult {
  success: boolean;
  result?: Record<string, unknown>;
  error?: string;
  requiresUserAction?: boolean;
  userActionPrompt?: string;
}

export interface PlanEventPayload {
  caseId: string;
  planId: string;
  eventSource: EventSource;
  eventType: EventType;
  eventData: Record<string, unknown>;
  description: string;
}
