import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { z } from 'zod';
import { provisionReferrerPortalUser } from '@/lib/referrer-portal-access';

const logger = createLogger('api/admin/clients/convert-to-referrer');

const ConvertSchema = z.object({
    clientId: z.string().min(1),
    commissionType: z.enum(['FIXED', 'VOLUME_BASED']).optional(),
    fixedCommissionAmount: z.number().min(1).nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
});

// POST /api/admin/clients/convert-to-referrer
// Converts an existing Client into a Referrer, preserving the referral chain
export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if (!session.user.isAdmin && !session.user.isExecutive && !session.user.isSeniorManager && session.user.role !== 'MANAGER') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await request.json();
        const parsed = ConvertSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 });
        }

        const { clientId, commissionType = 'FIXED', fixedCommissionAmount = 250, notes } = parsed.data;

        // Fetch the client
        const client = await prisma.client.findUnique({
            where: { id: clientId },
            include: {
                cases: {
                    select: { id: true, referrerId: true },
                    take: 1,
                    orderBy: { createdAt: 'desc' },
                },
            },
        });

        if (!client) {
            return NextResponse.json({ error: 'Client not found' }, { status: 404 });
        }

        const existingPortalUser = await prisma.user.findUnique({
            where: { username: client.idNumber },
            select: { userType: true },
        });
        if (existingPortalUser && existingPortalUser.userType !== 'REFERRER') {
            return NextResponse.json({ error: 'A non-referrer user already exists with this ID number username' }, { status: 409 });
        }

        // Check if this client is already a referrer
        const existingReferrer = await prisma.referrer.findFirst({
            where: { project: { clientType: 'CLIENT', } }, // This is a basic check
        });

        // If the client was referred, preserve that relationship (parentReferrerId)
        let parentReferrerId: string | null = null;
        if (client.cases.length > 0 && client.cases[0].referrerId) {
            parentReferrerId = client.cases[0].referrerId;
        }

        // Determine the parent project for the new sub-project
        let subProjectParentId: string;
        if (parentReferrerId) {
            // Nest under the referrer who brought in this client
            const parentReferrer = await prisma.referrer.findUnique({
                where: { id: parentReferrerId },
                select: { projectId: true },
            });
            if (parentReferrer?.projectId) {
                subProjectParentId = parentReferrer.projectId;
            } else {
                // Fallback to root
                let referralsRoot = await prisma.project.findFirst({
                    where: { name: 'Referrals', type: 'ACQUISITION_SOURCE', parentId: null },
                });
                if (!referralsRoot) {
                    referralsRoot = await prisma.project.create({
                        data: { name: 'Referrals', type: 'ACQUISITION_SOURCE', description: 'Cases referred by external referrers' },
                    });
                }
                subProjectParentId = referralsRoot.id;
            }
        } else {
            // Create/find root "Referrals" project
            let referralsRoot = await prisma.project.findFirst({
                where: { name: 'Referrals', type: 'ACQUISITION_SOURCE', parentId: null },
            });
            if (!referralsRoot) {
                referralsRoot = await prisma.project.create({
                    data: { name: 'Referrals', type: 'ACQUISITION_SOURCE', description: 'Cases referred by external referrers' },
                });
            }
            subProjectParentId = referralsRoot.id;
        }

        // Create sub-project named after the client
        const subProject = await prisma.project.create({
            data: {
                name: `${client.firstName} ${client.lastName}`,
                type: 'REFERRER',
                description: `Referral sub-project for ${client.firstName} ${client.lastName}${client.idNumber ? ` (ID: ${client.idNumber})` : ''} — Converted from Client`,
                parentId: subProjectParentId,
                clientType: 'CLIENT_REFERRER', // Mark this as a converted client
            },
        });

        // Create the referrer record
        const referrer = await prisma.referrer.create({
            data: {
                firstName: client.firstName,
                lastName: client.lastName,
                idNumber: client.idNumber,
                email: client.email || client.alternativeEmail,
                cellNumber: client.phone || client.whatsappNumber,
                bankName: client.bankName,
                accountNumber: client.accountNumber,
                accountType: client.accountType,
                branchCode: client.branchCode,
                accountHolderName: client.accountHolderName,
                projectId: subProject.id,
                createdById: session.user.id,
                parentReferrerId: parentReferrerId,
                commissionType,
                fixedCommissionAmount: commissionType === 'FIXED' ? (fixedCommissionAmount || 250) : null,
                notes: notes ? `Converted from Client (ID: ${clientId}). Original notes: ${notes}` : `Converted from Client (ID: ${clientId})`,
                isActive: true,
            },
            include: {
                project: { select: { id: true, name: true, parentId: true } },
                parentReferrer: { select: { id: true, firstName: true, lastName: true } },
                _count: { select: { cases: true } },
            },
        });
        await provisionReferrerPortalUser({ ...referrer, portalUser: null });

        // Create an audit log entry
        await prisma.auditLog.create({
            data: {
                userId: session.user.id,
                action: 'CLIENT_CONVERTED_TO_REFERRER',
                resource: 'Client',
                resourceId: clientId,
                details: {
                    referrerId: referrer.id,
                    referrerName: `${referrer.firstName} ${referrer.lastName}`,
                    parentReferrerId,
                    projectId: subProject.id,
                },
            },
        });

        logger.info(`Client ${clientId} converted to Referrer ${referrer.id}`);
        return NextResponse.json({
            referrer,
            message: `${client.firstName} ${client.lastName} is now a referrer`,
        }, { status: 201 });
    } catch (error) {
        logger.error('Error converting client to referrer:', error);
        return NextResponse.json({ error: 'Failed to convert client' }, { status: 500 });
    }
}
