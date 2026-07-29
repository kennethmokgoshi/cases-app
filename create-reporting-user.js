const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

// Simple password hash using Node's built-in crypto
function hashPassword(password) {
  // This is a simple hash for demo - in production use bcrypt
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function createUser() {
  try {
    const hashedPassword = hashPassword('Reporting@1');

    // First check if user exists
    const existing = await prisma.user.findUnique({
      where: { email: 'reporting@zenowethu.co.za' }
    });

    if (existing) {
      console.log('✓ User already exists');
      console.log('Email: reporting@zenowethu.co.za');
      console.log('Password: Reporting@1');
      return;
    }

    const user = await prisma.user.create({
      data: {
        email: 'reporting@zenowethu.co.za',
        firstName: 'Reporting',
        lastName: 'Staff',
        password: hashedPassword,
        userType: 'STAFF',
        status: 'ACTIVE',
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
