const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function cleanupNonZenowethuUsers() {
  try {
    console.log('\n🧹 CLEANING UP NON-ZENOWETHU USERS\n');
    console.log('═'.repeat(80));

    // Users to delete (Test Admins and non-Zenowethu staff)
    const usersToDelete = [
      // Test Admins
      'admin-convert-1784298178956945@example.com',
      'admin-convert-1784898837597602@example.com',
      'admin-convert-1784898865274253@example.com',
      'admin-convert-1785224068342999@example.com',
      'admin-convert@example.com',
      'admin-test-1784883722157638@example.com',
      'admin-test@example.com',
      // Non-Zenowethu Managers
      'alson@letsatsifinance.co.za',
      'derby@shosholoza.co.za',
      'jaun@future-finance.co.za',
      'mmamy@letsatsifinance.co.za',
      'mmnguni73@gmail.com',
      // Non-Zenowethu Staff
      'lesego@letsatsifinance.co.za',
      'lintle@curroblack.co.za',
      'metsa@letsatsifinance.co.za',
      'mishack@letsatsifinance.co.za',
      'palesa@letsatsifinance.co.za',
      'referrer.1112115656088@portal.zenowethu.local',
      'referrer.7908125586088@portal.zenowethu.local',
      'referrer.alberton.1@portal.zenowethu.local',
      'sibongile@letsatsifinance.co.za',
    ];

    console.log(`Deleting ${usersToDelete.length} non-Zenowethu users...\n`);

    let deleted = 0;
    for (const email of usersToDelete) {
      try {
        const user = await prisma.user.findUnique({ where: { email } });
        if (user) {
          await prisma.user.delete({ where: { id: user.id } });
          console.log(`✓ Deleted: ${email}`);
          deleted++;
        }
      } catch (error) {
        console.error(`✗ Error deleting ${email}:`, error.message);
      }
    }

    console.log(`\n✅ Successfully deleted ${deleted} users\n`);

    // Get remaining users
    const remainingUsers = await prisma.user.findMany({
      where: {
        email: {
          endsWith: '@zenowethu.co.za',
        },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isAdmin: true,
        role: true,
        userType: true,
      },
      orderBy: { email: 'asc' },
    });

    console.log(`📊 REMAINING ZENOWETHU USERS: ${remainingUsers.length}\n`);
    console.log('═'.repeat(80));

    // Categorize remaining users
    const categories = {
      admin: [],
      executive: [],
      manager: [],
      finance: [],
      staff: [],
    };

    remainingUsers.forEach((user) => {
      const name = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;

      if (user.isAdmin) {
        categories.admin.push({ email: user.email, name, role: user.role });
      } else if (user.role && user.role.toUpperCase().includes('EXECUTIVE')) {
        categories.executive.push({ email: user.email, name, role: user.role });
      } else if (user.role && user.role.toUpperCase().includes('MANAGER')) {
        categories.manager.push({ email: user.email, name, role: user.role });
      } else if (user.role && user.role.toUpperCase().includes('FINANCE')) {
        categories.finance.push({ email: user.email, name, role: user.role });
      } else {
        categories.staff.push({ email: user.email, name, role: user.role });
      }
    });

    // Print by category
    if (categories.admin.length > 0) {
      console.log('\n👤 ADMIN\n');
      categories.admin.forEach((user, i) => {
        console.log(`${i + 1}. ${user.name}`);
        console.log(`   📧 Email: ${user.email}`);
        console.log('');
      });
    }

    if (categories.executive.length > 0) {
      console.log('\n🎯 EXECUTIVE\n');
      categories.executive.forEach((user, i) => {
        console.log(`${i + 1}. ${user.name}`);
        console.log(`   📧 Email: ${user.email}`);
        console.log('');
      });
    }

    if (categories.manager.length > 0) {
      console.log('\n👔 MANAGER\n');
      categories.manager.forEach((user, i) => {
        console.log(`${i + 1}. ${user.name}`);
        console.log(`   📧 Email: ${user.email}`);
        console.log('');
      });
    }

    if (categories.finance.length > 0) {
      console.log('\n💰 FINANCE\n');
      categories.finance.forEach((user, i) => {
        console.log(`${i + 1}. ${user.name}`);
        console.log(`   📧 Email: ${user.email}`);
        console.log('');
      });
    }

    if (categories.staff.length > 0) {
      console.log('\n👥 STAFF\n');
      categories.staff.forEach((user, i) => {
        console.log(`${i + 1}. ${user.name}`);
        console.log(`   📧 Email: ${user.email}`);
        console.log('');
      });
    }

    // Print summary
    console.log('\n📈 FINAL SUMMARY\n');
    console.log('═'.repeat(80));
    console.log(`Admin:     ${categories.admin.length}`);
    console.log(`Executive: ${categories.executive.length}`);
    console.log(`Manager:   ${categories.manager.length}`);
    console.log(`Finance:   ${categories.finance.length}`);
    console.log(`Staff:     ${categories.staff.length}`);
    console.log(`─────────────────────`);
    console.log(`Total:     ${remainingUsers.length}`);
    console.log(`\nDeleted:   ${deleted} non-Zenowethu users`);
    console.log(`\n✅ All users are now from @zenowethu.co.za domain\n`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

cleanupNonZenowethuUsers();
