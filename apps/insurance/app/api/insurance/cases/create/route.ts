import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger } from '@zenowethu/shared-lib';
import { runAutomatedUnderwriting } from '../../../../../lib/underwriting-service';

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const body = await request.json();
        const { client, accounts } = body; // accounts is array of auditData items

        if (!client || !client.idNumber && !client.id) {
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

        // Use a transaction to ensure all records are created or nothing is
        const result = await prisma.$transaction(async (tx) => {
            let dbClient;

            // 1. Handle Client (Find Existing or Create New)
            if (client.id) {
                dbClient = await tx.client.findUnique({ where: { id: client.id } });
                if (!dbClient) throw new Error('Client not found');
            } else {
                // Upsert based on ID Number to prevent duplicates even if "New Client" form was used
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
            const fileNumber = `INS-${new Date().getFullYear()}-${(count + 1).toString().padStart(4, '0')}`;

            const newCase = await tx.case.create({
                data: {
                    fileNumber,
                    clientId: dbClient.id,
                    status: 'OPEN',
                    category: 'Insurance',
                    createdById: session.user.id,
                    description: `Smart Start Assessment for ${accounts.length} accounts`
                }
            });

            // 3. Create Insurance Assessment Container
            const totalPremium = accounts.reduce((sum: number, acc: any) => sum + (Number(acc.premium) || 0), 0);

            const assessment = await tx.insuranceAssessment.create({
                data: {
                    caseId: newCase.id,
                    clientId: dbClient.id,
                    totalCurrentPremium: totalPremium,
                    totalAccounts: accounts.length,
                    status: 'DRAFT',
                    createdById: session.user.id
                }
            });

            // 4. Create Credit Accounts & Assessment Links
            for (const acc of accounts) {
                const creditAccount = await tx.creditAccount.create({
                    data: {
                        caseId: newCase.id,
                        clientId: dbClient.id,
                        creditorName: acc.lender,
                        accountNumber: acc.accountNumber || 'UNKNOWN',
                        accountType: 'Unsecured',
                        outstandingBalance: Number(acc.principal) || 0,
                        originalAmount: Number(acc.principal) || 0,
                        monthlyInstalment: Number(acc.premium) || 0,
                        interestRate: Number(acc.interestRate) || 0,
                        termMonths: Number(acc.termMonths) || 0,
                        premiumAmount: Number(acc.premium) || 0,
                        status: 'ACTIVE'
                    }
                });

                await tx.insuranceAssessmentAccount.create({
                    data: {
                        assessmentId: assessment.id,
                        creditAccountId: creditAccount.id,
                        currentPremium: Number(acc.premium) || 0,
                        premiumSource: 'CLIENT_PROVIDED'
                    }
                });
            }

            return { newCase, assessment, dbClient };
        });

        // 6. Trigger automated underwriting if client has ID and salary
        if (result.dbClient.idNumber && result.dbClient.netSalary) {
            try {
                await runAutomatedUnderwriting(result.assessment.id, session.user.id);
            } catch (err) {
                logger.warn({ err, assessmentId: result.assessment.id }, 'Initial automated underwriting failed (non-blocking)');
            }
        }

        return NextResponse.json({ success: true, caseId: result.newCase.id });

    } catch (error: any) {
        logger.error({ error }, 'Error creating insurance case:');
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
