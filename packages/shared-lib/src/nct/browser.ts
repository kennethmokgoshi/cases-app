/**
 * NCT (National Consumer Tribunal) — Browser Lifecycle & Authentication
 * Manages the Puppeteer singleton and NCT login flow.
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { getNCTCredentials } from '../integrations';
import { logger } from '../logger'; // Using relative import to avoid lint issues for now

// Helper function to wait
export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// NCT Configuration
export const NCT_CONFIG = {
    baseUrl: 'https://www.thenct.org.za',
    loginUrl: 'https://www.thenct.org.za/cms/login', // Guessed common CMS login path
    efilingUrl: 'https://www.thenct.org.za/cms/efiling',
    epurseUrl: 'https://www.thenct.org.za/cms/epurse',
    timeout: 60000
};

// Browser singleton
let browser: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
    if (!browser) {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
    }
    return browser;
}

export async function closeBrowser(): Promise<void> {
    if (browser) {
        await browser.close();
        browser = null;
    }
}

/**
 * Login to NCT CMS portal
 */
export async function loginToNCT(page: Page, credentials: { username: string; password: string }): Promise<boolean> {
    try {
        logger.info('Navigating to NCT login page:', NCT_CONFIG.loginUrl);
        await page.goto(NCT_CONFIG.loginUrl, { waitUntil: 'networkidle2', timeout: NCT_CONFIG.timeout });

        // Wait for login form
        const usernameSelectors = [
            'input[name*="username"]',
            'input[name*="email"]',
            'input[id*="username"]',
            'input[id*="email"]',
            '#username',
            '#email'
        ];

        let usernameField = null;
        for (const selector of usernameSelectors) {
            usernameField = await page.$(selector);
            if (usernameField) {
                logger.info('Found username field with selector:', selector);
                break;
            }
        }

        if (!usernameField) {
            logger.error('Could not find NCT username field');
            return false;
        }

        // Find password field
        const passwordSelectors = [
            'input[type="password"]',
            'input[name*="password"]',
            '#password'
        ];

        let passwordField = null;
        for (const selector of passwordSelectors) {
            passwordField = await page.$(selector);
            if (passwordField) {
                logger.info('Found password field with selector:', selector);
                break;
            }
        }

        if (!passwordField) {
            logger.error('Could not find NCT password field');
            return false;
        }

        // Enter credentials
        await usernameField.type(credentials.username);
        await passwordField.type(credentials.password);

        // Find and click login button
        const buttonSelectors = [
            'button[type="submit"]',
            'input[type="submit"]',
            'button:contains("Login")',
            '#btnLogin',
            '.btn-primary'
        ];

        let loginButton = null;
        for (const selector of buttonSelectors) {
            try {
                loginButton = await page.$(selector);
                if (loginButton) {
                    logger.info('Found login button with selector:', selector);
                    break;
                }
            } catch (e) { }
        }

        if (!loginButton) {
            logger.error('Could not find NCT login button');
            return false;
        }

        // Click login button
        await loginButton.click();

        // Wait for navigation
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: NCT_CONFIG.timeout });

        const currentUrl = page.url();
        logger.info('After login, current URL:', currentUrl);

        // If we're no longer on the login page and URL suggests dashboard/cms, assume success
        const isLoggedIn = !currentUrl.includes('login') &&
            (currentUrl.includes('cms') || currentUrl.includes('dashboard'));

        return isLoggedIn;
    } catch (error) {
        logger.error('NCT Login failed:', error);
        return false;
    }
}
