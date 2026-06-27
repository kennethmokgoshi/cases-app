const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function check() {
  try {
    // Count all referrers
    const totalReferrers = await prisma.referrer.count();
    console.log(`\n✅ Total Referrer Records: ${totalReferrers}`);

    // Count active referrers
    const activeReferrers = await prisma.referrer.count({ where: { isActive: true } });
    console.log(`✅ Active Referrers: ${activeReferrers}`);

    // Find orphan projects (REFERRER type without a Referrer record)
    const allReferrerProjects = await prisma.project.findMany({
      where: { type: 'REFERRER' },
      select: { id: true, name: true },
    });
    console.log(`\n📁 Total REFERRER-type Projects: ${allReferrerProjects.length}`);

    const referrerIds = await prisma.referrer.findMany({
      select: { projectId: true },
    });
    const linkedProjectIds = new Set(referrerIds.map(r => r.projectId).filter(Boolean));

    const orphanProjects = allReferrerProjects.filter(p => !linkedProjectIds.has(p.id));
    console.log(`⚠️  Orphan Projects (no Referrer record): ${orphanProjects.length}`);

    if (orphanProjects.length > 0) {
      console.log('\n   Orphan projects (appear in dropdown only):');
      orphanProjects.forEach(p => {
        console.log(`   • ${p.name}`);
      });
    }

    // Get all referrers with their project info
    const referrers = await prisma.referrer.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        isActive: true,
        projectId: true,
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    console.log(`\n👥 All Referrer Records (${referrers.length} total):`);
    referrers.forEach(r => {
      const status = r.isActive ? '✓' : '✗';
      console.log(`   ${status} ${r.firstName} ${r.lastName} (Project: ${r.projectId ? r.projectId.substring(0, 8) : 'NONE'})`);
    });

    // Summary
    console.log(`\n📊 SUMMARY:`);
    console.log(`   Referrer Records in main list (/admin/referrers): ${totalReferrers}`);
    console.log(`   Items selectable in dropdown (/api/admin/referrers/dropdown): ${totalReferrers + orphanProjects.length}`);
    console.log(`   Difference: ${orphanProjects.length} orphan projects`);

    if (orphanProjects.length === 0) {
      console.log(`\n✅ NO DIFFERENCE - All lists are in sync!`);
    } else {
      console.log(`\n⚠️  DIFFERENCE FOUND - ${orphanProjects.length} projects in dropdown but not in main list`);
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

check();
