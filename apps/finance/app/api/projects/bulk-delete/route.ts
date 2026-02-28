import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger } from '@zenowethu/shared-lib';

export async function DELETE(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user || !session.user.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 401 });
        }

        const { projectIds } = await request.json();

        if (!projectIds || !Array.isArray(projectIds) || projectIds.length === 0) {
            return NextResponse.json({ error: 'No project IDs provided' }, { status: 400 });
        }

        // Logic for Bulk Deletion:
        // We need to check if ANY of these projects have children or cases that are NOT in the deletion list.
        // To keep it simple but safe:
        // 1. Identify projects with children
        // 2. Identify projects with cases
        // 3. Filter out those that can be safely deleted.

        const results = {
            deleted: [] as string[],
            failed: [] as { id: string, name: string, reason: string }[]
        };

        for (const id of projectIds) {
            const project = await prisma.project.findUnique({
                where: { id },
                include: { _count: { select: { children: true, cases: true } } }
            });

            if (!project) {
                results.failed.push({ id, name: 'Unknown', reason: 'Project not found' });
                continue;
            }

            if (project._count.children > 0) {
                results.failed.push({ id, name: project.name, reason: 'Has sub-projects' });
                continue;
            }

            const caseCount = await prisma.caseProject.count({
                where: { projectId: id }
            });

            if (caseCount > 0) {
                results.failed.push({ id, name: project.name, reason: 'Has linked cases' });
                continue;
            }

            try {
                await prisma.project.delete({ where: { id } });
                results.deleted.push(id);
            } catch (err) {
                results.failed.push({ id, name: project.name, reason: 'Database error ' + (err instanceof Error ? err.message : '') });
            }
        }

        return NextResponse.json({
            message: `Successfully deleted ${results.deleted.length} projects.`,
            deletedCount: results.deleted.length,
            failedCount: results.failed.length,
            failed: results.failed
        });

    } catch (error) {
        logger.error('Error in bulk project delete:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
