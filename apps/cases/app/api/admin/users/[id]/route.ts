import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';

const logger = createLogger('api/admin/users/[id]');

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();

        if (!session?.user?.isAdmin) {
            return NextResponse.json(
                { error: 'Unauthorized - Admin access required' },
                { status: 403 }
            );
        }

        const { id } = await params;

        // Prevent deleting yourself
        if (id === session.user.id) {
            return NextResponse.json(
                { error: 'Cannot delete your own account' },
                { status: 400 }
            );
        }

        // Check if user exists
        const user = await prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true } });

        if (!user) {
            return NextResponse.json(
                { error: 'User not found' },
                { status: 404 }
            );
        }

        // Delete the user (cascading deletes will handle related records)
        await prisma.user.delete({
            where: { id } });

        return NextResponse.json({
            success: true,
            message: `User ${user.firstName} ${user.lastName} (${user.email}) has been deleted` });
    } catch (error: any) {
        logger.error('Delete user error:', error);

        // Handle foreign key constraints
        if (error.code === 'P2003') {
            return NextResponse.json(
                { error: 'Cannot delete user: they have related records. Please reassign or delete their cases first.' },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: 'Failed to delete user', details: error.message },
            { status: 500 }
        );
    }
}
