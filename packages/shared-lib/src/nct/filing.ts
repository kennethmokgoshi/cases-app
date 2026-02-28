/**
 * NCT (National Consumer Tribunal) — eFiling & Document Management
 * Methods to submit applications and upload required documents.
 */

import { Page } from 'puppeteer';
import { NCT_CONFIG, delay } from './browser';
import type { NCTFilingResult } from './types';
import { logger } from '../logger';

export interface NCTFilingData {
    identityNo: string;
    consumerName: string;
    form138Path: string;
    acceptanceLettersPath: string;
    form17_2Path: string;
    form16APath: string;
    proofOfServicePath: string;
    idCopyPath: string;
}

/**
 * Submit a new Debt Rearrangement Application via eFiling
 */
export async function submitNCTApplication(page: Page, data: NCTFilingData): Promise<NCTFilingResult> {
    try {
        const efilingUrl = `${NCT_CONFIG.baseUrl}/cms/efiling`;
        logger.info(`Starting NCT eFiling for: ${data.identityNo}`);
        await page.goto(efilingUrl, { waitUntil: 'networkidle2', timeout: NCT_CONFIG.timeout });

        // Click 'File Debt Rearrangement Application(s)'
        // Based on description: Use the 'eFiling' link under 'File Debt Rearrangement Application(s)'
        await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            const filingLink = links.find(a => a.innerText.includes('File Debt Rearrangement Application'));
            if (filingLink) filingLink.click();
        });

        await page.waitForNavigation({ waitUntil: 'networkidle2' });

        // Fill in metadata (guessed selectors based on common CMS patterns)
        await page.type('input[name*="idNumber"]', data.identityNo);
        await page.type('input[name*="consumerName"]', data.consumerName);

        // Upload mandatory documents
        const uploads = [
            { label: 'Form TI 138(1)', path: data.form138Path },
            { label: 'Signed Acceptance Letters', path: data.acceptanceLettersPath },
            { label: 'Form 17.2', path: data.form17_2Path },
            { label: 'Form 16A', path: data.form16APath },
            { label: 'Proof of Service', path: data.proofOfServicePath },
            { label: 'SA ID Copy', path: data.idCopyPath }
        ];

        for (const upload of uploads) {
            logger.info(`Uploading ${upload.label}: ${upload.path}`);
            // Find file input near label
            const inputHandle = await page.evaluateHandle((labelText) => {
                const labels = Array.from(document.querySelectorAll('label'));
                const label = labels.find(l => (l as HTMLElement).innerText.toLowerCase().includes(labelText.toLowerCase()));
                if (label && (label as HTMLLabelElement).htmlFor) return document.getElementById((label as HTMLLabelElement).htmlFor);

                // Fallback: look for file input after text
                const textNodes = Array.from(document.querySelectorAll('span, td, div'));
                const node = textNodes.find(n => (n as HTMLElement).innerText.toLowerCase().includes(labelText.toLowerCase()));
                if (node && node.parentElement) return node.parentElement.querySelector('input[type="file"]');

                return null;
            }, upload.label);

            if (inputHandle) {
                const element = inputHandle.asElement() as any;
                if (element) {
                    await element.uploadFile(upload.path);
                    await delay(1000); // Wait for upload state
                }
            } else {
                logger.warn(`Could not find upload field for: ${upload.label}`);
            }
        }

        // Submit application
        await page.click('button[type="submit"], #btnSubmit');
        await page.waitForNavigation({ waitUntil: 'networkidle2' });

        const currentUrl = page.url();
        const bodyText = await page.evaluate(() => document.body.innerText);

        if (bodyText.includes('successfully captured') || currentUrl.includes('success')) {
            // Try to extract case number
            const caseMatch = bodyText.match(/Case\s*(?:No|Number)\s*[:\.]?\s*([A-Z0-9\/]+)/i);
            const caseNumber = caseMatch ? caseMatch[1] : undefined;

            return {
                success: true,
                caseNumber,
                message: 'Application successfully captured by NCT CMS'
            };
        }

        return {
            success: false,
            message: 'Failed to capture application. Please check manual NCT portal.'
        };

    } catch (error: any) {
        logger.error({ err: error }, 'NCT eFiling failed');
        return {
            success: false,
            message: `NCT eFiling error: ${error}`
        };
    }
}

/**
 * Handle Bulk Filing (XML upload)
 */
export async function bulkFileNCTAplications(page: Page, xmlPath: string): Promise<NCTFilingResult> {
    try {
        const bulkUrl = `${NCT_CONFIG.baseUrl}/cms/bulk-filing`;
        logger.info(`Starting NCT Bulk Filing: ${xmlPath}`);
        await page.goto(bulkUrl, { waitUntil: 'networkidle2', timeout: NCT_CONFIG.timeout });

        const fileInput = await page.$('input[type="file"]');
        if (fileInput) {
            await fileInput.uploadFile(xmlPath);
            await page.click('#btnUpload, button[type="submit"]');
            await page.waitForNavigation({ waitUntil: 'networkidle2' });

            return {
                success: true,
                message: 'XML Bulk Filing submitted successfully'
            };
        }

        return { success: false, message: 'Bulk filing input not found' };
    } catch (error: any) {
        logger.error({ err: error }, 'NCT Bulk Filing failed');
        return { success: false, message: `Bulk filing error: ${error}` };
    }
}
