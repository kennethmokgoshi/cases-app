/**
 * Send File Request Emails — Credit Bureaus & Credit Providers
 *
 * Fires formal file-request emails to:
 *   1. Configured credit bureaus (from SystemSettings or env)
 *   2. Each unique credit provider linked to the case's credit accounts
 *
 * Typically triggered after DHS acceptance, or manually by staff.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { sendFileRequestEmails, GhlService, auth, createLogger } from '@zenowethu/shared-lib';
import type { CreditProviderContact } from '@zenowethu/shared-lib';

const logger = createLogger('api/cases/[id]/send-file-requests');

// South African credit bureau dispute email addresses (public/official contact points).
// Overridable via SystemSettings keys: bureau_email_transunion, bureau_email_experian, bureau_email_xds
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

        // Expect keys like: bureau_email_transunion, bureau_email_experian, bureau_email_xds, etc.
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

        // Optional body
        let body: { skipBureaus?: boolean; skipProviders?: boolean; useAiDraft?: boolean } = {};
        try { body = await request.json(); } catch { /* body is optional */ }

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

        // --- Credit Bureaus ---
        const creditBureauEmails = body.skipBureaus ? [] : await getCreditBureauEmails();

        // --- Credit Providers: group accounts by provider, only include providers with an email ---
        const creditProviderContacts: CreditProviderContact[] = [];

        if (!body.skipProviders) {
            const providerMap = new Map<string, CreditProviderContact>();

            for (const account of currentCase.creditAccounts) {
                const cp = account.creditProvider;
                if (!cp?.email) continue;

                if (!providerMap.has(cp.id)) {
                    providerMap.set(cp.id, { name: cp.name, email: cp.email, accountNumbers: [], outstandingBalances: {} });
                }
                if (account.accountNumber) {
                    const entry = providerMap.get(cp.id)!;
                    entry.accountNumbers.push(account.accountNumber);
                    if (account.outstandingBalance != null) {
                        entry.outstandingBalances![account.accountNumber] = Number(account.outstandingBalance);
                    }
                }
            }

            creditProviderContacts.push(...providerMap.values());
        }

        // All accounts for AI bureau draft context
        const allAccounts = currentCase.creditAccounts.map(a => ({
            creditorName:       a.creditorName,
            accountNumber:      a.accountNumber ?? undefined,
            accountType:        a.accountType,
            outstandingBalance: a.outstandingBalance != null ? Number(a.outstandingBalance) : undefined,
        }));

        if (creditBureauEmails.length === 0 && creditProviderContacts.length === 0) {
            return NextResponse.json({
                error: 'No recipients found',
                details: 'No credit bureau emails configured and no credit providers with email addresses on record.',
            }, { status: 400 });
        }

        const clientName = `${currentCase.client.firstName} ${currentCase.client.lastName}`;

        const result = await sendFileRequestEmails({
            caseId: id,
            clientName,
            idNumber:               currentCase.client.idNumber,
            fileNumber:             currentCase.fileNumber,
            senderName:             session.user.name || undefined,
            creditBureauEmails,
            creditProviderContacts,
            useAiDraft:             body.useAiDraft === true,
            allAccounts,
        });

        // Log a case comment summarising what was sent
        const bureauSent   = result.bureauResults.filter(r => r.success).length;
        const providerSent = result.providerResults.filter(r => r.success).length;
        const commentLines = [
            `File request emails dispatched:`,
            bureauSent > 0
                ? `• Credit bureaus (${bureauSent}/${result.bureauResults.length}): ${result.bureauResults.filter(r => r.success).map(r => r.email).join(', ')}`
                : `• Credit bureaus: none sent`,
            providerSent > 0
                ? `• Credit providers (${providerSent}/${result.providerResults.length}): ${result.providerResults.filter(r => r.success).map(r => r.name).join(', ')}`
                : `• Credit providers: none sent`,
        ];

        const failures = [
            ...result.bureauResults.filter(r => !r.success).map(r => `Bureau ${r.email}: ${r.error}`),
            ...result.providerResults.filter(r => !r.success).map(r => `Provider ${r.name}: ${r.error}`),
        ];

        if (failures.length > 0) {
            commentLines.push(`• Failures: ${failures.join('; ')}`);
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

        logger.info(`[send-file-requests] Case ${id}: ${bureauSent} bureau + ${providerSent} provider emails sent`);

        // Apply GHL tag to trigger follow-up automation workflow (non-blocking)
        if (bureauSent > 0 || providerSent > 0) {
            GhlService.applyTags(id, ['dhs_file_requested']).catch(err =>
                logger.warn('[send-file-requests] GHL tag application failed (non-blocking):', err)
            );
        }

        return NextResponse.json({
            success: true,
            bureauResults:   result.bureauResults,
            providerResults: result.providerResults,
            summary: {
                bureausSent:   bureauSent,
                providersSent: providerSent,
                totalFailures: failures.length,
            },
        });

    } catch (error) {
        logger.error('send-file-requests error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', details: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}
