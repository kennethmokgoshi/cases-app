import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger, calculatePrescriptionStatus } from '@zenowethu/shared-lib';

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { caseId } = body;

        if (!caseId) {
            return NextResponse.json({ error: 'caseId is required' }, { status: 400 });
        }

        // 1. Fetch all credit accounts for this case
        const accounts = await prisma.creditAccount.findMany({
            where: { caseId },
            include: {
                case: {
                    include: { client: { select: { firstName: true, lastName: true, idNumber: true } } }
                }
            }
        });

        const results = [];

        // 2. Perform prescription assessment for each account
        for (const account of accounts) {
            if (!account.lastPaymentDate) continue;

            // Use the shared-lib logic
            const status = calculatePrescriptionStatus(new Date(account.lastPaymentDate), 'STANDARD');

            if (status.isPrescribed) {
                // Check if a legal matter already exists for this prescription
                const existing = await prisma.legalMatter.findFirst({
                    where: {
                        caseId,
                        matterType: 'PRESCRIPTION',
                        creditorName: account.creditorName,
                        accountNumber: account.accountNumber || undefined
                    }
                });

                if (!existing) {
                    // Automatically create a Prescription Matter
                    const matter = await prisma.legalMatter.create({
                        data: {
                            caseId,
                            clientId: account.clientId,
                            matterType: 'PRESCRIPTION',
                            creditorName: account.creditorName,
                            accountNumber: account.accountNumber,
                            status: 'OPEN',
                            outcomeNotes: `Found prescribed debt. Last activity: ${account.lastPaymentDate.toLocaleDateString()}. ${status.reason}`,
                            isPrescribed: true,
                            createdById: session.user.id
                        }
                    });

                    // Create log entry - toStatus is required by schema
                    await prisma.workflowLog.create({
                        data: {
                            caseId,
                            action: 'PRESCRIPTION_AUTO_FLAGGED',
                            userId: session.user.id,
                            notes: `System identified prescribed debt for ${account.creditorName}`,
                            toStatus: account.case.status // Current case status as fallback
                        }
                    });

                    // Also update the credit account itself
                    await prisma.creditAccount.update({
                        where: { id: account.id },
                        data: {
                            isPrescribed: true,
                            prescriptionDate: status.prescriptionDate
                        }
                    });

                    results.push(matter);
                }
            }
        }

        return NextResponse.json({
            message: `Check complete. Identified ${results.length} new prescribed matters.`,
            foundCount: results.length
        });

    } catch (error: any) {
        logger.error({ error }, 'Error in prescription batch check:');
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
