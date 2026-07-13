import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { z } from 'zod';
import { canAccessReferrer } from '@/lib/referrer-access';

const logger = createLogger('api/admin/referrers/[id]');

const COMMISSION_TYPES = ['FIXED', 'VOLUME_BASED'] as const;
const REFERRER_TYPES = ['COMMISSION', 'DISCOUNT'] as const;

const PatchSchema = z.object({
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().min(1).max(100).optional(),
    idNumber: z.string().trim().length(13).or(z.literal('')).transform(val => val === '' ? null : val).nullable().optional(),
    email: z.string().email().nullable().optional(),
    cellNumber: z.string().max(20).nullable().optional(),
    employerName: z.string().max(200).nullable().optional(),
    employmentType: z.enum(['EMPLOYED', 'SELF_EMPLOYED', 'CONTRACT', 'UNEMPLOYED', 'RETIRED']).nullable().optional(),
    employerAddress: z.string().max(500).nullable().optional(),
    employerPhone: z.string().max(20).nullable().optional(),
    occupation: z.string().max(200).nullable().optional(),
    monthlyIncome: z.number().positive().nullable().optional(),
    bankName: z.string().max(100).nullable().optional(),
    accountNumber: z.string().max(50).nullable().optional(),
    accountType: z.enum(['CHEQUE', 'SAVINGS', 'CURRENT']).nullable().optional(),
    branchCode: z.string().max(10).nullable().optional(),
    accountHolderName: z.string().max(200).nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
    isActive: z.boolean().optional(),
    // Referrer type — COMMISSION earns per referral; DISCOUNT gives clients
    // discounted pricing and earns nothing.
    referrerType: z.enum(REFERRER_TYPES).optional(),
    clientDiscountPercent: z.number().min(0).max(100).nullable().optional(),
    // Commission tier (COMMISSION type only)
    commissionType: z.enum(COMMISSION_TYPES).optional(),
    fixedCommissionAmount: z.number().min(1).max(99999).nullable().optional(),
    // Hierarchy
    parentReferrerId: z.string().nullable().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'No fields to update' });

function isAdminLevel(session: { user: { isAdmin?: boolean; isExecutive?: boolean; isSeniorManager?: boolean; role?: string } }) {
    return session.user.isAdmin || session.user.isExecutive || session.user.isSeniorManager || session.user.role === 'MANAGER';
}

