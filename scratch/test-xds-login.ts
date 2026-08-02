import { getXDSCredentials } from '../packages/shared-lib/src/integrations/xds-config';
import { getXdsBrowser, closeXdsBrowser } from '../packages/shared-lib/src/xds/browser';

async function main() {
    const creds = await getXDSCredentials();
    console.log('Testing XDS Login via Form Submit...');
    console.log('URL:', creds.portalUrl);
    console.log('Username:', creds.username);

    const browser = await getXdsBrowser();
    const page = await browser.newPage();

    try {
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );

        const loginUrl = `${creds.portalUrl.replace(/\/$/, '')}/XDSPortal/Account/Login`;
        console.log('Navigating to:', loginUrl);
        await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 60_000 });

        // Fill username & password via DOM evaluate
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
        }, creds.username, creds.password);

        console.log('Submitting login form...');
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

        await new Promise(r => setTimeout(r, 4000));

        console.log('Final URL:', page.url());
        console.log('Final Title:', await page.title());

        const bodyText = await page.evaluate(() => document.body.innerText);
        console.log('--- Body Text Snippet ---');
        console.log(bodyText.substring(0, 500));
    } catch (err) {
        console.error('Error during test:', err);
    } finally {
        await page.close().catch(() => null);
        await closeXdsBrowser().catch(() => null);
    }
}

main().catch(console.error);
