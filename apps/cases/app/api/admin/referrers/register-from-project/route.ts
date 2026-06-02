import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { z } from 'zod';

const logger = createLogger('api/admin/referrers/register-from-project');

const Schema = z.object({
    projectId: z.string().min(1),
    parentReferrerId: z.string().nullable().optional(),
});

/**
 * POST /api/admin/referrers/register-from-project
 *
 * Converts an existing FOLDER/REFERRER sub-project into a proper Referrer record
 * without creating a new project. The project is kept in place; a Referrer record
 * is created and linked to it via projectId.
 *
 * This is how the existing "Refferals" folder entries (Capitec Central City, Dede,
 * Errol Matabane, etc.) become tracked referrers with commission support.
 *
 * Name splitting: first word → firstName, rest → lastName.
 * e.g. "Capitec Central City" → firstName: "Capitec", lastName: "Central City"
 *      "Dede" → firstName: "Dede", lastName: "(Referrer)"
 */
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
        const parsed = Schema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 });
        }

        const { projectId, parentReferrerId } = parsed.data;

        // Verify the project exists
        const project = await prisma.project.findUnique({ where: { id: projectId } });
        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        // Check it doesn't already have a Referrer record
        const existing = await prisma.referrer.findUnique({ where: { projectId } });
        if (existing) {
            return NextResponse.json(
                { error: `Project is already linked to referrer "${existing.firstName} ${existing.lastName}"` },
                { status: 409 }
            );
        }

        // Validate parent referrer if provided
        if (parentReferrerId) {
            const parent = await prisma.referrer.findUnique({ where: { id: parentReferrerId } });
            if (!parent) {
                return NextResponse.json({ error: 'Parent referrer not found' }, { status: 404 });
            }
        }

        // Split project name into firstName / lastName
        const nameParts = project.name.trim().split(/\s+/);
        const firstName = nameParts[0] ?? project.name;
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '(Referrer)';

        // Mark the project as REFERRER type so it shows in REFERRER-type queries
        await prisma.project.update({
            where: { id: projectId },
            data: { type: 'REFERRER' },
        });

        const referrer = await prisma.referrer.create({
            data: {
                firstName,
                lastName,
                projectId,
                createdById: session.user.id,
                parentReferrerId: parentReferrerId ?? null,
                commissionType: 'FIXED',
            },
            include: {
                project: { select: { id: true, name: true, parentId: true } },
                parentReferrer: { select: { id: true, firstName: true, lastName: true } },
                _count: { select: { cases: true } },
            },
        });

        // Back-fill referrerId on existing cases that are already in this project
        const caseProjects = await prisma.caseProject.findMany({
            where: { projectId },
            select: { caseId: true },
        });
        if (caseProjects.length > 0) {
            const caseIds = caseProjects.map(cp => cp.caseId);
            await prisma.case.updateMany({
                where: { id: { in: caseIds }, referrerId: null },
                data: { referrerId: referrer.id },
            });
            logger.info(`Back-filled referrerId=${referrer.id} on ${caseIds.length} existing cases for project ${projectId}`);
        }

        logger.info(`Referrer registered from project: ${referrer.id} — ${referrer.firstName} ${referrer.lastName}`);
        return NextResponse.json(referrer, { status: 201 });
    } catch (error) {
        logger.error('Error registering referrer from project:', error);
        return NextResponse.json({ error: 'Failed to register referrer' }, { status: 500 });
    }
}
