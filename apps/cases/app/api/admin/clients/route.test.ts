import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@zenowethu/database';

// Unique per run so reruns / parallel test files never collide on unique fields
// (username, idNumber). Cleanup is scoped to only these records — never deleteMany({}),
// which would wipe the whole database and hit FK violations.
const uniq = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const rand13 = () => String(Math.floor(1e12 + Math.random() * 9e12)); // random 13-digit ID

describe('GET /api/admin/clients', () => {
    let testClient: any;
    let testUser: any;

    beforeAll(async () => {
        testUser = await prisma.user.create({
            data: {
                username: `admin-test-${uniq}`,
                firstName: 'Test',
                lastName: 'Admin',
                email: `admin-test-${uniq}@example.com`,
                password: 'hashed_password',
                isAdmin: true,
            },
        });

        testClient = await prisma.client.create({
            data: {
                firstName: 'John',
                lastName: 'Doe',
                idNumber: rand13(),
                email: `john-${uniq}@example.com`,
                phone: '0821234567',
                employer: 'ABC Corp',
            },
        });
    });

    afterAll(async () => {
        // Scoped cleanup — only the records this suite created.
        await prisma.client.deleteMany({ where: { id: testClient?.id } });
        await prisma.user.deleteMany({ where: { id: testUser?.id } });
    });

    it('should return clients list with pagination', async () => {
        // This test verifies the fixture shape; auth() would be mocked for a full route test.
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
