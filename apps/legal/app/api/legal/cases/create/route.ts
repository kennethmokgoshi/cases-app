import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger } from '@zenowethu/shared-lib';

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const body = await request.json();
        const { client, matter } = body;

        if (!client || (!client.idNumber && !client.id)) {
            return NextResponse.json({ error: 'Client identification is required' }, { status: 400 });
        }

        // A consumer record created here must carry an email address: DHS consumer
        // updates and every piece of outbound case correspondence depend on it.
        const clientEmail = typeof client.email === 'string' ? client.email.trim().toLowerCase() : '';
        if (!client.id) {
            if (!clientEmail) {
                return NextResponse.json({ error: 'Client email is required' }, { status: 400 });
            }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
                return NextResponse.json({ error: 'Client email is not a valid email address' }, { status: 400 });
            }
        }

        // Transaction: Client -> Case -> LegalMatter
        const result = await prisma.$transaction(async (tx) => {
            let dbClient;

            // 1. Handle Client
            if (client.id) {
                dbClient = await tx.client.findUnique({ where: { id: client.id } });
                if (!dbClient) throw new Error('Client not found');
            } else {
                const cleanId = client.idNumber.replace(/\s/g, '');
                dbClient = await tx.client.upsert({
                    where: { idNumber: cleanId },
                    update: {
                        firstName: client.firstName,
                        lastName: client.lastName,
                        email: clientEmail,
                        phone: client.phone,
                        address: client.address
                    },
                    create: {
                        firstName: client.firstName,
                        lastName: client.lastName,
                        idNumber: cleanId,
                        email: clientEmail,
                        phone: client.phone,
                        address: client.address
                    }
                });
            }

            // 2. Create Case
            const count = await tx.case.count();
            const fileNumber = `LEG-${new Date().getFullYear()}-${(count + 1).toString().padStart(4, '0')}`;

            const newCase = await tx.case.create({
                data: {
                    fileNumber,
                    clientId: dbClient.id,
                    status: 'OPEN',
                    category: 'Legal',
                    createdById: session.user.id,
                    description: `${matter.type} Application`
                }
            });

            // 3. Create Legal Matter
            const legalMatter = await tx.legalMatter.create({
                data: {
                    caseId: newCase.id,
                    clientId: dbClient.id,
                    matterType: matter.type, // e.g., 'RESCISSION', 'PRESCRIPTION', 'DISPUTE'
                    creditorName: matter.creditor || 'Various',
                    accountNumber: matter.accountNumber,
                    status: 'OPEN',
                    priority: 'MEDIUM',
                    judgmentCaseNumber: matter.caseNumber // For Rescissions
                }
            });

            return { caseId: newCase.id, legalMatterId: legalMatter.id };
        });

        return NextResponse.json({ success: true, ...result });

    } catch (error: any) {
        logger.error('Error creating legal case:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
