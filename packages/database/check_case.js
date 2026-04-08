const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const c = await prisma.case.findUnique({
    where: { id: 'cmnp3m1fl00007khtkwshv7em' }
  });

  console.log('CASE DATA:', JSON.stringify(c, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
