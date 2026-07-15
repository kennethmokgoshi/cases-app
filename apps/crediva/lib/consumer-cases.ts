import { formatStatus, getStatusByCode } from '@zenowethu/shared-lib/src/statuses/statuses';
import { summariseCaseFinancials } from '@zenowethu/shared-lib/src/finance/case-financials';

export type ConsumerInvoiceRecord = {
  id: string;
  invoiceNumber: string;
  type: string;
  status: string;
  total: number | string;
  subtotal: number | string;
  vatAmount: number | string;
  issuedAt: Date | string;
  dueAt: Date | string;
  acceptedAt: Date | string | null;
  rejectedAt: Date | string | null;
  publicToken: string | null;
  notes: string | null;
  lineItems: unknown;
  convertedToInvoiceId: string | null;
};

export type ConsumerPaymentRecord = {
  id: string;
  amount: number | string;
  date: Date | string;
  method: string;
  reference: string | null;
  category: string;
  status: string;
  notes: string | null;
};

export type ConsumerCaseRecord = {
  id: string;
  fileNumber: string;
  description: string | null;
  status: string;
  category: string | null;
  services: string | null;
  serviceFee: number | string | null;
  nextUpdate: Date | string | null;
  deadline: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  consumerDhsStatus: string | null;
  requestedDhsStatus: string | null;
  invoices: ConsumerInvoiceRecord[];
  payments: ConsumerPaymentRecord[];
  workflowLogs: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    action: string;
    timestamp: Date | string;
    notes: string | null;
  }>;
  comments: Array<{
    id: string;
    content: string;
    activityType: string | null;
    createdAt: Date | string;
  }>;
  notifications: Array<{
    id: string;
    channel: string;
    message: string;
    sentAt: Date | string;
    statusCode: string | null;
  }>;
  documentRequests: Array<{
    id: string;
    category: string;
    label: string;
    notes: string | null;
    status: string;
    createdAt: Date | string;
    reviewedAt: Date | string | null;
  }>;
  drrConsents: Array<{
    id: string;
    status: string;
    channel: string;
    createdAt: Date | string;
    consentedAt: Date | string | null;
    expiresAt: Date | string;
  }>;
};

export type ConsumerCaseView = ReturnType<typeof buildConsumerCaseView>;

type ProgressStep = {
  key: string;
  label: string;
  state: 'done' | 'current' | 'pending';
};

type TimelineItem = {
  id: string;
  kind: 'status' | 'comment' | 'communication';
  title: string;
  detail: string | null;
  date: string;
};

const COMPLETED_STATUSES = new Set(['COMPLETED', 'RESOLVED', 'CLOSED', 'PAID_UP_LETTER_RECEIVED']);
const CONSENT_STATUSES = new Set(['READY_TO_CONSENT', 'ACCEPTED_VIA_DHS', 'ZDM_CLIENT']);
const DOCUMENT_STATUSES = new Set(['CONSENT_RECEIVED', 'AWAITING_DRR_DOCS', 'OUTSTANDING_DOCS']);
const CLEARANCE_STATUSES = new Set(['READY_CLEARANCE', 'CLEARANCE_REQUESTED', 'CLEARANCE_IN_PROGRESS']);

const PROGRESS_STEPS = [
  { key: 'opened', label: 'File opened' },
  { key: 'review', label: 'Assessment' },
  { key: 'consent', label: 'Consent' },
  { key: 'documents', label: 'Documents' },
  { key: 'clearance', label: 'Clearance' },
  { key: 'complete', label: 'Complete' },
] as const;

