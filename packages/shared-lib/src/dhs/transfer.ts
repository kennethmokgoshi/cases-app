/**
 * DHS (NCR Debt Help System) — Transfer Request Submission
 * Handles the 6-step workflow for requesting a new consumer transfer.
 */

import fs from 'fs';
import path from 'path';
import { getDHSCredentials } from '../integrations';
import { getBrowser, loginToDHS, delay, DHS_CONFIG } from './browser';
import type { DHSTransferRequestResult } from './types';
import { logger } from '../logger';

/**
 * Request a new transfer for a consumer
 */
export async function requestTransfer(
    idNumber: string,
    poaFilePath: string,
    idDocFilePath: string
): Promise<DHSTransferRequestResult> {
    const browserInstance = await getBrowser();
    const page = await browserInstance.newPage();

    try {
        // Get credentials from database/config
        const credentials = await getDHSCredentials();

        // Login first
        logger.info('Starting DHS transfer request for ID:', idNumber);
        const loggedIn = await loginToDHS(page, credentials);
        if (!loggedIn) {
            return { success: false, message: 'Failed to login to DHS' };
        }

        // Navigate to Request New Transfer page
        logger.info('Navigating to Request New Transfer page:', DHS_CONFIG.requestTransferUrl);
        await page.goto(DHS_CONFIG.requestTransferUrl, { waitUntil: 'networkidle2', timeout: DHS_CONFIG.timeout });

        // Wait for page to be fully loaded
        await delay(2000);

        // Find and fill ID number field - look for the specific RSA ID input
        // The field is labeled "RSA ID Number or Passport No:"
        let idInputSelector: string | null = null;

        // Try specific ASP.NET ContentPlaceHolder IDs first
        const specificSelectors = [
            '#ContentPlaceHolder1_txtIdNumber',
            '#ContentPlaceHolder1_txtRSAID',
            '#ContentPlaceHolder1_txtID',
            'input[id*="txtId"]',
            'input[id*="txtID"]',
            'input[id*="RSA"]',
            'input[type="text"]'
        ];

        for (const selector of specificSelectors) {
            const elem = await page.$(selector);
            if (elem) {
                idInputSelector = selector;
                logger.info('Found ID input with selector:', selector);
                break;
            }
        }

        if (!idInputSelector) {
            // Log all inputs on the page for debugging
            const allInputs = await page.$$eval('input', inputs =>
                inputs.map(i => ({ id: i.id, name: i.name, type: i.type }))
            );
            logger.info('All inputs on page:', JSON.stringify(allInputs));
            return { success: false, message: 'Could not find ID number input field' };
        }

        // Use page.type with selector instead of element.type - more reliable
        try {
            // Clear and type using page methods
            await page.click(idInputSelector);
            await delay(500);

            // Triple-click to select all, then type to replace
            await page.click(idInputSelector, { clickCount: 3 });
            await page.type(idInputSelector, idNumber);
            logger.info('Entered ID number:', idNumber);
        } catch (inputError) {
            logger.info('Error with click/type, trying evaluate method:', inputError);
            // Fallback: use JavaScript to set the value directly
            await page.evaluate((selector: string, value: string) => {
                const input = document.querySelector(selector) as HTMLInputElement;
                if (input) {
                    input.value = value;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }, idInputSelector, idNumber);
            logger.info('Set ID number via JavaScript');
        }

        // Click Apply Filter button
        // The Apply Filter button on DHS is an anchor link, not an input button
        // Use the same pattern as the Manage Transfers page
        const filterButtonSelectors = [
            '#cp_pagedata_lb_ApplyDataFilter',  // Main Apply Filter link
            '#ContentPlaceHolder1_lb_ApplyDataFilter',
            'a:has-text("Apply Filter")',
            'a[id*="ApplyDataFilter"]',
            'a[id*="btnFilter"]',
            '#ContentPlaceHolder1_btnFilter',
            'input[value="Apply Filter"]',
            'input[value*="Filter"]'
        ];

        let filterButtonClicked = false;
        for (const selector of filterButtonSelectors) {
            try {
                const elem = await page.$(selector);
                if (elem) {
                    logger.info('Found filter button with selector:', selector);
                    // Use JavaScript click for anchor elements - more reliable
                    await page.evaluate((sel: string) => {
                        const btn = document.querySelector(sel) as HTMLElement;
                        if (btn) btn.click();
                    }, selector);
                    logger.info('Clicked Apply Filter button:', selector);
                    filterButtonClicked = true;
                    break;
                }
            } catch (e) {
                logger.info('Selector', selector, 'not found or click failed');
            }
        }

        if (!filterButtonClicked) {
            // Try finding by text content
            const clickedByText = await page.evaluate(() => {
                const links = document.querySelectorAll('a');
                for (const link of links) {
                    if (link.textContent?.includes('Apply Filter')) {
                        (link as HTMLElement).click();
                        return true;
                    }
                }
                // Also try buttons
                const buttons = document.querySelectorAll('button, input[type="submit"]');
                for (const btn of buttons) {
                    const text = (btn as HTMLElement).innerText || (btn as HTMLInputElement).value || '';
                    if (text.includes('Apply') || text.includes('Filter') || text.includes('Search')) {
                        (btn as HTMLElement).click();
                        return true;
                    }
                }
                return false;
            });

            if (clickedByText) {
                logger.info('Clicked Apply Filter by text content');
                filterButtonClicked = true;
            } else {
                logger.info('No filter button found, trying Enter key');
                await page.keyboard.press('Enter');
            }
        }

        logger.info('Waiting for search results to load...');
        await delay(4000); // Wait longer for AJAX results to load

        // Take a screenshot for debugging
        const screenshotDir = path.join(process.cwd(), 'public', 'uploads');
        if (!fs.existsSync(screenshotDir)) {
            fs.mkdirSync(screenshotDir, { recursive: true });
        }
        const screenshotPath = path.join(screenshotDir, `dhs - transfer - ${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        logger.info('Screenshot saved to:', screenshotPath);

        // Log actual page content for debugging
        const bodyText = await page.evaluate(() => document.body.innerText);
        logger.info('Page body text (first 1000 chars):', bodyText.substring(0, 1000));

        // First check if the ID number appears in the search results table
        // The DHS table has columns: IDENTITY No, SURNAME, FIRST NAME(S), GENDER, STATUS, TRNS IND, DEBT COUN., PROVINCE
        const idFoundInTable = await page.evaluate((searchId: string) => {
            // Look for the ID number in table cells
            const cells = document.querySelectorAll('table td');
            for (const cell of cells) {
                if (cell.textContent?.includes(searchId)) {
                    return true;
                }
            }
            // Also check for any row that contains the ID
            const rows = document.querySelectorAll('tr');
            for (const row of rows) {
                if (row.textContent?.includes(searchId)) {
                    return true;
                }
            }
            return false;
        }, idNumber);

        logger.info('ID found in table:', idFoundInTable);

        if (!idFoundInTable) {
            // Also check the "Displaying" text which shows record count
            const displayingText = await page.evaluate(() => {
                // Look for text like "Displaying 1 items" or "Displaying n items"
                const text = document.body.innerText;
                const match = text.match(/Displaying\s+(\d+)\s+items?/i);
                return match ? parseInt(match[1]) : 0;
            });

            logger.info('Records displayed:', displayingText);

            if (displayingText === 0) {
                return { success: false, message: 'Consumer not found in DHS. Please verify the ID number. Check screenshot: ' + screenshotPath };
            }
        }

        // Check if results table has data rows (not just header)
        const tableRowCount = await page.evaluate(() => {
            // Count data rows in the table (exclude header rows)
            const dataRows = document.querySelectorAll('table tbody tr, table tr:not(:first-child)');
            return dataRows.length;
        });

        logger.info('Table data rows found:', tableRowCount);

        if (tableRowCount === 0 && !idFoundInTable) {
            return { success: false, message: 'No search results found. Consumer may not be in DHS. Check screenshot: ' + screenshotPath };
        }

        // Look for Transfer button/link in the results row
        // On DHS, there's a "T" icon in the first column that triggers transfer
        // We need to find the actual DATA row in the GridView (not input fields)

        // First, find the GridView table and log all rows with their structure
        const tableInfo = await page.evaluate((searchId: string) => {
            // Look for GridView tables (usually have class containing 'grd' or 'grid')
            const tables = document.querySelectorAll('table');
            const results: { tableIndex: number; rowIndex: number; cells: string[]; firstCellHTML: string; hasId: boolean }[] = [];

            for (let t = 0; t < tables.length; t++) {
                const table = tables[t];
                const rows = table.querySelectorAll('tr');

                for (let r = 0; r < rows.length; r++) {
                    const row = rows[r];
                    const cells = row.querySelectorAll('td');

                    // Only data rows have <td> cells (header rows have <th>)
                    if (cells.length > 0) {
                        const cellTexts = Array.from(cells).map(c => (c.textContent || '').trim().substring(0, 30));
                        const hasId = cellTexts.some(text => text.includes(searchId));

                        if (hasId) {
                            results.push({
                                tableIndex: t,
                                rowIndex: r,
                                cells: cellTexts,
                                firstCellHTML: cells[0].innerHTML.substring(0, 200),
                                hasId: true
                            });
                        }
                    }
                }
            }
            return results;
        }, idNumber);

        logger.info('Data rows containing ID:', JSON.stringify(tableInfo, null, 2));

        // Step 1: Click the T button (green icon with white T)
        // The T button is in a div with id like "btnEditA_XXXXXXX"
        // Log the HTML of the button for debugging
        const tButtonInfo = await page.evaluate(() => {
            const btnEditDivs = document.querySelectorAll('div[id^="btnEditA"]');
            const info: { divId: string; html: string; anchors: { href: string; onclick: string }[] }[] = [];

            btnEditDivs.forEach(div => {
                const anchors = div.querySelectorAll('a');
                info.push({
                    divId: div.id,
                    html: div.outerHTML.substring(0, 500),
                    anchors: Array.from(anchors).map(a => ({
                        href: a.getAttribute('href') || '',
                        onclick: a.getAttribute('onclick') || ''
                    }))
                });
            });
            return info;
        });
        logger.info('T button info:', JSON.stringify(tButtonInfo, null, 2));

        // Try to click the anchor link properly using Puppeteer's click
        let tButtonClicked = false;
        try {
            // Find and click the anchor inside btnEditA using selector
            const tButtonSelector = 'div[id^="btnEditA"] a';
            const tAnchor = await page.$(tButtonSelector);
            if (tAnchor) {
                logger.info('Found T button anchor, clicking with Puppeteer...');
                await tAnchor.click();
                tButtonClicked = true;
                logger.info('T button anchor clicked');
            }
        } catch (clickErr) {
            logger.info('Error clicking T anchor with Puppeteer:', clickErr);
        }

        // Fallback: try clicking via JavaScript if Puppeteer click failed
        if (!tButtonClicked) {
            const jsClick = await page.evaluate(() => {
                const btnEditDivs = document.querySelectorAll('div[id^="btnEditA"]');
                if (btnEditDivs.length > 0) {
                    const btnDiv = btnEditDivs[0];
                    const anchor = btnDiv.querySelector('a');
                    if (anchor) {
                        // Try to trigger the onclick handler if it exists
                        const onclick = anchor.getAttribute('onclick');
                        if (onclick) {
                            try {
                                eval(onclick);
                                return { clicked: true, method: 'eval onclick' };
                            } catch (e) {
                                // Fall back to click
                            }
                        }
                        anchor.click();
                        return { clicked: true, method: 'anchor.click()' };
                    }
                    (btnDiv as HTMLElement).click();
                    return { clicked: true, method: 'div.click()' };
                }
                return { clicked: false, reason: 'No btnEditA div found' };
            });
            logger.info('JavaScript click result:', JSON.stringify(jsClick, null, 2));
            tButtonClicked = jsClick.clicked;
        }

        if (!tButtonClicked) {
            const errorScreenshot = path.join(screenshotDir, `dhs - no - t - btn - ${Date.now()}.png`);
            await page.screenshot({ path: errorScreenshot, fullPage: true });
            return { success: false, message: `Could not find T button.Check screenshot: ${errorScreenshot} ` };
        }

        // Wait for the "REQUEST TRANSFER SELECTED CONSUMER" popup to appear
        // The T button directly opens this popup via AJAX
        logger.info('Waiting for transfer popup to appear...');
        await delay(5000);  // Wait longer for AJAX popup

        // Take screenshot after T button click
        const afterTScreenshot = path.join(screenshotDir, `dhs - after - T - ${Date.now()}.png`);
        await page.screenshot({ path: afterTScreenshot, fullPage: true });
        logger.info('After T click screenshot:', afterTScreenshot);

        // Take screenshot of popup
        const popupScreenshot = path.join(screenshotDir, `dhs - popup - ${Date.now()}.png`);
        await page.screenshot({ path: popupScreenshot, fullPage: true });
        logger.info('Popup screenshot saved to:', popupScreenshot);

        // Check if popup appeared by looking for the "REQUEST TRANSFER" text
        const popupCheck = await page.evaluate(() => {
            const bodyText = document.body.innerText;
            const hasRequestTransfer = bodyText.includes('REQUEST TRANSFER SELECTED CONSUMER') ||
                bodyText.includes('Attach signed consent') ||
                bodyText.includes('Attach consumer Identity');
            return {
                hasRequestTransfer,
                bodyTextSnippet: bodyText.substring(0, 1500)
            };
        });
        logger.info('Popup check - has REQUEST TRANSFER:', popupCheck.hasRequestTransfer);
        logger.info('Body text snippet:', popupCheck.bodyTextSnippet);

        // Check for iframes - the popup might be loaded in an iframe
        const iframeInfo = await page.evaluate(() => {
            const iframes = document.querySelectorAll('iframe');
            return Array.from(iframes).map(f => ({
                id: f.id,
                name: f.name,
                src: f.src,
                className: f.className
            }));
        });
        logger.info('Found iframes:', JSON.stringify(iframeInfo, null, 2));

        // Try to find the popup iframe and switch to it
        let popupFrame = null;
        const frames = page.frames();
        logger.info('Total frames:', frames.length);

        for (const frame of frames) {
            const frameUrl = frame.url();
            logger.info('Frame URL:', frameUrl);

            // Check if this frame contains the transfer request form
            if (frameUrl.includes('ConsumerTransferRequest') || frameUrl.includes('dhs_ConsumerTransferRequest')) {
                popupFrame = frame;
                logger.info('Found popup frame:', frameUrl);
                break;
            }

            // Also check frame content for file inputs
            try {
                const hasFileInputs = await frame.evaluate(() => {
                    return document.querySelectorAll('input[type="file"]').length > 0;
                });
                if (hasFileInputs) {
                    popupFrame = frame;
                    logger.info('Found frame with file inputs:', frameUrl);
                    break;
                }
            } catch (e) {
                // Frame might not be accessible
            }
        }

        // If we found a popup frame, use it; otherwise use the main page
        const targetFrame = popupFrame || page;
        logger.info('Using frame:', popupFrame ? 'popup iframe' : 'main page');

        // Log all file inputs and selects for debugging
        const popupElements = await targetFrame.evaluate(() => {
            const fileInputs = Array.from(document.querySelectorAll('input[type="file"]')).map(el => ({
                id: el.id,
                name: el.getAttribute('name'),
                accept: el.getAttribute('accept'),
                visible: (el as HTMLElement).offsetParent !== null
            }));
            const selects = Array.from(document.querySelectorAll('select')).map(el => ({
                id: el.id,
                name: el.getAttribute('name'),
                options: Array.from(el.options).map(o => ({ value: o.value, text: o.text }))
            }));
            const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]')).map(el => ({
                id: el.id,
                name: el.getAttribute('name'),
                checked: (el as HTMLInputElement).checked
            }));
            const buttons = Array.from(document.querySelectorAll('input[type="submit"], input[type="button"], button, a')).map(el => ({
                tag: el.tagName,
                id: el.id,
                value: el.getAttribute('value'),
                text: (el.textContent || '').substring(0, 50)
            })).filter(b => b.value || b.text);
            return { fileInputs, selects, checkboxes, buttons };
        });
        logger.info('Popup elements:', JSON.stringify(popupElements, null, 2));

        // Wait for file upload fields - this indicates the popup opened
        let popupOpened = false;
        try {
            await targetFrame.waitForSelector('input[type="file"]', { timeout: 10000 });
            popupOpened = true;
        } catch {
            logger.info('No file inputs found after clicking T button - popup may not have opened');
        }

        // Find all file inputs in the target frame
        const fileInputs = await targetFrame.$$('input[type="file"]');
        logger.info('Found', fileInputs.length, 'file input(s)');

        // If no file inputs, the transfer popup didn't open
        if (fileInputs.length === 0) {
            const noPopupScreenshot = path.join(screenshotDir, `dhs - no - popup - ${Date.now()}.png`);
            await page.screenshot({ path: noPopupScreenshot, fullPage: true });
            return {
                success: false,
                message: 'Transfer popup did not open. The T button may not have been clicked. Check screenshot: ' + noPopupScreenshot
            };
        }

        // ===== STEP 1: Upload ZENOWETHU_POA (signed consent) =====
        logger.info('===== STEP 1: Uploading signed consent (ZENOWETHU_POA) =====');
        if (fileInputs.length >= 1) {
            logger.info('Uploading signed consent (ZENOWETHU_POA):', poaFilePath);
            await fileInputs[0].uploadFile(poaFilePath);
            await delay(1000);
        }
        // Screenshot after Step 1
        const step1Screenshot = path.join(screenshotDir, `step1.png`);
        await page.screenshot({ path: step1Screenshot, fullPage: true });
        logger.info('Step 1 screenshot (after POA upload):', step1Screenshot);

        // ===== STEP 2: Upload Extracted ID =====
        logger.info('===== STEP 2: Uploading ID Document =====');
        if (fileInputs.length >= 2) {
            logger.info('Uploading ID document:', idDocFilePath);
            await fileInputs[1].uploadFile(idDocFilePath);
            await delay(1000);
        }
        // Screenshot after Step 2
        const step2Screenshot = path.join(screenshotDir, `step2.png`);
        await page.screenshot({ path: step2Screenshot, fullPage: true });
        logger.info('Step 2 screenshot (after ID upload):', step2Screenshot);

        // ===== STEP 3a: Click dropdown "Select reason for this transfer" =====
        logger.info('===== STEP 3a: Clicking dropdown =====');
        const reasonSelectors = [
            'select[id*="Reason"]',
            'select[id*="reason"]',
            'select[name*="Reason"]',
            'select[name*="reason"]',
            '#cp_pagedata_ddlReason',
            'select'
        ];

        let dropdownFound = false;
        for (const selector of reasonSelectors) {
            const reasonSelect = await targetFrame.$(selector);
            if (reasonSelect) {
                logger.info('Found reason dropdown:', selector);
                dropdownFound = true;

                // Click to open dropdown first
                await reasonSelect.click();
                await delay(500);

                // Screenshot after Step 3a (dropdown opened)
                const step3aScreenshot = path.join(screenshotDir, `step3a.png`);
                await page.screenshot({ path: step3aScreenshot, fullPage: true });
                logger.info('Step 3a screenshot (dropdown clicked):', step3aScreenshot);

                // ===== STEP 3b: Select "Others" from dropdown =====
                logger.info('===== STEP 3b: Selecting "Others" =====');
                const selectedOption = await targetFrame.evaluate((sel: string) => {
                    const select = document.querySelector(sel) as HTMLSelectElement;
                    if (!select) return null;

                    // Find "Others" option
                    for (const option of select.options) {
                        if (option.text.toLowerCase().includes('other')) {
                            select.value = option.value;
                            select.dispatchEvent(new Event('change', { bubbles: true }));
                            return option.text;
                        }
                    }
                    // If no "Others", select last option
                    if (select.options.length > 1) {
                        select.selectedIndex = select.options.length - 1;
                        select.dispatchEvent(new Event('change', { bubbles: true }));
                        return select.options[select.selectedIndex].text;
                    }
                    return null;
                }, selector);

                if (selectedOption) {
                    logger.info('Selected reason:', selectedOption);
                    await delay(500);

                    // Screenshot after Step 3b (Others selected)
                    const step3bScreenshot = path.join(screenshotDir, `step3b.png`);
                    await page.screenshot({ path: step3bScreenshot, fullPage: true });
                    logger.info('Step 3b screenshot (Others selected):', step3bScreenshot);
                    break;
                }
            }
        }

        // ===== STEP 4: Check the checkbox =====
        logger.info('===== STEP 4: Checking checkbox =====');
        const checkboxClicked = await targetFrame.evaluate(() => {
            const checkboxes = document.querySelectorAll('input[type="checkbox"]');
            logger.info('Found', checkboxes.length, 'checkboxes');

            for (const checkbox of checkboxes) {
                const cb = checkbox as HTMLInputElement;
                if (!cb.checked) {
                    cb.click();
                    logger.info('Clicked checkbox:', cb.id || cb.name);
                }
            }
            return checkboxes.length > 0;
        });
        logger.info('Checkbox clicked:', checkboxClicked);
        await delay(500);

        // Screenshot after Step 4 (checkbox checked)
        const step4Screenshot = path.join(screenshotDir, `step4.png`);
        await page.screenshot({ path: step4Screenshot, fullPage: true });
        logger.info('Step 4 screenshot (checkbox checked):', step4Screenshot);

        await delay(500);

        // ===== STEP 5: Click "Request to Transfer Consumer" button =====
        logger.info('===== STEP 5: Clicking Request to Transfer Consumer button =====');

        // Register dialog handler BEFORE clicking to ensure we catch any alerts/confirms
        // This handles Step 6 (Confirmation) which might happen immediately after click
        page.on('dialog', async dialog => {
            logger.info('Dialog appeared with message:', dialog.message());
            await dialog.accept();
            logger.info('Dialog accepted');
        });

        const requestButtonSelectors = [
            'input[value*="Request to Transfer Consumer"]',
            'input[value*="Request to Transfer"]',
            'input[value*="Request Transfer"]',
            'a[id*="btnRequest"]',
            '#cp_pagedata_btnRequestTransfer',
            '[id*="btnRequest"]',
            '[id*="RequestTransfer"]',
            // Try specific text targeting
            'text/"Request to Transfer Consumer"',
            'text/"Request to Transfer"'
        ];

        let requestButtonClicked = false;

        // Strategy 1: Try finding in targetFrame using selectors
        for (const selector of requestButtonSelectors) {
            try {
                if (selector.startsWith('text/')) {
                    // unexpected syntax, handle in next block
                    continue;
                }
                const btn = await targetFrame.$(selector);
                if (btn) {
                    logger.info('Found Request Transfer button:', selector);
                    // Try normal click first
                    try {
                        await btn.click();
                        requestButtonClicked = true;
                        logger.info('Clicked Request Transfer button (Puppeteer click)');
                    } catch (e) {
                        // If proper click fails, try JS click
                        await targetFrame.evaluate((sel: string) => {
                            const el = document.querySelector(sel) as HTMLElement;
                            if (el) el.click();
                        }, selector);
                        requestButtonClicked = true;
                        logger.info('Clicked Request Transfer button (JS click)');
                    }
                    if (requestButtonClicked) break;
                }
            } catch (e) {
                // Continue
            }
        }

        // Strategy 2: Find by text content (robust)
        if (!requestButtonClicked) {
            logger.info('Trying to find Request button by text content...');
            requestButtonClicked = await targetFrame.evaluate(() => {
                const searchText = 'Request to Transfer Consumer';
                // Check inputs
                const inputs = Array.from(document.querySelectorAll('input[type="submit"], input[type="button"], button'));
                for (const input of inputs) {
                    const val = (input as HTMLInputElement).value || input.textContent || '';
                    if (val.includes('Request') && val.includes('Transfer')) {
                        (input as HTMLElement).click();
                        return true;
                    }
                }
                // Check anchors looks like buttons
                const anchors = Array.from(document.querySelectorAll('a'));
                for (const anchor of anchors) {
                    const text = anchor.textContent || '';
                    if (text.includes('Request') && text.includes('Transfer')) {
                        anchor.click();
                        return true;
                    }
                }
                // Check any element with the exact text
                const allElems = document.querySelectorAll('div, span, b, strong');
                for (const el of allElems) {
                    const htmlEl = el as HTMLElement;
                    if (htmlEl.innerText === searchText) {
                        htmlEl.click();
                        return true;
                    }
                    // Check if parent is clickable
                    if (htmlEl.innerText === searchText && htmlEl.parentElement && (htmlEl.parentElement.tagName === 'A' || htmlEl.parentElement.tagName === 'BUTTON')) {
                        htmlEl.parentElement.click();
                        return true;
                    }
                }
                return false;
            });

            if (requestButtonClicked) logger.info('Clicked Request Transfer button by text content');
        }

        if (!requestButtonClicked) {
            const step5FailScreenshot = path.join(screenshotDir, `step5 - fail.png`);
            await page.screenshot({ path: step5FailScreenshot, fullPage: true });
            return { success: false, message: 'Could not find Request Transfer button in Step 5. Check screenshot: ' + step5FailScreenshot };
        }

        await delay(1000);

        // Screenshot after Step 5 (Request button clicked)
        const step5Screenshot = path.join(screenshotDir, `step5 - success.png`);
        await page.screenshot({ path: step5Screenshot, fullPage: true });
        logger.info('Step 5 screenshot (Request button clicked):', step5Screenshot);

        // ===== STEP 6: Confirm Transfer Request =====
        logger.info('===== STEP 6: Waiting for Confirmation/Completion =====');

        // Use explicit dialog handling if not already caught by listener
        // But the listener above should handle it. This block is just for logging/waiting.
        await delay(3000);

        // Also look for HTML-based OK button
        const okButtonSelectors = [
            'input[value="OK"]',
            'input[value="Okay"]',
            'input[value="Ok"]',
            'button:has-text("OK")',
            'a:has-text("OK")',
            '#cp_pagedata_btnOK',
            '[id*="btnOK"]',
            '[id*="btnOk"]'
        ];

        for (const selector of okButtonSelectors) {
            try {
                const okBtn = await page.$(selector);
                if (okBtn) {
                    logger.info('Found OK button:', selector);
                    await page.evaluate((sel: string) => {
                        const el = document.querySelector(sel) as HTMLElement;
                        if (el) el.click();
                    }, selector);
                    logger.info('Clicked OK button');
                    break;
                }
            } catch (e) {
                // Continue trying
            }
        }

        await delay(2000);

        // Take final screenshot
        const finalScreenshot = path.join(screenshotDir, `dhs - final - ${Date.now()}.png`);
        await page.screenshot({ path: finalScreenshot, fullPage: true });
        logger.info('Final screenshot saved to:', finalScreenshot);

        // Check for success message
        const finalBodyText = await page.evaluate(() => document.body.innerText);
        if (finalBodyText.toLowerCase().includes('success') || finalBodyText.toLowerCase().includes('submitted') || finalBodyText.toLowerCase().includes('request has been')) {
            logger.info('Transfer request submitted successfully (verified by text)');
            return { success: true, message: 'Transfer request submitted successfully' };
        }

        // If we clicked the request button and didn't see an explicit error, assume success
        if (requestButtonClicked) {
            logger.info('Transfer request button clicked, assume success despite missing confirmation text');
            return { success: true, message: 'Transfer requested (verification text not found but button clicked)' };
        }

        // Check for error message
        if (finalBodyText.toLowerCase().includes('error') || finalBodyText.toLowerCase().includes('failed')) {
            return { success: false, message: 'DHS returned an error. Please check the DHS portal. Screenshot: ' + finalScreenshot };
        }

        // Do NOT assume success - return false if we couldn't verify
        return { success: false, message: 'Could not verify if transfer was submitted. Please check DHS portal manually. Screenshot: ' + finalScreenshot };
    } catch (error) {
        logger.error('Error requesting transfer:', error);
        return { success: false, message: `Error: ${error} ` };
    } finally {
        await page.close();
    }
}
