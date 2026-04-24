const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const consumerId = 'cmn4atyns000086uvmfizehua';
  const requests = await prisma.serviceRequest.findMany({
    where: { consumerId: consumerId }
  });
  console.log(JSON.stringify(requests, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
