import { NextResponse } from 'next/server';
import { auth, logger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type') || 'cases';
        const from = searchParams.get('from');
        const to = searchParams.get('to');
        const projectId = searchParams.get('projectId');

        const where: any = {};

        // Date range filter
        if (from && to) {
            where.createdAt = {
                gte: new Date(from),
                lte: new Date(to + 'T23:59:59') };
        }

        // Type filter (B2B vs B2C)
        if (type === 'cases_b2b') {
            where.acquisitionType = 'B2B';
        } else if (type === 'cases_b2c') {
            where.acquisitionType = { in: ['B2C', 'DIRECT'] };
        }

        // Project filter
        if (projectId && projectId !== 'all') {
            where.projects = {
                some: { projectId }
            };
        }

        const cases = await prisma.case.findMany({
            where,
            select: {
                fileNumber: true,
                client: {
                    select: {
                        firstName: true,
                        lastName: true,
                        idNumber: true,
                        phone: true,
                        email: true }
                },
                status: true,
                acquisitionType: true,
                createdAt: true },
            orderBy: {
                createdAt: 'desc'
            },
            take: 500, // Limit for preview
        });

        // Format data for preview
        const formatted = cases.map(c => ({
            fileNumber: c.fileNumber,
            clientName: `${c.client.firstName} ${c.client.lastName}`,
            idNumber: c.client.idNumber,
            phone: c.client.phone,
            email: c.client.email,
            status: c.status,
            acquisitionType: c.acquisitionType,
            createdAt: c.createdAt }));

        return NextResponse.json(formatted);
    } catch (error: any) {
        logger.error('Preview API error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch preview', details: error.message },
            { status: 500 }
        );
    }
}

