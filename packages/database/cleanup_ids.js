const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Starting ID number cleanup...');
  
  const clients = await prisma.client.findMany({
    select: { id: true, idNumber: true }
  });

  let updatedCount = 0;
  for (const client of clients) {
    const trimmed = client.idNumber.trim();
    if (trimmed !== client.idNumber) {
      console.log(`Trimming ID: "${client.idNumber}" -> "${trimmed}"`);
      await prisma.client.update({
        where: { id: client.id },
        data: { idNumber: trimmed }
      });
      updatedCount++;
    }
  }

  console.log(`\nCleanup complete. Updated ${updatedCount} clients.`);
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
