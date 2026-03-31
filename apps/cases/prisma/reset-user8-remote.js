// This script connects to the REMOTE PostgreSQL database and resets user8's password
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

// Explicitly use the remote database URL
const REMOTE_DB_URL = "postgresql://postgres:fxlixb9u2i2xzw5q@213.199.57.111:5432/postgres";

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: REMOTE_DB_URL
        }
    }
});

async function resetPassword() {
    const email = 'user8@zenowethu.co.za';
    const newPassword = 'TestPassword123!';

    console.log(`\n=== Resetting password for ${email} in REMOTE PostgreSQL ===\n`);
    console.log(`Database URL: ${REMOTE_DB_URL}`);

    try {
        // First, check if user exists
        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() }
        });

        if (!user) {
            console.error(`ERROR: User ${email} not found in REMOTE PostgreSQL database!`);
            console.log('\nLet me list all users:');
            const allUsers = await prisma.user.findMany({
                select: {
                    email: true,
                    firstName: true,
                    lastName: true,
                    organization: true,
                    isAdmin: true
                },
                take: 20
            });
            console.log(`Found ${allUsers.length} users:`);
            allUsers.forEach(u => {
                console.log(`  - ${u.email} (${u.firstName} ${u.lastName}) [${u.organization}] ${u.isAdmin ? '[ADMIN]' : ''}`);
            });
            process.exit(1);
        }

        console.log(`Found user: ${user.firstName} ${user.lastName}`);
        console.log(`Current email: ${user.email}`);
        console.log(`Organization: ${user.organization}`);
        console.log(`Is Admin: ${user.isAdmin}`);
        console.log(`Current password hash: ${user.password}`);

        // Hash the new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        console.log(`\nNew password hash: ${hashedPassword}`);

        // Update the user's password
        await prisma.user.update({
            where: { email: email.toLowerCase() },
            data: { password: hashedPassword }
        });

        console.log(`\n✓ Password successfully updated in REMOTE PostgreSQL!`);
        console.log(`\nTest credentials:`);
        console.log(`  Email: ${email}`);
        console.log(`  Password: ${newPassword}`);

        // Verify the password works
        const updatedUser = await prisma.user.findUnique({
            where: { email: email.toLowerCase() }
        });

        if (updatedUser && await bcrypt.compare(newPassword, updatedUser.password)) {
            console.log(`\n✓ Password verification successful!`);
        } else {
            console.error(`\n✗ Password verification FAILED!`);
            console.error(`Stored hash: ${updatedUser?.password}`);
            console.error(`Test password: ${newPassword}`);
            process.exit(1);
        }
    } catch (error) {
        console.error('Error:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

resetPassword()
    .catch((e) => {
        console.error('Fatal error:', e);
        process.exit(1);
    });
