import { prisma } from '@zenowethu/database';
import { validateApiKey, hasPermission, apiError, apiSuccess , logger } from '@zenowethu/shared-lib';

/**
 * GET /api/v1/cases/:id
 * Get a single case by ID or file number
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
                client: true,
                projects: {
                    include: {
                        project: { select: { id: true, name: true, type: true } }
                    }
                },
                workflowLogs: {
                    orderBy: { timestamp: 'desc' },
                    take: 10,
                    include: { user: true }
                }
            }
        });

        if (!caseRecord) {
            return apiError('Case not found', 404);
        }

        // Check if API key has access to this case (if scoped to a project)
        if (apiKey.projectId) {
            const hasAccess = caseRecord.projects.some(p => p.projectId === apiKey.projectId);
            if (!hasAccess) {
                return apiError('Case not found', 404); // Don't reveal existence
            }
        }

        // Format response
        const response = {
            id: caseRecord.id,
            fileNumber: caseRecord.fileNumber,
            status: caseRecord.status,
            acquisitionType: caseRecord.acquisitionType,
            client: {
                firstName: caseRecord.client.firstName,
                lastName: caseRecord.client.lastName,
                idNumber: caseRecord.client.idNumber,
                phone: caseRecord.client.phone,
                email: caseRecord.client.email },
            services: caseRecord.services,
            isOverdue: caseRecord.isOverdue,
            projects: caseRecord.projects.map(p => ({
                id: p.project.id,
                name: p.project.name,
                isPrimary: p.isPrimary
            })),
            statusHistory: caseRecord.workflowLogs.map(log => ({
                fromStatus: log.fromStatus,
                toStatus: log.toStatus,
                changedBy: log.user?.username || 'System',
                notes: log.notes,
                timestamp: log.timestamp.toISOString()
            })),
            createdAt: caseRecord.createdAt.toISOString(),
            updatedAt: caseRecord.updatedAt.toISOString() };

        return apiSuccess(response);
    } catch (error) {
        logger.error('API v1 GET /cases/:id error:', error);
        return apiError('Failed to fetch case', 500);
    }
}

/**
 * PATCH /api/v1/cases/:id
 * Update a case status
 */
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    // Validate API key
    const validation = await validateApiKey(request);
    if (!validation.valid) {
        return apiError(validation.error, validation.status);
    }

    const { apiKey } = validation;

    // Check write permission
    if (!hasPermission(apiKey, 'write')) {
        return apiError('API key does not have write permission', 403);
    }

    try {
        const { id } = await params;
        const body = await request.json();
        const { status, notes } = body;

        // Find the case
        const caseRecord = await prisma.case.findFirst({
            where: {
                OR: [{ id }, { fileNumber: id }]
            },
            include: {
                projects: true
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

        // Update the case
        const updateData: Record<string, unknown> = {};
        if (status) updateData.status = status;
        if (notes !== undefined) updateData.notes = notes;

        const updatedCase = await prisma.case.update({
            where: { id: caseRecord.id },
            data: updateData
        });

        // Log status change
        if (status && status !== caseRecord.status) {
            await prisma.workflowLog.create({
                data: {
                    caseId: caseRecord.id,
                    fromStatus: caseRecord.status,
                    toStatus: status,
                    notes: `[API: ${apiKey.name}] ${notes || 'Status updated via API'}`
                }
            });
        }

        return apiSuccess({
            id: updatedCase.id,
            fileNumber: updatedCase.fileNumber,
            status: updatedCase.status,
            updatedAt: updatedCase.updatedAt.toISOString(),
            message: 'Case updated successfully'
        });
    } catch (error) {
        logger.error('API v1 PATCH /cases/:id error:', error);
        return apiError('Failed to update case', 500);
    }
}

