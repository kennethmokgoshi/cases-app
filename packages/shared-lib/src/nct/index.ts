export * from './types';
export * from './browser';
export * from './tracking';
export * from './epurse';
export * from './filing';

import { getBrowser, loginToNCT, closeBrowser } from './browser';
import { getNCTCaseStatus, viewAllNCTCases } from './tracking';
import { getEPurseBalance } from './epurse';
import { submitNCTApplication } from './filing';
import { getNCTCredentials } from '../integrations';
import { logger } from '../logger';

/**
 * High-level service to interact with NCT CMS
 */
export const NCTService = {
    async checkStatus(identityNo: string) {
        const browser = await getBrowser();
        const page = await browser.newPage();
        try {
            const credentials = await getNCTCredentials();
            const loggedIn = await loginToNCT(page, credentials);
            if (!loggedIn) throw new Error('NCT Login failed');

            return await getNCTCaseStatus(page, identityNo);
        } finally {
            await page.close();
        }
    },

    async getBalance() {
        const browser = await getBrowser();
        const page = await browser.newPage();
        try {
            const credentials = await getNCTCredentials();
            const loggedIn = await loginToNCT(page, credentials);
            if (!loggedIn) throw new Error('NCT Login failed');

            return await getEPurseBalance(page);
        } finally {
            await page.close();
        }
    },

    async fileApplication(data: any) {
        const browser = await getBrowser();
        const page = await browser.newPage();
        try {
            const credentials = await getNCTCredentials();
            const loggedIn = await loginToNCT(page, credentials);
            if (!loggedIn) throw new Error('NCT Login failed');

            return await submitNCTApplication(page, data);
        } finally {
            await page.close();
        }
    },

    async shutdown() {
        await closeBrowser();
    }
};
