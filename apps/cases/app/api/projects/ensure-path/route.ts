import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { createLogger } from '@zenowethu/shared-lib';

const logger = createLogger('api/projects/ensure-path');


// POST /api/projects/ensure-path
// Creates a project if it doesn't exist, or returns existing one
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { parentId, name, type } = body;
        logger.info('Ensure Path Request:', { parentId, name, type });

        if (!parentId || !name || !type) {
            return NextResponse.json(
                { error: 'Missing required fields: parentId, name, type' },
                { status: 400 }
            );
        }

        // Check if project already exists under this parent with this name
        const existing = await prisma.project.findFirst({
            where: {
                parentId: parentId,
                name: name
            },
            select: {
                id: true,
                name: true,
                type: true,
                parentId: true
            }
        });

        if (existing) {
            // Return existing project
            return NextResponse.json(existing);
        }

        // Project doesn't exist, create it
        // Use transaction to ensure creation + member inheritance happen atomically
        const newProject = await prisma.$transaction(async (tx) => {
            // 1. Create the project
            const project = await tx.project.create({
                data: {
                    name,
                    type,
                    parentId: parentId },
                select: {
                    id: true,
                    name: true,
                    type: true,
                    parentId: true
                }
            });

            // 2. Fetch parent members
            const parentMembers = await tx.projectMember.findMany({
                where: { projectId: parentId }
            });

            // 3. Copy members to new project
            if (parentMembers.length > 0) {
                // Robustness: Ensure users still exist to avoid Foreign Key errors
                const userIds = parentMembers.map(pm => pm.userId);
                const validUsers = await tx.user.findMany({
                    where: { id: { in: userIds } },
                    select: { id: true }
                });
                const validUserIds = new Set(validUsers.map(u => u.id));

                const validMembers = parentMembers.filter(pm => validUserIds.has(pm.userId));

                if (validMembers.length < parentMembers.length) {
                    logger.warn(`ensure-path: Ignored ${parentMembers.length - validMembers.length} orphan project members.`);
                }

                if (validMembers.length > 0) {
                    // Optimized to use createMany for performance
                    await tx.projectMember.createMany({
                        data: validMembers.map(pm => ({
                            projectId: project.id,
                            userId: pm.userId,
                            role: pm.role
                        }))
                    });
                }
            }

            return project;
        });

        return NextResponse.json(newProject);
    } catch (error) {
        logger.error('Error in ensure-path:', error);
        return NextResponse.json(
            { error: 'Internal server error', details: String(error) },
            { status: 500 }
        );
    }
}
