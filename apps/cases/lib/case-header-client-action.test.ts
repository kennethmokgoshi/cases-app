import { describe, expect, it } from 'vitest';

import { getCaseHeaderClientAction } from './case-header-client-action';

describe('getCaseHeaderClientAction', () => {
    it('shows Manage Client for ZDM client cases', () => {
        expect(getCaseHeaderClientAction({
            status: 'ZDM_CLIENT',
            canManageReferrerConversion: true,
        })).toBe('manage-client');
    });

    it('normalizes display-style ZDM client statuses', () => {
        expect(getCaseHeaderClientAction({
            status: 'zdm client',
            canManageReferrerConversion: true,
        })).toBe('manage-client');
    });

    it('keeps Convert to Referrer for non-ZDM cases', () => {
        expect(getCaseHeaderClientAction({
            status: 'ACCEPTED_VIA_DHS',
            canManageReferrerConversion: true,
        })).toBe('convert-to-referrer');
    });

    it('hides the client action when the user cannot manage referrer conversion', () => {
        expect(getCaseHeaderClientAction({
            status: 'ZDM_CLIENT',
            canManageReferrerConversion: false,
        })).toBeNull();
    });
});
