import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.project.updateMany({
    where: {
      name: 'Letsatsi Finance and Loans Mthata April 2026'
    },
    data: {
      name: 'Letsatsi Mthata April 2026'
    }
  });
  console.log(`Updated ${result.count} projects.`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
