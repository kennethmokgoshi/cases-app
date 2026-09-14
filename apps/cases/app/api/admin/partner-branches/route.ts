import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { z } from 'zod';

const logger = createLogger('api/admin/partner-branches');

/** Contact fields are optional everywhere — a branch may be captured before its
 *  details are known, and blank is honest where invented data would be harmful. */
const ContactFields = {
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
    isActive: z.boolean().optional() };

const CreateSchema = z.object({
    partnerProjectId: z.string().min(1),
    projectId: z.string().min(1).nullable().optional(),
    name: z.string().trim().min(1).max(200),
    ...ContactFields });

export type PartnerBranchCreateInput = z.infer<typeof CreateSchema>;

/** Empty string from a form field means "clear this value". */
function emptyToNull(value: string | null | undefined): string | null | undefined {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

export function normaliseContactInput<T extends Record<string, unknown>>(data: T): T {
    const out: Record<string, unknown> = { ...data };
    for (const key of [
        'code', 'contactPerson', 'email', 'phone', 'alternatePhone', 'whatsappNumber',
        'addressLine', 'city', 'province', 'postalCode', 'notes',
    ]) {
        if (key in out) out[key] = emptyToNull(out[key] as string | null | undefined);
    }
    return out as T;
}

/** Managing the branch directory is a manager-and-above action. */
export function canManageBranches(user: {
    isAdmin?: boolean;
    isExecutive?: boolean;
    isSeniorManager?: boolean;
    role?: string | null;
} | undefined | null): boolean {
    if (!user) return false;
    return Boolean(user.isAdmin || user.isExecutive || user.isSeniorManager || user.role === 'MANAGER');
}

// GET /api/admin/partner-branches — branch directory, optionally scoped to one partner
export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const partnerProjectId = searchParams.get('partnerProjectId') ?? '';
        const search = (searchParams.get('search') ?? '').trim();
        const missingContact = searchParams.get('missingContact') === 'true';
        const isActiveParam = searchParams.get('isActive') ?? '';

        const branches = await prisma.partnerBranch.findMany({
            where: {
                ...(partnerProjectId ? { partnerProjectId } : {}),
                ...(isActiveParam === 'true' ? { isActive: true } : {}),
                ...(isActiveParam === 'false' ? { isActive: false } : {}),
                // "Needs attention" filter: no email AND no phone means the
                // fallback chain cannot reach this branch at all.
                ...(missingContact
                    ? {
                        AND: [
                            { OR: [{ email: null }, { email: '' }] },
                            { OR: [{ phone: null }, { phone: '' }] },
                        ] }
                    : {}),
                ...(search
                    ? {
                        OR: [
                            { name: { contains: search, mode: 'insensitive' as const } },
                            { code: { contains: search, mode: 'insensitive' as const } },
                            { contactPerson: { contains: search, mode: 'insensitive' as const } },
                            { email: { contains: search, mode: 'insensitive' as const } },
                            { city: { contains: search, mode: 'insensitive' as const } },
                        ] }
                    : {}) },
            include: {
                partnerProject: { select: { id: true, name: true } },
                _count: { select: { cases: true } } },
            orderBy: [{ partnerProject: { name: 'asc' } }, { name: 'asc' }] });

        // Partner list for the filter dropdown — B2B acquisition sources.
        const partners = await prisma.project.findMany({
            where: { type: 'ACQUISITION_SOURCE', clientType: 'B2B' },
            select: { id: true, name: true },
            orderBy: { name: 'asc' } });

        return NextResponse.json({
            branches,
            partners,
            summary: {
                total: branches.length,
                withEmail: branches.filter((b) => Boolean(b.email)).length,
                withPhone: branches.filter((b) => Boolean(b.phone)).length,
                unreachable: branches.filter((b) => !b.email && !b.phone).length } });
    } catch (error) {
        logger.error({ err: error }, 'Failed to list partner branches');
        return NextResponse.json({ error: 'Failed to load partner branches' }, { status: 500 });
    }
}

// POST /api/admin/partner-branches — add a branch to a partner
export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if (!canManageBranches(session.user)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const parsed = CreateSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 });
        }
        const data = normaliseContactInput(parsed.data);

        const partner = await prisma.project.findUnique({
            where: { id: data.partnerProjectId },
            select: { id: true } });
        if (!partner) {
            return NextResponse.json({ error: 'Partner not found' }, { status: 422 });
        }

        const duplicate = await prisma.partnerBranch.findFirst({
            where: { partnerProjectId: data.partnerProjectId, name: { equals: data.name, mode: 'insensitive' } },
            select: { id: true } });
        if (duplicate) {
            return NextResponse.json({ error: 'This partner already has a branch with that name' }, { status: 409 });
        }

        const branch = await prisma.partnerBranch.create({
            data: {
                partnerProjectId: data.partnerProjectId,
                projectId: data.projectId ?? null,
                name: data.name,
                code: data.code ?? null,
                contactPerson: data.contactPerson ?? null,
                email: data.email ?? null,
                phone: data.phone ?? null,
                alternatePhone: data.alternatePhone ?? null,
                whatsappNumber: data.whatsappNumber ?? null,
                addressLine: data.addressLine ?? null,
                city: data.city ?? null,
                province: data.province ?? null,
                postalCode: data.postalCode ?? null,
                notes: data.notes ?? null,
                isActive: data.isActive ?? true },
            include: { partnerProject: { select: { id: true, name: true } } } });

        logger.info({ branchId: branch.id, userId: session.user.id }, 'Partner branch created');
        return NextResponse.json({ branch }, { status: 201 });
    } catch (error) {
        logger.error({ err: error }, 'Failed to create partner branch');
        return NextResponse.json({ error: 'Failed to create partner branch' }, { status: 500 });
    }
}
