import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger } from '@zenowethu/shared-lib';

const logger = createLogger('api/groups');

// GET: List all groups
export async function GET() {
    try {
        // @ts-ignore
        const groups = await prisma.userGroup.findMany({
            include: {
                _count: {
                    select: { members: true }
                },
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
            },
            orderBy: { name: 'asc' }
        });
        return NextResponse.json(groups);
    } catch (error) {
        logger.error('Error fetching groups:', error);
        return NextResponse.json({ error: 'Failed to fetch groups' }, { status: 500 });
    }
}

// POST: Create a new group
export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const { name } = await request.json();

        if (!name || name.trim() === '') {
            return NextResponse.json({ error: 'Group name is required' }, { status: 400 });
        }

        // @ts-ignore
        const existing = await prisma.userGroup.findUnique({
            where: { name: name.trim() }
        });

        if (existing) {
            return NextResponse.json({ error: 'Group name already exists' }, { status: 409 });
        }

        // @ts-ignore
        const group = await prisma.userGroup.create({
            data: {
                name: name.trim()
            }
        });

        return NextResponse.json(group, { status: 201 });
    } catch (error: any) {
        logger.error('Error creating group:', error);
        return NextResponse.json({ error: error.message || 'Failed to create group' }, { status: 500 });
    }
}

