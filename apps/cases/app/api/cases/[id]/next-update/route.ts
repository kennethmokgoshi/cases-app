import { createNextUpdateRoute } from '@zenowethu/shared-lib/src/payments/next-update-route';

// The Cases app owns its own next-update date — isolated from the other apps.
export const { GET, PATCH } = createNextUpdateRoute('CASES');
