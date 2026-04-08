const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || "postgresql://postgres:fxlixb9u2i2xzw5q@213.199.57.111:5432/postgres?connection_limit=10&pool_timeout=30&connect_timeout=30"
    }
  }
});

async function main() {
  const projects = await prisma.project.findMany({
    where: {
      name: {
        contains: 'Letsatsi',
        mode: 'insensitive'
      }
    },
    select: {
      id: true,
      name: true
    }
  });

  console.log('PROJECTS FOUND:', JSON.stringify(projects, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
