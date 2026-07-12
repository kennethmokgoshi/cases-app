import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../integrations', () => ({
    getDHSCredentials: vi.fn().mockResolvedValue({ username: 'testuser', password: 'testpassword' }),
}));

vi.mock('./browser', () => ({
    getBrowser: vi.fn().mockResolvedValue({
        newPage: vi.fn().mockResolvedValue({
            goto: vi.fn(),
            screenshot: vi.fn(),
            url: vi.fn().mockReturnValue('https://dhs.co.za'),
            frames: vi.fn().mockReturnValue([]),
            click: vi.fn(),
            type: vi.fn(),
            close: vi.fn(),
            keyboard: { press: vi.fn() },
            $: vi.fn().mockResolvedValue('#idInput'),
            evaluate: vi.fn().mockResolvedValue({
                noRecords: false,
                hasDisplayingRecords: true,
                hasIdInText: true,
                bodySnippet: 'Displaying records 1 - 1'
            })
        }),
    }),
    loginToDHS: vi.fn().mockResolvedValue(true),
    delay: vi.fn(),
    DHS_CONFIG: {
        requestTransferUrl: 'https://dhs.co.za/RequestNewTransfer.aspx',
        timeout: 10000,
    },
}));

vi.mock('./extraction', () => ({
    extractConsumerInfo: vi.fn().mockResolvedValue({
        identityNo: '8805275493082',
        surname: 'SITHOLE',
        firstNames: 'MSIZI',
        gender: 'Male',
        status: 'C',
        transferIndicator: 'Y',
        debtCounsellor: 'NCRDC3541',
        province: 'KwaZulu-Natal',
    }),
    getDeclineReason: vi.fn(),
}));

vi.mock('./counsellor', () => ({
    getDebtCounsellorInfo: vi.fn().mockResolvedValue({
        fullName: 'Sebastien Alexanderson',
        tradingName: 'National Debt Advisors',
        operatingStatus: 'Operating',
        tel: '0210038733',
        mobile: '0821112222',
        email: 'seb@nda.co.za',
        province: 'Western Cape',
        ncrRegistrationNo: 'NCRDC3541',
    }),
}));

import { searchConsumer } from './search';
import { getDebtCounsellorInfo } from './counsellor';

describe('searchConsumer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('successfully searches a consumer and populates debt counsellor details', async () => {
        const result = await searchConsumer('8805275493082');

        expect(result.found).toBe(true);
        expect(result.consumer?.identityNo).toBe('8805275493082');
        expect(result.debtCounsellor?.fullName).toBe('Sebastien Alexanderson');
        expect(result.debtCounsellor?.ncrRegistrationNo).toBe('NCRDC3541');
        expect(getDebtCounsellorInfo).toHaveBeenCalled();
    });
});
