import { beforeEach, describe, expect, it, vi } from 'vitest';

const { page } = vi.hoisted(() => ({
    page: {
        goto: vi.fn(),
        reload: vi.fn(),
        $: vi.fn(),
        click: vi.fn(),
        keyboard: { press: vi.fn() },
        type: vi.fn(),
        screenshot: vi.fn(),
        close: vi.fn(),
        frames: vi.fn(),
        on: vi.fn(),
    },
}));

vi.mock('./browser', () => ({
    DHS_CONFIG: {
        baseUrl: 'https://www.ncrdebthelp.co.za',
        searchManageConsumerUrl: 'https://www.ncrdebthelp.co.za/dhs_SearchManageConsumer.aspx',
        timeout: 60000,
    },
    delay: vi.fn().mockResolvedValue(undefined),
    getBrowser: vi.fn().mockResolvedValue({ newPage: vi.fn().mockResolvedValue(page) }),
    loginToDHS: vi.fn().mockResolvedValue(true),
}));

vi.mock('../integrations', () => ({
    getDHSCredentials: vi.fn().mockResolvedValue({ username: 'user', password: 'pass' }),
}));

import { delay } from './browser';
import {
    DHS_UNSUSPEND_CONSUMER_SERVICES_REASON,
    getConsumerSuspensionIndicator,
    unsuspendConsumerServices,
} from './status-history';

const suspendedRow = {
    cells: ['actions', '8001015009087', 'Y'],
    signals: {
        buttonClass: 'btn btn-success btn-xs',
        buttonTitle: 'Unsuspend Consumer Services',
        suspIndCell: 'Y',
    },
};

const activeRow = {
    cells: ['actions', '8001015009087', 'N'],
    signals: {
        buttonClass: 'btn btn-danger btn-xs',
        buttonTitle: 'Suspend Consumer Services',
        suspIndCell: 'N',
    },
};

beforeEach(() => {
    vi.clearAllMocks();
    page.goto.mockResolvedValue(undefined);
    page.reload.mockResolvedValue(undefined);
    page.$.mockImplementation(async (selector: string) =>
        selector === '#ContentPlaceHolder1_txtRSAIDNo' || selector === '#cp_pagedata_lb_ApplyDataFilter'
            ? {}
            : null,
    );
    page.click.mockResolvedValue(undefined);
    page.keyboard.press.mockResolvedValue(undefined);
    page.type.mockResolvedValue(undefined);
    page.screenshot.mockResolvedValue(undefined);
    page.close.mockResolvedValue(undefined);
});

describe('DHS suspension actions', () => {
    it('reads the Search & Manage Consumer suspension state before clearance work', async () => {
        page.frames.mockReturnValue([
            {
                evaluate: vi.fn().mockResolvedValue(suspendedRow),
            },
        ]);

        const result = await getConsumerSuspensionIndicator('8001015009087');

        expect(result.found).toBe(true);
        expect(result.suspension?.status).toBe('SUSPENDED');
        expect(result.message).toContain('SUSPENDED');
    });

    it('clicks Unsuspend only when DHS shows services are suspended', async () => {
        let readCount = 0;
        const frame = {
            evaluate: vi.fn(async (script: string) => {
                if (script.includes('signals:')) {
                    readCount += 1;
                    return readCount === 1 ? suspendedRow : activeRow;
                }
                if (script.includes('btn.click();')) return true;
                if (script.includes('textarea.value = reason')) {
                    expect(script).toContain(DHS_UNSUSPEND_CONSUMER_SERVICES_REASON);
                    return true;
                }
                if (script.includes("text.indexOf('unsuspend consumer debt counsellor services')")) return true;
                if (script.includes("text.indexOf('continue')")) return true;
                return null;
            }),
        };
        page.frames.mockReturnValue([frame]);

        const result = await unsuspendConsumerServices('8001015009087');

        expect(result.success).toBe(true);
        expect(result.unsuspended).toBe(true);
        expect(result.before?.status).toBe('SUSPENDED');
        expect(result.after?.status).toBe('NOT_SUSPENDED');
        expect(delay).toHaveBeenCalledWith(30000);
        expect(page.reload).toHaveBeenCalledWith({ waitUntil: 'load', timeout: 60000 });
        expect(page.type).toHaveBeenCalledWith('#ContentPlaceHolder1_txtRSAIDNo', '8001015009087', { delay: 80 });
    });

    it('does not report success when the DHS reason dialog cannot be completed', async () => {
        const frame = {
            evaluate: vi.fn(async (script: string) => {
                if (script.includes('signals:')) return suspendedRow;
                if (script.includes('btn.click();')) return true;
                if (script.includes('textarea.value = reason')) return false;
                return null;
            }),
        };
        page.frames.mockReturnValue([frame]);

        const result = await unsuspendConsumerServices('8001015009087');

        expect(result.success).toBe(false);
        expect(result.unsuspended).toBe(false);
        expect(result.message).toContain('required reason');
        expect(delay).not.toHaveBeenCalledWith(30000);
        expect(page.reload).not.toHaveBeenCalled();
    });
});
