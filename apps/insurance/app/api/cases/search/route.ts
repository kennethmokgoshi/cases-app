
import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { logger } from '@zenowethu/shared-lib';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const query = searchParams.get('q');

        if (!query || query.length < 2) {
            return NextResponse.json([]);
        }

        const cases = await prisma.case.findMany({
            where: {
                OR: [
                    { fileNumber: { contains: query } }, // Case insensitive usually depends on DB collation
                    { client: { firstName: { contains: query } } },
                    { client: { lastName: { contains: query } } },
                    { client: { idNumber: { contains: query } } },
                    { client: { phone: { contains: query } } },
                    { client: { email: { contains: query } } },
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
