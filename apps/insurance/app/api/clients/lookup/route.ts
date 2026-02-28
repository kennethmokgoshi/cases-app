import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger } from '@zenowethu/shared-lib';

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { idNumber } = await request.json();

        if (!idNumber) {
            return NextResponse.json({ error: 'ID Number is required' }, { status: 400 });
        }

        // Clean the ID number (remove spaces)
        const cleanId = idNumber.replace(/\s/g, '');

        const client = await prisma.client.findFirst({
            where: {
                OR: [
                    { idNumber: cleanId },
                    { idNumber: { contains: cleanId } } // Catch prefixed IDs like "DRL..."
                ]
            },
            include: {
                cases: {
                    select: {
                        id: true,
                        fileNumber: true,
                        status: true,
                        category: true,
                        InsuranceAssessment: true, // Check if they already have an assessment
                    },
                    orderBy: {
                        createdAt: 'desc'
                    },
                    take: 5
                }
            }
        });

        if (!client) {
            return NextResponse.json({ found: false });
        }

        return NextResponse.json({
            found: true,
            client: {
                id: client.id,
                firstName: client.firstName,
                lastName: client.lastName,
                idNumber: client.idNumber,
                email: client.email,
                phone: client.phone,
                address: client.address
            },
            existingCases: client.cases.map(c => ({
                id: c.id,
                fileNumber: c.fileNumber,
                status: c.status,
                hasInsuranceAssessment: c.InsuranceAssessment.length > 0
            }))
        });

    } catch (error: any) {
        logger.error('Error looking up client:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
