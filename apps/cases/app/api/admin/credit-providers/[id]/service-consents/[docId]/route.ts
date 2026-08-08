import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { z } from 'zod';

const logger = createLogger('api/admin/credit-providers/[id]/service-consents/[docId]');

const PatchSchema = z.object({
    isActive: z.boolean(),
});

type RouteContext = { params: Promise<{ id: string; docId: string }> };

type ManageSession = {
    user?: {
        isAdmin?: boolean;
        isExecutive?: boolean;
        isSeniorManager?: boolean;
        isManager?: boolean;
    };
} | null | undefined;

function canManageServiceConsents(session: ManageSession): boolean {
    return Boolean(
        session?.user?.isAdmin ||
        session?.user?.isExecutive ||
        session?.user?.isSeniorManager ||
        session?.user?.isManager
    );
}

// Activate/deactivate is open to any signed-in staff member.
export async function PATCH(request: Request, { params }: RouteContext) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id, docId } = await params;
        const body = await request.json();
        const parsed = PatchSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 });
        }

        const existing = await prisma.creditProviderServiceConsentDocument.findFirst({
            where: { id: docId, creditProviderId: id },
        });
        if (!existing) {
            return NextResponse.json({ error: 'Service consent document not found' }, { status: 404 });
        }

        const document = await prisma.creditProviderServiceConsentDocument.update({
            where: { id: docId },
            data: { isActive: parsed.data.isActive },
        });

        logger.info('Credit provider service consent document status updated', {
            providerId: id,
            documentId: docId,
            isActive: document.isActive,
            userId: session.user.id,
        });

        return NextResponse.json({ document });
    } catch (error) {
        logger.error('Error updating service consent document:', error);
        return NextResponse.json({ error: 'Failed to update service consent document' }, { status: 500 });
    }
}

// Delete is restricted to admins, executives, senior managers, and managers.
export async function DELETE(_request: Request, { params }: RouteContext) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if (!canManageServiceConsents(session)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { id, docId } = await params;
        const existing = await prisma.creditProviderServiceConsentDocument.findFirst({
            where: { id: docId, creditProviderId: id },
        });
        if (!existing) {
            return NextResponse.json({ error: 'Service consent document not found' }, { status: 404 });
        }

        await prisma.creditProviderServiceConsentDocument.delete({ where: { id: docId } });

        logger.info('Credit provider service consent document deleted', {
            providerId: id,
            documentId: docId,
            userId: session.user.id,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error('Error deleting service consent document:', error);
        return NextResponse.json({ error: 'Failed to delete service consent document' }, { status: 500 });
    }
}
