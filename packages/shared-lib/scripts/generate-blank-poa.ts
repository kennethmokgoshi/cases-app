import { generateStandardPoa } from '../src/poa/poa-generator';
import { ZENOWETHU_COMPANY_PROFILE } from '../src/company/profile';
import { writeFileSync } from 'fs';
import { join } from 'path';

async function main() {
    console.log('Generating blank POA...');
    const buffer = await generateStandardPoa({
        company: ZENOWETHU_COMPANY_PROFILE,
        fullName: ' ',
        idNumber: ' ',
        dateOfBirth: ' ',
        address: ' ',
        phone: ' ',
        email: ' ',
        signedCity: ' ',
        signedDate: ' '
    });
    
    const outputPath = join(process.cwd(), '..', '..', 'Blank_POA.pdf');
    writeFileSync(outputPath, buffer);
    console.log(`Success! Blank POA saved to: ${outputPath}`);
}

main().catch(console.error);
