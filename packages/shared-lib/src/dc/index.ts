/**
 * Debt Counsellor contact-book & outcome-history utilities.
 *
 * email-priority.ts  — 5-slot priority email list (promote / bounce / best)
 * outcome-events.ts  — durable DHS accept/decline event recording
 */

export {
    MAX_PRIORITY_EMAILS,
    normalizeDcEmail,
    promoteDcEmail,
    getDcPriorityEmails,
    getBestDcEmail,
    recordDcEmailBounce,
    seedDcPriorityEmails,
} from './email-priority';
export type { DcEmailSource, DcPriorityEmail, PromoteResult } from './email-priority';

export { recordDhsOutcome } from './outcome-events';
export type { DhsOutcome, RecordOutcomeResult } from './outcome-events';
