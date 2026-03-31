import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function resetPassword() {
    const email = 'user8@zenowethu.co.za'
    const newPassword = 'TestPassword123!'

    console.log(`\n=== Resetting password for ${email} ===\n`)

    // First, check if user exists
    const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() }
    })

    if (!user) {
        console.error(`ERROR: User ${email} not found in database!`)
        process.exit(1)
    }

    console.log(`Found user: ${user.firstName} ${user.lastName}`)
    console.log(`Current email: ${user.email}`)
    console.log(`Organization: ${user.organization}`)
    console.log(`Is Admin: ${user.isAdmin}`)

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10)

    // Update the user's password
    await prisma.user.update({
        where: { email: email.toLowerCase() },
        data: { password: hashedPassword }
    })

    console.log(`\n✓ Password successfully updated!`)
    console.log(`\nTest credentials:`)
    console.log(`  Email: ${email}`)
    console.log(`  Password: ${newPassword}`)

    // Verify the password works
    const updatedUser = await prisma.user.findUnique({
        where: { email: email.toLowerCase() }
    })

    if (updatedUser && await bcrypt.compare(newPassword, updatedUser.password)) {
        console.log(`\n✓ Password verification successful!`)
    } else {
        console.error(`\n✗ Password verification FAILED!`)
        process.exit(1)
    }

    await prisma.$disconnect()
}

resetPassword()
    .catch((e) => {
        console.error('Error:', e)
        process.exit(1)
    })
