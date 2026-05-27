import { NextResponse } from 'next/server';
import { auth, createLogger, logAuditAction } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { z } from 'zod';

const logger = createLogger('api/admin/service-requests/convert');

const ConvertSchema = z.object({
    requestId: z.string().min(1),
    consumerId: z.string().min(1),
});

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if (!session.user.isAdmin && session.user.role !== 'MANAGER' && session.user.role !== 'STAFF') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await request.json();
        const parsed = ConvertSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 });
        }

        const { requestId, consumerId } = parsed.data;

        // Fetch request and consumer
        const serviceReq = await prisma.serviceRequest.findUnique({
            where: { id: requestId },
            include: { consumer: true },
        });

        if (!serviceReq || serviceReq.consumerId !== consumerId) {
            return NextResponse.json({ error: 'Service request not found' }, { status: 404 });
        }

        if (serviceReq.status !== 'PENDING') {
            return NextResponse.json({ error: 'Only pending requests can be converted' }, { status: 400 });
        }

        const consumer = serviceReq.consumer;

        let newCaseId = '';

        await prisma.$transaction(async (tx) => {
            // 1. If consumer has no linkedClient, create Client and link it
            let clientId = consumer.linkedClientId;
            if (!clientId) {
                const newClient = await tx.client.create({
                    data: {
                        firstName: consumer.firstName,
                        lastName: consumer.lastName,
                        email: consumer.email,
                        idNumber: consumer.idNumber || `TEMP-${Date.now()}`,
                        phone: consumer.phone || '',
                        type: 'Credo Portal',
                    },
                });
                clientId = newClient.id;

                await tx.consumerAccount.update({
                    where: { id: consumerId },
                    data: { linkedClientId: clientId },
                });
            }

            // Generate file number (e.g. CRD-2026-XXXX)
            const year = new Date().getFullYear();
            const count = await tx.case.count({
                where: { fileNumber: { startsWith: `CRD-${year}` } }
            });
            const fileNumber = `CRD-${year}-${String(count + 1).padStart(4, '0')}`;

            // 2. Create the Case
            const newCase = await tx.case.create({
                data: {
                    fileNumber,
                    clientId: clientId!,
                    status: 'NEW_LEAD',
                    description: `Credo Request: ${serviceReq.services}`,
                    services: serviceReq.services || '',
                    totalDebtAmount: serviceReq.total,
                    acquisitionType: 'Credo Portal',
                    assignedToId: session.user.id,
                },
            });
            newCaseId = newCase.id;

            // 3. Mark Service Request as COMPLETED and link to case
            await tx.serviceRequest.update({
                where: { id: requestId },
                data: {
                    status: 'COMPLETED',
                    linkedCaseId: newCase.id,
                },
            });

            // 4. Add audit log
            await tx.caseComment.create({
                data: {
                    caseId: newCase.id,
                    userId: session.user.id,
                    type: 'NOTE',
                    activityType: 'CASE_CREATED',
                    content: `Case created from Credo Service Request.\nServices Requested: ${serviceReq.services}\nAmount: R ${serviceReq.total.toNumber().toFixed(2)}`,
                    isInternal: true,
                },
            });
        });

        logger.info(`Successfully converted Service Request ${requestId} to Case ${newCaseId} by ${session.user.email}`);

        await logAuditAction({
            userId: session.user.id,
            action: 'CREATE',
            resource: 'Case',
            resourceId: newCaseId,
            details: { source: 'Credo Service Request', serviceRequestId: requestId }
        });
        
        return NextResponse.json({ success: true, caseId: newCaseId });
    } catch (error) {
        logger.error('Error converting service request:', error);
        return NextResponse.json({ error: 'Failed to convert service request' }, { status: 500 });
    }
}
