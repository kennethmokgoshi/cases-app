/**
 * XDS (TransUnion XDS) Credit Bureau — Browser Lifecycle & Authentication
 * Manages the Puppeteer singleton and XDS login flow.
 */

import { Browser, Page } from 'puppeteer';
import { XdsCredentials } from './types';
import { logger } from '../logger';
import { getXDSCredentials } from '../integrations/xds-config';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Puppeteer browser singleton for XDS
let xdsBrowser: Browser | null = null;

export async function getXdsBrowser(): Promise<Browser> {
    if (!xdsBrowser) {
        const puppeteer = require('puppeteer');
        xdsBrowser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
            ],
        });
    }
    return xdsBrowser;
}

export async function closeXdsBrowser(): Promise<void> {
    if (xdsBrowser) {
        await xdsBrowser.close();
        xdsBrowser = null;
    }
}

// Re-export so sync.ts can import getXdsCredentials from this file without breaking existing imports
export { getXDSCredentials as getXdsCredentials } from '../integrations/xds-config';

/**
 * Login to the XDS portal.
 * Returns true on success, false on failure.
 */
export async function loginToXds(
    page: Page,
    credentials: XdsCredentials
): Promise<boolean> {
    try {
        const loginUrl = `${credentials.portalUrl.replace(/\/$/, '')}/XDSPortal/Account/Login`;
        logger.info(`[XDS] Navigating to login: ${loginUrl}`);

        await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 60_000 });

        // --- Username field ---
        const usernameSelectors = [
            'input[name="username"]',
            'input[name="UserName"]',
            'input[name="Username"]',
            'input[id="username"]',
            'input[id="Username"]',
            'input[type="text"]',
            'input[placeholder*="sername"]',
            'input[placeholder*="ser"]',
        ];
        let usernameField = null;
        for (const sel of usernameSelectors) {
            usernameField = await page.$(sel);
            if (usernameField) {
                logger.info(`[XDS] Username field found: ${sel}`);
                break;
            }
        }
        if (!usernameField) {
            logger.error('[XDS] Username field not found on login page');
            return false;
        }

        // --- Password field ---
        const passwordSelectors = [
            'input[type="password"]',
            'input[name="password"]',
            'input[name="Password"]',
            'input[id="password"]',
        ];
        let passwordField = null;
        for (const sel of passwordSelectors) {
            passwordField = await page.$(sel);
            if (passwordField) {
                logger.info(`[XDS] Password field found: ${sel}`);
                break;
            }
        }
        if (!passwordField) {
            logger.error('[XDS] Password field not found on login page');
            return false;
        }

        // --- Fill credentials ---
        await page.evaluate((usr, pwd) => {
            const userInput = (document.querySelector('input[name="UserName"]') ||
                document.querySelector('input[name="username"]') ||
                document.querySelector('input[type="text"]')) as HTMLInputElement;
            const passInput = (document.querySelector('input[name="Password"]') ||
                document.querySelector('input[name="password"]') ||
                document.querySelector('input[type="password"]')) as HTMLInputElement;

            if (userInput) {
                userInput.value = usr;
                userInput.dispatchEvent(new Event('input', { bubbles: true }));
                userInput.dispatchEvent(new Event('change', { bubbles: true }));
            }
            if (passInput) {
                passInput.value = pwd;
                passInput.dispatchEvent(new Event('input', { bubbles: true }));
                passInput.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }, credentials.username, credentials.password);

        // --- Submit form ---
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => null),
            page.evaluate(() => {
                const btn = document.querySelector('button[type="submit"], input[type="submit"], .btn-login, button');
                if (btn) {
                    (btn as HTMLElement).click();
                } else {
                    const form = document.querySelector('form');
                    if (form) form.submit();
                }
            }),
        ]);
        await delay(3000);

        const currentUrl = page.url();
        logger.info(`[XDS] Post-login URL: ${currentUrl}`);

        const pageText = await page.evaluate(() => document.body.innerText);
        if (
            (currentUrl.toLowerCase().includes('account/login') && pageText.toLowerCase().includes('log in')) ||
            pageText.toLowerCase().includes('invalid credentials') ||
            pageText.toLowerCase().includes('incorrect username')
        ) {
            logger.error('[XDS] Login appears to have failed');
            return false;
        }

        logger.info('[XDS] Login successful');
        return true;
    } catch (error) {
        logger.error('[XDS] Login error:', error);
        return false;
    }
}

export { delay };
