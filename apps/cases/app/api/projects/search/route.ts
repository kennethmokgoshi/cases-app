import { createOrgSearchRoute } from '@zenowethu/shared-lib/src/search/org-search-route';
import { hasFullReferrerVisibility, getVisibleReferrerProjectIds } from '@/lib/referrer-access';

// Referrers in the org search are membership-scoped exactly like the referrer
// registry: admins see all, everyone else only referrers whose sub-project
// they belong to.
export const { GET } = createOrgSearchRoute({
    resolveReferrerScope: async (user) =>
        hasFullReferrerVisibility(user) ? null : getVisibleReferrerProjectIds(user.id),
});
