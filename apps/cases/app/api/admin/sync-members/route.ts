
import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger } from '@zenowethu/shared-lib';

const logger = createLogger('api/admin/sync-members');

// Helper to recursively sync members
async function syncProjectMembers(projectId: string, parentMembers: any[]) {
    // 1. Fetch current project
    const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
            members: true,
            children: true
        }
    });

    if (!project) return;

    // 2. Identify missing members from parent
    const membersToAdd = [];

    for (const pm of parentMembers) {
        // If this parent member is NOT in the current project, add them
        const exists = project.members.some(m => m.userId === pm.userId);
        if (!exists) {
            membersToAdd.push({
                projectId: projectId,
                userId: pm.userId,
                role: pm.role // Inherit role
            });
        }
    }

    // 3. Add missing members (using Promise.all for SQLite compatibility)
    if (membersToAdd.length > 0) {
        logger.info(`Syncing ${membersToAdd.length} members to project ${project.name} (${project.id})`);
        await Promise.all(membersToAdd.map(m =>
            prisma.projectMember.create({
                data: m
            })
        ));
    }

    // 4. Get the UPDATED list of members for this project (original + newly added)
    const updatedMembers = [
        ...project.members,
        ...membersToAdd
    ];

    // 5. Recurse for all children
    for (const child of project.children) {
        await syncProjectMembers(child.id, updatedMembers);
    }
}

export async function GET(request: Request) {
    try {
        const session = await auth();
        // Strict Admin check
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        logger.info('Starting member sync...');

        // 1. Get ROOT project
        const root = await prisma.project.findFirst({
            where: { type: 'ROOT' },
            include: { members: true }
        });

        if (!root) {
            return NextResponse.json({ message: 'No Root project found' });
        }

        // 2. Start recursion from ROOT
        // We pass root's members as the "parent context" for the root itself? 
        // No, the root has no parent. But we want to sync root's members DOWN to its children.
        // So we call sync for the root. 
        // Parent members for root is EMPTY. 
        // The logic inside: "Identify missing from parent" -> empty. added -> 0.
        // updatedMembers -> root.members.
        // recurse -> children gets root.members. 
        // Correct.
        await syncProjectMembers(root.id, []);

        return NextResponse.json({ message: 'Sync complete' });

    } catch (error: any) {
        logger.error('Sync failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

