import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import {
    auth,
    createLogger,
    getCommissionStageForCaseStatus,
    isCommissionEligible,
    calculateCommissionAmount,
    referrerEarnsCommission,
} from '@zenowethu/shared-lib';
import { z } from 'zod';
import { hasFullReferrerVisibility, canAccessReferrer } from '@/lib/referrer-access';

const logger = createLogger('api/cases/[id]/referrer');

const Schema = z.object({
    referrerId: z.string().min(1).nullable(),
});

// PATCH /api/cases/[id]/referrer — assign, change, or remove the referrer linked
// to a case. Staff use this to correct referrals credited to the wrong referrer
// (or to none at all, e.g. cases created before the referrer was registered).
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if (!session.user.isAdmin && !session.user.isExecutive && !session.user.isSeniorManager && session.user.role !== 'MANAGER') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { id } = await params;
        const parsed = Schema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 });
        }
        const { referrerId } = parsed.data;

        const caseRecord = await prisma.case.findUnique({
            where: { id },
            select: {
                id: true,
                status: true,
                referrerId: true,
                referrer: { select: { id: true, firstName: true, lastName: true } },
            },
        });
        if (!caseRecord) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        let newReferrer: {
            id: string;
            firstName: string;
            lastName: string;
            email: string | null;
            cellNumber: string | null;
            referrerType: string;
            isActive: boolean;
            projectId: string | null;
            commissionType: string;
            fixedCommissionAmount: unknown;
        } | null = null;

        if (referrerId) {
            newReferrer = await prisma.referrer.findUnique({
                where: { id: referrerId },
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    cellNumber: true,
                    referrerType: true,
                    isActive: true,
                    projectId: true,
                    commissionType: true,
                    fixedCommissionAmount: true,
                },
            }) as typeof newReferrer;
            if (!newReferrer) {
                return NextResponse.json({ error: 'Referrer not found' }, { status: 404 });
            }
            if (!newReferrer.isActive) {
                return NextResponse.json({ error: 'This referrer is inactive — reactivate them before assigning referrals' }, { status: 422 });
            }
            // Non-admins may only assign referrers whose sub-project they can see
            // (same membership scoping as the referrer registry).
            if (!hasFullReferrerVisibility(session.user) && !(await canAccessReferrer(session.user, newReferrer.projectId))) {
                return NextResponse.json({ error: 'You do not have access to this referrer' }, { status: 403 });
            }
        }

        if ((referrerId ?? null) === (caseRecord.referrerId ?? null)) {
            return NextResponse.json({ referrer: toSlim(newReferrer), unchanged: true });
        }

        // Never silently re-credit a referral whose commission was already paid out.
        const existingCommission = await prisma.referrerCommission.findUnique({
            where: { caseId: id },
            select: { isPaid: true },
        });
        if (existingCommission?.isPaid) {
            return NextResponse.json(
                { error: 'The commission for this referral has already been paid out to the current referrer. Resolve the payout before reassigning.' },
                { status: 409 }
            );
        }

        await prisma.case.update({
            where: { id },
            data: {
                referrer: referrerId ? { connect: { id: referrerId } } : { disconnect: true },
                updatedBy: { connect: { id: session.user.id } },
            },
        });

        // Keep the commission record consistent with the new assignment.
        if (!referrerId) {
            if (existingCommission) {
                await prisma.referrerCommission.delete({ where: { caseId: id } });
            }
        } else if (newReferrer) {
            const stage = getCommissionStageForCaseStatus(caseRecord.status);
            if (stage) {
                const earnsCommission = referrerEarnsCommission(newReferrer.referrerType);
                const eligible = earnsCommission && isCommissionEligible(stage);
                let autoAmount: number | undefined;
                if (eligible) {
                    const totalReferralCount = await prisma.case.count({ where: { referrerId } });
                    autoAmount = calculateCommissionAmount(
                        newReferrer.commissionType,
                        newReferrer.fixedCommissionAmount as never,
                        totalReferralCount,
                    );
                }
                await prisma.referrerCommission.upsert({
                    where: { caseId: id },
                    create: {
                        referrerId,
                        caseId: id,
                        stage,
                        isEligible: eligible,
                        ...(autoAmount !== undefined && { commissionAmount: autoAmount }),
                    },
                    update: {
                        referrerId,
                        stage,
                        isEligible: eligible,
                        ...(autoAmount !== undefined && { commissionAmount: autoAmount }),
                    },
                });
            } else if (existingCommission) {
                // Status has no commission-stage mapping — just repoint the unpaid row.
                await prisma.referrerCommission.update({
                    where: { caseId: id },
                    data: { referrerId },
                });
            }
        }

        // Case-timeline audit entry (same pattern as project moves).
        const oldName = caseRecord.referrer ? `${caseRecord.referrer.firstName} ${caseRecord.referrer.lastName}` : null;
        const newName = newReferrer ? `${newReferrer.firstName} ${newReferrer.lastName}` : null;
        const content = newName && oldName
            ? `Changed referrer from **${oldName}** to **${newName}**`
            : newName
                ? `Assigned referrer **${newName}**`
                : `Removed referrer **${oldName}**`;
        await prisma.caseComment.create({
            data: {
                caseId: id,
                userId: session.user.id,
                content,
                activityType: 'REFERRER_CHANGE',
                activityData: JSON.stringify({
                    fromReferrerId: caseRecord.referrerId,
                    toReferrerId: referrerId,
                }),
            },
        });

        logger.info(`Case ${id} referrer changed: ${caseRecord.referrerId ?? 'none'} → ${referrerId ?? 'none'} by ${session.user.id}`);
        return NextResponse.json({ referrer: toSlim(newReferrer) });
    } catch (error) {
        logger.error('Error updating case referrer:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// Shape matches the referrer object GET /api/cases/[id] embeds, so the case
// page can drop the response straight into its state.
function toSlim(referrer: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    cellNumber: string | null;
    referrerType: string;
    isActive: boolean;
} | null) {
    if (!referrer) return null;
    return {
        id: referrer.id,
        firstName: referrer.firstName,
        lastName: referrer.lastName,
        email: referrer.email,
        cellNumber: referrer.cellNumber,
        referrerType: referrer.referrerType,
        isActive: referrer.isActive,
    };
}
