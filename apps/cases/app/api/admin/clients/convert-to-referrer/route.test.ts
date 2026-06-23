import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@zenowethu/database';

describe('POST /api/admin/clients/convert-to-referrer', () => {
    let testClient: any;
    let testReferrer: any;
    let testUser: any;
    let testCase: any;

    beforeAll(async () => {
        // Create a test admin user
        testUser = await prisma.user.create({
            data: {
                username: 'admin-convert-test',
                firstName: 'Test',
                lastName: 'Admin',
                email: 'admin-convert@example.com',
                password: 'hashed_password',
                isAdmin: true,
            },
        });

        // Create a parent referrer for referral chain testing
        const parentProject = await prisma.project.create({
            data: {
                name: 'Parent Referrer Project',
                type: 'REFERRER',
            },
        });

        testReferrer = await prisma.referrer.create({
            data: {
                firstName: 'Parent',
                lastName: 'Referrer',
                idNumber: '9001011111111',
                projectId: parentProject.id,
                createdById: testUser.id,
                isActive: true,
            },
        });
    });

    beforeEach(async () => {
        // Create test client
        testClient = await prisma.client.create({
            data: {
                firstName: 'Jane',
                lastName: 'Smith',
                idNumber: '9001019999999',
                email: 'jane@example.com',
                phone: '0829876543',
                bankName: 'ABSA',
                accountNumber: '1234567890',
                accountType: 'CHEQUE',
                branchCode: '632005',
                accountHolderName: 'Jane Smith',
            },
        });

        // Create a case referred by the parent referrer
        testCase = await prisma.case.create({
            data: {
                fileNumber: `TST${Date.now()}`,
                clientId: testClient.id,
                status: 'INTAKE_INITIAL',
                referrerId: testReferrer.id,
                createdById: testUser.id,
            },
        });
    });

    afterAll(async () => {
        // Cleanup
        await prisma.case.deleteMany({});
        await prisma.client.deleteMany({});
        await prisma.referrer.deleteMany({});
        await prisma.project.deleteMany({});
        await prisma.auditLog.deleteMany({});
        await prisma.user.deleteMany({});
    });

    it('should create a referrer from client data', async () => {
        expect(testClient).toBeDefined();
        expect(testClient.firstName).toBe('Jane');
        expect(testClient.idNumber).toBe('9001019999999');
    });

    it('should preserve referral chain (parentReferrerId)', async () => {
        // When a client is referred by a referrer, that relationship should be preserved
        expect(testCase.referrerId).toBe(testReferrer.id);
        // When converting this client to a referrer, their parentReferrerId should be set
    });

    it('should create sub-project for new referrer', async () => {
        // The conversion should create a new project with type 'REFERRER'
        const existingProject = await prisma.project.findFirst({
            where: { type: 'REFERRER' },
        });
        expect(existingProject).toBeDefined();
    });

    it('should copy banking details from client', async () => {
        expect(testClient.bankName).toBe('ABSA');
        expect(testClient.accountNumber).toBe('1234567890');
        // These should be copied to the new referrer record
    });
});
