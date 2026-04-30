
import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger } from '@zenowethu/shared-lib';

const logger = createLogger('api/cases/search');

export async function GET(request: Request) {
    try {
        // Check authentication
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const query = searchParams.get('q')?.trim();

        if (query && query.length < 2) {
            return NextResponse.json([]);
        }

        let cases;

        if (!query) {
            cases = await prisma.case.findMany({
                take: 5,
                include: {
                    client: true,
                    projects: {
                        where: { isPrimary: true },
                        include: {
                            project: true
                        }
                    }
                },
                orderBy: {
                    updatedAt: 'desc'
                }
            });
        } else {
            cases = await prisma.case.findMany({
                where: {
                    OR: [
                        { fileNumber: { contains: query, mode: 'insensitive' } },
                        { client: { firstName: { contains: query, mode: 'insensitive' } } },
                        { client: { lastName: { contains: query, mode: 'insensitive' } } },
                        { client: { idNumber: { contains: query, mode: 'insensitive' } } },
                        { client: { phone: { contains: query, mode: 'insensitive' } } },
                        { client: { email: { contains: query, mode: 'insensitive' } } },
                    ]
                },
                take: 10,
                include: {
                    client: true,
                    projects: {
                        where: { isPrimary: true },
                        include: {
                            project: true
                        }
                    }
                },
                orderBy: {
                    updatedAt: 'desc'
                }
            });
        }

        const formattedCases = cases.map(c => ({
            id: c.id,
            fileNumber: c.fileNumber,
            clientName: `${c.client.firstName} ${c.client.lastName}`,
            clientIdNumber: c.client.idNumber,
            status: c.status,
            project: c.projects[0]?.project?.name || 'No Project'
        }));

        return NextResponse.json(formattedCases);
    } catch (error) {
        logger.error('Error searching cases:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
