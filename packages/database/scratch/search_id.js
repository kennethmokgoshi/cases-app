const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const idNumber = '8207225452088';
  console.log(`Searching for ID Number: ${idNumber}`);

  const clients = await prisma.client.findMany({
    where: { idNumber: idNumber },
    include: { cases: true }
  });
  console.log('--- Clients ---');
  console.log(JSON.stringify(clients, null, 2));

  const users = await prisma.user.findMany({
    where: { idNumber: idNumber }
  });
  console.log('--- Users ---');
  console.log(JSON.stringify(users, null, 2));

  const consumerAccounts = await prisma.consumerAccount.findMany({
    where: { idNumber: idNumber }
  });
  console.log('--- ConsumerAccounts ---');
  console.log(JSON.stringify(consumerAccounts, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
