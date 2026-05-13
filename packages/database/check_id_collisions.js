const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const clients = await prisma.client.findMany({
    select: { id: true, idNumber: true }
  });

  const duplicates = new Map();
  clients.forEach(c => {
    const trimmed = c.idNumber.trim();
    if (trimmed !== c.idNumber) {
      console.log(`Found non-trimmed ID: "${c.idNumber}" (ID: ${c.id})`);
    }
    
    if (duplicates.has(trimmed)) {
      duplicates.get(trimmed).push(c.id);
    } else {
      duplicates.set(trimmed, [c.id]);
    }
  });

  console.log('\nScanning for collision after trim...');
  let collisionCount = 0;
  for (const [idNumber, ids] of duplicates.entries()) {
    if (ids.length > 1) {
      console.log(`Collision found for ID "${idNumber}": ${ids.join(', ')}`);
      collisionCount++;
    }
  }
  
  if (collisionCount === 0) {
    console.log('No collisions found. Safe to trim all IDs.');
  } else {
    console.log(`Found ${collisionCount} collisions. Merging will be required.`);
  }
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
