/**
 * Direct DHS Check Request Status runner
 * Usage: npx tsx scratch/run-dhs-check.ts
 */

process.env.DATABASE_URL = 'postgresql://postgres:fxlixb9u2i2xzw5q@213.199.57.111:5432/postgres?connection_limit=10&pool_timeout=30&connect_timeout=30';

import { checkTransferStatus, closeBrowser } from '../packages/shared-lib/src/dhs';

const ID_NUMBER = '8805275493082';

async function main() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  DHS Check Request Status');
    console.log(`  ID: ${ID_NUMBER}`);
    console.log('═══════════════════════════════════════════════════════════\n');

    const start = Date.now();

    try {
        console.log('▶ Starting checkTransferStatus...\n');
        const result = await checkTransferStatus(ID_NUMBER);
        const duration = ((Date.now() - start) / 1000).toFixed(2);

        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('  RESULT');
        console.log('═══════════════════════════════════════════════════════════');
        console.log(`  Duration:        ${duration}s`);
        console.log(`  Found:           ${result.found}`);
        console.log(`  Status:          ${result.status}`);
        console.log(`  Combined Status: ${result.combinedStatus}`);
        console.log(`  Request Status:  ${result.requestStatus}`);
        console.log(`  Days Counter:    ${result.daysCounter || '(none)'}`);
        console.log(`  Message:         ${result.message}`);

        if (result.consumer) {
            console.log('\n  ── Consumer ──────────────────────────────');
            console.log(`  ID:             ${result.consumer.identityNo}`);
            console.log(`  Surname:        ${result.consumer.surname}`);
            console.log(`  First Names:    ${result.consumer.firstNames}`);
            console.log(`  Status:         ${result.consumer.status}`);
            console.log(`  Province:       ${result.consumer.province}`);
        }

        if (result.debtCounsellor) {
            console.log('\n  ── Debt Counsellor ───────────────────────');
            console.log(`  NCRDC No:       ${result.debtCounsellor.ncrRegistrationNo}`);
            console.log(`  Full Name:      ${result.debtCounsellor.fullName}`);
            console.log(`  Trading Name:   ${result.debtCounsellor.tradingName}`);
            console.log(`  Mobile:         ${result.debtCounsellor.mobile}`);
            console.log(`  Tel:            ${result.debtCounsellor.tel}`);
            console.log(`  Email:          ${result.debtCounsellor.email}`);
            console.log(`  Province:       ${result.debtCounsellor.province}`);
            console.log(`  Op. Status:     ${result.debtCounsellor.operatingStatus}`);
        }

        if (result.status === 'DECLINED') {
            console.log('\n  ── Step 9: Decline Reason ────────────────');
            if (result.declineReason) {
                console.log(`  ✅ REASON: ${result.declineReason}`);
            } else {
                console.log('  ❌ Could not retrieve reason (popup may not have appeared)');
            }
        }

        if (result.screenshot) {
            console.log(`\n  Screenshot saved: ${result.screenshot}`);
        }

        console.log('\n═══════════════════════════════════════════════════════════\n');

    } catch (err) {
        const duration = ((Date.now() - start) / 1000).toFixed(2);
        console.error(`\n❌ Error after ${duration}s:`, err);
    } finally {
        await closeBrowser();
        process.exit(0);
    }
}

main();
