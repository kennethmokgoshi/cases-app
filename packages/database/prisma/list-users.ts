import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  try {
    const users = await prisma.user.findMany()
    console.log('--- DB USERS ---')
    console.log(
      JSON.stringify(
        users.map(u => ({
          id: u.id,
          email: u.email,
          firstName: u.firstName,
          lastName: u.lastName,
          role: u.role,
          userType: u.userType,
          isAdmin: u.isAdmin,
        })),
        null,
        2
      )
    )
  } catch (error) {
    console.error('Error running list-users:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
