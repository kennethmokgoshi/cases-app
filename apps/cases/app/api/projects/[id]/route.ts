import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { createLogger } from '@zenowethu/shared-lib';
import { auth } from '@zenowethu/shared-lib/src/auth';

const logger = createLogger('api/projects/[id]');

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const project = await prisma.project.findUnique({
            where: { id },
            include: {
                parent: true,
                children: {
                    include: {
                        _count: { select: { cases: true, children: true } }
                    },
                    orderBy: { name: 'asc' }
                },
                _count: { select: { cases: true, children: true } }
            }
        });

        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        return NextResponse.json(project);
    } catch (error) {
        logger.error('Error fetching project:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// Helper to recursively ADD members to ancestor projects
async function addMembersToAncestors(tx: any, parentId: string, membersToAdd: { userId: string, role: string }[]) {
    if (!parentId) return;

    // 1. Get parent
    const parent = await tx.project.findUnique({
        where: { id: parentId },
        include: { members: true }
    });

    if (!parent) return;

    // 2. Identify who needs adding to parent
    const existingMemberIds = new Set(parent.members.map((m: any) => m.userId));
    const toAdd = membersToAdd.filter(m => !existingMemberIds.has(m.userId));

    if (toAdd.length > 0) {
        await Promise.all(toAdd.map(m =>
            tx.projectMember.create({
                data: {
                    projectId: parentId,
                    userId: m.userId,
                    role: m.role || 'MEMBER'
                }
            })
        ));
    }

    // 3. Recurse up the tree
    if (parent.parentId) {
        await addMembersToAncestors(tx, parent.parentId, membersToAdd);
    }
}

// Helper to recursively remove members from children projects
async function removeMembersFromDescendants(tx: any, projectId: string, userIdsToCheck: string[]) {
    // 1. Get children
    const children = await tx.project.findMany({
        where: { parentId: projectId },
        select: { id: true }
    });

    if (children.length === 0) return;

    // 2. Remove members from children
    for (const child of children) {
        await tx.projectMember.deleteMany({
            where: {
                projectId: child.id,
                userId: { in: userIdsToCheck }
            }
        });

        // 3. Recurse
        await removeMembersFromDescendants(tx, child.id, userIdsToCheck);
    }
}

// Helper to recursively ADD members to children projects
async function addMembersToDescendants(tx: any, projectId: string, newMembers: { userId: string, role: string }[]) {
    // 1. Get children
    const children = await tx.project.findMany({
        where: { parentId: projectId },
        select: { id: true, members: { select: { userId: true } } }
    });

    if (children.length === 0) return;

    // 2. Add members to children
    for (const child of children) {
        // Filter members that are NOT already in the child
        const existingMemberIds = new Set(child.members.map((m: any) => m.userId));
        const membersToAdd = newMembers.filter(m => !existingMemberIds.has(m.userId));

        if (membersToAdd.length > 0) {
            await Promise.all(membersToAdd.map(m =>
                tx.projectMember.create({
                    data: {
                        projectId: child.id,
                        userId: m.userId,
                        role: m.role
                    }
                })
            ));
        }

        // 3. Recurse (pass ALL newMembers down, even if some were already in this child, 
        // because sub-children might be missing them)
        // Optimization: We could pass only membersToAdd if we assume consistency, 
        // but strict inheritance suggests passing all from parent down.
        // However, to avoid exponential checks, passing 'newMembers' (the parent's full list of additions) is correct.
        await addMembersToDescendants(tx, child.id, newMembers);
    }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const body = await request.json();
        logger.info('PATCH Project [id]:', id);
        logger.info('PATCH Body:', JSON.stringify(body, null, 2));
        const { name, description, type, clientType, parentId, members: inputMembers } = body;
        let members = inputMembers;

        // Manager validation moved below to support type-based exceptions

        // Get current project
        const currentProject = await prisma.project.findUnique({
            where: { id },
            include: { members: true }
        });

        if (!currentProject) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        // Authorization Check
        // Allow if Admin OR if user is a MANAGER of this project
        const isManager = currentProject.members.some(m => m.userId === session.user.id && m.role === 'MANAGER');
        if (!session.user.isAdmin && !isManager) {
            return NextResponse.json({ error: 'Forbidden: You do not have permission to edit this project' }, { status: 403 });
        }

        // Calculate removed users if members are being updated
        let removedUserIds: string[] = [];
        if (members !== undefined && currentProject.members) {
            const newMemberIds = new Set(members.map((m: any) => m.userId));
            removedUserIds = currentProject.members
                .filter(m => !newMemberIds.has(m.userId))
                .map(m => m.userId);
        }

        // Check for duplicate name under same parent (if name is being changed)
        if (name && name !== currentProject.name) {
            const targetParentId = parentId !== undefined ? parentId : currentProject.parentId;
            const existingProject = await prisma.project.findFirst({
                where: {
                    name: name,
                    parentId: targetParentId,
                    id: { not: id } // Exclude current project
                }
            });

            if (existingProject) {
                return NextResponse.json({
                    error: `A project named "${name}" already exists${targetParentId ? ' under this parent' : ' at the top level'}`
                }, { status: 400 });
            }
        }

        // Prevent changing to ROOT if one already exists
        if (type === 'ROOT' && currentProject.type !== 'ROOT') {
            const existingRoot = await prisma.project.findFirst({
                where: { type: 'ROOT' }
            });
            if (existingRoot) {
                return NextResponse.json({
                    error: 'A ROOT project already exists. There can only be one ROOT project.'
                }, { status: 400 });
            }
        }

        // Determine final type for clientType logic
        const finalType = type !== undefined ? type : currentProject.type;

        // Logic: Every project needs at least one MANAGER.
        // EXCEPTION: Partners (ACQUISITION_SOURCE) do not require a manager.
        if (members !== undefined && finalType !== 'ACQUISITION_SOURCE') {
            const hasManager = members.some((m: any) => m.role === 'MANAGER');
            if (!hasManager) {
                const updaterIndex = members.findIndex((m: any) => m.userId === session.user.id);
                if (updaterIndex !== -1) {
                    members[updaterIndex].role = 'MANAGER';
                } else {
                    members.push({ userId: session.user.id, role: 'MANAGER' });
                }
            }
        }

        // Transaction to handle member replacement if provided
        const project = await prisma.$transaction(async (tx) => {
            // 1. Build update data
            const updateData: any = {};
            if (name !== undefined) updateData.name = name;
            if (description !== undefined) updateData.description = description;
            if (type !== undefined) updateData.type = type;
            if (parentId !== undefined) updateData.parentId = parentId;

            // Client Type logic: Only ACQUISITION_SOURCE can have a clientType
            if (clientType !== undefined && finalType === 'ACQUISITION_SOURCE') {
                updateData.clientType = clientType;
            } else if (type !== undefined && type !== 'ACQUISITION_SOURCE') {
                // If changing type AWAY from source, clear clientType
                updateData.clientType = null;
            }

            // 2. Perform update only if data changed
            let updated;
            if (Object.keys(updateData).length > 0) {
                updated = await tx.project.update({
                    where: { id },
                    data: updateData,
                    include: {
                        parent: true,
                        _count: { select: { cases: true, children: true } },
                        members: { include: { user: true } }
                    }
                });
            } else {
                // Just fetch current with same includes if no basic fields changed
                updated = await tx.project.findUniqueOrThrow({
                    where: { id },
                    include: {
                        parent: true,
                        _count: { select: { cases: true, children: true } },
                        members: { include: { user: true } }
                    }
                });
            }

            // 2. Not updating members? Return
            if (members === undefined) return updated;

            // 3. Handle Removal from Descendants
            // EXCEPTION: Partners (ACQUISITION_SOURCE) do not propagate removals to descendants
            if (removedUserIds.length > 0 && updated.type !== 'ACQUISITION_SOURCE') {
                await removeMembersFromDescendants(tx, id, removedUserIds);
            }

            // 4. Replace members for THIS project
            // Delete all existing
            await tx.projectMember.deleteMany({ where: { projectId: id } });

            // Create new ones
            if (members.length > 0) {
                const newMembersPayload = members.map((m: any) => ({
                    userId: m.userId,
                    role: m.role || 'MEMBER'
                }));

                const createData = newMembersPayload.map((m: any) => ({
                    projectId: id,
                    userId: m.userId,
                    role: m.role
                }));

                await tx.projectMember.createMany({
                    data: createData
                });

                // 5. Hierarchy Sync
                // EXCEPTION: Partners (ACQUISITION_SOURCE) are isolated containers.
                // We SKIP all hierarchy syncing (Up and Down) to prevent performance issues and recursive crashes.
                if (finalType !== 'ACQUISITION_SOURCE') {
                    // A) Sync UP: If adding to a sub-project, ensure ancestors have them too
                    if (updated.parentId) {
                        await addMembersToAncestors(tx, updated.parentId, newMembersPayload);
                    }

                    // B) Sync DOWN: If adding to a parent, ensure descendants have them too
                    await addMembersToDescendants(tx, id, newMembersPayload);
                }
            }

            // Return fresh data
            return tx.project.findUniqueOrThrow({
                where: { id },
                include: {
                    parent: true,
                    _count: { select: { cases: true, children: true } },
                    members: { include: { user: true } }
                }
            });
        });

        return NextResponse.json(project);
    } catch (error) {
        logger.error('Error updating project:', error);
        if (error instanceof Error) {
            // Return the specific error message for debugging
            return NextResponse.json({ error: error.message, stack: error.stack }, { status: 500 });
        }
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        // Fetch project to check permissions
        const project = await prisma.project.findUnique({
            where: { id },
            include: { members: true }
        });

        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        // Authorization Check
        // Allow if Admin OR if user is a MANAGER of this project
        const isManager = project.members.some(m => m.userId === session.user.id && m.role === 'MANAGER');
        if (!session.user.isAdmin && !isManager) {
            return NextResponse.json({ error: 'Forbidden: You do not have permission to delete this project' }, { status: 403 });
        }

        // Check if project has children
        const childCount = await prisma.project.count({
            where: { parentId: id }
        });

        if (childCount > 0) {
            return NextResponse.json(
                { error: 'Cannot delete project with children. Delete children first.' },
                { status: 400 }
            );
        }

        // Check if project has cases
        const caseCount = await prisma.caseProject.count({
            where: { projectId: id }
        });

        if (caseCount > 0) {
            return NextResponse.json(
                { error: 'Cannot delete project with linked cases. Remove cases first.' },
                { status: 400 }
            );
        }

        await prisma.project.delete({
            where: { id }
        });

        return NextResponse.json({ message: 'Project deleted successfully' });
    } catch (error) {
        logger.error('Error deleting project:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

