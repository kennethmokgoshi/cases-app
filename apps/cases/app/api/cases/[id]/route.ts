import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { createLogger, sendStatusChangeNotification, provisionConsumerForClient } from '@zenowethu/shared-lib';
import { auth } from '@zenowethu/shared-lib/src/auth';
import { CasePatchSchema, parseBody } from '@/lib/schemas';
import { buildProjectDisplayName } from '@/lib/project-path';
import { z } from 'zod';

const logger = createLogger('api/cases/[id]');


export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        let caseDetail;
        
        // Define inclusion logic once to reuse for fallback
        const standardInclude: any = {
            client: true,
            jointClient: true,
            projects: {
                include: {
                    project: {
                        include: {
                            parent: { select: { id: true, name: true } },
                            members: {
                                include: {
                                    user: {
                                        select: {
                                            firstName: true,
                                            lastName: true,
                                            email: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            // Referrer shown on the case page under the Project card so staff can
            // spot referrals assigned to the wrong referrer at a glance.
            referrer: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    cellNumber: true,
                    referrerType: true,
                    isActive: true
                }
            },
            documents: true,
            workflowLogs: {
                orderBy: {
                    timestamp: 'desc'
                }
            },
            assignments: {
                include: {
                    user: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            email: true,
                            avatarUrl: true
                        }
                    }
                }
            },
            updatedBy: {
                select: {
                    firstName: true,
                    lastName: true
                }
            },
            // Latest debt-review-removal consent — lets staff see at a glance
            // whether the consumer has consented for work to proceed.
            drrConsents: {
                orderBy: { createdAt: 'desc' as const },
                take: 1,
                select: {
                    id: true,
                    status: true,
                    channel: true,
                    createdAt: true,
                    consentedAt: true,
                    expiresAt: true
                }
            },
            // Client quotations for this case — the case page shows staff whether a
            // quote went out and whether the client accepted or rejected it.
            // DC fee quotes are excluded: those are addressed to another debt
            // counsellor, not this client.
            invoices: {
                where: { type: 'QUOTE' as const },
                orderBy: { issuedAt: 'desc' as const },
                select: {
                    id: true,
                    invoiceNumber: true,
                    status: true,
                    total: true,
                    issuedAt: true,
                    sentAt: true,
                    sentTo: true,
                    acceptedAt: true,
                    rejectedAt: true,
                    decisionNote: true,
                    convertedToInvoiceId: true
                }
            }
        };

        try {
            // Priority 1: Search by internal CUID id
            caseDetail = await prisma.case.findUnique({
                where: { id },
                include: standardInclude
            });

            // Priority 2: Fallback to search by fileNumber if id lookup failed
            if (!caseDetail) {
                caseDetail = await prisma.case.findUnique({
                    where: { fileNumber: id },
                    include: standardInclude
                });
            }
        } catch (initialError) {
            logger.error('[API] Case Details GET failed, retrying without assignments:', initialError);
            
            // Critical Fallback: Retry without assignments if schema/data mismatch
            const fallbackInclude = { ...standardInclude };
            delete fallbackInclude.assignments;
            delete fallbackInclude.jointClient; // Also delete if causing issues in older DBs
            // Actually, keep it if it's new, but usually fallbacks are for breaking changes.
            // I'll keep it simple.

            caseDetail = await prisma.case.findUnique({
                where: { id },
                include: fallbackInclude
            });

            if (!caseDetail) {
                caseDetail = await prisma.case.findUnique({
                    where: { fileNumber: id },
                    include: fallbackInclude
                });
            }
        }

        if (!caseDetail) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        // Fetch all projects once to build paths efficiently
        const allProjects = await prisma.project.findMany({
            select: { id: true, name: true, parentId: true, type: true }
        });

        const projectsWithPath = (caseDetail as any).projects.map((cp: any) => ({
            ...cp,
            project: {
                ...cp.project,
                fullPath: buildProjectDisplayName(cp.project.id, allProjects)
            }
        }));

        // Find latest Savings Audit from documents
        let savingsAudit = null;
        const creditReport = (caseDetail as any).documents
            ?.filter((d: any) => d.type === 'CREDIT_REPORT' && d.extractedData)
            ?.sort((a: any, b: any) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0];

        if (creditReport?.extractedData) {
            try {
                const parsed = JSON.parse(creditReport.extractedData);
                savingsAudit = parsed.savingsAudit || null;
            } catch (e) {
                logger.error('Failed to parse credit report extractedData for savingsAudit', e);
            }
        }

        const { invoices: caseQuotes, ...caseRest } = caseDetail as any;

        return NextResponse.json({
            ...caseRest,
            projects: projectsWithPath,
            savingsAudit,
            quotes: caseQuotes ?? []
        });
    } catch (error) {
        logger.error('Error fetching case:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        // Attribution: Use session user or fallback to first admin
        const actingUserId = session?.user?.id || (await prisma.user.findFirst({ where: { isAdmin: true } }))?.id;
        const attribution = actingUserId ? { connect: { id: actingUserId } } : undefined;

        if (!session?.user && !actingUserId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const isAdmin = session?.user?.isAdmin === true;

        const { id } = await params;
        const parsed = parseBody(CasePatchSchema, await request.json());
        if (!parsed.success) return parsed.response;

        const body = parsed.data as z.infer<typeof CasePatchSchema>;
        const {
            client,
            jointClient,
            closedAccounts,
            openAccounts,
            prescribedAccounts,
            ncrdcNo,
            instalments,
            affordabilityStatus,
            acquisitionType,
            partnerName,
            partnerBranch,
            r350Status,
            partnerSplitPercent,
            dhsStatus,
            manuallyAcceptedViaDhs,
            debtCounsellorName,
            dcTradingName,
            dcEmail,
            lastKnownEmail,
            preferredDcEmail,
            dcOperatingStatus,
            dcMobile,
            consumerDhsStatus,
            requestedDhsStatus,
            previousDebtCounsellor,
            dhsPreviousStatus,
            dhsStatusDate,
            dhsApplicationDate,
            cb_ncrdcNo,
            cb_debtCounsellor,
            cb_contactNo,
            cb_applicationDate,
            cb_status,
            cb_statusDate,
            totalDebtAmount,
            totalMonthlyInstallment,
            forceUpdate,
            status,
            workflowStatus,
            insuranceNotes,
            adminFee,
            serviceFee,
            distributeWaitList,
            todos,
            declineReason,
            declineReasonAttended,
            services,
            description,
            assignments,
            category,
            legalFeesStatus,
            ...otherCaseData
        } = body;

        // Get the current case's client
        const currentCase = await prisma.case.findUnique({
            where: { id },
            include: { client: true }
        });

        if (!currentCase) {
            return NextResponse.json({
                error: 'Case not found',
                code: 'CASE_NOT_FOUND'
            }, { status: 404 });
        }

        // Check for duplicate ID Number
        if (client && client.idNumber) {
            const existingByIdNumber = await prisma.client.findFirst({
                where: {
                    idNumber: client.idNumber,
                    id: { not: currentCase.clientId }
                },
                include: {
                    cases: {
                        orderBy: { createdAt: 'desc' },
                        take: 1,
                        include: {
                            projects: {
                                where: { isPrimary: true },
                                include: { project: { select: { name: true } } },
                                take: 1
                            }
                        }
                    }
                }
            });

            if (existingByIdNumber) {
                // Determine if we should allow merging automatically
                let isSpecialRole = false;
                if (client.idNumber) {
                    const [employee, referrer, b2bUser] = await Promise.all([
                        prisma.user.findFirst({ where: { idNumber: client.idNumber, userType: 'STAFF' }, select: { id: true } }),
                        prisma.referrer.findFirst({ where: { idNumber: client.idNumber }, select: { id: true } }),
                        prisma.user.findFirst({ where: { idNumber: client.idNumber, userType: 'B2B_PARTNER' }, select: { id: true } })
                    ]);
                    isSpecialRole = !!(employee || referrer || b2bUser);
                }

                // Check if existing client has active cases
                const existingCases = await prisma.case.findMany({
                    where: { clientId: existingByIdNumber.id },
                    select: { status: true }
                });
                const hasActiveCases = existingCases.some(c => !['COMPLETED', 'CLOSED', 'CANCELLED', 'REJECTED', 'QUOTE_REJECTED', 'NOT_POTENTIAL', 'FEES_TOO_HIGH', 'LEGAL_FEES_WITHDREW', 'AFTERCARE_FEES_WITHDREW', 'PARKED'].includes(c.status));

                if (forceUpdate || isAdmin || isSpecialRole || !hasActiveCases) {
                    logger.info(`🔄 Auto-Merge/Force Update Triggered for Duplicate ID: ${client.idNumber} (Reason: ${forceUpdate ? 'Manual' : isAdmin ? 'Admin' : isSpecialRole ? 'Special Role' : 'No Active Cases'})`);

                    // 1. Update Existing Client
                    await (prisma.client.update as any)({
                        where: { id: existingByIdNumber.id },
                        data: {
                            firstName: client.firstName,
                            lastName: client.lastName,
                            phone: client.phone || existingByIdNumber.phone,
                            alternativePhone: client.alternativePhone || (existingByIdNumber as any).alternativePhone,
                            alternativePhone2: client.alternativePhone2 || (existingByIdNumber as any).alternativePhone2,
                            email: client.email || existingByIdNumber.email,
                            alternativeEmail: client.alternativeEmail || (existingByIdNumber as any).alternativeEmail,
                            address: client.address || existingByIdNumber.address,
                            employer: client.employer || existingByIdNumber.employer,
                            grossSalary: client.grossSalary ? parseFloat(String(client.grossSalary)) : (existingByIdNumber as any).grossSalary,
                            netSalary: client.netSalary ? parseFloat(String(client.netSalary)) : (existingByIdNumber as any).netSalary
                        }
                    });

                    // 2. Find Latest Case for Existing Client
                    const existingCase = await prisma.case.findFirst({
                        where: { clientId: existingByIdNumber.id },
                        orderBy: { createdAt: 'desc' }
                    });

                    let finalCaseId = existingCase?.id;

                    if (existingCase) {
                        // Update existing case financials
                        await prisma.case.update({
                            where: { id: existingCase.id },
                            data: {
                                totalDebtAmount: totalDebtAmount,
                                totalMonthlyInstallment: totalMonthlyInstallment,
                                serviceFee: serviceFee ? parseFloat(String(serviceFee).replace(/[^0-9.]/g, '')) : undefined,
                                instalments: instalments || 1,
                                services: services ? JSON.stringify(services) : undefined, // Update services
                                acquisitionType: acquisitionType, // Update acquisition type
                                partnerName: partnerName,
                                partnerBranch: partnerBranch,
                                // Add other fields as needed
                            }
                        });

                        // Copy projects from temp case to existing case
                        // 1. Get temp case projects
                        const tempProjects = await prisma.caseProject.findMany({
                            where: { caseId: currentCase.id }
                        });

                        // 2. Add them to existing case if not present
                        for (const tp of tempProjects) {
                            // Check if already linked
                            const existingLink = await prisma.caseProject.findUnique({
                                where: {
                                    caseId_projectId: {
                                        caseId: existingCase.id,
                                        projectId: tp.projectId
                                    }
                                }
                            });

                            if (!existingLink) {
                                await prisma.caseProject.create({
                                    data: {
                                        caseId: existingCase.id,
                                        projectId: tp.projectId,
                                        isPrimary: tp.isPrimary
                                    }
                                });
                            } else if (tp.isPrimary) {
                                // If temp project is primary, update existing to be primary??
                                // Or maybe just ensure at least one is primary.
                                // For now, let's respect the new one if the old one wasn't primary.
                                if (!existingLink.isPrimary) {
                                    await prisma.caseProject.update({
                                        where: {
                                            caseId_projectId: {
                                                caseId: existingCase.id,
                                                projectId: tp.projectId
                                            }
                                        },
                                        data: { isPrimary: true }
                                    });
                                }
                            }
                        }
                    } else {
                        // Create new case if oddly none exists
                        // Create new case if oddly none exists (Orphan client)
                        // Generate file number logic
                        const year = new Date().getFullYear();
                        let newCase;
                        let retryCount = 0;
                        const maxRetries = 5;

                        while (retryCount < maxRetries) {
                            try {
                                // Get the highest file number this year
                                const lastCase = await prisma.case.findFirst({
                                    where: { fileNumber: { startsWith: `ZDM-${year}-` } },
                                    orderBy: { fileNumber: 'desc' },
                                    select: { fileNumber: true }
                                });

                                let nextNumber = 1;
                                if (lastCase) {
                                    const parts = lastCase.fileNumber.split('-');
                                    const lastNumber = parseInt(parts[2] || '0', 10);
                                    nextNumber = (isNaN(lastNumber) ? 0 : lastNumber) + 1;
                                }
                                const fileNumber = `ZDM-${year}-${String(nextNumber).padStart(3, '0')}`;

                                newCase = await prisma.case.create({
                                    data: {
                                        fileNumber,
                                        clientId: existingByIdNumber.id,
                                        status: 'NEW_LEAD',
                                        totalDebtAmount: totalDebtAmount,
                                        totalMonthlyInstallment: totalMonthlyInstallment,
                                        // Default fields
                                        acquisitionType: 'B2C',
                                        serviceFeeCollectedBy: 'ZENOWETHU'
                                    }
                                });
                                break; // Success
                            } catch (createError: any) {
                                if (createError?.code === 'P2002' && createError?.meta?.target?.includes('fileNumber')) {
                                    retryCount++;
                                    continue; // Retry with new number
                                }
                                throw createError; // Rethrow other errors
                            }
                        }

                        if (!newCase) throw new Error('Failed to generate unique file number after retries');
                        finalCaseId = newCase.id;
                    }

                    // 3. Move Documents from TEMP Case to FINAL Case
                    // currentCase is the TEMP case
                    await prisma.document.updateMany({
                        where: { caseId: currentCase.id },
                        data: { caseId: finalCaseId! }
                    });

                    // 4. Cleanup & Delete TEMP Case
                    // Delete related records first to avoid foreign key constraints
                    await prisma.caseProject.deleteMany({ where: { caseId: currentCase.id } });
                    await prisma.workflowLog.deleteMany({ where: { caseId: currentCase.id } });
                    await prisma.notificationLog.deleteMany({ where: { caseId: currentCase.id } });
                    await prisma.caseComment.deleteMany({ where: { caseId: currentCase.id } });

                    await prisma.case.delete({
                        where: { id: currentCase.id }
                    });

                    // Also delete temp client if it was created just now (which currentCase.client explains)
                    // The temp client ID is currentCase.clientId
                    await prisma.client.delete({
                        where: { id: currentCase.clientId }
                    });

                    return NextResponse.json({
                        success: true,
                        id: finalCaseId,
                        message: 'Merged with existing record'
                    });

                } else {
                    const existingLatestCase = (existingByIdNumber as any).cases?.[0];
                    const existingProjectId = existingLatestCase?.projects?.[0]?.projectId;
                    // Resolve the full hierarchical project path (e.g. "Letsatsi Mbombela June 2026")
                    // rather than just the leaf name (e.g. "June"), so the duplicate modal matches the
                    // project label shown on the case detail view.
                    let existingProjectName = existingLatestCase?.projects?.[0]?.project?.name || 'Unknown Project';
                    if (existingProjectId) {
                        const dupProjects = await prisma.project.findMany({
                            select: { id: true, name: true, parentId: true, type: true }
                        });
                        const path = buildProjectDisplayName(existingProjectId, dupProjects);
                        if (path) existingProjectName = path;
                    }
                    const existingFileNumber = existingLatestCase?.fileNumber || '';
                    return NextResponse.json({
                        error: `ID Number "${client.idNumber}" already exists for another client: ${existingByIdNumber.firstName} ${existingByIdNumber.lastName}`,
                        code: 'DUPLICATE_ID_NUMBER',
                        field: 'idNumber',
                        existingClient: {
                            id: existingByIdNumber.id,
                            name: `${existingByIdNumber.firstName} ${existingByIdNumber.lastName}`
                        },
                        existingClientName: `${existingByIdNumber.firstName} ${existingByIdNumber.lastName}`,
                        existingFileNumber,
                        existingProjectName,
                        originalIdNumber: client.idNumber
                    }, { status: 409 });
                }
            }
        }
        // NOTE: Email and cell/phone number are intentionally NOT checked for uniqueness.
        // Business rule: one email or phone number may be shared by more than one consumer
        // (e.g. clients without their own email use a branch email address). The ID number
        // is the only unique identifier per client, enforced above and by the schema.

        // Build client update data - only include fields that are provided
        const clientUpdateData: Record<string, unknown> = {};
        if (client) {
            if (client.firstName !== undefined) clientUpdateData.firstName = client.firstName;
            if (client.lastName !== undefined) clientUpdateData.lastName = client.lastName;
            if (client.idNumber !== undefined) clientUpdateData.idNumber = client.idNumber;
            if (client.email !== undefined) clientUpdateData.email = client.email || null;
            if (client.alternativeEmail !== undefined) clientUpdateData.alternativeEmail = client.alternativeEmail || null;
            if (client.phone !== undefined) clientUpdateData.phone = client.phone || null;
            if (client.alternativePhone !== undefined) clientUpdateData.alternativePhone = client.alternativePhone || null;
            if (client.alternativePhone2 !== undefined) clientUpdateData.alternativePhone2 = client.alternativePhone2 || null;
            if (client.whatsappNumber !== undefined) clientUpdateData.whatsappNumber = client.whatsappNumber || null;
            if (client.telegramNumber !== undefined) clientUpdateData.telegramNumber = client.telegramNumber || null;
            if (client.address !== undefined) clientUpdateData.address = client.address || null;
            if (client.employer !== undefined) clientUpdateData.employer = client.employer || null;
            if (client.employeeNo !== undefined) clientUpdateData.employeeNo = client.employeeNo || null;
            if (client.grossSalary !== undefined) clientUpdateData.grossSalary = client.grossSalary ? parseFloat(String(client.grossSalary)) : null;
            if (client.netSalary !== undefined) clientUpdateData.netSalary = client.netSalary ? parseFloat(String(client.netSalary)) : null;
            if (client.salaryPayDate !== undefined) clientUpdateData.salaryPayDate = client.salaryPayDate ? parseInt(String(client.salaryPayDate)) : null;
            if (client.type !== undefined) clientUpdateData.type = client.type || 'Standard';
        }

        // Build jointClient logic
        let jointClientIdToConnect: string | undefined = undefined;
        let shouldDisconnectJoint = false;

        if (jointClient) {
            if (jointClient.idNumber) {
                const existingJoint = await prisma.client.findUnique({
                    where: { idNumber: jointClient.idNumber }
                });
                
                const jData: any = {};
                if (jointClient.firstName !== undefined) jData.firstName = jointClient.firstName;
                if (jointClient.lastName !== undefined) jData.lastName = jointClient.lastName;
                if (jointClient.email !== undefined) jData.email = jointClient.email || null;
                if (jointClient.phone !== undefined) jData.phone = jointClient.phone || null;
                
                if (existingJoint) {
                    jointClientIdToConnect = existingJoint.id;
                    if (Object.keys(jData).length > 0) {
                        await prisma.client.update({
                            where: { id: existingJoint.id },
                            data: jData
                        });
                    }
                } else {
                    const newJoint = await prisma.client.create({
                        data: {
                            firstName: jointClient.firstName || '',
                            lastName: jointClient.lastName || '',
                            idNumber: jointClient.idNumber,
                            email: jointClient.email || null,
                            phone: jointClient.phone || null
                        }
                    });
                    jointClientIdToConnect = newJoint.id;
                    // Give the joint client their own Crediva login (ID + default
                    // password). Idempotent, non-blocking, never throws.
                    provisionConsumerForClient(newJoint.id).catch(err =>
                        logger.error(`Crediva provisioning failed for joint client ${newJoint.id}:`, err),
                    );
                }
            }
        } else if (jointClient === null) {
            shouldDisconnectJoint = true;
        }

        // Build case update data
        const caseUpdateData: Record<string, unknown> = {};
        if (Object.keys(clientUpdateData).length > 0) {
            caseUpdateData.client = { update: clientUpdateData };
        }
        if (jointClientIdToConnect) {
            caseUpdateData.jointClient = { connect: { id: jointClientIdToConnect } };
        } else if (shouldDisconnectJoint) {
            caseUpdateData.jointClient = { disconnect: true };
        }
        if (closedAccounts !== undefined) caseUpdateData.closedAccounts = closedAccounts || 0;
        if (openAccounts !== undefined) caseUpdateData.openAccounts = openAccounts || 0;
        if (prescribedAccounts !== undefined) caseUpdateData.prescribedAccounts = prescribedAccounts || 0;
        if (ncrdcNo !== undefined) caseUpdateData.ncrdcNo = ncrdcNo || null;
        if (services !== undefined) caseUpdateData.services = services ? JSON.stringify(services) : null;
        if (serviceFee !== undefined) caseUpdateData.serviceFee = serviceFee ? parseFloat(String(serviceFee).replace(/[^0-9.]/g, '')) : null;
        if (instalments !== undefined) caseUpdateData.instalments = instalments || 1;
        if (category !== undefined) caseUpdateData.category = category || 'Standard';
        if (legalFeesStatus !== undefined) caseUpdateData.legalFeesStatus = legalFeesStatus || null;
        if (affordabilityStatus !== undefined) caseUpdateData.affordabilityStatus = affordabilityStatus || null;
        // B2B/B2C fields - only update if provided
        if (acquisitionType !== undefined) caseUpdateData.acquisitionType = acquisitionType;
        if (partnerName !== undefined) caseUpdateData.partnerName = partnerName;
        if (partnerBranch !== undefined) caseUpdateData.partnerBranch = partnerBranch;
        if (r350Status !== undefined) caseUpdateData.r350Status = r350Status;
        if (partnerSplitPercent !== undefined) caseUpdateData.partnerSplitPercent = partnerSplitPercent;
        // DHS fields - only update if provided
        if (dhsStatus !== undefined) caseUpdateData.dhsStatus = dhsStatus;
        if (manuallyAcceptedViaDhs !== undefined) caseUpdateData.manuallyAcceptedViaDhs = manuallyAcceptedViaDhs;
        if (debtCounsellorName !== undefined) caseUpdateData.debtCounsellorName = debtCounsellorName;
        if (dcTradingName !== undefined) caseUpdateData.dcTradingName = dcTradingName;
        if (dcEmail !== undefined) caseUpdateData.dcEmail = dcEmail;
        if (lastKnownEmail !== undefined) caseUpdateData.lastKnownEmail = lastKnownEmail;
        if (preferredDcEmail !== undefined) caseUpdateData.preferredDcEmail = preferredDcEmail;
        if (dcOperatingStatus !== undefined) caseUpdateData.dcOperatingStatus = dcOperatingStatus;
        if (dcMobile !== undefined) caseUpdateData.dcMobile = dcMobile;
        if (consumerDhsStatus !== undefined) caseUpdateData.consumerDhsStatus = consumerDhsStatus;
        if (requestedDhsStatus !== undefined) caseUpdateData.requestedDhsStatus = requestedDhsStatus;
        if (dhsPreviousStatus !== undefined) caseUpdateData.dhsPreviousStatus = dhsPreviousStatus;
        if (previousDebtCounsellor !== undefined) caseUpdateData.previousDebtCounsellor = previousDebtCounsellor;
        if (dhsStatusDate !== undefined) caseUpdateData.dhsStatusDate = dhsStatusDate ? new Date(dhsStatusDate) : null;
        if (dhsApplicationDate !== undefined) caseUpdateData.dhsApplicationDate = dhsApplicationDate ? new Date(dhsApplicationDate) : null;

        if (cb_ncrdcNo !== undefined) caseUpdateData.cb_ncrdcNo = cb_ncrdcNo;
        if (cb_debtCounsellor !== undefined) caseUpdateData.cb_debtCounsellor = cb_debtCounsellor;
        if (cb_contactNo !== undefined) caseUpdateData.cb_contactNo = cb_contactNo;
        if (cb_applicationDate !== undefined) caseUpdateData.cb_applicationDate = cb_applicationDate ? new Date(cb_applicationDate) : null;
        if (cb_status !== undefined) caseUpdateData.cb_status = cb_status;
        if (cb_statusDate !== undefined) caseUpdateData.cb_statusDate = cb_statusDate ? new Date(cb_statusDate) : null;

        if (totalDebtAmount !== undefined) caseUpdateData.totalDebtAmount = totalDebtAmount;

        if (totalMonthlyInstallment !== undefined) caseUpdateData.totalMonthlyInstallment = totalMonthlyInstallment;

        // Tasks & Decline Reason
        if (todos !== undefined) caseUpdateData.todos = todos;
        if (declineReason !== undefined) caseUpdateData.declineReason = declineReason;
        if (declineReasonAttended !== undefined) caseUpdateData.declineReasonAttended = declineReasonAttended;
        if (description !== undefined) caseUpdateData.description = description; // Add description field
        if (body.nextUpdate !== undefined) caseUpdateData.nextUpdate = body.nextUpdate ? new Date(body.nextUpdate) : null;

        // Fetch old case data for diffing
        const oldCase = await prisma.case.findUnique({
            where: { id },
            select: {
                // @ts-ignore
                todos: true,
                status: true
            }
        });

        if (!oldCase) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }
    
        // Sync assignments if provided
        if (assignments !== undefined) {
            // @ts-ignore
            await prisma.caseAssignment.deleteMany({ where: { caseId: id } });
            if (assignments.length > 0) {
                // @ts-ignore
                await prisma.caseAssignment.createMany({
                    data: assignments.map(userId => ({
                        caseId: id,
                        userId
                    }))
                });
            }
            // Ensure updatedAt is updated even if only assignments changed
            caseUpdateData.updatedAt = new Date();
        }

        // Set who last updated the case
        if (attribution) {
            caseUpdateData.updatedBy = attribution;
        }

        // Normal update - update the existing client
        let updatedCase;
        try {
            updatedCase = await prisma.case.update({
                where: { id },
                data: caseUpdateData,
                include: {
                    client: true,
                    createdBy: { select: { firstName: true, lastName: true } },
                    updatedBy: { select: { firstName: true, lastName: true } },
                    projects: {
                        include: {
                            project: true
                        }
                    },
                    documents: true,
                    workflowLogs: {
                        orderBy: { timestamp: 'desc' }
                    }
                }
            });
        } catch (updateError) {
            logger.error('[API] Case Update failed with assignments/relations, retrying simple update:', updateError);
            updatedCase = await prisma.case.update({
                where: { id },
                data: caseUpdateData,
                include: {
                    client: true,
                    createdBy: { select: { firstName: true, lastName: true } },
                    updatedBy: { select: { firstName: true, lastName: true } },
                    projects: {
                        include: {
                            project: true
                        }
                    },
                    documents: true,
                    workflowLogs: {
                        orderBy: { timestamp: 'desc' }
                    }
                }
            });
        }

        // Create log if description changed
        if (description !== undefined) {
            try {
                await prisma.workflowLog.create({
                    data: {
                        caseId: id,
                        toStatus: updatedCase.status,
                        // action: 'EDIT',
                        notes: `[EDIT] Updated description`, // Shortened to avoid huge logs
                        userId: actingUserId ?? null
                    }
                });
            } catch (logError) {
                logger.error('Failed to create workflow log for description update:', logError);
            }
        }

        // Create logs for Task changes
        if (todos !== undefined) {
            try {
                const session = await auth();
                // @ts-ignore
                const oldTodos: any[] = oldCase.todos ? JSON.parse(oldCase.todos) : [];
                let newTodos: any[];
                try {
                    newTodos = JSON.parse(todos);
                } catch {
                    logger.error('Failed to parse todos JSON:', todos);
                    newTodos = [];
                }

                // Find added tasks
                const addedTasks = newTodos.filter(nt => !oldTodos.find(ot => ot.id === nt.id));
                for (const task of addedTasks) {
                    await prisma.workflowLog.create({
                        data: {
                            caseId: id, fromStatus: updatedCase.status,
                            toStatus: updatedCase.status,
                            // action: 'TASK_CREATED', // Temporarily disabled due to schema/client mismatch
                            notes: `[TASK_CREATED] Created task: "${task.text}"`,
                            userId: actingUserId
                        }
                    });
                }

                // Find completed/uncompleted tasks
                const commonTasks = newTodos.filter(nt => oldTodos.find(ot => ot.id === nt.id));
                for (const task of commonTasks) {
                    const oldTask = oldTodos.find(ot => ot.id === task.id);
                    if (task.done && !oldTask.done) {
                        await prisma.workflowLog.create({
                            data: {
                                caseId: id, fromStatus: updatedCase.status,
                                toStatus: updatedCase.status,
                                // action: 'TASK_COMPLETED',
                                notes: `[TASK_COMPLETED] Completed task: "${task.text}"`,
                                userId: actingUserId
                            }
                        });
                    } else if (!task.done && oldTask.done) {
                        await prisma.workflowLog.create({
                            data: {
                                caseId: id, fromStatus: updatedCase.status,
                                toStatus: updatedCase.status,
                                // action: 'TASK_REOPENED',
                                notes: `[TASK_REOPENED] Reopened task: "${task.text}"`,
                                userId: actingUserId
                            }
                        });
                    }
                }

                // Find deleted tasks
                const deletedTasks = oldTodos.filter(ot => !newTodos.find(nt => nt.id === ot.id));
                for (const task of deletedTasks) {
                    await prisma.workflowLog.create({
                        data: {
                            caseId: id, fromStatus: updatedCase.status,
                            toStatus: updatedCase.status,
                            // action: 'TASK_DELETED',
                            notes: `[TASK_DELETED] Deleted task: "${task.text}"`,
                            userId: actingUserId
                        }
                    });
                }

            } catch (logError) {
                logger.error('Failed to create workflow log for tasks:', logError);
            }
        }

        // Fetch all projects once to build paths efficiently (same as GET endpoint)
        const allProjects = await prisma.project.findMany({
            select: { id: true, name: true, parentId: true, type: true }
        });

        const projectsWithPaths = updatedCase.projects.map((cp) => ({
            ...cp,
            project: {
                ...cp.project,
                fullPath: buildProjectDisplayName(cp.project.id, allProjects)
            }
        }));

        // Send welcome notification if email was just set on a NEW_LEAD case
        if (client?.email && updatedCase.status === 'NEW_LEAD') {
            const existingNotification = await prisma.notificationLog.findFirst({
                where: { caseId: id, statusCode: 'NEW_LEAD', success: true }
            });
            if (!existingNotification) {
                const notifSource = updatedCase.partnerName || 'Zenowethu Debt Management';
                const creatorName = updatedCase.createdBy
                    ? `${updatedCase.createdBy.firstName} ${updatedCase.createdBy.lastName}`
                    : 'Zenowethu Team';
                // Parse services from stored JSON and format for display
                let servicesText = '';
                if ((updatedCase as any).services) {
                    try {
                        const storedServices: string[] = JSON.parse((updatedCase as any).services);
                        if (Array.isArray(storedServices) && storedServices.length > 0) {
                            servicesText = storedServices.map(s =>
                                s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                            ).join(', ');
                        }
                    } catch { /* leave blank if parse fails */ }
                }
                sendStatusChangeNotification({
                    caseId: updatedCase.id,
                    clientName: `${updatedCase.client.firstName} ${updatedCase.client.lastName}`,
                    clientPhone: updatedCase.client.phone,
                    clientEmail: updatedCase.client.email,
                    clientWhatsApp: updatedCase.client.phone,
                    fileNumber: updatedCase.fileNumber,
                    statusCode: 'NEW_LEAD',
                    partnerName: updatedCase.partnerName,
                    partnerUserName: creatorName,
                    isB2B: updatedCase.acquisitionType === 'B2B',
                    isCreatedByPartner: false,
                    services: servicesText,
                    mainSource: notifSource,
                    senderName: creatorName,
                    senderEmail: 'updates@zenowethu.co.za'
                }).then(result => {
                    logger.info(`Welcome notification sent (PATCH) for ${updatedCase.fileNumber}: Email=${result.emailSuccess}, SMS=${result.smsSuccess}`);
                }).catch(err => {
                    logger.error(`Failed to send welcome notification (PATCH) for ${updatedCase.id}:`, err);
                });
            }
        }

        return NextResponse.json({
            ...updatedCase,
            projects: projectsWithPaths
        });
    } catch (error: any) {
        logger.error('Error updating case:', error);

        // Handle Prisma unique constraint error (fallback)
        if (error?.code === 'P2002') {
            const field = error?.meta?.target?.[0] || 'field';
            return NextResponse.json({
                error: `This ${field} is already in use by another client.`,
                code: 'DUPLICATE_FIELD',
                field: field
            }, { status: 409 });
        }

        // Handle Prisma validation errors (unknown fields, type mismatches)
        if (error?.name === 'PrismaClientValidationError') {
            const errorMessage = error?.message || 'Validation error';
            // Extract meaningful part of the error
            const match = errorMessage.match(/Unknown argument `([^`]+)`/);
            if (match) {
                return NextResponse.json({
                    error: `Database field error: Unknown field "${match[1]}". The database may need to be updated.`,
                    code: 'VALIDATION_ERROR',
                    details: `Please contact support. Field: ${match[1]}`
                }, { status: 400 });
            }
            return NextResponse.json({
                error: 'Data validation error. Please check your input and try again.',
                code: 'VALIDATION_ERROR',
                details: errorMessage.substring(0, 500) // Limit error message length
            }, { status: 400 });
        }

        return NextResponse.json({
            error: 'Failed to update case. Please try again.',
            code: 'INTERNAL_ERROR',
            details: error?.message || 'Unknown error occurred'
        }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const isAdmin = session.user.isAdmin === true || session.user.role?.toUpperCase() === 'ADMIN';
        if (!isAdmin) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { id } = await params;

        const existingCase = await prisma.case.findFirst({
            where: { id, deletedAt: { equals: null } },
            select: { id: true, fileNumber: true }
        });

        if (!existingCase) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        const now = new Date();
        const deletedByName = session.user.name || session.user.id;
        const deletedOn = now.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });

        await prisma.$transaction([
            prisma.case.update({
                where: { id },
                data: { deletedAt: now, deletedById: session.user.id },
            }),
            prisma.caseComment.create({
                data: {
                    caseId: id,
                    userId: session.user.id,
                    content: `Case moved to trash by ${deletedByName} on ${deletedOn}.`,
                    activityType: 'SYSTEM',
                    type: 'NOTE',
                    isInternal: true,
                },
            }),
        ]);

        logger.info(`Case ${existingCase.fileNumber} soft-deleted by ${deletedByName} (${session.user.id})`);

        return NextResponse.json({
            success: true,
            message: `Case ${existingCase.fileNumber} moved to trash. It will be permanently deleted in 30 days.`
        });
    } catch (error) {
        logger.error('Error deleting case:', error);
        return NextResponse.json({ error: 'Failed to delete case' }, { status: 500 });
    }
}
