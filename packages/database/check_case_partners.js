const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const cases = await prisma.case.findMany({
    where: {
      partnerName: {
        contains: 'Finance',
        mode: 'insensitive'
      }
    },
    select: {
      id: true,
      partnerName: true
    }
  });

  console.log('CASES WITH FINANCE PARTNER:', JSON.stringify(cases, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
