import { PrismaClient } from '@prisma/client';
import { logger } from '@zenowethu/shared-lib';

const prisma = new PrismaClient();

async function main() {
    const searchNames = ['Rose', 'Olivia', 'Kenneth'];
    logger.info(`Searching for users: ${searchNames.join(', ')}...`);

    const users = await prisma.user.findMany({
        where: {
            OR: searchNames.map(name => ({
                firstName: {
                    contains: name,
                    mode: 'insensitive' } })) },
        select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            userType: true } });

    if (users.length === 0) {
        logger.info('No users found matching these names.');
    } else {
        logger.info('Found users:');
        users.forEach(user => {
            logger.info(`- ${user.firstName} ${user.lastName} (${user.email}) [Current Role: ${user.role}]`);
        });
    }
}

main()
    .catch((e) => {
        logger.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
