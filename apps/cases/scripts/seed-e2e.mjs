/**
 * E2E Test Prerequisites Seed Script
 *
 * Ensures all test data exists for E2E tests to run without skips:
 * 1. Test user (user8) has admin access to see all projects/cases
 * 2. ProjectMember records link user8 to ACQUISITION_SOURCE projects
 * 3. At least one case exists with proper client and project linkage
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const TEST_USER_EMAIL = 'user8@zenowethu.co.za';
const TEST_PASSWORD = process.env.SEED_PASSWORD || process.env.E2E_PASSWORD || 'TestPassword123!';

async function main() {
    console.log('\n=== E2E Test Prerequisites Seed ===\n');

    // 1. Ensure test user exists and is admin
    console.log('1. Setting up test user...');
    let user = await prisma.user.findUnique({ where: { email: TEST_USER_EMAIL } });

    if (!user) {
        const hashedPassword = bcrypt.hashSync(TEST_PASSWORD, 10);
        user = await prisma.user.create({
            data: {
                email: TEST_USER_EMAIL,
                username: TEST_USER_EMAIL,
                firstName: 'E2E',
                lastName: 'TestUser',
                password: hashedPassword,
                organization: 'Zenowethu',
                role: 'ADMIN',
                isAdmin: true,
                userType: 'STAFF',
            }
        });
        console.log('   Created test user:', user.email);
    } else {
        // Update to admin if not already
        if (!user.isAdmin) {
            await prisma.user.update({
                where: { email: TEST_USER_EMAIL },
                data: { isAdmin: true, role: 'ADMIN' }
            });
            console.log('   Updated user to admin:', user.email);
        } else {
            console.log('   User already admin:', user.email);
        }

        // Ensure password is correct
        const passwordMatch = bcrypt.compareSync(TEST_PASSWORD, user.password);
        if (!passwordMatch) {
            const hashedPassword = bcrypt.hashSync(TEST_PASSWORD, 10);
            await prisma.user.update({
                where: { email: TEST_USER_EMAIL },
                data: { password: hashedPassword }
            });
            console.log('   Updated password');
        } else {
            console.log('   Password verified OK');
        }
    }

    // Refresh user data
    user = await prisma.user.findUnique({ where: { email: TEST_USER_EMAIL } });
    console.log('   User ID:', user.id, '| Admin:', user.isAdmin, '| Role:', user.role);

    // 2. Ensure ROOT project exists
    console.log('\n2. Setting up project hierarchy...');
    let rootProject = await prisma.project.findFirst({ where: { type: 'ROOT' } });

    if (!rootProject) {
        rootProject = await prisma.project.create({
            data: {
                id: 'zdm-files-root',
                name: 'ZDM FILES',
                slug: 'zdm-files',
                type: 'ROOT',
            }
        });
        console.log('   Created ROOT project:', rootProject.name);
    } else {
        console.log('   ROOT project exists:', rootProject.name, '(id:', rootProject.id + ')');
    }

    // 3. Ensure at least one ACQUISITION_SOURCE project exists
    let sourceProjects = await prisma.project.findMany({
        where: { type: 'ACQUISITION_SOURCE', parentId: rootProject.id }
    });

    if (sourceProjects.length === 0) {
        const source = await prisma.project.create({
            data: {
                id: 'letsatsi-referrals',
                name: 'Letsatsi Referrals',
                slug: 'letsatsi-referrals',
                type: 'ACQUISITION_SOURCE',
                parentId: rootProject.id,
                clientType: 'B2B',
            }
        });
        sourceProjects = [source];
        console.log('   Created ACQUISITION_SOURCE:', source.name);
    } else {
        console.log('   ACQUISITION_SOURCE projects exist:', sourceProjects.length, 'total');
        // Ensure at least one has clientType B2B (needed for /partner/cases/new)
        const b2bSources = sourceProjects.filter(p => p.clientType === 'B2B');
        if (b2bSources.length === 0) {
            await prisma.project.update({
                where: { id: sourceProjects[0].id },
                data: { clientType: 'B2B' }
            });
            console.log('   Set clientType=B2B on:', sourceProjects[0].name);
        } else {
            console.log('   B2B sources:', b2bSources.length);
        }
    }

    // 4. Add ProjectMember records for test user on ALL source projects
    console.log('\n3. Setting up project memberships...');
    const allSourceProjects = await prisma.project.findMany({
        where: { type: 'ACQUISITION_SOURCE' }
    });

    let added = 0;
    for (const project of allSourceProjects) {
        const existing = await prisma.projectMember.findUnique({
            where: { projectId_userId: { projectId: project.id, userId: user.id } }
        });
        if (!existing) {
            await prisma.projectMember.create({
                data: {
                    projectId: project.id,
                    userId: user.id,
                    role: 'ADMIN',
                }
            });
            added++;
        }
    }
    console.log('   Added', added, 'new memberships (total sources:', allSourceProjects.length + ')');

    // Also add membership to ROOT project
    const rootMembership = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: rootProject.id, userId: user.id } }
    });
    if (!rootMembership) {
        await prisma.projectMember.create({
            data: { projectId: rootProject.id, userId: user.id, role: 'ADMIN' }
        });
        console.log('   Added ROOT project membership');
    }

    // 5. Ensure at least one case exists with proper linkage
    console.log('\n4. Setting up test case data...');
    const caseCount = await prisma.case.count();

    if (caseCount === 0) {
        // Create a client first
        let client = await prisma.client.findFirst({ where: { idNumber: '8001015009087' } });
        if (!client) {
            client = await prisma.client.create({
                data: {
                    firstName: 'John',
                    lastName: 'Doe',
                    idNumber: '8001015009087',
                    email: 'john.doe@test.co.za',
                    phone: '0712345678',
                    clientType: 'Payroll',
                }
            });
            console.log('   Created client:', client.firstName, client.lastName);
        }

        // Create a case
        const newCase = await prisma.case.create({
            data: {
                fileNumber: 'ZDM-E2E-001',
                clientId: client.id,
                status: 'NEW_LEAD',
                createdById: user.id,
            }
        });
        console.log('   Created case:', newCase.fileNumber);

        // Link case to a source project
        const sourceProject = allSourceProjects[0];
        if (sourceProject) {
            await prisma.caseProject.create({
                data: {
                    caseId: newCase.id,
                    projectId: sourceProject.id,
                    isPrimary: true,
                }
            });
            console.log('   Linked case to:', sourceProject.name);
        }
    } else {
        console.log('   Cases already exist:', caseCount);

        // Ensure at least one case is linked to a project user8 can access
        const casesWithProjects = await prisma.caseProject.count();
        console.log('   Case-Project links:', casesWithProjects);
    }

    // 6. Verify everything is set up
    console.log('\n=== Verification ===');

    const finalUser = await prisma.user.findUnique({
        where: { email: TEST_USER_EMAIL },
        select: { id: true, email: true, isAdmin: true, role: true, userType: true }
    });
    console.log('User:', finalUser);

    const memberships = await prisma.projectMember.count({ where: { userId: user.id } });
    console.log('Project memberships:', memberships);

    const cases = await prisma.case.count();
    console.log('Total cases:', cases);

    const sources = await prisma.project.count({ where: { type: 'ACQUISITION_SOURCE' } });
    console.log('ACQUISITION_SOURCE projects:', sources);

    const b2bCount = await prisma.project.count({ where: { type: 'ACQUISITION_SOURCE', clientType: 'B2B' } });
    console.log('B2B sources:', b2bCount);

    console.log('\n=== E2E Seed Complete ===\n');
}

main()
    .catch((e) => {
        console.error('Seed failed:', e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
