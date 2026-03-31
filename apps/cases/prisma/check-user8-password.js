const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function checkPassword() {
    const email = 'user8@zenowethu.co.za';
    const testPassword = 'TestPassword123!';

    console.log(`\n=== Checking password for ${email} ===\n`);

    // Get user from database
    const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() }
    });

    if (!user) {
        console.error(`ERROR: User ${email} not found in database!`);
        process.exit(1);
    }

    console.log(`Found user: ${user.firstName} ${user.lastName}`);
    console.log(`Email: ${user.email}`);
    console.log(`Stored hash: ${user.password}`);
    console.log(`\nTesting password: ${testPassword}`);

    // Test if password matches
    const matches = await bcrypt.compare(testPassword, user.password);
    console.log(`\nPassword match result: ${matches}`);

    if (matches) {
        console.log('\n✓ Password verification PASSED!');
    } else {
        console.log('\n✗ Password verification FAILED!');

        // Also check what the SEED_PASSWORD would hash to
        console.log('\n=== Checking alternative passwords ===');
        const seedPassword = process.env.SEED_PASSWORD || 'changeme-dev-only';
        console.log(`\nTesting SEED_PASSWORD: ${seedPassword}`);
        const seedMatches = await bcrypt.compare(seedPassword, user.password);
        console.log(`SEED_PASSWORD match result: ${seedMatches}`);
    }

    await prisma.$disconnect();
}

checkPassword()
    .catch((e) => {
        console.error('Error:', e);
        process.exit(1);
    });
