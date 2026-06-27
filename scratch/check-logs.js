const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Checking recent notification logs...');
    const logs = await prisma.notificationLog.findMany({
        take: 5,
        orderBy: { sentAt: 'desc' },
        select: {
            id: true,
            channel: true,
            recipient: true,
            success: true,
            error: true,
            provider: true,
            sentAt: true,
            message: true
        }
    });

    console.log(JSON.stringify(logs, null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
