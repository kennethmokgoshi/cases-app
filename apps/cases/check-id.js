const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const idNumber = '7805130292084';
    try {
        const deleted = await prisma.client.delete({
            where: { idNumber }
        });
        console.log('Successfully deleted client:', deleted.id);
    } catch (e) {
        console.error('Failed to delete client:', e.message);
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());
