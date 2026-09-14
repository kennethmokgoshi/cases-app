import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { z } from 'zod';
import { normaliseContactInput, canManageBranches } from '../route';
import { syncBranchReferrerContact } from '@zenowethu/shared-lib/src/partners/contact-sync';

const logger = createLogger('api/admin/partner-branches/[id]');

const UpdateSchema = z.object({
    name: z.string().trim().min(1).max(200).optional(),
    code: z.string().trim().max(50).nullable().optional(),
    contactPerson: z.string().trim().max(200).nullable().optional(),
    email: z.union([z.string().trim().email(), z.literal(''), z.null()]).optional(),
    phone: z.string().trim().max(30).nullable().optional(),
    alternatePhone: z.string().trim().max(30).nullable().optional(),
    whatsappNumber: z.string().trim().max(30).nullable().optional(),
    addressLine: z.string().trim().max(300).nullable().optional(),
    city: z.string().trim().max(120).nullable().optional(),
    province: z.string().trim().max(120).nullable().optional(),
    postalCode: z.string().trim().max(20).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    isActive: z.boolean().optional() });

// GET /api/admin/partner-branches/[id]
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const { id } = await params;
        const branch = await prisma.partnerBranch.findUnique({
            where: { id },
            include: {
                partnerProject: { select: { id: true, name: true } },
                _count: { select: { cases: true } } } });
        if (!branch) {
            return NextResponse.json({ error: 'Branch not found' }, { status: 404 });
        }
        return NextResponse.json({ branch });
    } catch (error) {
        logger.error({ err: error }, 'Failed to load partner branch');
        return NextResponse.json({ error: 'Failed to load partner branch' }, { status: 500 });
    }
}

// PATCH /api/admin/partner-branches/[id] — update contact details
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if (!canManageBranches(session.user)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { id } = await params;
        const parsed = UpdateSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 });
        }
        const data = normaliseContactInput(parsed.data);

        const existing = await prisma.partnerBranch.findUnique({
            where: { id },
            select: { id: true, partnerProjectId: true } });
        if (!existing) {
            return NextResponse.json({ error: 'Branch not found' }, { status: 404 });
        }

        // Renaming must not collide with a sibling branch of the same partner.
        if (data.name) {
            const clash = await prisma.partnerBranch.findFirst({
                where: {
                    partnerProjectId: existing.partnerProjectId,
                    name: { equals: data.name, mode: 'insensitive' },
                    NOT: { id } },
                select: { id: true } });
            if (clash) {
                return NextResponse.json({ error: 'This partner already has a branch with that name' }, { status: 409 });
            }
        }

        await prisma.partnerBranch.update({
            where: { id },
            data,
            include: { partnerProject: { select: { id: true, name: true } } } });

        // Push the contact details onto this branch's Referrer record, so staff
        // only ever type them once. Fills blanks only — see contact-sync.
        const sync = await syncBranchReferrerContact({ branchId: id });

        const branch = await prisma.partnerBranch.findUnique({
            where: { id },
            include: { partnerProject: { select: { id: true, name: true } } } });

        logger.info({ branchId: id, userId: session.user.id }, 'Partner branch updated');
        return NextResponse.json({ branch, syncedToReferrer: sync?.filled ?? [] });
    } catch (error) {
        logger.error({ err: error }, 'Failed to update partner branch');
        return NextResponse.json({ error: 'Failed to update partner branch' }, { status: 500 });
    }
}

// DELETE /api/admin/partner-branches/[id]
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if (!session.user.isAdmin && !session.user.isExecutive) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { id } = await params;
        const branch = await prisma.partnerBranch.findUnique({
            where: { id },
            select: { id: true, _count: { select: { cases: true } } } });
        if (!branch) {
            return NextResponse.json({ error: 'Branch not found' }, { status: 404 });
        }

        // A branch with cases attached is the fallback contact for those cases —
        // deactivate it instead of breaking their contact chain.
        if (branch._count.cases > 0) {
            const deactivated = await prisma.partnerBranch.update({
                where: { id },
                data: { isActive: false } });
            return NextResponse.json({
                branch: deactivated,
                deactivated: true,
                message: `Branch has ${branch._count.cases} linked case(s) and was deactivated rather than deleted.` });
        }

        await prisma.partnerBranch.delete({ where: { id } });
        logger.info({ branchId: id, userId: session.user.id }, 'Partner branch deleted');
        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error({ err: error }, 'Failed to delete partner branch');
        return NextResponse.json({ error: 'Failed to delete partner branch' }, { status: 500 });
    }
}
