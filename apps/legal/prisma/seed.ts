import { logger } from '@zenowethu/shared-lib';
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
    logger.info('Start seeding ...')

    // --- Seed Users ---
    const defaultPassword = await bcrypt.hash(process.env.SEED_PASSWORD || 'changeme-dev-only', 10)

    // Helper function to determine organization from email domain
    const getOrganization = (email: string): string => {
        const domain = email.toLowerCase().split('@')[1]
        if (domain?.includes('letsatsifinance')) return 'Letsatsi'
        if (domain?.includes('futurefinance')) return 'Future Finance'
        if (domain?.includes('shosholoza')) return 'Shosholoza'
        if (domain?.includes('zenowethu')) return 'Zenowethu'
        return 'Zenowethu' // Default
    }

    const users = [
        // Letsatsi Users
        { username: 'Lesego@letsatsifinance.co.za', firstName: 'Lesego', lastName: 'Nyakalo', email: 'Lesego@letsatsifinance.co.za', isAdmin: false },
        { username: 'mmamy@letsatsifinance.co.za', firstName: 'Mmamy', lastName: 'Matlou', email: 'mmamy@letsatsifinance.co.za', isAdmin: false },
        { username: 'sibongile@letsatsifinance.co.za', firstName: 'Sibongile', lastName: 'Mnyabiso', email: 'sibongile@letsatsifinance.co.za', isAdmin: false },
        // Zenowethu Users
        { username: 'user8@zenowethu.co.za', firstName: 'zenowethu', lastName: 'zenowethu', email: 'user8@zenowethu.co.za', isAdmin: false },
        { username: 'kenneth@zenowethu.co.za', firstName: 'Kenneth', lastName: 'Mokgoshi', email: 'kenneth@zenowethu.co.za', isAdmin: true },
        { username: 'user10@zenowethu.co.za', firstName: 'Zenowethu', lastName: 'Zenowethu', email: 'user10@zenowethu.co.za', isAdmin: false },
        { username: 'user11@zenowethu.co.za', firstName: 'Zenowethu', lastName: 'Zenowethu', email: 'user11@zenowethu.co.za', isAdmin: false },
        { username: 'user12@zenowethu.co.za', firstName: 'Zenowethu', lastName: 'Zenowethu', email: 'user12@zenowethu.co.za', isAdmin: false },
        { username: 'user13@zenowethu.co.za', firstName: 'Zenowethu', lastName: 'Zenowethu', email: 'user13@zenowethu.co.za', isAdmin: false },
        { username: 'bheki@zenowethu.co.za', firstName: 'Bheki', lastName: 'Mhlabane', email: 'bheki@zenowethu.co.za', isAdmin: false },
        { username: 'katlego@zenowethu.co.za', firstName: 'Katlego', lastName: 'Modiselle', email: 'katlego@zenowethu.co.za', isAdmin: false },
        { username: 'user16@zenowethu.co.za', firstName: 'Zenowethu', lastName: 'Zenowethu', email: 'user16@zenowethu.co.za', isAdmin: false },
        { username: 'onmnisi@zenowethu.co.za', firstName: 'Olivia', lastName: 'Mnisi', email: 'onmnisi@zenowethu.co.za', isAdmin: false },
        { username: 'moshet@zenowethu.co.za', firstName: 'Moshe', lastName: 'Teane', email: 'moshet@zenowethu.co.za', isAdmin: false },
        { username: 'thendo@zenowethu.co.za', firstName: 'Thendo', lastName: 'Baloyi', email: 'thendo@zenowethu.co.za', isAdmin: false },
    ]

    for (const user of users) {
        const organization = getOrganization(user.email)
        await prisma.user.upsert({
            where: { email: user.email },
            update: { organization }, // Update organization if user exists
            create: {
                username: user.username,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                password: defaultPassword,
                organization,
                isAdmin: user.isAdmin } })
    }

    logger.info(`Created ${users.length} users`)

    // 1. Create Top-Level Project: ZDM FILES
    const zdmFiles = await prisma.project.upsert({
        where: { id: 'zdm-files-root' },
        update: { type: 'ROOT' },
        create: {
            id: 'zdm-files-root',
            name: 'ZDM FILES',
            type: 'ROOT',
            description: 'Master container for all client files' } })

    logger.info(`Created root project: ${zdmFiles.name} (${zdmFiles.id})`)

    // 2. Create Reporting-Based Sub-Projects (Acquisition Sources)
    const sources = [
        { id: 'letsatsi-referrals', name: 'Letsatsi Referrals' },
        { id: 'shosholoza-referrals', name: 'Shosholoza Referrals' },
        { id: 'future-finance-referrals', name: 'Future Finance Referrals' },
        { id: 'car-dealership-referrals', name: 'Car Dealership Referrals' },
        { id: 'walk-ins-direct', name: 'Walk-Ins & D E' },
    ]

    let letsatsiProject;

    for (const source of sources) {
        const p = await prisma.project.upsert({
            where: { id: source.id },
            update: { type: 'ACQUISITION_SOURCE' },
            create: {
                id: source.id,
                name: source.name,
                type: 'ACQUISITION_SOURCE',
                parentId: zdmFiles.id } })
        if (source.name === 'Letsatsi Referrals') {
            letsatsiProject = p;
        }
    }

    logger.info('Created acquisition source projects')

    // 3. Create Example Secondary Project (Audit)
    const auditProject = await prisma.project.upsert({
        where: { id: 'audit-project' },
        update: {},
        create: {
            id: 'audit-project',
            name: 'Paul Kruger 1 - Jan 2024 to Q2 2025 Audit',
            type: 'Audit',
            description: 'Temporary project for audit purposes' } })

    logger.info('Created secondary audit project')

    // 4. Create Dummy Client & Case (only if not exists)
    const existingClient = await prisma.client.findUnique({
        where: { idNumber: '8001015009087' }
    })

    if (!existingClient) {
        const client = await prisma.client.create({
            data: {
                firstName: 'John',
                lastName: 'Doe',
                idNumber: '8001015009087',
                email: 'john.doe@example.com',
                phone: '0821234567',
                type: 'Payroll',
                cases: {
                    create: {
                        fileNumber: 'ZDM-2025-001',
                        status: 'Outstanding Documents',
                        projects: {
                            create: [
                                {
                                    projectId: letsatsiProject!.id,
                                    isPrimary: true
                                },
                                {
                                    projectId: auditProject.id,
                                    isPrimary: false
                                }
                            ]
                        }
                    }
                }
            } })
        logger.info(`Created dummy client: ${client.firstName} ${client.lastName}`)
    } else {
        logger.info('Dummy client already exists, skipping...')
    }

    logger.info('Seeding finished.')
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        logger.error(e)
        await prisma.$disconnect()
        process.exit(1)
    })