// GET /api/admin/referrers/[id]
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const session = await auth();
        if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        if (!isAdminLevel(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const referrer = await prisma.referrer.findUnique({
            where: { id },
            include: {
                project: { select: { id: true, name: true, parentId: true } },
                portalUser: { select: { id: true, email: true, lastLogin: true, isLocked: true } },
                parentReferrer: { select: { id: true, firstName: true, lastName: true } },
                referredReferrers: { select: { id: true, firstName: true, lastName: true, isActive: true } },
                _count: { select: { cases: true } },
                cases: {
                    select: {
                        id: true,
                        fileNumber: true,
                        status: true,
                        client: { select: { firstName: true, lastName: true } },
                        createdAt: true,
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 50,
                },
            },
        });

        if (!referrer) return NextResponse.json({ error: 'Referrer not found' }, { status: 404 });

        // Non-admins may only view referrers whose sub-project they belong to
        if (!(await canAccessReferrer(session.user, referrer.projectId))) {
            return NextResponse.json({ error: 'Forbidden — you are not a member of this referrer' }, { status: 403 });
        }

        return NextResponse.json(referrer);
    } catch (error) {
        logger.error('Error fetching referrer:', error);
        return NextResponse.json({ error: 'Failed to fetch referrer' }, { status: 500 });
    }
}

// PATCH /api/admin/referrers/[id] — only Admin or Executive can edit referrers
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const session = await auth();
        if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        if (!session.user.isAdmin && !session.user.isExecutive) {
            return NextResponse.json({ error: 'Forbidden — only Admin or Executive can edit referrers' }, { status: 403 });
        }

        const existing = await prisma.referrer.findUnique({ where: { id } });
        if (!existing) return NextResponse.json({ error: 'Referrer not found' }, { status: 404 });

        const body = await request.json();
        const parsed = PatchSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 });
        }

        const data = parsed.data;

        // ID number must stay unique across referrers
        if (data.idNumber && data.idNumber !== existing.idNumber) {
            const duplicate = await prisma.referrer.findUnique({ where: { idNumber: data.idNumber } });
            if (duplicate && duplicate.id !== id) {
                return NextResponse.json({ error: 'A referrer with this ID number already exists' }, { status: 409 });
            }
        }
        if (data.idNumber === null && existing.idNumber) {
            logger.warn(`Referrer ${id} idNumber being cleared (was: ${existing.idNumber}) by user ${session.user.id}`);
        }

        // Contact-field preservation: email and cellNumber are used for referrer notifications
        // throughout the case lifecycle. Log prominently if they are being explicitly cleared.
        if (data.email === null && existing.email) {
            logger.warn(`Referrer ${id} email being cleared (was: ${existing.email}) by user ${session.user.id}`);
        }
        if (data.cellNumber === null && existing.cellNumber) {
            logger.warn(`Referrer ${id} cellNumber being cleared (was: ${existing.cellNumber}) by user ${session.user.id}`);
        }

        // If name changed, rename the linked sub-project too
        const newFirstName = data.firstName ?? existing.firstName;
        const newLastName = data.lastName ?? existing.lastName;

        if (existing.projectId) {
            const projectUpdate: Record<string, unknown> = {};

            if (data.firstName || data.lastName) {
                projectUpdate.name = `${newFirstName} ${newLastName}`;
            }

            // Re-parent sub-project if parentReferrerId changed
            if ('parentReferrerId' in data) {
                if (data.parentReferrerId) {
                    // Prevent circular reference
                    if (data.parentReferrerId === id) {
                        return NextResponse.json({ error: 'A referrer cannot refer themselves' }, { status: 422 });
                    }
                    const parent = await prisma.referrer.findUnique({
                        where: { id: data.parentReferrerId },
                        select: { id: true, projectId: true },
                    });
                    if (!parent) {
                        return NextResponse.json({ error: 'Parent referrer not found' }, { status: 404 });
                    }
                    if (parent.projectId) {
                        projectUpdate.parentId = parent.projectId;
                    }
                } else {
                    // Cleared — move back under root "Referrals" project
                    let referralsRoot = await prisma.project.findFirst({
                        where: { name: 'Referrals', type: 'ACQUISITION_SOURCE', parentId: null },
                    });
                    if (!referralsRoot) {
                        referralsRoot = await prisma.project.create({
                            data: { name: 'Referrals', type: 'ACQUISITION_SOURCE', description: 'Cases referred by external referrers' },
                        });
                    }
                    projectUpdate.parentId = referralsRoot.id;
                }
            }

            if (Object.keys(projectUpdate).length > 0) {
                await prisma.project.update({
                    where: { id: existing.projectId },
                    data: projectUpdate,
                });
            }
        }

        const { parentReferrerId: newParentReferrerId, ...restData } = data;
        // Keep type-specific config consistent with the referrer's (possibly
        // updated) type: discount referrers carry no commission amount,
        // commission referrers carry no client discount.
        const effectiveType = restData.referrerType ?? existing.referrerType;
        if (effectiveType === 'DISCOUNT') {
            restData.fixedCommissionAmount = null;
        } else {
            restData.clientDiscountPercent = null;
        }
        const updated = await prisma.referrer.update({
            where: { id },
            data: {
                ...restData,
                monthlyIncome: restData.monthlyIncome !== undefined ? restData.monthlyIncome : undefined,
                ...('parentReferrerId' in data ? { parentReferrerId: newParentReferrerId ?? null } : {}),
            },
            include: {
                project: { select: { id: true, name: true, parentId: true } },
                parentReferrer: { select: { id: true, firstName: true, lastName: true } },
                _count: { select: { cases: true } },
            },
        });

        return NextResponse.json(updated);
    } catch (error) {
        logger.error('Error updating referrer:', error);
        return NextResponse.json({ error: 'Failed to update referrer' }, { status: 500 });
    }
}

// DELETE /api/admin/referrers/[id] — soft-deactivate; only admin/executive can hard-delete
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const session = await auth();
        if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        if (!session.user.isAdmin && !session.user.isExecutive) {
            return NextResponse.json({ error: 'Forbidden — only Admin or Executive can delete referrers' }, { status: 403 });
        }

        const existing = await prisma.referrer.findUnique({
            where: { id },
            include: { _count: { select: { cases: true } } },
        });
        if (!existing) return NextResponse.json({ error: 'Referrer not found' }, { status: 404 });

        if (existing._count.cases > 0) {
            return NextResponse.json(
                { error: `Cannot delete — referrer has ${existing._count.cases} linked case(s). Deactivate instead.` },
                { status: 422 }
            );
        }

        // Delete sub-project if it exists and has no other cases
        if (existing.projectId) {
            const projectCaseCount = await prisma.caseProject.count({ where: { projectId: existing.projectId } });
            if (projectCaseCount === 0) {
                await prisma.project.delete({ where: { id: existing.projectId } });
            }
        }

        await prisma.referrer.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error('Error deleting referrer:', error);
        return NextResponse.json({ error: 'Failed to delete referrer' }, { status: 500 });
    }
}
