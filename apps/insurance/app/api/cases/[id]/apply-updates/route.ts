import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger, ApplyUpdatesSchema, parseBody  }from '@zenowethu/shared-lib';

interface UpdateRequest {
    updates: {
        [field: string]: string | number | null;
    };
}

// Fields that belong to the Client model
const CLIENT_FIELDS = ['idNumber', 'firstName', 'lastName', 'phone'];

// Fields that belong to the Case model
const CASE_FIELDS = [
    'totalDebtAmount', 'totalMonthlyInstallment', 'openAccounts', 'closedAccounts',
    'cb_ncrdcNo', 'cb_debtCounsellor', 'cb_contactNo', 'cb_applicationDate', 'cb_status', 'cb_statusDate'
];

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: caseId } = await params;
        const body: UpdateRequest = await request.json();
        const { updates } = body;

        if (!updates || Object.keys(updates).length === 0) {
            return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
        }

        // Fetch case to get clientId
        const caseRecord = await prisma.case.findUnique({
            where: { id: caseId },
            select: { id: true, clientId: true }
        });

        if (!caseRecord) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        // Separate updates into client and case updates
        const clientUpdates: any = {};
        const caseUpdates: any = {};

        for (const [field, value] of Object.entries(updates)) {
            if (CLIENT_FIELDS.includes(field)) {
                clientUpdates[field] = value;
            } else if (CASE_FIELDS.includes(field)) {
                // Handle special type conversions
                if (field === 'totalDebtAmount' || field === 'totalMonthlyInstallment') {
                    caseUpdates[field] = value !== null ? parseFloat(String(value)) : null;
                } else if (field === 'openAccounts' || field === 'closedAccounts') {
                    caseUpdates[field] = value !== null ? parseInt(String(value), 10) : 0;
                } else if (field === 'cb_applicationDate' || field === 'cb_statusDate') {
                    caseUpdates[field] = value !== null ? new Date(String(value)) : null;
                } else {
                    caseUpdates[field] = value;
                }
            }
        }

        // Update client if there are client updates
        if (Object.keys(clientUpdates).length > 0) {
            try {
                await prisma.client.update({
                    where: { id: caseRecord.clientId },
                    data: clientUpdates
                });
                logger.info('✅ Client updated with:', Object.keys(clientUpdates));
            } catch (e: any) {
                // Handle unique constraint violation for idNumber
                if (e.code === 'P2002' && clientUpdates.idNumber) {
                    logger.warn('⚠️ ID Number collision, skipping idNumber update');
                    const { idNumber, ...safeClientUpdates } = clientUpdates;
                    if (Object.keys(safeClientUpdates).length > 0) {
                        await prisma.client.update({
                            where: { id: caseRecord.clientId },
                            data: safeClientUpdates
                        });
                    }
                } else {
                    throw e;
                }
            }
        }

        // Update case if there are case updates
        if (Object.keys(caseUpdates).length > 0) {
            await prisma.case.update({
                where: { id: caseId },
                data: caseUpdates
            });
            logger.info('✅ Case updated with:', Object.keys(caseUpdates));
        }

        // Log activity
        await prisma.caseComment.create({
            data: {
                caseId,
                userId: session.user.id,
                content: `Updated case with re-analyzed data: ${Object.keys(updates).join(', ')}`,
                activityType: 'REANALYSIS_UPDATE',
                activityData: JSON.stringify({
                    updatedFields: Object.keys(updates),
                    clientFieldsUpdated: Object.keys(clientUpdates),
                    caseFieldsUpdated: Object.keys(caseUpdates)
                })
            }
        });

        return NextResponse.json({
            success: true,
            message: `Updated ${Object.keys(updates).length} field(s)`,
            updatedFields: Object.keys(updates)
        });

    } catch (error) {
        logger.error('❌ Apply updates error:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Failed to apply updates'
        }, { status: 500 });
    }
}
