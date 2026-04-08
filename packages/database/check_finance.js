const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const projects = await prisma.project.findMany({
    where: {
      name: {
        contains: 'Finance',
        mode: 'insensitive'
      }
    },
    select: {
      id: true,
      name: true
    }
  });

  console.log('FINANCE PROJECTS FOUND:', JSON.stringify(projects, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
