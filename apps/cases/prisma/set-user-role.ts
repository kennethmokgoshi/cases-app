/**
 * Utility script to set a user's role by email.
 * Usage: npx ts-node --project apps/cases/tsconfig.json apps/cases/prisma/set-user-role.ts <email> <role>
 * Example: npx ts-node --project apps/cases/tsconfig.json apps/cases/prisma/set-user-role.ts rose@zenowethu.co.za FINANCE
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '@zenowethu/shared-lib';

const prisma = new PrismaClient();

const validRoles = ['MEMBER', 'MANAGER', 'EXECUTIVE', 'FINANCE', 'ADMIN', 'B2B_PARTNER'];

async function main() {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        logger.error('Usage: npx ts-node apps/cases/prisma/set-user-role.ts <email> <role>');
        logger.error('Supported Roles:', validRoles.join(', '));
        process.exit(1);
    }

    const email = args[0];
    const role = args[1].toUpperCase();

    if (!validRoles.includes(role)) {
        logger.error(`Invalid role: ${role}`);
        logger.error('Supported Roles:', validRoles.join(', '));
        process.exit(1);
    }

    logger.info(`Updating user ${email} to role ${role}...`);

    try {
        // Find user first to ensure they exist
        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() }, // Ensure email is lowercased for match
        });

        if (!user) {
            logger.error(`User with email ${email} not found.`);
            process.exit(1);
        }

        // Prepare update data
        const updateData: any = {
            role: role };

        // Set helper flags based on role
        if (role === 'ADMIN') {
            updateData.isAdmin = true;
            updateData.isManager = true; // Admins are implicitly managers
        } else if (role === 'MANAGER') {
            updateData.isManager = true;
            updateData.isAdmin = false;
        } else {
            updateData.isAdmin = false;
            updateData.isManager = false;
        }

        if (role === 'B2B_PARTNER') {
            updateData.userType = 'B2B_PARTNER';
        } else {
            // Only reset userType if they were B2B_PARTNER, otherwise keep as STAFF
            if (user.userType === 'B2B_PARTNER') {
                updateData.userType = 'STAFF';
            }
        }

        const updatedUser = await prisma.user.update({
            where: { email: email.toLowerCase() },
            data: updateData });

        logger.info(`✅ Success! User ${updatedUser.firstName} ${updatedUser.lastName} (${updatedUser.email}) updated.`);
        logger.info(`- Role: ${updatedUser.role}`);
        logger.info(`- Is Admin: ${updatedUser.isAdmin}`);
        logger.info(`- Is Manager: ${updatedUser.isManager}`);
        logger.info(`- User Type: ${updatedUser.userType}`);

    } catch (error) {
        logger.error('Error updating user:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
