import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { createLogger } from '@zenowethu/shared-lib';

const logger = createLogger('api/admin/documents');


export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const acquisitionType = searchParams.get('acquisitionType'); // Optional filter

        const where: any = {};
        if (acquisitionType) {
            where.acquisitionType = acquisitionType;
        }

        const resources = await prisma.documentResource.findMany({
            where,
            include: {
                projects: true
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        return NextResponse.json(resources);
    } catch (error) {
        logger.error('Error fetching resources:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { name, fileUrl, fileSize, mimeType, category, acquisitionType, projectIds } = body;

        if (!name || !fileUrl || !category) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const resource = await prisma.documentResource.create({
            data: {
                name,
                fileUrl,
                fileSize,
                mimeType,
                category,
                acquisitionType: acquisitionType || null, // Empty string -> null
                projects: {
                    connect: projectIds?.map((id: string) => ({ id })) || []
                }
            },
            include: {
                projects: true
            }
        });

        return NextResponse.json(resource, { status: 201 });
    } catch (error) {
        logger.error('Error creating resource:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
