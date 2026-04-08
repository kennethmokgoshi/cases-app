const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const projects = await prisma.project.findMany({
    where: {
      name: {
        contains: 'Letsatsi',
        mode: 'insensitive'
      }
    }
  });

  console.log('ALL LETSATSI PROJECTS:', JSON.stringify(projects, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
