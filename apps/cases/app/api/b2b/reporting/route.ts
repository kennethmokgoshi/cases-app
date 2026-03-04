import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';

// Server-side logger for API routes
const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    debug: (...args: any[]) => console.debug('[DEBUG]', ...args)
};

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check if user is a manager
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            include: {
                projectMemberships: {
                    include: {
                        project: true } } } });

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Check if user is a manager in any project
        const isManager = user.projectMemberships.some(m => m.role === 'MANAGER');
        if (!isManager && !session.user.isAdmin) {
            return NextResponse.json({ error: 'Access denied. Manager role required.' }, { status: 403 });
        }

        // Get user's partner project ID
        const partnerProjectId = user.b2bPartnerId;
        if (!partnerProjectId) {
            return NextResponse.json({ error: 'No partner project found' }, { status: 404 });
        }

        // --- RECURSIVE PROJECT TRACKING ---
        // We need all sub-project IDs (branches, years, months) to count cases correctly
        const allProjects = await prisma.project.findMany({
            select: { id: true, parentId: true }
        });

        const getDescendantIds = (rootId: string): string[] => {
            const descendants: string[] = [rootId];
            const queue = [rootId];
            while (queue.length > 0) {
                const currId = queue.shift()!;
                const children = allProjects.filter(p => p.parentId === currId);
                children.forEach(child => {
                    descendants.push(child.id);
                    queue.push(child.id);
                });
            }
            return descendants;
        };

        const projectIds = getDescendantIds(partnerProjectId);

        // Get team stats
        const totalCases = await prisma.case.count({
            where: {
                projects: {
                    some: {
                        projectId: { in: projectIds } } } } });

        const activeCases = await prisma.case.count({
            where: {
                projects: {
                    some: {
                        projectId: { in: projectIds } } },
                status: {
                    in: ['NEW_LEAD', 'DOCUMENTS_RECEIVED', 'IN_PROGRESS', 'SENT_TO_XDS'] } } });

        const completedCases = await prisma.case.count({
            where: {
                projects: {
                    some: {
                        projectId: { in: projectIds } } },
                status: 'COMPLETED' } });

        const pendingDocuments = await prisma.case.count({
            where: {
                projects: {
                    some: {
                        projectId: { in: projectIds } } },
                status: 'OUTSTANDING_DOCUMENTS' } });

        // Get team members and their case counts
        const teamMembers = await prisma.user.findMany({
            where: {
                b2bPartnerId: partnerProjectId },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                _count: {
                    select: {
                        casesCreated: true } } } });

        const teamMembersData = teamMembers.map(member => ({
            id: member.id,
            firstName: member.firstName || 'Unknown',
            lastName: member.lastName || 'User',
            email: member.email,
            casesCreated: member._count.casesCreated }));

        // Get recent activity (last 10 workflow changes)
        const recentWorkflowLogs = await prisma.workflowLog.findMany({
            where: {
                case: {
                    projects: {
                        some: {
                            projectId: { in: projectIds } } } } },
            include: {
                case: {
                    select: {
                        fileNumber: true } },
                user: {
                    select: {
                        firstName: true,
                        lastName: true } } },
            orderBy: {
                timestamp: 'desc' },
            take: 10 });

        const recentActivity = recentWorkflowLogs.map(log => ({
            id: log.id,
            caseFileNumber: log.case.fileNumber,
            action: `Status changed to ${log.toStatus.replace('_', ' ')}`,
            user: log.user ? `${log.user.firstName} ${log.user.lastName}` : 'System',
            timestamp: log.timestamp.toISOString() }));

        return NextResponse.json({
            teamStats: {
                totalCases,
                activeCases,
                completedCases,
                pendingDocuments },
            teamMembers: teamMembersData,
            recentActivity });
    } catch (error) {
        logger.error('Error fetching reporting data:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

