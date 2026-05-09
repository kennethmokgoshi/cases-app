const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    console.log('Testing Prisma query with updatedBy include...');
    const cases = await prisma.case.findMany({
      take: 5,
      include: {
        client: true,
        updatedBy: {
          select: {
            firstName: true,
            lastName: true
          }
        }
      }
    });
    console.log(`Success! Found ${cases.length} cases.`);
    if (cases.length > 0) {
      console.log('Sample case updatedBy:', JSON.stringify(cases[0].updatedBy, null, 2));
    }
  } catch (error) {
    console.error('Prisma query failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
