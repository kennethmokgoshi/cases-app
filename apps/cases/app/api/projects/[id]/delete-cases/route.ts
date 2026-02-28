
import { NextRequest, NextResponse } from 'next/server';
import { auth, logger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';

export async function DELETE(
    req: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    const session = await auth();

    // 1. Authorization: Only Admins can mass delete cases
    if (!session?.user?.isAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const projectId = params.id;

    if (!projectId) {
        return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    try {
        const casesToDelete = await prisma.case.findMany({
            where: {
                projects: {
                    some: {
                        projectId: projectId
                    }
                }
            },
            select: { id: true }
        });

        const caseIds = casesToDelete.map(c => c.id);

        if (caseIds.length === 0) {
            return NextResponse.json({ message: 'No cases found in this project', count: 0 });
        }

        // Chunking to avoid SQLite variable limit (999) and handle deletion gracefully
        const CHUNK_SIZE = 500;
        let deletedCount = 0;

        for (let i = 0; i < caseIds.length; i += CHUNK_SIZE) {
            const chunk = caseIds.slice(i, i + CHUNK_SIZE);

            // 1. Delete ALL CaseProject associations first (missing cascade)
            await prisma.caseProject.deleteMany({
                where: {
                    caseId: { in: chunk }
                }
            });

            // 2. Delete the Cases (other relations like Comments have cascade)
            const result = await prisma.case.deleteMany({
                where: {
                    id: { in: chunk }
                }
            });
            deletedCount += result.count;
        }

        return NextResponse.json({
            message: `Successfully deleted ${deletedCount} cases from project ${projectId}`,
            count: deletedCount
        });

    } catch (error) {
        logger.error('Failed to bulk delete cases:', error);
        const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
