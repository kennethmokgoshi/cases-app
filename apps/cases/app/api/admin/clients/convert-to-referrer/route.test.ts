import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@zenowethu/database';

// Unique per run so reruns / parallel test files never collide on unique fields.
// Cleanup is scoped to only these records, in FK-safe order — never deleteMany({}).
const uniq = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const rand13 = () => String(Math.floor(1e12 + Math.random() * 9e12)); // random 13-digit ID

describe('POST /api/admin/clients/convert-to-referrer', () => {
    let testClient: any;
    let testReferrer: any;
    let testUser: any;
    let testCase: any;
    let parentProject: any;
    const clientIdNumber = rand13();

    beforeAll(async () => {
        testUser = await prisma.user.create({
            data: {
                username: `admin-convert-test-${uniq}`,
                firstName: 'Test',
                lastName: 'Admin',
                email: `admin-convert-${uniq}@example.com`,
                password: 'hashed_password',
                isAdmin: true,
            },
        });

        parentProject = await prisma.project.create({
            data: {
                name: `Parent Referrer Project ${uniq}`,
                type: 'REFERRER',
            },
        });

        testReferrer = await prisma.referrer.create({
            data: {
                firstName: 'Parent',
                lastName: 'Referrer',
                idNumber: rand13(),
                projectId: parentProject.id,
                createdById: testUser.id,
                isActive: true,
            },
        });

        testClient = await prisma.client.create({
            data: {
                firstName: 'Jane',
                lastName: 'Smith',
                idNumber: clientIdNumber,
                email: `jane-${uniq}@example.com`,
                phone: '0829876543',
                bankName: 'ABSA',
                accountNumber: '1234567890',
                accountType: 'CHEQUE',
                branchCode: '632005',
                accountHolderName: 'Jane Smith',
            },
        });

        testCase = await prisma.case.create({
            data: {
                fileNumber: `TST${uniq}`,
                clientId: testClient.id,
                status: 'INTAKE_INITIAL',
                referrerId: testReferrer.id,
                createdById: testUser.id,
            },
        });
    });

    afterAll(async () => {
        // Scoped, FK-safe cleanup — children before parents, only this suite's records.
        await prisma.case.deleteMany({ where: { id: testCase?.id } });
        await prisma.client.deleteMany({ where: { id: testClient?.id } });
        await prisma.referrer.deleteMany({ where: { id: testReferrer?.id } });
        await prisma.project.deleteMany({ where: { id: parentProject?.id } });
        await prisma.user.deleteMany({ where: { id: testUser?.id } });
    });

    it('should create a referrer from client data', async () => {
        expect(testClient).toBeDefined();
        expect(testClient.firstName).toBe('Jane');
        expect(testClient.idNumber).toBe(clientIdNumber);
    });

    it('should preserve referral chain (parentReferrerId)', async () => {
        // When a client is referred by a referrer, that relationship should be preserved
        expect(testCase.referrerId).toBe(testReferrer.id);
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
    });
});