export function buildConsumerCaseView(caseRecord: ConsumerCaseRecord, financeBaseUrl: string): {
  id: string;
  fileNumber: string;
  title: string;
  type: string;
  status: string;
  statusLabel: string;
  statusDescription: string | null;
  progress: number;
  progressSteps: ProgressStep[];
  currentStep: string;
  nextAction: string;
  nextUpdate: string | null;
  deadline: string | null;
  createdAt: string;
  updatedAt: string;
  consumerDhsStatus: string | null;
  requestedDhsStatus: string | null;
  financials: ReturnType<typeof summariseCaseFinancials>;
  quotes: Array<{
    id: string;
    number: string;
    status: string;
    total: number;
    issuedAt: string;
    dueAt: string;
    acceptedAt: string | null;
    viewUrl: string | null;
    downloadUrl: string | null;
  }>;
  payments: Array<{
    id: string;
    amount: number;
    date: string;
    method: string;
    reference: string | null;
    status: string;
  }>;
  documentRequests: ConsumerCaseRecord['documentRequests'];
  consent: {
    status: string;
    channel: string;
    createdAt: string;
    consentedAt: string | null;
    expiresAt: string;
  } | null;
  timeline: TimelineItem[];
} {
  const progress = getProgress(caseRecord.status);
  const status = getStatusByCode(caseRecord.status);
  const financials = summariseCaseFinancials({
    serviceFee: caseRecord.serviceFee,
    payments: caseRecord.payments,
    invoices: caseRecord.invoices,
  });
  const consent = [...caseRecord.drrConsents]
    .sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt))[0] ?? null;

  return {
    id: caseRecord.id,
    fileNumber: caseRecord.fileNumber,
    title: caseRecord.description || caseRecord.fileNumber || 'Unnamed Case',
    type: caseRecord.category || 'Standard',
    status: caseRecord.status,
    statusLabel: formatStatus(caseRecord.status),
    statusDescription: status?.description ?? null,
    progress: progress.percent,
    progressSteps: progress.steps,
    currentStep: progress.currentStep,
    nextAction: getNextAction(caseRecord.status, caseRecord.documentRequests, consent),
    nextUpdate: toIso(caseRecord.nextUpdate),
    deadline: toIso(caseRecord.deadline),
    createdAt: toIso(caseRecord.createdAt) ?? '',
    updatedAt: toIso(caseRecord.updatedAt) ?? '',
    consumerDhsStatus: caseRecord.consumerDhsStatus,
    requestedDhsStatus: caseRecord.requestedDhsStatus,
    financials,
    quotes: caseRecord.invoices
      .filter(invoice => invoice.type === 'QUOTE')
      .map(invoice => ({
        id: invoice.id,
        number: invoice.invoiceNumber,
        status: invoice.status,
        total: Number(invoice.total),
        issuedAt: toIso(invoice.issuedAt) ?? '',
        dueAt: toIso(invoice.dueAt) ?? '',
        acceptedAt: toIso(invoice.acceptedAt),
        viewUrl: invoice.publicToken ? `/quote/${invoice.publicToken}` : null,
        downloadUrl: invoice.publicToken
          ? `${financeBaseUrl.replace(/\/+$/, '')}/api/public/quotes/${invoice.publicToken}/pdf`
          : null,
      })),
    payments: caseRecord.payments.map(payment => ({
      id: payment.id,
      amount: Number(payment.amount),
      date: toIso(payment.date) ?? '',
      method: payment.method,
      reference: payment.reference,
      status: payment.status,
    })),
    documentRequests: caseRecord.documentRequests,
    consent: consent ? {
      status: consent.status,
      channel: consent.channel,
      createdAt: toIso(consent.createdAt) ?? '',
      consentedAt: toIso(consent.consentedAt),
      expiresAt: toIso(consent.expiresAt) ?? '',
    } : null,
    timeline: buildTimeline(caseRecord),
  };
}

function getProgress(status: string): { percent: number; currentStep: string; steps: ProgressStep[] } {
  const index = getProgressIndex(status);
  return {
    percent: Math.round((index / (PROGRESS_STEPS.length - 1)) * 100),
    currentStep: PROGRESS_STEPS[index].label,
    steps: PROGRESS_STEPS.map((step, i) => ({
      ...step,
      state: i < index ? 'done' : i === index ? 'current' : 'pending',
    })),
  };
}

function getProgressIndex(status: string): number {
  if (COMPLETED_STATUSES.has(status)) return 5;
  if (CLEARANCE_STATUSES.has(status)) return 4;
  if (DOCUMENT_STATUSES.has(status)) return 3;
  if (CONSENT_STATUSES.has(status)) return 2;
  if (status.includes('DHS') || status.includes('ASSESS') || status.includes('REVIEW')) return 1;
  return 0;
}

function getNextAction(
  status: string,
  documentRequests: ConsumerCaseRecord['documentRequests'],
  consent: ConsumerCaseRecord['drrConsents'][number] | null,
): string {
  const openRequests = documentRequests.filter(request => request.status === 'REQUESTED');
  if (openRequests.length > 0) {
    return `Upload ${openRequests.length} requested document${openRequests.length === 1 ? '' : 's'} in Document Vault.`;
  }
  if (consent?.status === 'PENDING') {
    return 'Open the consent link sent to you and approve Zenowethu to continue working on your file.';
  }
  if (status === 'READY_TO_CONSENT') {
    return 'Consent is required before debt review removal work can continue.';
  }
  if (status === 'CONSENT_RECEIVED') {
    return 'Consent is recorded. Zenowethu is checking the documents needed for the next step.';
  }
  if (COMPLETED_STATUSES.has(status)) {
    return 'This file is complete. You can still download statements and view the activity history.';
  }
  return 'Zenowethu is working on the next step. Watch this page for status updates.';
}

function buildTimeline(caseRecord: ConsumerCaseRecord): TimelineItem[] {
  const statusEvents = caseRecord.workflowLogs.map(log => ({
    id: `status-${log.id}`,
    kind: 'status' as const,
    title: formatStatus(log.toStatus),
    detail: log.notes,
    date: toIso(log.timestamp) ?? '',
  }));
  const comments = caseRecord.comments.map(comment => ({
    id: `comment-${comment.id}`,
    kind: 'comment' as const,
    title: comment.activityType === 'CLIENT_COMMENT' ? 'Your comment' : 'Case comment',
    detail: comment.content,
    date: toIso(comment.createdAt) ?? '',
  }));
  const communications = caseRecord.notifications.map(note => ({
    id: `communication-${note.id}`,
    kind: 'communication' as const,
    title: `${note.channel} sent to you`,
    detail: note.message,
    date: toIso(note.sentAt) ?? '',
  }));

  return [...statusEvents, ...comments, ...communications]
    .sort((a, b) => toTime(b.date) - toTime(a.date))
    .slice(0, 30);
}

function toIso(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toTime(value: Date | string | null): number {
  const iso = toIso(value);
  return iso ? new Date(iso).getTime() : 0;
}
