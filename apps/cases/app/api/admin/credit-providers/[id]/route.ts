import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { z } from 'zod';

const logger = createLogger('api/admin/credit-providers/[id]');

const PatchSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    type: z.enum(['BANK', 'MICRO_LENDER', 'TELECOM', 'RETAILER', 'OTHER']).optional(),
    email: z.string().email().nullable().optional(),
    phone: z.string().max(30).nullable().optional(),
    address: z.string().max(500).nullable().optional(),
    attorney: z.string().max(200).nullable().optional(),
    attorneyEmail: z.string().email().nullable().optional(),
    attorneyPhone: z.string().max(30).nullable().optional(),
    contactSource: z.enum(['MANUAL', 'WEB_LOOKUP', 'XDS']).optional(),
    contactSourceNotes: z.string().max(1000).nullable().optional(),
    needsReview: z.boolean().optional(),
    isActive: z.boolean().optional(),
    /** Staff confirms the current contact details are correct — clears the review flag. */
    markVerified: z.boolean().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/admin/credit-providers/[id] — single credit provider
export async function GET(_req: Request, { params }: RouteContext) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const provider = await prisma.creditProvider.findUnique({ where: { id } });
        if (!provider) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }
        return NextResponse.json(provider);
    } catch (error) {
        logger.error('Error fetching credit provider:', error);
        return NextResponse.json({ error: 'Failed to fetch credit provider' }, { status: 500 });
    }
}

// PATCH /api/admin/credit-providers/[id] — update a credit provider.
// Editing fields is open to any signed-in staff member; markVerified (the
// "confirmed correct for legal notices" compliance action) is restricted to
// admins, executives, senior managers, and managers.
export async function PATCH(request: Request, { params }: RouteContext) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const body = await request.json();
        const parsed = PatchSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Validation failed', issues: parsed.error.issues },
                { status: 422 }
            );
        }

        if (parsed.data.markVerified) {
            const canManage =
                session.user.isAdmin || session.user.isExecutive ||
                session.user.isSeniorManager || session.user.isManager;
            if (!canManage) {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
            }
        }

        const existing = await prisma.creditProvider.findUnique({ where: { id } });
        if (!existing) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }

        const { markVerified, ...rest } = parsed.data;
        const data = markVerified
            ? { ...rest, contactSource: 'MANUAL' as const, needsReview: false, contactVerifiedAt: new Date() }
            : rest;

        const provider = await prisma.creditProvider.update({
            where: { id },
            data,
        });

        logger.info(`Credit provider updated by user ${session.user.id}: ${provider.name}`);
        return NextResponse.json(provider);
    } catch (error: unknown) {
        if (
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            (error as { code: string }).code === 'P2002'
        ) {
            return NextResponse.json(
                { error: 'A credit provider with that name already exists' },
                { status: 409 }
            );
        }
        logger.error('Error updating credit provider:', error);
        return NextResponse.json({ error: 'Failed to update credit provider' }, { status: 500 });
    }
}

// DELETE /api/admin/credit-providers/[id] — remove a credit provider
// (admins, executives, senior managers, and managers only)
export async function DELETE(_req: Request, { params }: RouteContext) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const canManage =
            session.user.isAdmin || session.user.isExecutive ||
            session.user.isSeniorManager || session.user.isManager;
        if (!canManage) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { id } = await params;
        const existing = await prisma.creditProvider.findUnique({ where: { id } });
        if (!existing) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }

        // Unlink any credit accounts pointing to this provider before deleting
        await prisma.creditAccount.updateMany({
            where: { creditProviderId: id },
            data: { creditProviderId: null },
        });

        await prisma.creditProvider.delete({ where: { id } });

        logger.info(`Credit provider deleted by user ${session.user.id}: ${existing.name}`);
        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error('Error deleting credit provider:', error);
        return NextResponse.json({ error: 'Failed to delete credit provider' }, { status: 500 });
    }
}
