// Test authentication directly with bcrypt to simulate what NextAuth does
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const REMOTE_DB_URL = "postgresql://postgres:fxlixb9u2i2xzw5q@213.199.57.111:5432/postgres";

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: REMOTE_DB_URL
        }
    }
});

async function testAuth() {
    const email = 'user8@zenowethu.co.za';
    const password = 'TestPassword123!';

    console.log(`\n=== Testing Authentication Flow ===\n`);
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
    console.log(`Database: ${REMOTE_DB_URL}\n`);

    try {
        // Step 1: Convert email to lowercase (as auth.ts does)
        const emailLowerCase = email.toLowerCase();
        console.log(`Step 1: Email normalized to: ${emailLowerCase}`);

        // Step 2: Find user
        const user = await prisma.user.findUnique({
            where: { email: emailLowerCase }
        });

        if (!user) {
            console.log('❌ FAIL: User not found');
            process.exit(1);
        }
        console.log(`✓ Step 2: User found: ${user.firstName} ${user.lastName}`);
        console.log(`   - ID: ${user.id}`);
        console.log(`   - Email: ${user.email}`);
        console.log(`   - Organization: ${user.organization}`);
        console.log(`   - isLocked: ${user.isLocked}`);
        console.log(`   - Password hash: ${user.password}`);

        // Step 3: Check if locked
        if (user.isLocked) {
            console.log('❌ FAIL: Account is locked');
            process.exit(1);
        }
        console.log(`✓ Step 3: Account is not locked`);

        // Step 4: Compare password
        console.log(`\nStep 4: Comparing password...`);
        console.log(`   Input password: ${password}`);
        console.log(`   Stored hash: ${user.password}`);

        const passwordMatch = await bcrypt.compare(password, user.password);
        console.log(`   Match result: ${passwordMatch}`);

        if (!passwordMatch) {
            console.log('❌ FAIL: Password does not match');
            process.exit(1);
        }
        console.log(`✓ Step 4: Password matches!`);

        // Step 5: Check role
        const userRole = user.role || 'MEMBER';
        console.log(`\n✓ Step 5: User role: ${userRole}`);

        // Step 6: Would return user object
        const returnedUser = {
            id: user.id,
            email: user.email,
            name: `${user.firstName} ${user.lastName}`,
            firstName: user.firstName,
            lastName: user.lastName,
            organization: user.organization,
            role: userRole,
            isAdmin: userRole === 'ADMIN',
            isManager: userRole === 'MANAGER' || userRole === 'ADMIN',
            userType: user.userType || 'STAFF',
            b2bPartnerId: user.b2bPartnerId || null
        };

        console.log(`\n✓ Authentication would succeed with user object:`);
        console.log(JSON.stringify(returnedUser, null, 2));

        console.log(`\n✅ AUTHENTICATION TEST PASSED!`);

    } catch (error) {
        console.error('❌ Error during authentication:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

testAuth()
    .catch((e) => {
        console.error('Fatal error:', e);
        process.exit(1);
    });
