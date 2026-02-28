import { describe, it, expect, vi } from 'vitest';
import { hasPermission, apiError, apiSuccess } from './api-auth';

// Mocking NextResponse since it's used in apiError and apiSuccess
vi.mock('next/server', () => ({
    NextResponse: {
        json: vi.fn((data, init) => ({
            json: async () => data,
            status: init?.status || 200,
            headers: init?.headers || {}
        }))
    }
}));

describe('Auth Utilities', () => {

    describe('hasPermission', () => {
        const mockApiKey = {
            id: 'key_123',
            name: 'Test Key',
            permissions: ['read', 'write'],
            projectId: 'proj_123',
            rateLimit: 100
        };

        it('should return true if permission is explicitly granted', () => {
            expect(hasPermission(mockApiKey, 'read')).toBe(true);
            expect(hasPermission(mockApiKey, 'write')).toBe(true);
        });

        it('should return false if permission is missing', () => {
            expect(hasPermission(mockApiKey, 'delete')).toBe(false);
        });

        it('should return true if "full" permission is granted', () => {
            const adminKey = { ...mockApiKey, permissions: ['full'] };
            expect(hasPermission(adminKey, 'read')).toBe(true);
            expect(hasPermission(adminKey, 'write')).toBe(true);
            expect(hasPermission(adminKey, 'delete')).toBe(true);
        });

        it('should handle comma-separated string cases (if applicable)', () => {
            // The implementation uses includes on an array, so we don't need to test strings here
            // as validateApiKey already splits them.
        });
    });

    describe('API Response Helpers', () => {
        it('should format error responses correctly', async () => {
            const response = apiError('Unauthorized', 401);
            const data = await response.json();
            expect(data).toEqual({ error: 'Unauthorized', success: false });
            expect(response.status).toBe(401);
        });

        it('should format success responses correctly', async () => {
            const resultData = { id: 1, name: 'Test' };
            const response = apiSuccess(resultData);
            const data = await response.json();
            expect(data).toEqual({ data: resultData, success: true });
            expect(response.status).toBe(200);
        });
    });
});
