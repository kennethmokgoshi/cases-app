import { generateStandardPoa } from '../src/poa/poa-generator';
import { writeFileSync } from 'fs';
import { join } from 'path';

async function main() {
    console.log('Generating blank POA...');
    const buffer = await generateStandardPoa({
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
