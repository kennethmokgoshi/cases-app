const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // 1. Are there multiple "Letsatsi" projects?
  const letsatsis = await prisma.project.findMany({
    where: { name: { contains: 'Letsatsi' } },
    select: { id: true, name: true, type: true, clientType: true, parentId: true },
  });
  console.log('=== Letsatsi projects ===');
  letsatsis.forEach(l => console.log(`${l.name} | ${l.type} | clientType=${l.clientType} | id=${l.id} | parentId=${l.parentId}`));

  // 2. Compare Bethlehem vs a working referrer (Athlone): parent id + member userIds
  const names = ['Bethlehem', 'Athlone'];
  for (const name of names) {
    const p = await prisma.project.findFirst({
      where: { name, type: 'REFERRER' },
      select: {
        id: true, name: true, parentId: true,
        referrerId: true,
        members: { select: { userId: true, role: true } },
      },
    });
    if (!p) { console.log(`\n${name}: NOT FOUND`); continue; }
    console.log(`\n=== ${name} ===`);
    console.log(`id=${p.id} parentId=${p.parentId} referrerId=${p.referrerId} memberCount=${p.members.length}`);
    console.log('memberUserIds=', p.members.map(m => m.userId).join(','));
  }

  // 3. Find B2B partner users (userType or b2bPartnerId set)
  const partners = await prisma.user.findMany({
    where: { OR: [{ userType: 'B2B' }, { b2bPartnerId: { not: null } }] },
    select: { id: true, email: true, userType: true, b2bPartnerId: true, role: true },
    take: 20,
  });
  console.log('\n=== B2B partner users ===');
  partners.forEach(u => console.log(`${u.email} | userType=${u.userType} | role=${u.role} | b2bPartnerId=${u.b2bPartnerId} | id=${u.id}`));
}

main().finally(() => prisma.$disconnect());
