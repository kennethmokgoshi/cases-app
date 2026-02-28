
import { PrismaClient } from '@prisma/client';
import { logger } from '@zenowethu/shared-lib';

const prisma = new PrismaClient();

async function main() {
    logger.info('--- Debugging B2B Access & Data ---');

    // 1. Count Cases
    const caseCount = await prisma.case.count();
    logger.info(`Total Cases in DB: ${caseCount}`);

    const allCases = await prisma.case.findMany({
        take: 5,
        include: { client: true, projects: true }
    });
    logger.info('First 5 cases:', JSON.stringify(allCases.map(c => ({
        id: c.id,
        fileNumber: c.fileNumber,
        client: c.client.firstName + ' ' + c.client.lastName,
        projects: c.projects.map(p => p.projectId)
    })), null, 2));

    // 2. Find User Lesego
    const user = await prisma.user.findFirst({
        where: {
            OR: [
                { email: { contains: 'Lesego', mode: 'insensitive' } },
                { firstName: { contains: 'Lesego', mode: 'insensitive' } }
            ]
        },
        include: {
            projectMemberships: {
                include: { project: true }
            }
        }
    });

    if (!user) {
        logger.error('❌ User "Lesego" NOT FOUND.');
        return;
    }

    logger.info(`\nFound User: ${user.firstName} ${user.lastName} (${user.email})`);
    logger.info(`User Type: ${user.userType}`);
    logger.info(`Role: ${user.role}`);
    logger.info(`Is Admin: ${user.isAdmin}`);
    logger.info(`Memberships: ${user.projectMemberships.length}`);
    user.projectMemberships.forEach(pm => {
        logger.info(` - Project: ${pm.project.name} (${pm.projectId}) Role: ${pm.role}`);
    });

    // 3. Simulate API Logic
    logger.info('\n--- Simulating API Access Logic ---');

    // Logic from route.ts
    const userRole = user.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN' || user.isAdmin === true;
    const isStaff = user.userType === 'STAFF';
    const isRestricted = !isAdmin && !isStaff;

    logger.info(`isRestricted: ${isRestricted}`);

    if (isRestricted) {
        // Find all projects the user is a member of
        const rootAllowedIds = user.projectMemberships.map(m => m.projectId);
        logger.info(`Root Allowed IDs: ${JSON.stringify(rootAllowedIds)}`);

        if (rootAllowedIds.length === 0) {
            logger.info('❌ User has NO project memberships. API returns [] (Empty Array).');
            // Check if B2B Partner ID exists?
            // Note: Current route.ts DOES NOT check b2bPartnerId, it relies on projectMemberships.
        } else {
            logger.info('User has project memberships. Calculating descendants...');
            // ... logic to fetch descendants ...
            const allProjects = await prisma.project.findMany({ select: { id: true, parentId: true } });

            const getDescendantIds = (rootId: string): string[] => {
                const descendants: string[] = [];
                const queue = [rootId];
                while (queue.length > 0) {
                    const currId = queue.shift()!;
                    const children = allProjects.filter(p => p.parentId === currId);
                    children.forEach(child => {
                        descendants.push(child.id);
                        queue.push(child.id);
                    });
                }
                return descendants;
            };

            const effectiveProjectIds = new Set<string>();
            rootAllowedIds.forEach(id => {
                effectiveProjectIds.add(id);
                getDescendantIds(id).forEach(childId => effectiveProjectIds.add(childId));
            });
            logger.info(`Effective Project Access Count: ${effectiveProjectIds.size}`);

            // Try query
            try {
                const cases = await prisma.case.findMany({
                    where: {
                        projects: { some: { projectId: { in: Array.from(effectiveProjectIds) } } }
                    },
                    take: 5
                });
                logger.info(`✅ API Query Success! Found ${cases.length} cases accessible to user.`);
            } catch (e: any) {
                logger.error('❌ API Query FAILED:', e);
            }
        }
    } else {
        logger.info('User is ADMIN or STAFF. Full access.');
    }

}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        logger.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
