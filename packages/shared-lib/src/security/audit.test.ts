import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logAuditAction } from './audit';
import { prisma } from '@zenowethu/database';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        auditLog: {
            create: vi.fn(),
        }
    }
}));

describe('Audit Logger', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('creates an audit log entry', async () => {
        await logAuditAction({
            userId: 'user-123',
            action: 'READ',
            resource: 'Client',
            resourceId: 'client-456'
        });

        expect(prisma.auditLog.create).toHaveBeenCalledWith({
            data: {
                userId: 'user-123',
                action: 'READ',
                resource: 'Client',
                resourceId: 'client-456',
                details: undefined
            }
        });
    });

    it('handles missing optional fields', async () => {
        await logAuditAction({
            action: 'EXPORT',
            resource: 'Report'
        });

        expect(prisma.auditLog.create).toHaveBeenCalledWith({
            data: {
                userId: null,
                action: 'EXPORT',
                resource: 'Report',
                resourceId: null,
                details: undefined
            }
        });
    });
});
