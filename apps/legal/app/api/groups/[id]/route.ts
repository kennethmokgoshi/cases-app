import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger } from '@zenowethu/shared-lib';

// GET: Get specific group details
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        // @ts-ignore
        const group = await prisma.userGroup.findUnique({
            where: { id },
            include: {
                members: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                email: true,
                                organization: true
                            }
                        }
                    }
                }
            }
        });

        if (!group) {
            return NextResponse.json({ error: 'Group not found' }, { status: 404 });
        }

        return NextResponse.json(group);
    } catch (error) {
        logger.error('Error fetching group:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// PATCH: Update group members (Add/Remove)
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const { id } = await params;
        const { addMemberIds, removeMemberIds } = await request.json();

        // Transaction to ensure atomicity
        await prisma.$transaction(async (tx) => {
            // Remove members
            if (removeMemberIds && removeMemberIds.length > 0) {
                // @ts-ignore
                await tx.userGroupMember.deleteMany({
                    where: {
                        groupId: id,
                        userId: { in: removeMemberIds }
                    }
                });
            }

            // Add members
            if (addMemberIds && addMemberIds.length > 0) {
                // Filter out already existing members to avoid unique constraint errors?
                // Or just use createMany with skipDuplicates (not available in SQLite/some providers nicely)
                // We'll iterate and upsert or create if not exists

                for (const userId of addMemberIds) {
                    // @ts-ignore
                    const exists = await tx.userGroupMember.findUnique({
                        where: {
                            groupId_userId: {
                                groupId: id,
                                userId: userId
                            }
                        }
                    });

                    if (!exists) {
                        // @ts-ignore
                        await tx.userGroupMember.create({
                            data: {
                                groupId: id,
                                userId: userId
                            }
                        });
                    }
                }
            }
        });

        // @ts-ignore
        const updatedGroup = await prisma.userGroup.findUnique({
            where: { id },
            include: {
                members: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                email: true
                            }
                        }
                    }
                }
            }
        });

        return NextResponse.json(updatedGroup);
    } catch (error) {
        logger.error('Error updating group:', error);
        return NextResponse.json({ error: 'Failed to update group' }, { status: 500 });
    }
}

// DELETE: Delete a group
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const { id } = await params;

        // @ts-ignore
        await prisma.userGroup.delete({
            where: { id }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error('Error deleting group:', error);
        return NextResponse.json({ error: 'Failed to delete group' }, { status: 500 });
    }
}
