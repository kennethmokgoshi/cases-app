/**
 * XDS (TransUnion XDS) Credit Bureau — Browser Lifecycle & Authentication
 * Manages the Puppeteer singleton and XDS login flow.
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { XdsCredentials } from './types';
import { logger } from '../logger';
import { getXDSCredentials } from '../integrations/xds-config';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Puppeteer browser singleton for XDS
let xdsBrowser: Browser | null = null;

export async function getXdsBrowser(): Promise<Browser> {
    if (!xdsBrowser) {
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
        const loginUrl = `${credentials.portalUrl.replace(/\/$/, '')}/login`;
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
        await usernameField.click({ clickCount: 3 });
        await usernameField.type(credentials.username, { delay: 30 });
        await passwordField.click({ clickCount: 3 });
        await passwordField.type(credentials.password, { delay: 30 });

        // --- Submit button ---
        const buttonSelectors = [
            'button[type="submit"]',
            'input[type="submit"]',
            'button:has-text("Login")',
            'button:has-text("Log In")',
            'button:has-text("Sign In")',
            '[data-testid="login-button"]',
            '.login-btn',
            '.btn-login',
        ];
        let loginButton = null;
        for (const sel of buttonSelectors) {
            try {
                loginButton = await page.$(sel);
                if (loginButton) {
                    logger.info(`[XDS] Login button found: ${sel}`);
                    break;
                }
            } catch {
                // continue
            }
        }
        if (!loginButton) {
            // Last resort: find any button containing "login" text
            loginButton = await page.evaluateHandle(() => {
                const buttons = Array.from(document.querySelectorAll('button, input[type=submit]'));
                return buttons.find(b =>
                    b.textContent?.toLowerCase().includes('login') ||
                    b.textContent?.toLowerCase().includes('sign in') ||
                    (b as HTMLInputElement).value?.toLowerCase().includes('login')
                ) || null;
            }) as any;
        }

        if (!loginButton) {
            logger.error('[XDS] Login button not found');
            return false;
        }

        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60_000 }),
            loginButton.click(),
        ]);

        const currentUrl = page.url();
        logger.info(`[XDS] Post-login URL: ${currentUrl}`);

        // Check for failed login indicators
        const pageText = await page.evaluate(() => document.body.innerText);
        if (
            currentUrl.toLowerCase().includes('login') ||
            pageText.toLowerCase().includes('invalid') ||
            pageText.toLowerCase().includes('incorrect') ||
            pageText.toLowerCase().includes('failed')
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
