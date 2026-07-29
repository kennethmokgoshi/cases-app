import bcryptjs from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function resetPasswords() {
  try {
    console.log('🔐 Starting password reset...\n');

    // Admin password
    const adminPassword = 'AdminPassword123!';
    const adminHashedPassword = await bcryptjs.hash(adminPassword, 10);

    // All other users password
    const otherPassword = 'Military@1';
    const otherHashedPassword = await bcryptjs.hash(otherPassword, 10);

    // Update Admin user(s)
    const adminUsers = await prisma.user.updateMany({
      where: { isAdmin: true },
      data: { password: adminHashedPassword }
    });

    console.log(`✅ Updated ${adminUsers.count} admin user(s) with password: AdminPassword123!`);

    // Update all other users
    const otherUsers = await prisma.user.updateMany({
      where: { isAdmin: false },
      data: { password: otherHashedPassword }
    });

    console.log(`✅ Updated ${otherUsers.count} other user(s) with password: Military@1`);

    // List all users to confirm
    const allUsers = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isAdmin: true,
        role: true
      },
      orderBy: { isAdmin: 'desc' }
    });

    console.log('\n📋 Updated Users:\n');
    allUsers.forEach(user => {
      const pwd = user.isAdmin ? 'AdminPassword123!' : 'Military@1';
      console.log(`  • ${user.firstName} ${user.lastName} (${user.email})`);
      console.log(`    Role: ${user.role} | Admin: ${user.isAdmin ? 'Yes' : 'No'}`);
      console.log(`    Password: ${pwd}\n`);
    });

    console.log(`\n✨ Password reset complete! Total users: ${allUsers.length}`);

  } catch (error) {
    console.error('❌ Error resetting passwords:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

resetPasswords();
