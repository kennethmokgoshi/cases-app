const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const cases = await prisma.case.findMany({
        take: 5,
        select: { id: true, fileNumber: true }
    });
    console.log('Sample Cases:', JSON.stringify(cases, null, 2));

    if (cases.length > 0) {
        const id = cases[0].id;
        const detail = await prisma.case.findUnique({
            where: { id },
            include: { client: true }
        });
        console.log(`Detail for ${id}:`, JSON.stringify(detail, null, 2));
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
