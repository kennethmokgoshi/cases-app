const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const c = await prisma.case.findUnique({
    where: { id: 'cmnp3m1fl00007khtkwshv7em' },
    include: {
      projects: {
        include: {
          project: {
            include: {
              parent: {
                include: {
                  parent: {
                    include: {
                      parent: true
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  });

  if (!c) {
    console.log('Case not found');
    return;
  }

  console.log('CASE PROJECTS AND ANCESTORS:');
  c.projects.forEach(cp => {
    let curr = cp.project;
    const path = [];
    while (curr) {
      path.unshift({ id: curr.id, name: curr.name, type: curr.type });
      curr = curr.parent;
    }
    console.log(`Path for project ${cp.project.id}:`, JSON.stringify(path, null, 2));
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
