
import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { sendDrrRequestEmails, auth, createLogger } from '@zenowethu/shared-lib';
import type { CreditProviderContact } from '@zenowethu/shared-lib';

const logger = createLogger('api/cases/[id]/send-drr-requests');

// Default bureau emails for fallback
const DEFAULT_BUREAU_EMAILS = [
    process.env.BUREAU_EMAIL_TRANSUNION || 'disputes@transunion.co.za',
    process.env.BUREAU_EMAIL_EXPERIAN   || 'disputeenquiries@experian.co.za',
    process.env.BUREAU_EMAIL_XDS        || 'disputes@xds.co.za',
];

async function getCreditBureauEmails(): Promise<string[]> {
    try {
        const settings = await prisma.systemSettings.findMany({
            where: { category: 'credit_bureaus' },
            select: { key: true, value: true },
        });

        if (settings.length === 0) return DEFAULT_BUREAU_EMAILS.filter(Boolean);

        const emails = settings
            .filter(s => s.key.startsWith('bureau_email_') && s.value?.includes('@'))
            .map(s => s.value);

        return emails.length > 0 ? emails : DEFAULT_BUREAU_EMAILS.filter(Boolean);
    } catch {
        return DEFAULT_BUREAU_EMAILS.filter(Boolean);
    }
}

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        const currentCase = await prisma.case.findUnique({
            where: { id },
            include: {
                client: true,
                creditAccounts: {
                    where: { isIncluded: true },
                    include: { creditProvider: true },
                },
            },
        });

        if (!currentCase) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        // --- Gear Up Recipients ---
        const creditBureauEmails = await getCreditBureauEmails();
        
        const providerMap = new Map<string, CreditProviderContact>();
        for (const account of currentCase.creditAccounts) {
            const cp = account.creditProvider;
            if (!cp?.email) continue;

            if (!providerMap.has(cp.id)) {
                providerMap.set(cp.id, { 
                    name: cp.name, 
                    email: cp.email, 
                    accountNumbers: [], 
                    outstandingBalances: {} 
                });
            }
            if (account.accountNumber) {
                const entry = providerMap.get(cp.id)!;
                entry.accountNumbers.push(account.accountNumber);
                if (account.outstandingBalance != null) {
                    entry.outstandingBalances![account.accountNumber] = Number(account.outstandingBalance);
                }
            }
        }
        const creditProviderContacts = Array.from(providerMap.values());

        const draftingAccounts = currentCase.creditAccounts.map(a => ({
            creditorName:       a.creditorName,
            accountNumber:      a.accountNumber ?? undefined,
            accountType:        a.accountType,
            outstandingBalance: a.outstandingBalance != null ? Number(a.outstandingBalance) : undefined,
        }));

        // --- Dispatch ---
        const result = await sendDrrRequestEmails({
            caseId: id,
            clientName: `${currentCase.client.firstName} ${currentCase.client.lastName}`,
            idNumber: currentCase.client.idNumber,
            fileNumber: currentCase.fileNumber,
            senderName: session.user.name || undefined,
            dcName: currentCase.debtCounsellorName || currentCase.dcTradingName,
            dcEmail: currentCase.dcEmail,
            creditBureauEmails,
            creditProviderContacts,
            allAccounts: draftingAccounts
        });

        // --- Logging ---
        const bureauSent   = result.bureauResults.filter(r => r.success).length;
        const providerSent = result.providerResults.filter(r => r.success).length;
        const dcStatus = result.dcSent ? 'sent' : 'none sent';

        const commentLines = [
            `**Specialized Debt Review Removal (DRR) request dispatched:**`,
            `• Debt Counsellor: ${dcStatus} (${currentCase.dcEmail || 'no email on record'})`,
            `• Credit Bureaus (${bureauSent}/${result.bureauResults.length}): ${result.bureauResults.filter(r => r.success).map(r => r.email).join(', ')}`,
            `• Credit Providers (${providerSent}/${result.providerResults.length}): ${result.providerResults.filter(r => r.success).map(r => r.name).join(', ')}`,
        ];

        const failures = [
            ...result.bureauResults.filter(r => !r.success).map(r => `Bureau ${r.email}: ${r.error}`),
            ...result.providerResults.filter(r => !r.success).map(r => `Provider ${r.name}: ${r.error}`),
        ];
        if (!result.dcSent && currentCase.dcEmail) {
            failures.push(`Debt Counsellor ${currentCase.dcEmail}: failed to send`);
        }

        if (failures.length > 0) {
            commentLines.push(`• **Failures:** ${failures.join('; ')}`);
        }

        await prisma.caseComment.create({
            data: {
                caseId: id,
                userId: session.user.id,
                content: commentLines.join('\n'),
                type: 'SYSTEM',
                isInternal: true,
            },
        });

        logger.info(`[send-drr-requests] Case ${id}: DRR requests dispatched (DC: ${result.dcSent}, Bureaus: ${bureauSent}, Providers: ${providerSent})`);

        return NextResponse.json({
            success: true,
            dcSent: result.dcSent,
            bureauResults: result.bureauResults,
            providerResults: result.providerResults,
            summary: {
                dcSent: result.dcSent,
                bureausSent: bureauSent,
                providersSent: providerSent,
                totalFailures: failures.length,
                message: `Successfully requested DRR files from ${result.dcSent ? 'Debt Counsellor, ' : ''}${bureauSent} bureaus, and ${providerSent} providers.`
            },
        });

    } catch (error) {
        logger.error('send-drr-requests error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', details: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}
