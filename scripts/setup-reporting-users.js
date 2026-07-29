const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function setupReportingUsers() {
  try {
    console.log('\n🔐 SETTING UP REPORTING APP PASSWORDS\n');
    console.log('═'.repeat(80));

    // Get all users
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        isAdmin: true,
        role: true,
        userType: true,
      },
      orderBy: { email: 'asc' },
    });

    if (users.length === 0) {
      console.log('❌ No users found in the database.');
      return;
    }

    console.log(`\n📊 Found ${users.length} users. Setting password: "Reporting@1"\n`);

    // Hash the password
    const hashedPassword = bcrypt.hashSync('Reporting@1', 10);

    // Update all users with the password
    let updated = 0;
    for (const user of users) {
      try {
        await prisma.user.update({
          where: { id: user.id },
          data: { password: hashedPassword },
        });
        updated++;
      } catch (error) {
        console.error(`Error updating user ${user.email}:`, error.message);
      }
    }

    console.log(`✅ Updated ${updated} users with password\n`);

    // Display all users with their roles
    console.log('👥 ALL USERS - LOGIN CREDENTIALS\n');
    console.log('═'.repeat(80));

    const categories = {
      admin: [],
      manager: [],
      executive: [],
      finance: [],
      staff: [],
    };

    users.forEach((user) => {
      const name = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
      const displayUser = {
        email: user.email,
        name: name,
        password: 'Reporting@1',
        role: user.role,
        userType: user.userType,
      };

      if (user.isAdmin) {
        categories.admin.push(displayUser);
      } else if (user.role && user.role.toUpperCase().includes('MANAGER')) {
        categories.manager.push(displayUser);
      } else if (user.role && user.role.toUpperCase().includes('EXECUTIVE')) {
        categories.executive.push(displayUser);
      } else if (user.role && user.role.toUpperCase().includes('FINANCE')) {
        categories.finance.push(displayUser);
      } else {
        categories.staff.push(displayUser);
      }
    });

    // Print by category
    if (categories.admin.length > 0) {
      console.log('\n👤 ADMIN (Highest Access)\n');
      categories.admin.forEach((user, i) => {
        console.log(`${i + 1}. ${user.name}`);
        console.log(`   📧 Email:    ${user.email}`);
        console.log(`   🔑 Password: ${user.password}`);
        console.log(`   🎯 Role:     ${user.role}`);
        console.log('');
      });
    }

    if (categories.executive.length > 0) {
      console.log('\n🎯 EXECUTIVE (High Access)\n');
      categories.executive.forEach((user, i) => {
        console.log(`${i + 1}. ${user.name}`);
        console.log(`   📧 Email:    ${user.email}`);
        console.log(`   🔑 Password: ${user.password}`);
        console.log(`   🎯 Role:     ${user.role}`);
        console.log('');
      });
    }

    if (categories.manager.length > 0) {
      console.log('\n👔 MANAGER (Team Management)\n');
      categories.manager.forEach((user, i) => {
        console.log(`${i + 1}. ${user.name}`);
        console.log(`   📧 Email:    ${user.email}`);
        console.log(`   🔑 Password: ${user.password}`);
        console.log(`   🎯 Role:     ${user.role}`);
        console.log('');
      });
    }

    if (categories.finance.length > 0) {
      console.log('\n💰 FINANCE (Financial Management)\n');
      categories.finance.forEach((user, i) => {
        console.log(`${i + 1}. ${user.name}`);
        console.log(`   📧 Email:    ${user.email}`);
        console.log(`   🔑 Password: ${user.password}`);
        console.log(`   🎯 Role:     ${user.role}`);
        console.log('');
      });
    }

    if (categories.staff.length > 0) {
      console.log('\n👥 STAFF (Regular Members)\n');
      categories.staff.forEach((user, i) => {
        console.log(`${i + 1}. ${user.name}`);
        console.log(`   📧 Email:    ${user.email}`);
        console.log(`   🔑 Password: ${user.password}`);
        console.log(`   🎯 Role:     ${user.role || 'MEMBER'}`);
        console.log('');
      });
    }

    // Print summary
    console.log('\n📈 SUMMARY\n');
    console.log('═'.repeat(80));
    console.log(`Admin:     ${categories.admin.length}`);
    console.log(`Executive: ${categories.executive.length}`);
    console.log(`Manager:   ${categories.manager.length}`);
    console.log(`Finance:   ${categories.finance.length}`);
    console.log(`Staff:     ${categories.staff.length}`);
    console.log(`─────────────────────`);
    console.log(`Total:     ${users.length}`);

    console.log('\n✅ LOGIN URL: http://localhost:3008');
    console.log('🔑 Password for all users: Reporting@1\n');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

setupReportingUsers();
