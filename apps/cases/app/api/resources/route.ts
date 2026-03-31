import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { createLogger } from '@zenowethu/shared-lib';

const logger = createLogger('api/resources');


export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const projectId = searchParams.get('projectId');
        const acquisitionType = searchParams.get('acquisitionType'); // B2B or B2C

        // Build where clause
        // We want docs that:
        // 1. Have matching acquisitionType OR acquisitionType is null (Global)
        // 2. AND (Have matching project ID OR No projects linked (Global))
        // Note: Prisma many-to-many filtering is tricky for "No projects linked".
        // Actually, my schema: "projects Project[]".
        // If I want "Global", I check if projects is empty.
        // Prisma doesn't easily support "where projects is empty OR projects has id".
        // I might need to fetch and filter, or use OR condition.

        const where: any = {
            AND: [
                {
                    OR: [
                        { acquisitionType: null }, // Global type
                        { acquisitionType: acquisitionType }
                    ]
                }
            ]
        };

        if (projectId) {
            where.AND.push({
                OR: [
                    { projects: { none: {} } }, // No linked projects (Global)
                    { projects: { some: { id: projectId } } } // Linked to this project
                ]
            });
        } else {
            // If no project specified, maybe only show strictly global ones? 
            // Or simple listing. Let's assume broad listing if no project specified (e.g. for Admin or general library).
        }

        const resources = await prisma.documentResource.findMany({
            where,
            orderBy: { name: 'asc' }
        });

        return NextResponse.json(resources);
    } catch (error) {
        logger.error('Error fetching user resources:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
