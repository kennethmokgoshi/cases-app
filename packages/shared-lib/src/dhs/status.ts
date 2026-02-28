/**
 * DHS (NCR Debt Help System) — Transfer Status Checking
 * Main entry point for checking a consumer's DHS transfer status.
 */

import fs from 'fs';
import { join } from 'path';
import { getDHSCredentials } from '../integrations';
import { getBrowser, loginToDHS, delay, DHS_CONFIG } from './browser';
import { extractConsumerInfo, getDeclineReason } from './extraction';
import type { DHSTransferStatus, DHSDebtCounsellorInfo, DHSTransferCheckResult } from './types';
import { logger } from '@zenowethu/shared-lib';

/**
 * Check if a transfer request exists for a consumer
 */
export async function checkTransferStatus(idNumber: string): Promise<DHSTransferCheckResult & { screenshot?: string }> {
    const browserInstance = await getBrowser();
    const page = await browserInstance.newPage();
    let screenshotPath = '';

    try {
        // Get credentials from database/config
        const credentials = await getDHSCredentials();

        // Login first
        logger.info('=== Starting DHS Status Check ===');
        logger.info('ID Number:', idNumber);
        const loggedIn = await loginToDHS(page, credentials);
        if (!loggedIn) {
            screenshotPath = `storage/uploads/dhs-status-login-fail-${Date.now()}.png`;
            await page.screenshot({ path: screenshotPath, fullPage: true });
            return { found: false, status: 'NOT_REQUESTED', message: 'Failed to login to DHS', screenshot: screenshotPath };
        }
        logger.info('Login successful');

        // Navigate to Manage Transfers page
        logger.info('Navigating to:', DHS_CONFIG.manageTransfersUrl);
        await page.goto(DHS_CONFIG.manageTransfersUrl, { waitUntil: 'networkidle2', timeout: DHS_CONFIG.timeout });

        // Wait for page to be fully loaded
        await delay(2000);

        // Take screenshot of the page before filling form
        screenshotPath = `storage/uploads/dhs-status-before-${Date.now()}.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true });
        logger.info('Screenshot before search:', screenshotPath);

        // Log page URL
        logger.info('Current URL:', page.url());

        // Find ID number input field - try multiple selectors based on DHS page structure
        // First, log ALL inputs on the page so we can see what's available
        const allInputs = await page.$$eval('input', inputs =>
            inputs.map(i => ({
                id: i.id,
                name: i.name,
                type: i.type,
                value: i.value,
                placeholder: i.placeholder,
                className: i.className
            }))
        );
        logger.info('=== ALL INPUTS ON PAGE ===');
        logger.info(JSON.stringify(allInputs, null, 2));
        logger.info('=== END INPUTS ===');

        // Try to find the RSA ID input field - based on ASP.NET naming conventions
        const idInputSelectors = [
            // ASP.NET ContentPlaceHolder patterns
            '#ContentPlaceHolder1_txtRSAIDNo',
            '#ContentPlaceHolder1_txtRSAID',
            '#ContentPlaceHolder1_txtIdNumber',
            '#ContentPlaceHolder1_txtID',
            '#ContentPlaceHolder1_txtPassport',
            // ctl00 prefix patterns (older ASP.NET)
            '#ctl00_ContentPlaceHolder1_txtRSAIDNo',
            '#ctl00_ContentPlaceHolder1_txtRSAID',
            '#ctl00_ContentPlaceHolder1_txtIdNumber',
            // Partial match patterns
            'input[id*="RSAID"]',
            'input[id*="RSAId"]',
            'input[id*="txtRSA"]',
            'input[id*="IdNumber"]',
            'input[id*="IDNumber"]',
            'input[id*="Passport"]',
            'input[name*="RSAID"]',
            'input[name*="IdNumber"]'
        ];

        let idInputSelector: string | null = null;
        for (const selector of idInputSelectors) {
            const elem = await page.$(selector);
            if (elem) {
                idInputSelector = selector;
                logger.info('Found ID input with selector:', selector);
                break;
            }
        }

        // If still not found, try to find text input near "RSA ID" label
        if (!idInputSelector) {
            logger.info('Trying to find input near RSA ID label...');
            idInputSelector = await page.evaluate(() => {
                // Find label or text containing "RSA ID"
                const labels = document.querySelectorAll('label, td, span');
                for (const label of labels) {
                    if (label.textContent?.toLowerCase().includes('rsa id')) {
                        // Look for nearby input
                        const parent = label.closest('tr, div, td');
                        if (parent) {
                            const input = parent.querySelector('input[type="text"]');
                            if (input && input.id) {
                                return '#' + input.id;
                            }
                        }
                    }
                }
                // Fallback: find first visible text input that's not a search box
                const textInputs = document.querySelectorAll('input[type="text"]:not([style*="display: none"])');
                for (const input of textInputs) {
                    const inp = input as HTMLInputElement;
                    if (inp.id && !inp.id.toLowerCase().includes('search') && !inp.id.toLowerCase().includes('page')) {
                        return '#' + inp.id;
                    }
                }
                return null;
            });
            if (idInputSelector) {
                logger.info('Found ID input via label search:', idInputSelector);
            }
        }

        if (!idInputSelector) {
            screenshotPath = `storage/uploads/dhs-status-no-input-${Date.now()}.png`;
            await page.screenshot({ path: screenshotPath, fullPage: true });
            return { found: false, status: 'NOT_REQUESTED', message: 'Could not find RSA ID input field', screenshot: screenshotPath };
        }

        // Clear the field and type ID number
        logger.info('Clicking on input field:', idInputSelector);
        await page.click(idInputSelector, { clickCount: 3 }); // Triple click to select all
        await delay(300);

        // Clear using keyboard
        await page.keyboard.press('Backspace');
        await delay(100);

        // Type the ID number slowly
        logger.info('Typing ID number:', idNumber);
        await page.type(idInputSelector, idNumber, { delay: 100 });
        await delay(500);

        // Verify what was typed
        const typedValue = await page.$eval(idInputSelector, (el) => (el as HTMLInputElement).value);
        logger.info('Value in field after typing:', typedValue);

        // Click Apply Filter button - from logs we know it's: cp_pagedata_lb_ApplyDataFilter
        // The Apply Filter is a link (<a>) element, not an input button
        const filterButtonSelectors = [
            // Exact ID from the logs - this is the correct one!
            '#cp_pagedata_lb_ApplyDataFilter',
            // Alternative patterns
            'a[id*="ApplyDataFilter"]',
            'a[id*="ApplyFilter"]',
            'a[id*="lb_Apply"]',
            // Fallback patterns
            '#ContentPlaceHolder1_lb_ApplyDataFilter',
            '#ctl00_cp_pagedata_lb_ApplyDataFilter'
        ];

        let filterButtonSelector: string | null = null;
        for (const selector of filterButtonSelectors) {
            try {
                const elem = await page.$(selector);
                if (elem) {
                    filterButtonSelector = selector;
                    logger.info('Found Apply Filter button with selector:', selector);
                    break;
                }
            } catch {
                // Some selectors might not be valid, continue
            }
        }

        // If still not found, try finding link with "Apply Filter" text
        if (!filterButtonSelector) {
            logger.info('Searching for Apply Filter link by text...');
            filterButtonSelector = await page.evaluate(() => {
                const links = document.querySelectorAll('a.btn');
                for (const link of links) {
                    if (link.textContent?.includes('Apply Filter')) {
                        if (link.id) return '#' + link.id;
                    }
                }
                return null;
            });
            if (filterButtonSelector) {
                logger.info('Found Apply Filter button by text search:', filterButtonSelector);
            }
        }

        if (filterButtonSelector) {
            logger.info('Clicking Apply Filter button:', filterButtonSelector);
            await page.click(filterButtonSelector);
            logger.info('Clicked Apply Filter button successfully');
        } else {
            logger.info('ERROR: Could not find Apply Filter button!');
            // Log what buttons are available for debugging
            const availableButtons = await page.$$eval('a.btn', btns =>
                btns.map(b => ({ id: b.id, text: b.textContent?.trim() }))
            );
            logger.info('Available buttons:', JSON.stringify(availableButtons, null, 2));
        }

        await delay(1000); // Short wait after click

        // Wait for AJAX results to load
        logger.info('Waiting for search results...');
        await delay(5000); // Increase wait time

        // Take a screenshot after search
        screenshotPath = `storage/uploads/dhs-status-after-${Date.now()}.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true });
        logger.info('Screenshot after search:', screenshotPath);

        // Log page content for debugging
        const bodyText = await page.evaluate(() => document.body.innerText);
        logger.info('=== Page Content ===');
        logger.info(bodyText.substring(0, 1500));
        logger.info('=== End Page Content ===');

        // Check for "Displaying records X - Y" text which indicates results
        const displayingMatch = await page.evaluate(() => {
            const text = document.body.innerText;
            // Look for patterns like "Displaying records 1 - 1" or "Displaying 1 items"
            const match = text.match(/Displaying\s+(?:records?\s+)?(\d+)(?:\s*-\s*(\d+))?/i);
            return match ? { first: match[1], second: match[2] || match[1] } : null;
        });

        logger.info('Displaying match:', displayingMatch);

        // Check if the ID number appears in the results table
        const idFoundInTable = await page.evaluate((searchId: string) => {
            // Look specifically in table rows
            const tables = document.querySelectorAll('table');
            for (const table of tables) {
                if (table.textContent?.includes(searchId)) {
                    return true;
                }
            }
            // Also check GridView which ASP.NET uses
            const gridViews = document.querySelectorAll('[id*="grd"], [id*="Grid"]');
            for (const grid of gridViews) {
                if (grid.textContent?.includes(searchId)) {
                    return true;
                }
            }
            return false;
        }, idNumber);

        logger.info('ID found in table:', idFoundInTable);

        // Look for "no records" text - but be careful as it might exist on the page template
        const hasNoRecordsMessage = await page.evaluate(() => {
            // More specific check - look for it in the table area
            const tableArea = document.querySelector('.table-responsive, table, [id*="grd"], [id*="Grid"]');
            if (tableArea) {
                const text = tableArea.textContent?.toLowerCase() || '';
                return text.includes('no records') || text.includes('no data');
            }
            return false;
        });

        logger.info('No records message found:', hasNoRecordsMessage);

        // Determine if results exist
        const hasResults = idFoundInTable || (displayingMatch && parseInt(displayingMatch.first) > 0);

        if (!hasResults && hasNoRecordsMessage) {
            logger.info('No transfer records found for this ID');
            return {
                found: false,
                status: 'NOT_REQUESTED',
                message: 'No transfer request found for this ID number',
                screenshot: screenshotPath
            };
        }

        // Try to extract status from the table
        // DHS table columns: ACTION, IDENTITY No, FULL NAME, GENDER, STATUS, CURRENT DC, DAY(S) COUNTER, REQUEST STATUS
        let status: DHSTransferStatus = 'NOT_REQUESTED';
        let daysCounter = '';
        let requestStatus = '';
        let combinedStatus = '';
        let currentDC = '';  // The NCRDC number from the CURRENT DC column
        let debtCounsellor: DHSDebtCounsellorInfo | undefined;

        // Extract data from the GridView table - need to find the correct table with data
        try {
            // The data table should have rows with the consumer data
            // Look for tables that contain the ID number we searched for
            const tableData = await page.evaluate((searchId: string) => {
                // Find all tables containing searchId
                const allTableData: string[][][] = [];
                // Find all tables on the page
                const tables = document.querySelectorAll('table');

                for (const table of tables) {
                    // Check if this table contains our search ID
                    if (!table.textContent?.includes(searchId)) continue;

                    const rows = table.querySelectorAll('tr');
                    const result: string[][] = [];

                    logger.info('Found table with searchId, extracting rows...');
                    for (const row of rows) {
                        const cells = row.querySelectorAll('td, th');
                        if (cells.length > 5) {
                            const rowData = Array.from(cells).map(c => c.textContent?.trim() || '');
                            result.push(rowData);  // No filtering - add ALL rows
                            logger.info('Row', result.length - 1, '- Cells:', cells.length, '- First:', rowData[0]?.substring(0, 20));
                        }
                    }
                    logger.info('Table rows:', result.length);
                    if (result.length > 0) {
                        allTableData.push(result);
                        logger.info('✅ Added table', allTableData.length, 'with', result.length, 'rows');
                    }
                }

                // NUCLEAR FIX: Return SECOND table!
                // allTableData[0] = filter form (has searchId in input)
                // allTableData[1] = data table (what we want!)
                if (allTableData.length >= 2) {
                    logger.info('🎯 Using SECOND table (index 1 out of', allTableData.length, 'tables)');
                    return allTableData[1];
                } else if (allTableData.length === 1) {
                    logger.info('⚠️ Only 1 table, using it');
                    return allTableData[0];
                }
                logger.info('❌ No tables found');
                return [];
            }, idNumber);

            logger.info('=== DATA TABLE ROWS ===');
            logger.info(JSON.stringify(tableData.slice(0, 5), null, 2));
            logger.info('=== END DATA TABLE ROWS ===');

            // NUCLEAR OPTION: Direct DOM extraction for REQUEST STATUS
            // Instead of relying on array indexing, directly query the DOM for the REQUEST STATUS cell
            const directRequestStatus = await page.evaluate((searchId: string) => {
                const tables = document.querySelectorAll('table');

                for (const table of tables) {
                    if (!table.textContent?.includes(searchId)) continue;

                    // SIMPLEST APPROACH: Get all tr elements
                    // tr[0] = header row
                    // tr[1] = first data row (most recent request)
                    const allRows = table.querySelectorAll('tr');

                    if (allRows.length < 2) continue; // Need at least header + 1 data row

                    // Get SECOND tr element (first data row after header)
                    const firstDataRow = allRows[1];
                    const cells = firstDataRow.querySelectorAll('td');

                    if (cells.length === 0) continue; // Skip if this is actually a header row

                    // REQUEST STATUS is the LAST cell (column 7/8)
                    const lastCell = cells[cells.length - 1];
                    const status = lastCell?.textContent?.trim() || '';

                    logger.info('🎯 SIMPLE TR[1] - Found', cells.length, 'cells in row');
                    logger.info('🎯 SIMPLE TR[1] - All cell values:');
                    Array.from(cells).forEach((cell, idx) => {
                        logger.info(`   Cell[${idx}]: "${cell.textContent?.trim()}"`);
                    });
                    logger.info('🎯 SIMPLE TR[1] - REQUEST STATUS (last cell):', status);

                    return status;
                }
                return '';
            }, idNumber);

            logger.info('\n\n');
            logger.info('═══════════════════════════════════════════════════════════');
            logger.info('🎯 EXTRACTED REQUEST STATUS FROM TR[1] LAST CELL:');
            logger.info(`   VALUE: "${directRequestStatus}"`);
            logger.info(`   LENGTH: ${directRequestStatus.length}`);
            logger.info(`   TYPE: ${typeof directRequestStatus}`);
            logger.info('═══════════════════════════════════════════════════════════');
            logger.info('\n\n');

            if (tableData.length > 0) {
                logger.info('Table data rows:', tableData.length);

                // tableData[0] = header/filter row
                // tableData[1] = FIRST data row (most recent request)
                // Don't check for ID - just use tableData[1] directly!
                let dataRow: string[] | null = null;
                let lastMatchingIndex = 1;

                if (tableData.length >= 2 && tableData[1]) {
                    // Use second element (first data row)
                    dataRow = tableData[1];
                    lastMatchingIndex = 1;
                    logger.info('✅ Using tableData[1] as FIRST DATA ROW (tableData[0] is header)');
                } else {
                    logger.info('❌ tableData does not have enough rows');
                }

                if (dataRow) {
                    logger.info('🎯 FIRST ROW ONLY - Index:', lastMatchingIndex);
                    logger.info('📋 Data row:', JSON.stringify(dataRow));

                    logger.info('\n========== DETAILED COLUMN ANALYSIS ==========');
                    logger.info('Total columns:', dataRow.length);
                    dataRow.forEach((col, idx) => {
                        logger.info(`Column [${idx}]: "${col}"`);
                    });
                    logger.info('Last column [' + (dataRow.length - 1) + ']: "' + dataRow[dataRow.length - 1] + '"');
                    logger.info('==============================================\n');

                    // Write to file so user can see what was extracted
                    try {
                        let fileContent = 'DHS Column Values Read\n';
                        fileContent += 'Timestamp: ' + new Date().toISOString() + '\n';
                        fileContent += 'Row Index: ' + lastMatchingIndex + '\n';
                        fileContent += 'Total Columns: ' + dataRow.length + '\n\n';
                        dataRow.forEach((col, idx) => {
                            fileContent += 'Column [' + idx + ']: "' + col + '"\n';
                        });
                        const logPath = join(process.cwd(), 'storage', 'uploads', 'COLUMN-VALUES.txt');
                        fs.writeFileSync(logPath, fileContent);
                    } catch (e) {
                        logger.info('Could not write column values file:', e);
                    }

                    // CORRECTED column mapping (based on COLUMN-VALUES.txt extraction):
                    // ACTION column is split into 3, causing shift!
                    // [0] = ACTION (combined)
                    // [1] = Preview button
                    // [2] = Withdraw button
                    // [3] = IDENTITY NO ← ID HERE!
                    // [4] = FULL NAME
                    // [5] = GENDER
                    // [6] = STATUS (consumer status)
                    // [7] = CURRENT DC ← DC HERE!
                    // [8] = DAY(S) COUNTER
                    // [9] = REQUEST STATUS ← STATUS HERE!

                    // Read from CORRECTED column indices!
                    requestStatus = dataRow[9]?.trim() || '';  // Column 9, not 7!
                    daysCounter = dataRow[8]?.trim() || '';    // Column 8, not 6!
                    currentDC = dataRow[7]?.trim() || '';      // Column 7, not 5!

                    // Store RAW COLUMN VALUES for comment display (CORRECTED indices)
                    const rawIdentityNo = dataRow[3]?.trim() || '';    // Column 3, not 1!
                    const rawCurrentDC = dataRow[7]?.trim() || '';     // Column 7, not 5!
                    const rawRequestStatus = dataRow[9]?.trim() || ''; // Column 9, not 7!

                    logger.info('✅ DIRECT COLUMN READ (NO ASSUMPTIONS):');
                    logger.info('   [1] IDENTITY NO:', rawIdentityNo);
                    logger.info('   [5] CURRENT DC:', currentDC);
                    logger.info('   [6] DAY(S) COUNTER:', daysCounter, '(blank = no value)');
                    logger.info('   [7] REQUEST STATUS:', rawRequestStatus);
                    logger.info('   [7] REQUEST STATUS:', requestStatus);
                }

                logger.info('Final CURRENT DC value:', currentDC);
                logger.info('Final DAY(S) COUNTER value:', daysCounter);
                logger.info('Final REQUEST STATUS value:', requestStatus);

                // Initialize debt counsellor with what we know (NCRDC number)
                if (currentDC) {
                    debtCounsellor = {
                        ncrRegistrationNo: currentDC,
                        fullName: '',
                        tradingName: '',
                        tel: '',
                        mobile: '',
                        fax: '',
                        email: '',
                        province: '',
                        operatingStatus: ''
                    };
                }
            }
        } catch (e) {
            logger.info('Could not extract table data:', e);
        }

        // If we found a CURRENT DC, click on it to get the Debt Counsellor details popup
        if (currentDC && hasResults) {
            try {
                logger.info('=== Clicking on CURRENT DC to get details ===');
                logger.info('Looking for link with text:', currentDC);

                // Click on the link using page.evaluate - try multiple matching strategies
                const clicked = await page.evaluate((dc: string) => {
                    const links = document.querySelectorAll('a');
                    const cleanDc = dc.replace(/\s+/g, '').toLowerCase();

                    // Strategy 1: Check text content (ignoring case and whitespace)
                    for (const link of links) {
                        const text = link.textContent?.trim() || '';
                        const cleanText = text.replace(/\s+/g, '').toLowerCase();

                        if (cleanText.includes(cleanDc) || cleanDc.includes(cleanText)) {
                            // Only click if it looks like an NCRDC link
                            if (text.toUpperCase().includes('NCRDC')) {
                                (link as HTMLElement).click();
                                return { success: true, method: 'text_match', text };
                            }
                        }
                    }

                    // Strategy 2: Check onclick attribute
                    for (const link of links) {
                        const onclick = (link.getAttribute('onclick') || '').toLowerCase();
                        if (onclick.includes(cleanDc)) {
                            (link as HTMLElement).click();
                            return { success: true, method: 'onclick', onclick };
                        }
                    }

                    return { success: false };
                }, currentDC);

                logger.info('Click result:', clicked);

                if (clicked.success) {
                    // Wait for popup - 5s should be enough for AJAX
                    await delay(5000);

                    // Take screenshot of popup state
                    screenshotPath = `storage/uploads/dhs-dc-popup-${Date.now()}.png`;
                    await page.screenshot({ path: screenshotPath, fullPage: true });

                    // Extract details from the popup using robust searching
                    const popupData = await page.evaluate(() => {
                        // Find the visible popup container
                        // DHS usually uses ASP.NET ModalPopupExtender which creates a div with specific classes or IDs
                        const possiblePopups = Array.from(document.querySelectorAll('div')).filter(div => {
                            const style = window.getComputedStyle(div);
                            const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
                            const hasContent = div.innerText && div.innerText.length > 50; // Popup must have content

                            if (!isVisible || !hasContent) return false;

                            // Check typical ID/Class patterns
                            const id = div.id || '';
                            const cls = div.className || '';
                            return id.includes('pnl') || id.includes('Panel') || id.includes('Modal') ||
                                cls.includes('modal') || cls.includes('popup') ||
                                style.position === 'fixed' || style.zIndex === '1000' || parseInt(style.zIndex) > 100;
                        });

                        // Sort by z-index (highest usually top)
                        possiblePopups.sort((a, b) => {
                            const zA = parseInt(window.getComputedStyle(a).zIndex) || 0;
                            const zB = parseInt(window.getComputedStyle(b).zIndex) || 0;
                            return zB - zA;
                        });

                        const popup = possiblePopups[0] || document.body; // Fallback to body
                        const text = popup.innerText || '';

                        // Helper to extract value by label key using loose regex
                        const extract = (pattern: RegExp) => {
                            const match = text.match(pattern);
                            return match ? match[1].trim() : '';
                        };

                        return {
                            fullText: text.substring(0, 500), // Log for debug
                            // Loose regexes that handle newlines, spaces, and different separators
                            ncrRegistrationNo: extract(/NCR\s*Registration\s*No\.?\s*[:\.]?\s*([A-Z0-9]+)/i),
                            fullName: extract(/Full\s*Name\s*[:\.]?\s*([^\n\r]+)/i),
                            tradingName: extract(/Trading\s*Name\s*[:\.]?\s*([^\n\r]+)/i),
                            tel: extract(/Tel\s*[:\.]?\s*([0-9\s\-\+\(\)]+)/i),
                            mobile: extract(/Mobile\s*[:\.]?\s*([0-9\s\-\+\(\)]+)/i),
                            fax: extract(/Fax\s*[:\.]?\s*([0-9\s\-\+\(\)]*)/i),
                            email: extract(/Email\s*[:\.]?\s*([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2 })/i),
                            province: extract(/Province\s*[:\.]?\s*([A-Za-z\s]+)/i),
                            operatingStatus: extract(/Operating\s*Status\s*[:\.]?\s*(Operating|Not Operating|Suspended)/i)
                        };
                    });

                    logger.info('Popup extraction raw text:', popupData.fullText);
                    logger.info('Extracted Fields:', popupData);

                    // If we got *any* valid data, update our debt counsellor object
                    if (popupData.ncrRegistrationNo || popupData.fullName || popupData.tradingName || popupData.email) {
                        debtCounsellor = {
                            ncrRegistrationNo: popupData.ncrRegistrationNo || currentDC,
                            fullName: popupData.fullName || '',
                            tradingName: popupData.tradingName || '',
                            tel: popupData.tel || '',
                            mobile: popupData.mobile || '',
                            fax: popupData.fax || '',
                            email: popupData.email || '',
                            province: popupData.province || '',
                            operatingStatus: popupData.operatingStatus || ''
                        };
                        logger.info('✅ Successfully updated Debt Counsellor object from popup:', debtCounsellor);
                    } else {
                        logger.warn('⚠️ Popup found but regex failed to extract meaningful data');
                    }

                    // Try to close popup
                    await page.keyboard.press('Escape');
                    await delay(500);
                } else {
                    logger.error('❌ Failed to find/click NCRDC link');
                }
            } catch (e) {
                logger.info('❌ Error interacting with DC popup:', e);
            }
        }

        // Build combined status
        logger.info('=== STATUS MAPPING DEBUG ===');
        logger.info('requestStatus value:', JSON.stringify(requestStatus));
        logger.info('requestStatus toLowerCase():', requestStatus.toLowerCase());
        logger.info('hasResults:', hasResults);

        if (requestStatus.toLowerCase().includes('auto') && requestStatus.toLowerCase().includes('transfer')) {
            status = 'AUTO_TRANSFERRED';
            combinedStatus = 'Auto Transferred';
        } else if (requestStatus.toLowerCase().includes('pending')) {
            status = 'PENDING';
            if (daysCounter) {
                // daysCounter might be "New", "1 Day(s)", "2 Day(s)", etc.
                if (daysCounter.toLowerCase() === 'new') {
                    combinedStatus = 'Pending - New (Day 1)';
                } else {
                    // Extract the number from "1 Day(s)", "2 Day(s)", etc.
                    const dayMatch = daysCounter.match(/(\d+)/);
                    if (dayMatch) {
                        const dayNum = parseInt(dayMatch[1]);
                        combinedStatus = `Pending - ${daysCounter} (Day ${dayNum + 1})`;
                    } else {
                        combinedStatus = `Pending - ${daysCounter} `;
                    }
                }
            } else {
                combinedStatus = 'Pending';
            }
        } else if (requestStatus.toLowerCase().includes('accepted') || requestStatus.toLowerCase().includes('approved')) {
            status = 'ACCEPTED';
            combinedStatus = 'Accepted';
        } else if (requestStatus.toLowerCase().includes('declined') || requestStatus.toLowerCase().includes('rejected')) {
            status = 'DECLINED';
            combinedStatus = 'Declined';
        } else if (hasResults) {
            // Found records but couldn't parse status
            status = 'PENDING';
            combinedStatus = daysCounter ? `Pending - ${daysCounter} ` : 'Pending';
            logger.info('Found records but could not parse status, defaulting to PENDING');
        }

        logger.info('Final status:', status);
        logger.info('Combined status:', combinedStatus);

        // Extract consumer info if found
        const consumer = hasResults ? await extractConsumerInfo(page) : undefined;

        // If declined, get the reason (with timeout protection)
        let declineReason: string | undefined;
        if (status === 'DECLINED') {
            try {
                logger.info('Attempting to get decline reason with 15s timeout...');
                declineReason = await Promise.race([
                    getDeclineReason(page),
                    new Promise<undefined>((resolve) =>
                        setTimeout(() => {
                            logger.info('Decline reason extraction timed out after 15s');
                            resolve(undefined);
                        }, 15000)
                    )
                ]);
                logger.info('Decline reason extraction completed:', declineReason ? 'success' : 'failed/timeout');
            } catch (error) {
                logger.error('Error getting decline reason:', error);
                declineReason = undefined;
            }
        }

        return {
            found: hasResults || false,
            status,
            daysCounter,
            requestStatus,
            combinedStatus,
            consumer,
            debtCounsellor,
            declineReason,
            message: combinedStatus || `Status: ${status} `,
            screenshot: screenshotPath
        };
    } catch (error) {
        logger.error('Error checking transfer status:', error);
        // Try to take a screenshot on error
        try {
            screenshotPath = `public/uploads/dhs-status-error-${Date.now()}.png`;
            await page.screenshot({ path: screenshotPath, fullPage: true });
        } catch {
            // Ignore screenshot errors
        }
        return { found: false, status: 'NOT_REQUESTED', message: `Error: ${error} `, screenshot: screenshotPath };
    } finally {
        await page.close();
    }
}
