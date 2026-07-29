const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// Hash password using bcrypt (same as auth.ts)
function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

async function createUser() {
  try {
    const hashedPassword = hashPassword('Reporting@1');

    // First check if user exists
    const existing = await prisma.user.findUnique({
      where: { email: 'reporting@zenowethu.co.za' }
    });

    if (existing) {
      console.log('✓ User exists - updating password with bcrypt...');
      const updated = await prisma.user.update({
        where: { email: 'reporting@zenowethu.co.za' },
        data: { password: hashedPassword }
      });
      console.log('✓ Password updated successfully!');
      console.log('Email: reporting@zenowethu.co.za');
      console.log('Password: Reporting@1');
      return;
    }

    const user = await prisma.user.create({
      data: {
        email: 'reporting@zenowethu.co.za',
        username: 'reporting',
        firstName: 'Reporting',
        lastName: 'Staff',
        password: hashedPassword,
        userType: 'STAFF',
      },
    });

    console.log('✓ User created successfully!');
    console.log('Email: reporting@zenowethu.co.za');
    console.log('Password: Reporting@1');
    console.log('User ID:', user.id);
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

createUser();
