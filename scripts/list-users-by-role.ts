import { prisma } from '@zenowethu/database'

async function listUsersByRole() {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        isAdmin: true,
        isExecutive: true,
        isSeniorManager: true,
        isManager: true,
        role: true,
        userType: true,
      },
      orderBy: { email: 'asc' },
    })

    console.log(`\n📊 TOTAL USERS: ${users.length}\n`)

    const categories = {
      admin: [] as string[],
      executive: [] as string[],
      manager: [] as string[],
      finance: [] as string[],
      staff: [] as string[],
    }

    users.forEach(user => {
      const name = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email
      const userInfo = `${name} (${user.email})`

      if (user.isAdmin) {
        categories.admin.push(userInfo)
      } else if (user.isExecutive) {
        categories.executive.push(userInfo)
      } else if (user.isSeniorManager || user.isManager) {
        categories.manager.push(userInfo)
      } else if (user.role === 'FINANCE' || user.role?.includes('FINANCE')) {
        categories.finance.push(userInfo)
      } else {
        categories.staff.push(userInfo)
      }
    })

    // Print categorized results
    console.log('👤 ADMIN (Can manage everything)')
    console.log('═'.repeat(60))
    if (categories.admin.length === 0) {
      console.log('   (none)')
    } else {
      categories.admin.forEach((user, i) => console.log(`   ${i + 1}. ${user}`))
    }

    console.log('\n🎯 EXECUTIVE (Can view all, approve major actions)')
    console.log('═'.repeat(60))
    if (categories.executive.length === 0) {
      console.log('   (none)')
    } else {
      categories.executive.forEach((user, i) => console.log(`   ${i + 1}. ${user}`))
    }

    console.log('\n👔 MANAGER (Can manage team)')
    console.log('═'.repeat(60))
    if (categories.manager.length === 0) {
      console.log('   (none)')
    } else {
      categories.manager.forEach((user, i) => console.log(`   ${i + 1}. ${user}`))
    }

    console.log('\n💰 FINANCE (Can manage invoices & payments)')
    console.log('═'.repeat(60))
    if (categories.finance.length === 0) {
      console.log('   (none)')
    } else {
      categories.finance.forEach((user, i) => console.log(`   ${i + 1}. ${user}`))
    }

    console.log('\n👥 STAFF (Regular team members)')
    console.log('═'.repeat(60))
    if (categories.staff.length === 0) {
      console.log('   (none)')
    } else {
      categories.staff.forEach((user, i) => console.log(`   ${i + 1}. ${user}`))
    }

    console.log('\n📈 SUMMARY')
    console.log('═'.repeat(60))
    console.log(`   Admin:     ${categories.admin.length}`)
    console.log(`   Executive: ${categories.executive.length}`)
    console.log(`   Manager:   ${categories.manager.length}`)
    console.log(`   Finance:   ${categories.finance.length}`)
    console.log(`   Staff:     ${categories.staff.length}`)
    console.log(`   ─────────────────`)
    console.log(`   Total:     ${users.length}\n`)

  } catch (error) {
    console.error('Error querying users:', error)
  } finally {
    await prisma.$disconnect()
  }
}

listUsersByRole()
