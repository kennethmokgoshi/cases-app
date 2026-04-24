const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const idNumber = '8207225452088';
  console.log(`Searching for ID Number: ${idNumber} using raw SQL`);

  try {
    const clients = await prisma.$queryRaw`SELECT * FROM "Client" WHERE "idNumber" = ${idNumber}`;
    console.log('--- Clients ---');
    console.log(JSON.stringify(clients, null, 2));
  } catch (e) {
    console.log('Error searching Client table');
  }

  try {
    const users = await prisma.$queryRaw`SELECT * FROM "User" WHERE "idNumber" = ${idNumber}`;
    console.log('--- Users ---');
    console.log(JSON.stringify(users, null, 2));
  } catch (e) {
    console.log('Error searching User table');
  }

  try {
    const consumerAccounts = await prisma.$queryRaw`SELECT * FROM "ConsumerAccount" WHERE "idNumber" = ${idNumber}`;
    console.log('--- ConsumerAccounts ---');
    console.log(JSON.stringify(consumerAccounts, null, 2));
  } catch (e) {
    console.log('Error searching ConsumerAccount table');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
