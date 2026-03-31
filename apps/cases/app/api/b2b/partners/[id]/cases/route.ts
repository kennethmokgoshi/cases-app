import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { createLogger } from '@zenowethu/shared-lib';

const logger = createLogger('api/b2b/partners/[id]/cases');


export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        // Get all cases linked to this partner project
        const caseProjects = await prisma.caseProject.findMany({
            where: {
                projectId: id,
                isPrimary: true
            },
            include: {
                case: {
                    include: {
                        client: {
                            select: {
                                firstName: true,
                                lastName: true
                            }
                        }
                    }
                }
            },
            orderBy: {
                case: { createdAt: 'desc' }
            }
        });

        const cases = caseProjects.map(cp => ({
            id: cp.case.id,
            fileNumber: cp.case.fileNumber,
            clientName: `${cp.case.client.firstName} ${cp.case.client.lastName}`,
            status: cp.case.status,
            createdAt: cp.case.createdAt.toISOString().split('T')[0],
            services: cp.case.services || ''
        }));

        return NextResponse.json(cases);
    } catch (error) {
        logger.error('Error fetching partner cases:', error);
        return NextResponse.json({ error: 'Failed to fetch cases' }, { status: 500 });
    }
}

