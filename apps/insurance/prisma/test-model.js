// Test Prisma connection and check CreditLifeRateTable model
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Testing Prisma connection...');

    // Test basic connection
    const userCount = await prisma.user.count();
    console.log(`✓ Connected! Found ${userCount} users`);

    // Check if model exists
    console.log('Checking CreditLifeRateTable model...');
    const count = await prisma.creditLifeRateTable.count();
    console.log(`✓ CreditLifeRateTable exists! Found ${count} entries`);

    // Try to create one entry
    console.log('Creating test entry...');
    const entry = await prisma.creditLifeRateTable.create({
        data: {
            creditorName: 'TEST_BANK',
            accountType: 'HOME_LOAN',
            minRate: 0.08,
            maxRate: 0.12,
            avgRate: 0.10,
            source: 'Test Entry',
        },
    });
    console.log('✓ Created:', entry);

    // Delete test entry
    await prisma.creditLifeRateTable.delete({ where: { id: entry.id } });
    console.log('✓ Deleted test entry');
}

main()
    .catch((e) => {
        console.error('Error:', e.message);
        console.error(e);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
