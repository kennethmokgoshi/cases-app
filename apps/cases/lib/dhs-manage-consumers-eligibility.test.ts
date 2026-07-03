import { describe, expect, it } from 'vitest';

import { canShowDhsManageConsumers } from './dhs-manage-consumers-eligibility';

describe('canShowDhsManageConsumers', () => {
    it('shows Manage Consumers for ZDM client workflow status', () => {
        expect(canShowDhsManageConsumers({
            status: 'ZDM_CLIENT',
            dhsStatus: null,
            manuallyAcceptedViaDhs: false,
        })).toBe(true);
    });

    it('shows Manage Consumers for display-style ZDM client status', () => {
        expect(canShowDhsManageConsumers({
            status: 'ZDM Client',
            dhsStatus: null,
            manuallyAcceptedViaDhs: false,
        })).toBe(true);
    });

    it('keeps the existing Accepted via DHS behavior', () => {
        expect(canShowDhsManageConsumers({
            status: 'ACCEPTED_VIA_DHS',
            dhsStatus: null,
            manuallyAcceptedViaDhs: false,
        })).toBe(true);
    });

    it('shows Manage Consumers when the manual accepted override is ticked', () => {
        expect(canShowDhsManageConsumers({
            status: 'REQUESTED_VIA_DHS',
            dhsStatus: 'PENDING',
            manuallyAcceptedViaDhs: true,
        })).toBe(true);
    });

    it('hides Manage Consumers for requested or pending files', () => {
        expect(canShowDhsManageConsumers({
            status: 'REQUESTED_VIA_DHS',
            dhsStatus: 'PENDING',
            manuallyAcceptedViaDhs: false,
        })).toBe(false);
    });
});
