/**
 * Inspect the actual HTML of the DHS results table row
 * to understand the real element structure of the "Declined" badge
 */

process.env.DATABASE_URL = 'postgresql://postgres:fxlixb9u2i2xzw5q@213.199.57.111:5432/postgres?connection_limit=10&pool_timeout=30&connect_timeout=30';

import { getBrowser, loginToDHS, delay, DHS_CONFIG } from '../packages/shared-lib/src/dhs/browser';
import { getDHSCredentials } from '../packages/shared-lib/src/integrations';

const ID_NUMBER = '8805275493082';

async function main() {
    const browserInstance = await getBrowser();
    const page = await browserInstance.newPage();

    try {
        const credentials = await getDHSCredentials();
        await loginToDHS(page, credentials);

        await page.goto(DHS_CONFIG.manageTransfersUrl, { waitUntil: 'load', timeout: 60000 });
        await delay(2000);

        // Enter ID and filter
        await page.click('input[id*="RSAID"]', { clickCount: 3 });
        await page.type('input[id*="RSAID"]', ID_NUMBER, { delay: 50 });
        await page.click('#cp_pagedata_lb_ApplyDataFilter');
        await delay(6000);

        // Dump the full HTML of the row containing our ID
        const rowHtml = await page.evaluate(`(function() {
            var tables = Array.from(document.querySelectorAll('table'));
            for (var i = 0; i < tables.length; i++) {
                if (tables[i].textContent.includes('${ID_NUMBER}')) {
                    // Get the row containing the ID
                    var rows = Array.from(tables[i].querySelectorAll('tr'));
                    for (var j = 0; j < rows.length; j++) {
                        if (rows[j].textContent.includes('${ID_NUMBER}')) {
                            return rows[j].innerHTML;
                        }
                    }
                }
            }
            return 'ROW NOT FOUND';
        })()`);

        console.log('\n=== ROW HTML ===');
        console.log(rowHtml);
        console.log('=== END ROW HTML ===\n');

        // Also dump all <a> tags on the page and their text
        const allLinks = await page.evaluate(`(function() {
            return Array.from(document.querySelectorAll('a')).map(function(a) {
                return { text: a.textContent.trim().substring(0,80), href: a.href, onclick: a.getAttribute('onclick'), className: a.className };
            }).filter(function(a) { return a.text.length > 0; });
        })()`);

        console.log('\n=== ALL LINKS ON PAGE ===');
        console.log(JSON.stringify(allLinks, null, 2));

        // Also dump all inputs/buttons
        const allButtons = await page.evaluate(`(function() {
            return Array.from(document.querySelectorAll('input[type="button"], input[type="submit"], button')).map(function(el) {
                return { tag: el.tagName, type: el.type, value: el.value, text: el.textContent.trim().substring(0,80) };
            });
        })()`);

        console.log('\n=== ALL BUTTONS/INPUTS ===');
        console.log(JSON.stringify(allButtons, null, 2));

    } finally {
        await page.close();
        await browserInstance.close();
        process.exit(0);
    }
}

main().catch(e => { console.error(e); process.exit(1); });
