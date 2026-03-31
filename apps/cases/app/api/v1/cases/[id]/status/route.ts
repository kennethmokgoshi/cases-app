import { prisma } from '@zenowethu/database';
import { validateApiKey, hasPermission, apiError, apiSuccess, createLogger } from '@zenowethu/shared-lib';

const logger = createLogger('api/v1/cases/[id]/status');

/**
 * GET /api/v1/cases/:id/status
 * Quick status check for a case
 */
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    // Validate API key
    const validation = await validateApiKey(request);
    if (!validation.valid) {
        return apiError(validation.error, validation.status);
    }

    const { apiKey } = validation;

    // Check read permission
    if (!hasPermission(apiKey, 'read')) {
        return apiError('API key does not have read permission', 403);
    }

    try {
        const { id } = await params;

        // Find case by ID or file number
        const caseRecord = await prisma.case.findFirst({
            where: {
                OR: [
                    { id },
                    { fileNumber: id }
                ]
            },
            include: {
                projects: true,
                workflowLogs: {
                    orderBy: { timestamp: 'desc' },
                    take: 1,
                    include: { user: true }
                }
            }
        });

        if (!caseRecord) {
            return apiError('Case not found', 404);
        }

        // Check access if scoped
        if (apiKey.projectId) {
            const hasAccess = caseRecord.projects.some(p => p.projectId === apiKey.projectId);
            if (!hasAccess) {
                return apiError('Case not found', 404);
            }
        }

        const lastUpdate = caseRecord.workflowLogs[0];

        return apiSuccess({
            fileNumber: caseRecord.fileNumber,
            status: caseRecord.status,
            isOverdue: caseRecord.isOverdue,
            lastUpdated: lastUpdate ? lastUpdate.timestamp.toISOString() : caseRecord.updatedAt.toISOString(),
            lastUpdatedBy: lastUpdate?.user?.username || null });
    } catch (error) {
        logger.error('API v1 GET /cases/:id/status error:', error);
        return apiError('Failed to fetch case status', 500);
    }
}

