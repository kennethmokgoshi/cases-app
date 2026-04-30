
import { searchConsumer, closeBrowser } from '../../../packages/shared-lib/src/dhs';
import { prisma } from '../../../packages/database';
import fs from 'fs';
import path from 'path';

async function main() {
    const idNumber = process.argv[2] || '8212205472080';
    console.log(`Checking DHS for ID: ${idNumber}`);
    
    try {
        const result = await searchConsumer(idNumber);
        console.log('Result:', JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await closeBrowser();
        process.exit(0);
    }
}

main();
