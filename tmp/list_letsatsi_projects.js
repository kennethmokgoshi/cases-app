const { PrismaClient } = require('@zenowethu/database');
const prisma = new PrismaClient();

async function main() {
  const projects = await prisma.project.findMany({
    where: {
      name: {
        contains: 'Letsatsi'
      }
    }
  });
  console.log(JSON.stringify(projects, null, 2));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
