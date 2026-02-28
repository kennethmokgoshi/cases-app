
import { validateSAID, verifyIdNumbers } logger, from '@zenowethu/shared-lib';

// Mocking the OpenAI response parsing logic since we can't easily import the internal function without exporting it
// But we can test the helper functions we found.

function testValidateSAID() {
    logger.info('--- Testing validateSAID ---');

    // Test cases
    const cases = [
        { id: '9202204720082', expected: true, desc: 'Valid ID (Randomly generated valid format)' }, // Note: This is an example, might not be mathematically valid if I just typed it. Let's use a known algorithm generator logic or just test the function's own logic.
        // Actually, let's trust the function's logic if we pass it a known valid one. 
        // Better: Valid ID: 8001015009087 (80-01-01, Male, Citizen, 8 check) -> 
        // 8+0+0+0+5+0+9+4(0*2)+2(1*2)+0(5*2=10->1)+0(0*2)+7(8*2=16->7)+7 = ... 
        // Let's just run it and see.
        { id: '8001015009087', expected: true, desc: 'Hypothetically Valid ID' },
        { id: '123', expected: false, desc: 'Too short' },
        { id: 'abcdefghijklm', expected: false, desc: 'Non-numeric' },
    ];

    cases.forEach(c => {
        const result = validateSAID(c.id);
        logger.info(`[${result.isValid === c.expected ? 'PASS' : 'FAIL'}] ${c.desc}: ${c.id} -> ${result.isValid} (Error: ${result.error || 'None'})`);
    });
}

function testVerifyIdNumbers() {
    logger.info('\n--- Testing verifyIdNumbers ---');

    const cases = [
        {
            data: { id: { idNumber: '8001015009087' }, poa: { idNumber: '8001015009087' }, creditReport: { consumer: { idNumber: '8001015009087' } } },
            expected: true,
            desc: 'All Match'
        },
        {
            data: { id: { idNumber: '8001015009087' }, poa: { idNumber: '9901015009087' } },
            expected: false,
            desc: 'Mismatch'
        },
        {
            data: { id: { idNumber: '8001015009087' } },
            expected: false, // Wait, logic says if uniqueIds.length === 1, and count >= 2 return true, else false (warning)
            desc: 'Single Source (Should warn)'
        }
    ];

    cases.forEach(c => {
        const result = verifyIdNumbers(c.data);
        const pass = result.isVerified === c.expected;
        logger.info(`[${pass ? 'PASS' : 'FAIL'}] ${c.desc} -> Verified: ${result.isVerified}, Warning: ${result.warning}`);
    });
}

// Mimic the JSON extraction logic from verify_ai_logic.ts to test it
function testJSONExtraction(rawContent: string) {
    logger.info('\n--- Testing JSON Extraction Logic ---');
    const jsonString = rawContent.replace(/```json\n?|\n?```/g, '').trim();
    const firstBrace = jsonString.indexOf('{');
    const lastBrace = jsonString.lastIndexOf('}');

    let finalJson = jsonString;
    if (firstBrace !== -1 && lastBrace !== -1) {
        finalJson = jsonString.substring(firstBrace, lastBrace + 1);
    }

    try {
        const parsed = JSON.parse(finalJson);
        logger.info('[PASS] Parsed JSON:', parsed);
        return true;
    } catch (e) {
        logger.info('[FAIL] Failed to parse:', e);
        return false;
    }
}

async function run() {
    try {
        testValidateSAID();
        testVerifyIdNumbers();

        testJSONExtraction('```json\n{"test": true}\n```');
        testJSONExtraction('Here is the json: {"test": true} thanks');

        logger.info('\nDone.');
    } catch (e) {
        logger.error(e);
    }
}

run();
