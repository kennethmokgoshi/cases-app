// Seed Credit Life Rate Table with typical South African lender rates
// Read .env file manually
const fs = require('fs');
const path = require('path');

// Load .env file
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const match = line.match(/^([^#][^=]*)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            let value = match[2].trim();
            // Remove quotes if present
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            process.env[key] = value;
        }
    });
    console.log('✓ Loaded .env file');
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const rates = [
    // Major Banks - Home Loans
    { creditorName: 'ABSA', accountType: 'HOME_LOAN', minRate: 0.08, maxRate: 0.12, avgRate: 0.10 },
    { creditorName: 'STANDARD_BANK', accountType: 'HOME_LOAN', minRate: 0.07, maxRate: 0.11, avgRate: 0.09 },
    { creditorName: 'FNB', accountType: 'HOME_LOAN', minRate: 0.08, maxRate: 0.12, avgRate: 0.10 },
    { creditorName: 'NEDBANK', accountType: 'HOME_LOAN', minRate: 0.08, maxRate: 0.12, avgRate: 0.10 },
    { creditorName: 'CAPITEC', accountType: 'HOME_LOAN', minRate: 0.09, maxRate: 0.13, avgRate: 0.11 },
    { creditorName: 'SA_HOME_LOANS', accountType: 'HOME_LOAN', minRate: 0.07, maxRate: 0.11, avgRate: 0.09 },

    // Major Banks - Vehicle Finance
    { creditorName: 'ABSA', accountType: 'VEHICLE', minRate: 0.30, maxRate: 0.45, avgRate: 0.38 },
    { creditorName: 'STANDARD_BANK', accountType: 'VEHICLE', minRate: 0.28, maxRate: 0.42, avgRate: 0.35 },
    { creditorName: 'FNB', accountType: 'VEHICLE', minRate: 0.30, maxRate: 0.45, avgRate: 0.38 },
    { creditorName: 'NEDBANK', accountType: 'VEHICLE', minRate: 0.30, maxRate: 0.45, avgRate: 0.38 },
    { creditorName: 'WESBANK', accountType: 'VEHICLE', minRate: 0.32, maxRate: 0.48, avgRate: 0.40 },
    { creditorName: 'MFC', accountType: 'VEHICLE', minRate: 0.35, maxRate: 0.50, avgRate: 0.42 },

    // Major Banks - Personal Loans
    { creditorName: 'ABSA', accountType: 'PERSONAL_LOAN', minRate: 0.35, maxRate: 0.55, avgRate: 0.45 },
    { creditorName: 'STANDARD_BANK', accountType: 'PERSONAL_LOAN', minRate: 0.35, maxRate: 0.55, avgRate: 0.45 },
    { creditorName: 'FNB', accountType: 'PERSONAL_LOAN', minRate: 0.35, maxRate: 0.55, avgRate: 0.45 },
    { creditorName: 'NEDBANK', accountType: 'PERSONAL_LOAN', minRate: 0.35, maxRate: 0.55, avgRate: 0.45 },
    { creditorName: 'CAPITEC', accountType: 'PERSONAL_LOAN', minRate: 0.38, maxRate: 0.58, avgRate: 0.48 },
    { creditorName: 'AFRICAN_BANK', accountType: 'PERSONAL_LOAN', minRate: 0.40, maxRate: 0.60, avgRate: 0.50 },

    // Retail Credit
    { creditorName: 'WOOLWORTHS', accountType: 'RETAIL', minRate: 0.50, maxRate: 0.70, avgRate: 0.60 },
    { creditorName: 'EDGARS', accountType: 'RETAIL', minRate: 0.50, maxRate: 0.70, avgRate: 0.60 },
    { creditorName: 'TRUWORTHS', accountType: 'RETAIL', minRate: 0.50, maxRate: 0.70, avgRate: 0.60 },
    { creditorName: 'MR_PRICE', accountType: 'RETAIL', minRate: 0.50, maxRate: 0.70, avgRate: 0.60 },
    { creditorName: 'JET', accountType: 'RETAIL', minRate: 0.55, maxRate: 0.75, avgRate: 0.65 },
    { creditorName: 'FOSCHINI', accountType: 'RETAIL', minRate: 0.50, maxRate: 0.70, avgRate: 0.60 },
    { creditorName: 'GAME', accountType: 'RETAIL', minRate: 0.50, maxRate: 0.70, avgRate: 0.60 },
    { creditorName: 'MAKRO', accountType: 'RETAIL', minRate: 0.50, maxRate: 0.70, avgRate: 0.60 },
    { creditorName: 'RCS', accountType: 'RETAIL', minRate: 0.55, maxRate: 0.75, avgRate: 0.65 },

    // Micro Lenders
    { creditorName: 'WONGA', accountType: 'MICRO_LOAN', minRate: 0.50, maxRate: 0.90, avgRate: 0.70 },
    { creditorName: 'BOODLE', accountType: 'MICRO_LOAN', minRate: 0.50, maxRate: 0.90, avgRate: 0.70 },
    { creditorName: 'FINBOND', accountType: 'MICRO_LOAN', minRate: 0.50, maxRate: 0.90, avgRate: 0.70 },
    { creditorName: 'BAYPORT', accountType: 'MICRO_LOAN', minRate: 0.45, maxRate: 0.85, avgRate: 0.65 },
    { creditorName: 'DIRECT_AXIS', accountType: 'MICRO_LOAN', minRate: 0.45, maxRate: 0.85, avgRate: 0.65 },

    // Default rates by account type (for unknown creditors)
    { creditorName: 'DEFAULT', accountType: 'HOME_LOAN', minRate: 0.08, maxRate: 0.15, avgRate: 0.11 },
    { creditorName: 'DEFAULT', accountType: 'VEHICLE', minRate: 0.30, maxRate: 0.50, avgRate: 0.40 },
    { creditorName: 'DEFAULT', accountType: 'PERSONAL_LOAN', minRate: 0.35, maxRate: 0.60, avgRate: 0.48 },
    { creditorName: 'DEFAULT', accountType: 'RETAIL', minRate: 0.50, maxRate: 0.75, avgRate: 0.62 },
    { creditorName: 'DEFAULT', accountType: 'MICRO_LOAN', minRate: 0.50, maxRate: 0.90, avgRate: 0.70 },
];

async function main() {
    console.log('Seeding Credit Life Rate Table...');
    console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'NOT SET');

    for (const rate of rates) {
        await prisma.creditLifeRateTable.upsert({
            where: {
                creditorName_accountType: {
                    creditorName: rate.creditorName,
                    accountType: rate.accountType,
                },
            },
            update: {
                minRate: rate.minRate,
                maxRate: rate.maxRate,
                avgRate: rate.avgRate,
                source: 'Industry Average 2024',
            },
            create: {
                creditorName: rate.creditorName,
                accountType: rate.accountType,
                minRate: rate.minRate,
                maxRate: rate.maxRate,
                avgRate: rate.avgRate,
                source: 'Industry Average 2024',
            },
        });
        console.log(`  ✓ ${rate.creditorName} - ${rate.accountType}`);
    }

    console.log(`\n✅ Seeded ${rates.length} rate entries`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
