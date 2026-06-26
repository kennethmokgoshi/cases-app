import { createNextUpdateRoute } from '@zenowethu/shared-lib/src/payments/next-update-route';

// Finance owns its own next-update date, surfaced as the "Next Payment Date".
// It is kept in sync automatically by the payment-arrangement service, but staff
// can also set it manually here.
export const { GET, PATCH } = createNextUpdateRoute('FINANCE');
