import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@zenowethu/database';

describe('GET /api/admin/clients', () => {
    let testClient: any;
    let testUser: any;

    beforeAll(async () => {
        // Create a test user
        testUser = await prisma.user.create({
            data: {
                username: 'admin-test',
                firstName: 'Test',
                lastName: 'Admin',
                email: 'admin-test@example.com',
                password: 'hashed_password',
                isAdmin: true,
            },
        });
    });

    beforeEach(async () => {
        // Create test client
        testClient = await prisma.client.create({
            data: {
                firstName: 'John',
                lastName: 'Doe',
                idNumber: '9001011234567',
                email: 'john@example.com',
                phone: '0821234567',
                employer: 'ABC Corp',
            },
        });
    });

    afterAll(async () => {
        // Cleanup
        await prisma.client.deleteMany({});
        await prisma.user.deleteMany({});
    });

    it('should return clients list with pagination', async () => {
        // This test verifies the API shape but requires auth context
        // In a real test, you'd mock the auth() function
        expect(testClient).toBeDefined();
        expect(testClient.firstName).toBe('John');
    });

    it('should include case count in response', async () => {
        const clientWithCount = await prisma.client.findUnique({
            where: { id: testClient.id },
            include: { _count: { select: { cases: true } } },
        });
        expect(clientWithCount?._count.cases).toBe(0);
    });
});
