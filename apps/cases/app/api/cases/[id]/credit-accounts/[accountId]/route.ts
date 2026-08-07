import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { z } from 'zod';

const logger = createLogger('api/cases/[id]/credit-accounts/[accountId]');

type RouteContext = { params: Promise<{ id: string; accountId: string }> };

const LinkProviderSchema = z.object({
    creditProviderId: z.string().min(1).nullable(),
});

// PATCH /api/cases/[id]/credit-accounts/[accountId]
// Links (or unlinks) a case's credit account to a CreditProvider directory
// record, so the provider's contact details flow into generated documents
// (e.g. Form 17.W) and creditor emails.
export async function PATCH(request: Request, { params }: RouteContext) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: caseId, accountId } = await params;

        const body = await request.json();
        const parsed = LinkProviderSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 422 });
        }

        const account = await prisma.creditAccount.findUnique({
            where:  { id: accountId },
            select: { id: true, caseId: true },
        });
        if (!account || account.caseId !== caseId) {
            return NextResponse.json({ error: 'Credit account not found on this case' }, { status: 404 });
        }

        const { creditProviderId } = parsed.data;
        if (creditProviderId) {
            const provider = await prisma.creditProvider.findUnique({ where: { id: creditProviderId } });
            if (!provider) {
                return NextResponse.json({ error: 'Credit provider not found' }, { status: 404 });
            }
        }

        const updated = await prisma.creditAccount.update({
            where: { id: accountId },
            data:  { creditProviderId },
            select: {
                id: true,
                creditProviderId: true,
                creditProvider: { select: { id: true, name: true, email: true, phone: true, address: true } },
            },
        });

        logger.info(`Credit account ${accountId} linked to provider ${creditProviderId ?? '(none)'} by user ${session.user.id}`);
        return NextResponse.json(updated);
    } catch (error) {
        logger.error('Error linking credit account to provider:', error);
        return NextResponse.json({ error: 'Failed to link credit account' }, { status: 500 });
    }
}
