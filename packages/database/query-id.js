const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const client = await prisma.client.findUnique({
    where: { idNumber: '7805130292084' },
    include: {
      cases: {
        select: {
          id: true,
          fileNumber: true,
          isAdminOnly: true,
          projects: { select: { projectId: true } }
        }
      }
    }
  });

  console.log('Client Search Result:', JSON.stringify(client, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
