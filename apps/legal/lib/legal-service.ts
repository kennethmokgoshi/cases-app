import { prisma } from '@zenowethu/database';
import { logger } from '@zenowethu/shared-lib';

export type LegalMatterType = 'RESCISSION' | 'DISPUTE' | 'PRESCRIPTION' | 'GENERAL';

export async function getLegalDashboardStats(userId: string) {
    try {
        const rescissions = await prisma.legalMatter.count({
            where: {
                matterType: 'RESCISSION',
                status: { not: 'GRANTED' }
            }
        });

        const disputes = await prisma.legalMatter.count({
            where: {
                matterType: 'DISPUTE',
                status: { not: 'RESOLVED' }
            }
        });

        const recentRescissions = await prisma.legalMatter.findMany({
            where: { matterType: 'RESCISSION' },
            take: 5,
            orderBy: { updatedAt: 'desc' },
            include: {
                Client: {
                    select: { firstName: true, lastName: true }
                },
                Case: {
                    select: { fileNumber: true }
                }
            }
        });

        const recentDisputes = await prisma.legalMatter.findMany({
            where: { matterType: 'DISPUTE' },
            take: 5,
            orderBy: { updatedAt: 'desc' },
            include: {
                Client: {
                    select: { firstName: true, lastName: true }
                }
            }
        });

        return {
            counts: {
                rescissions,
                disputes
            },
            recentRescissions,
            recentDisputes
        };
    } catch (error) {
        logger.error({ error }, '[legal-service] Error fetching dashboard stats:');
        throw error;
    }
}

export async function createLegalMatter(data: {
    caseId: string;
    clientId: string;
    matterType: LegalMatterType;
    creditorName: string;
    accountNumber?: string;
    notes?: string;
    userId: string;
}) {
    try {
        const matter = await prisma.legalMatter.create({
            data: {
                caseId: data.caseId,
                clientId: data.clientId,
                matterType: data.matterType,
                creditorName: data.creditorName,
                accountNumber: data.accountNumber,
                outcomeNotes: data.notes,
                createdById: data.userId,
                status: 'OPEN'
            }
        });

        await prisma.workflowLog.create({
            data: {
                caseId: data.caseId,
                fromStatus: null,
                toStatus: 'OPEN',
                action: 'LEGAL_MATTER_CREATED',
                userId: data.userId,
                notes: `New ${data.matterType} matter created for ${data.creditorName}`
            }
        });

        logger.info({ matterId: matter.id, type: data.matterType }, '⚖️ Legal matter created successfully');
        return matter;
    } catch (error) {
        logger.error({ error }, '[legal-service] Error creating legal matter:');
        throw error;
    }
}
