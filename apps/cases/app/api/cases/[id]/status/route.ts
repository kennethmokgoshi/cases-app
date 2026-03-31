import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { calculateSlaDeadline  } from '@zenowethu/shared-lib';
import { getStatusByCode } from '@zenowethu/shared-lib';
import {
    sendStatusChangeNotification,
    sendInternalNotification,
    findManagersForCase
} from '@zenowethu/shared-lib';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { CaseStatusSchema, parseBody } from '@/lib/schemas';
import { z } from 'zod';

const logger = createLogger('api/cases/[id]/status');

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        const { id } = await params;
        const parsed = parseBody(CaseStatusSchema, await request.json());
        if (!parsed.success) return parsed.response;
        const body = parsed.data as z.infer<typeof CaseStatusSchema>;
        const { newStatus, skipNotification } = body;

        // Get the status configuration
        const statusInfo = getStatusByCode(newStatus);

        // Get current case with client info for notification
        const currentCase = await prisma.case.findUnique({
            where: { id },
            include: {
                client: true,
                projects: {
                    where: { isPrimary: true },
                    include: { project: true }
                }
            }
        });

        if (!currentCase) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        // Calculate deadline if SLA is enabled
        let deadline: Date | null = null;
        if (statusInfo?.slaEnabled && statusInfo.slaDays) {
            deadline = calculateSlaDeadline(new Date());
        }

        // Update the case
        const updatedCase = await prisma.case.update({
            where: { id },
            data: {
                status: newStatus,
                statusEntryDate: new Date(),
                nextUpdate: deadline, // Use the calculated SLA date as nextUpdate
                // deadline: deadline, // Removed as requested
                isOverdue: false, // Reset overdue state on status change
                daysInStatus: 0, // Reset days counter
                workflowLogs: {
                    create: {
                        fromStatus: currentCase.status,
                        toStatus: newStatus,
                        timestamp: new Date() }
                }
            },
            include: {
                client: true,
                projects: {
                    include: {
                        project: true
                    }
                },
                workflowLogs: {
                    orderBy: {
                        timestamp: 'desc'
                    }
                }
            }
        });

        // Send notification (async, don't block response)
        if (!skipNotification) {
            // Get main source from project hierarchy
            let mainSource = currentCase.partnerName || 'Zenowethu Debt Management';
            const primaryProject = currentCase.projects[0]?.project;
            if (primaryProject) {
                let currentProject = primaryProject;
                while (currentProject.parentId) {
                    const parent = await prisma.project.findUnique({
                        where: { id: currentProject.parentId }
                    });
                    if (parent) {
                        currentProject = parent;
                    } else {
                        break;
                    }
                }
                mainSource = currentProject.name;
            }

            // Parse services from case
            let servicesText = 'Credit Repair';
            if (currentCase.services) {
                try {
                    const servicesArray = JSON.parse(currentCase.services);
                    if (Array.isArray(servicesArray) && servicesArray.length > 0) {
                        servicesText = servicesArray.join(', ');
                    }
                } catch { /* ignore parse errors */ }
            }

            sendStatusChangeNotification({
                caseId: id,
                clientName: `${currentCase.client.firstName} ${currentCase.client.lastName}`,
                clientPhone: currentCase.client.phone,
                clientEmail: currentCase.client.email,
                fileNumber: currentCase.fileNumber,
                statusCode: newStatus,
                partnerName: currentCase.partnerName,
                isB2B: currentCase.acquisitionType === 'B2B',
                services: servicesText,
                mainSource: mainSource }).then(result => {
                if (result.errors.length > 0) {
                    logger.warn(`⚠️ Notification errors for ${id}:`, result.errors);
                } else {
                    logger.info(`📬 Notification sent for ${id}: SMS=${result.smsSuccess}, Email=${result.emailSuccess}`);
                }
            }).catch(err => {
                logger.error(`❌ Failed to send notification for ${id}:`, err);
            });
        }

        // --- AUTOMATED INTERNAL ALERTS ---

        // 1. Alert Manager if Case is Declined
        const declineStatusPrefixes = ['REJECTED', 'CASE_REJECTED', 'DEBT_BUSTERS_REJECTED', 'OCTOGEN_REJECTED'];
        const isDeclined = declineStatusPrefixes.some(prefix => newStatus.startsWith(prefix));

        if (isDeclined) {
            const managers = await findManagersForCase(id);
            if (managers.length > 0) {
                for (const managerId of managers) {
                    await sendInternalNotification({
                        caseId: id,
                        userId: managerId,
                        statusCode: 'DECLINED_MANAGER',
                        variables: {
                            clientName: `${currentCase.client.firstName} ${currentCase.client.lastName}`,
                            fileNumber: currentCase.fileNumber
                        }
                    });
                }
            }
        }

        // 2. Alert Admin if Project has no Manager (Self-healing check)
        const primaryProject = updatedCase.projects.find(p => p.isPrimary)?.project;
        if (primaryProject) {
            const managers = await prisma.projectMember.count({
                where: {
                    projectId: primaryProject.id,
                    role: 'MANAGER'
                }
            });

            if (managers === 0) {
                await sendInternalNotification({
                    role: 'ADMIN',
                    statusCode: 'NO_MANAGER_ADMIN',
                    variables: {
                        projectName: primaryProject.name
                    }
                });
            }
        }

        // 3. Automated DC Invoice Request (if status is REJECTED_OWES_FEES)
        if (newStatus === 'REJECTED_OWES_FEES' && currentCase.dcEmail) {
            await sendStatusChangeNotification({
                caseId: id,
                clientName: `${currentCase.client.firstName} ${currentCase.client.lastName}`,
                fileNumber: currentCase.fileNumber,
                statusCode: 'REQUEST_INVOICE_DC',
                dcName: currentCase.debtCounsellorName || 'Debt Counsellor',
                dcEmail: currentCase.dcEmail,
                idNumber: currentCase.client.idNumber,
                isB2B: currentCase.acquisitionType === 'B2B' });
        }

        return NextResponse.json(updatedCase);
    } catch (error) {
        logger.error('Error updating case status:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
