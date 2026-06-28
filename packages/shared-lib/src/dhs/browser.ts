/**
 * DHS (NCR Debt Help System) — Browser Lifecycle & Authentication
 * Manages the Puppeteer singleton and DHS login flow.
 */

import type { Browser, Page } from 'puppeteer';
import { getDHSCredentials } from '../integrations';
import { logger } from '../logger';

// Helper function to wait - replaces deprecated page.waitForTimeout
export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// DHS Configuration (credentials are now fetched dynamically from database)
export const DHS_CONFIG = {
    baseUrl: 'https://www.ncrdebthelp.co.za',
    loginUrl: 'https://www.ncrdebthelp.co.za/dhs_Login.aspx',
    manageTransfersUrl: 'https://www.ncrdebthelp.co.za/dhs_ManageRequestTransfers.aspx',
    requestTransferUrl: 'https://www.ncrdebthelp.co.za/dhs_RequestNewTransfer.aspx',
    searchManageConsumerUrl: 'https://www.ncrdebthelp.co.za/dhs_SearchManageConsumer.aspx',
    timeout: 60000  // Increased to 60 seconds for slow DHS responses
};

// Browser singleton
let browser: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
    if (!browser) {
        const puppeteer = require('puppeteer');
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
 * Login to DHS portal
 */
export async function loginToDHS(page: Page, credentials: { username: string; password: string }): Promise<boolean> {
    try {
        logger.info('Navigating to DHS login page:', DHS_CONFIG.loginUrl);
        await page.goto(DHS_CONFIG.loginUrl, { waitUntil: 'load', timeout: DHS_CONFIG.timeout });

        // Wait for login form - try multiple possible selectors
        const usernameSelectors = [
            'input[type="text"]',
            'input[name*="Username"]',
            'input[name*="user"]',
            'input[id*="Username"]',
            'input[id*="user"]',
            '#txtUsername',
            '#ContentPlaceHolder1_txtUsername'
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
            logger.error('Could not find username field');
            return false;
        }

        // Find password field
        const passwordSelectors = [
            'input[type="password"]',
            'input[name*="Password"]',
            'input[name*="pass"]',
            'input[id*="Password"]',
            '#txtPassword',
            '#ContentPlaceHolder1_txtPassword'
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
            logger.error('Could not find password field');
            return false;
        }

        // Enter credentials (from database/config)
        await usernameField.type(credentials.username);
        await passwordField.type(credentials.password);

        // Find and click login button - look for "Proceed | LogIn" button
        const buttonSelectors = [
            'input[type="submit"][value*="Login"]',
            'input[type="submit"][value*="Proceed"]',
            'button:has-text("Login")',
            'input[name*="btnLogin"]',
            'input[name*="Login"]',
            '#btnLogin',
            '#ContentPlaceHolder1_btnLogin',
            '.btn-success',
            'input.btn-success'
        ];

        let loginButton = null;
        for (const selector of buttonSelectors) {
            try {
                loginButton = await page.$(selector);
                if (loginButton) {
                    logger.info('Found login button with selector:', selector);
                    break;
                }
            } catch (e) {
                // Continue trying other selectors
            }
        }

        if (!loginButton) {
            // Try to find any submit button
            loginButton = await page.$('input[type="submit"]');
            logger.info('Using generic submit button');
        }

        if (!loginButton) {
            logger.error('Could not find login button');
            return false;
        }

        // Click login button
        await loginButton.click();

        // Wait for navigation after login
        await page.waitForNavigation({ waitUntil: 'load', timeout: DHS_CONFIG.timeout });

        // Verify login success by checking URL or page content
        const currentUrl = page.url();
        logger.info('After login, current URL:', currentUrl);

        // If we're no longer on the login page, assume success
        const isLoggedIn = !currentUrl.includes('Login');

        return isLoggedIn;
    } catch (error) {
        logger.error('DHS Login failed:', error);
        return false;
    }
}
