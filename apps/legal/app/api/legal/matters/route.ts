import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger } from '@zenowethu/shared-lib';
import { createLegalMatter, LegalMatterType } from '../../../../lib/legal-service';

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type') as LegalMatterType | null;
        const status = searchParams.get('status');
        const caseId = searchParams.get('caseId');

        const where: any = {};
        if (type) where.matterType = type;
        if (status) where.status = status;
        if (caseId) where.caseId = caseId;

        const matters = await prisma.legalMatter.findMany({
            where,
            include: {
                Client: {
                    select: { firstName: true, lastName: true, idNumber: true }
                },
                Case: {
                    select: { fileNumber: true }
                }
            },
            orderBy: { updatedAt: 'desc' }
        });

        return NextResponse.json(matters);
    } catch (error) {
        logger.error({ error }, 'Error fetching legal matters:');
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { caseId, clientId, matterType, creditorName, accountNumber, notes } = body;

        if (!caseId || !clientId || !matterType || !creditorName) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const matter = await createLegalMatter({
            caseId,
            clientId,
            matterType,
            creditorName,
            accountNumber,
            notes,
            userId: session.user.id
        });

        return NextResponse.json(matter, { status: 201 });
    } catch (error: any) {
        logger.error({ error }, 'Error creating legal matter:');
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
