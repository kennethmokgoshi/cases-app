import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { validateApiKey, hasPermission, apiError, apiSuccess, logger } from '@zenowethu/shared-lib';

/**
 * GET /api/v1/cases
 * List cases accessible by the API key
 * Query params: status, limit, offset, search
 */
export async function GET(request: Request) {
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
        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status');
        const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
        const offset = parseInt(searchParams.get('offset') || '0');
        const search = searchParams.get('search');

        // Build filter based on API key scope
        const whereClause: Record<string, unknown> = {};

        // If API key is scoped to a project, only return those cases
        if (apiKey.projectId) {
            whereClause.projects = {
                some: {
                    projectId: apiKey.projectId,
                    isPrimary: true
                }
            };
        }

        if (status) {
            whereClause.status = status;
        }

        if (search) {
            whereClause.OR = [
                { fileNumber: { contains: search } },
                { client: { firstName: { contains: search } } },
                { client: { lastName: { contains: search } } },
                { client: { idNumber: { contains: search } } },
            ];
        }

        const [cases, total] = await Promise.all([
            prisma.case.findMany({
                where: whereClause,
                include: {
                    client: {
                        select: {
                            firstName: true,
                            lastName: true,
                            idNumber: true,
                            phone: true,
                            email: true }
                    }
                },
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip: offset }),
            prisma.case.count({ where: whereClause })
        ]);

        // Format response
        const formattedCases = cases.map(c => ({
            id: c.id,
            fileNumber: c.fileNumber,
            status: c.status,
            acquisitionType: c.acquisitionType,
            client: {
                firstName: c.client.firstName,
                lastName: c.client.lastName,
                idNumber: c.client.idNumber,
                phone: c.client.phone,
                email: c.client.email },
            services: c.services,
            isOverdue: c.isOverdue,
            createdAt: c.createdAt.toISOString(),
            updatedAt: c.updatedAt.toISOString() }));

        return apiSuccess({
            cases: formattedCases,
            pagination: {
                total,
                limit,
                offset,
                hasMore: offset + limit < total
            }
        });
    } catch (error) {
        logger.error('API v1 GET /cases error:', error);
        return apiError('Failed to fetch cases', 500);
    }
}

/**
 * POST /api/v1/cases
 * Create a new case via API
 */
export async function POST(request: Request) {
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
        const body = await request.json();
        const { client, services, notes } = body;

        // Validate required fields
        if (!client?.firstName || !client?.lastName || !client?.idNumber) {
            return apiError('Client firstName, lastName, and idNumber are required', 400);
        }

        // A consumer without an email address cannot be updated on DHS or receive
        // any case correspondence, so referrals must carry one.
        const clientEmail = typeof client.email === 'string' ? client.email.trim().toLowerCase() : '';
        if (!clientEmail) {
            return apiError('Client email is required', 400);
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
            return apiError('Client email is not a valid email address', 400);
        }

        // Check if client exists or create new
        let existingClient = await prisma.client.findUnique({
            where: { idNumber: client.idNumber }
        });

        if (!existingClient) {
            existingClient = await prisma.client.create({
                data: {
                    firstName: client.firstName,
                    lastName: client.lastName,
                    idNumber: client.idNumber,
                    phone: client.phone || null,
                    email: clientEmail }
            });
        }

        // Generate file number
        const year = new Date().getFullYear();
        const caseCount = await prisma.case.count();
        const fileNumber = `ZDM-${year}-${String(caseCount + 1).padStart(3, '0')}`;

        // Determine acquisition type based on API key scope
        const acquisitionType = apiKey.projectId ? 'B2B' : 'B2C';
        const r350Status = acquisitionType === 'B2B' ? 'NOT_APPLICABLE' : 'PENDING';

        // Create the case
        const newCase = await prisma.case.create({
            data: {
                fileNumber,
                clientId: existingClient.id,
                status: 'NEW_LEAD',
                acquisitionType,
                r350Status,
                services: services ? JSON.stringify(services) : null }
        });

        // Link to project if API key is scoped
        if (apiKey.projectId) {
            await prisma.caseProject.create({
                data: {
                    caseId: newCase.id,
                    projectId: apiKey.projectId,
                    isPrimary: true
                }
            });
        }

        // Create workflow log
        await prisma.workflowLog.create({
            data: {
                caseId: newCase.id,
                fromStatus: null,
                toStatus: 'NEW_LEAD',
                notes: `[API: ${apiKey.name}] Case created via API`
            }
        });

        return apiSuccess({
            id: newCase.id,
            fileNumber: newCase.fileNumber,
            status: newCase.status,
            acquisitionType: newCase.acquisitionType,
            createdAt: newCase.createdAt.toISOString(),
            message: 'Case created successfully'
        }, 201);
    } catch (error) {
        logger.error('API v1 POST /cases error:', error);
        return apiError('Failed to create case', 500);
    }
}

