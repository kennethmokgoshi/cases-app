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
        const { client, documents } = body; // documents: { type: string, fileName: string }[]

        if (!client || (!client.idNumber && !client.id)) {
            return NextResponse.json({ error: 'Client identification is required' }, { status: 400 });
        }

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
                        email: client.email,
                        phone: client.phone
                    },
                    create: {
                        firstName: client.firstName,
                        lastName: client.lastName,
                        idNumber: cleanId,
                        email: client.email,
                        phone: client.phone
                    }
                });
            }

            // 2. Create Case
            const count = await tx.case.count();
            const fileNumber = `FA-${new Date().getFullYear()}-${(count + 1).toString().padStart(4, '0')}`;

            const newCase = await tx.case.create({
                data: {
                    fileNumber,
                    clientId: dbClient.id,
                    status: 'OPEN',
                    category: 'Forensic Audit',
                    createdById: session.user.id,
                    description: `Forensic Investigation for ${dbClient.lastName}`
                }
            });

            // 3. Create Forensic Audit Record
            const audit = await tx.forensicAudit.create({
                data: {
                    id: `AUD-${newCase.id}`, // Simple ID strategy
                    caseId: newCase.id,
                    status: 'PENDING',
                    auditorId: session.user.id
                }
            });

            // 4. Record Evidence Metadata
            // In a real app, we'd handle file buffers here or use presigned URLs. 
            // For now, we just log that the user "uploaded" them.
            if (documents && Array.isArray(documents)) {
                for (const doc of documents) {
                    await tx.auditEvidence.create({
                        data: {
                            id: `EVID-${Math.random().toString(36).substr(2, 9)}`,
                            auditId: audit.id,
                            fileName: doc.fileName,
                            fileUrl: 's3://mock-bucket/' + doc.fileName, // Mock URL
                            fileType: 'application/pdf',
                            category: doc.type, // e.g., 'LEDGER', 'SECTION_129'
                            uploadedBy: session.user.email || session.user.id || 'System'
                        }
                    });
                }
            }

            return { caseId: newCase.id, auditId: audit.id };
        });

        return NextResponse.json({ success: true, ...result });

    } catch (error: any) {
        logger.error('Error creating forensic case:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
