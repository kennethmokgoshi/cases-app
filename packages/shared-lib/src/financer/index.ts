/**
 * Vehicle-financer correspondence.
 *
 * repossession-letter.ts   — pure letter builder + vehicle-account hint
 * repossession-enquiry.ts  — prepare / preview / send for the case button
 *
 * Server-only (Prisma). Deep-import it: `@zenowethu/shared-lib/src/financer`.
 */

export {
    buildRepossessionEnquiryLetter,
    describeVehicle,
    formatLetterDate,
    isLikelyVehicleAccount,
} from './repossession-letter';
export type { RepossessionLetter, RepossessionLetterInput } from './repossession-letter';

export {
    DEFAULT_REPLY_BUSINESS_DAYS,
    DEFAULT_PAUSE_BUSINESS_DAYS,
    RepossessionEnquiryInputSchema,
    prepareRepossessionEnquiry,
    processRepossessionEnquiry,
} from './repossession-enquiry';
export type {
    EnquiryAccountOption,
    RepossessionEnquiryContext,
    RepossessionEnquiryFailure,
    RepossessionEnquiryInput,
    RepossessionEnquiryResult,
} from './repossession-enquiry';
