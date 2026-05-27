import { prisma } from '@zenowethu/database';

export type AuditAction = 'READ' | 'CREATE' | 'UPDATE' | 'DELETE' | 'EXPORT' | 'GENERATE_PDF';

export interface AuditLogOptions {
    userId?: string;
    action: AuditAction;
    resource: string;
    resourceId?: string;
    details?: Record<string, any>;
}

/**
 * Standardized logger for POPIA compliance. Tracks who accessed/modified what PII and when.
 */
export async function logAuditAction(options: AuditLogOptions) {
    try {
        await prisma.auditLog.create({
            data: {
                userId: options.userId || null,
                action: options.action,
                resource: options.resource,
                resourceId: options.resourceId || null,
                details: options.details ? options.details : undefined,
            },
        });
    } catch (error) {
        // We log to console but don't fail the primary request if audit logging fails,
        // though in strict environments we might want to throw.
        console.error('Failed to write AuditLog', error);
    }
}
