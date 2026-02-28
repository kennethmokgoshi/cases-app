import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { logger } from '@zenowethu/shared-lib';

export async function GET() {
    try {
        // Get all B2B acquisition source projects
        const b2bProjects = await prisma.project.findMany({
            where: {
                type: 'ACQUISITION_SOURCE',
                clientType: 'B2B'
            },
            include: {
                _count: {
                    select: { cases: true }
                },
                cases: {
                    where: { isPrimary: true },
                    include: {
                        case: {
                            select: { status: true }
                        }
                    }
                }
            },
            orderBy: { name: 'asc' }
        });

        const partners = b2bProjects.map(project => {
            const cases = project.cases.map(cp => cp.case);
            const activeCases = cases.filter(c => 
                !['COMPLETED', 'CLOSED', 'CANCELLED'].includes(c.status)
            ).length;
            const completedCases = cases.filter(c => c.status === 'COMPLETED').length;

            return {
                id: project.id,
                name: project.name,
                clientType: project.clientType,
                totalCases: project._count.cases,
                activeCases,
                completedCases
            };
        });

        return NextResponse.json(partners);
    } catch (error) {
        logger.error('Error fetching B2B partners:', error);
        return NextResponse.json({ error: 'Failed to fetch partners' }, { status: 500 });
    }
}

