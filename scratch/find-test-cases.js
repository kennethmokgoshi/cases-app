const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkCases() {
    const cases = await prisma.case.findMany({
        take: 5,
        include: {
            documents: true,
            client: true
        },
        where: {
            documents: {
                some: {
                    type: { in: ['ID', 'POA'] }
                }
            }
        }
    });

    console.log('Cases with ID/POA:');
    cases.forEach(c => {
        console.log(`- ${c.fileNumber} (${c.id}): ${c.documents.map(d => d.type).join(', ')}`);
    });

    await prisma.$disconnect();
}

checkCases();
