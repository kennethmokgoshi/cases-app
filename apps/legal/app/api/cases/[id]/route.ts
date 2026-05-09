import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger, CasePatchSchema, parseBody  } from '@zenowethu/shared-lib';
import { z } from 'zod';


export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const caseDetail = await prisma.case.findUnique({
            where: { id },
            include: {
                client: true,
                updatedBy: {
                    select: {
                        firstName: true,
                        lastName: true
                    }
                },
                projects: {
                    include: {
                        project: {
                            include: {
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
                documents: true,
                workflowLogs: {
                    orderBy: {
                        timestamp: 'desc'
                    }
                }
            }
        });

        if (!caseDetail) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        // Fetch all projects once to build paths efficiently
        const allProjects = await prisma.project.findMany({
            select: { id: true, name: true, parentId: true, type: true }
        });
        const projectMap = new Map(allProjects.map(p => [p.id, p]));

        const getPath = (projectId: string): string => {
            const parts: { name: string; type: string }[] = [];
            let curr: { id: string; name: string; parentId: string | null; type: string } | undefined = projectMap.get(projectId) as { id: string; name: string; parentId: string | null; type: string } | undefined;

            while (curr) {
                if (curr.type !== 'ROOT') {
                    parts.unshift({ name: curr.name, type: curr.type });
                }
                if (curr.parentId) {
                    curr = projectMap.get(curr.parentId) as { id: string; name: string; parentId: string | null; type: string } | undefined;
                } else {
                    break;
                }
            }

            const clean = (name: string) => {
                let s = name;
                if (s === 'Letsatsi Referrals') s = 'Letsatsi';
                s = s.replace(/My Cases\s*-?\s*/gi, '').trim();
                return s;
            };

            const year = clean(parts.filter(p => p.type === 'YEAR').pop()?.name || '');
            const month = clean(parts.filter(p => p.type === 'MONTH').pop()?.name || '');
            const allSources = parts.filter(p => p.type === 'ACQUISITION_SOURCE');
            const specificSource = allSources.filter(p => p.name !== 'Cases').pop();
            const source = clean(specificSource?.name || allSources[0]?.name || '');
            const branches = parts
                .filter(p => (p.type === 'BRANCH' || p.type === 'FOLDER') && p.name !== source)
                .map(p => clean(p.name));
            const branch = branches.join(' ');

            if (year || month || source || branch) {
                return [source, branch, month, year].filter(Boolean).join(' ');
            }
            return parts.map(p => clean(p.name)).filter(Boolean).join(' ');
        };

        const projectsWithPath = caseDetail.projects.map((cp) => ({
            ...cp,
            project: {
                ...cp.project,
                fullPath: getPath(cp.project.id)
            }
        }));

        return NextResponse.json({
            ...caseDetail,
            projects: projectsWithPath
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
        const { id } = await params;
        const parsed = parseBody(CasePatchSchema, await request.json());
        if (!parsed.success) return parsed.response;
        const body = parsed.data as z.infer<typeof CasePatchSchema>;
        const {
            client,
            closedAccounts,
            openAccounts,
            prescribedAccounts,
            ncrdcNo,
            instalments,
            affordabilityStatus,
            // B2B/B2C fields
            acquisitionType,
            partnerName,
            partnerBranch,
            r350Status,
            partnerSplitPercent,
            // DHS fields
            dhsStatus,
            debtCounsellorName,
            dcTradingName,
            dcEmail,
            dcOperatingStatus,
            dcMobile,
            consumerDhsStatus,
            requestedDhsStatus,

            previousDebtCounsellor,
            dhsPreviousStatus,
            dhsStatusDate,
            dhsApplicationDate,
            // Credit Bureau Info
            cb_ncrdcNo,
            cb_debtCounsellor,
            cb_contactNo,
            cb_applicationDate,
            cb_status,
            cb_statusDate,
            totalDebtAmount,
            totalMonthlyInstallment,
            forceUpdate, // Added for duplicate override
            // Fields for case update
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
            description, // New field
            ...otherCaseData // Catch any other fields not explicitly destructured for case update
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
                }
            });

            if (existingByIdNumber) {
                if (forceUpdate) {
                    logger.info('🔄 Force Update Triggered for Duplicate ID:', client.idNumber);

                    // 1. Update Existing Client
                    await prisma.client.update({
                        where: { id: existingByIdNumber.id },
                        data: {
                            firstName: client.firstName,
                            lastName: client.lastName,
                            phone: client.phone || existingByIdNumber.phone,
                            email: client.email || existingByIdNumber.email,
                            address: client.address || existingByIdNumber.address,
                            employer: client.employer || existingByIdNumber.employer,
                            grossSalary: client.grossSalary ? parseFloat(String(client.grossSalary)) : existingByIdNumber.grossSalary,
                            netSalary: client.netSalary ? parseFloat(String(client.netSalary)) : existingByIdNumber.netSalary }
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
                    // Generate suggested prefixed ID (e.g., DRL8207225452088 for "Debt Review Letsatsi")
                    const suggestedPrefix = 'DRL'; // Default suggested prefix
                    const suggestedIdNumber = `${suggestedPrefix}${client.idNumber}`;

                    return NextResponse.json({
                        error: `ID Number "${client.idNumber}" already exists for another client: ${existingByIdNumber.firstName} ${existingByIdNumber.lastName}`,
                        code: 'DUPLICATE_ID_NUMBER',
                        field: 'idNumber',
                        existingClient: {
                            id: existingByIdNumber.id,
                            name: `${existingByIdNumber.firstName} ${existingByIdNumber.lastName}`
                        },
                        allowPrefixedId: true,
                        suggestedIdNumber: suggestedIdNumber,
                        originalIdNumber: client.idNumber
                    }, { status: 409 });
                }
            }
        }
        // Check for duplicate Email (if provided)
        if (client && client.email) {
            const existingByEmail = await prisma.client.findFirst({
                where: {
                    email: client.email,
                    id: { not: currentCase.clientId }
                }
            });

            if (existingByEmail) {
                return NextResponse.json({
                    error: `Email "${client.email}" already exists for another client: ${existingByEmail.firstName} ${existingByEmail.lastName}`,
                    code: 'DUPLICATE_EMAIL',
                    field: 'email'
                }, { status: 409 });
            }
        }

        // Check for duplicate Phone Number (if provided)
        if (client && client.phone) {
            const existingByPhone = await prisma.client.findFirst({
                where: {
                    phone: client.phone,
                    id: { not: currentCase.clientId }
                }
            });

            if (existingByPhone) {
                return NextResponse.json({
                    error: `Cell Number "${client.phone}" already exists for another client: ${existingByPhone.firstName} ${existingByPhone.lastName}`,
                    code: 'DUPLICATE_PHONE',
                    field: 'cellNumber'
                }, { status: 409 });
            }
        }

        // Build client update data - only include fields that are provided
        const clientUpdateData: Record<string, unknown> = {};
        if (client) {
            if (client.firstName !== undefined) clientUpdateData.firstName = client.firstName;
            if (client.lastName !== undefined) clientUpdateData.lastName = client.lastName;
            if (client.idNumber !== undefined) clientUpdateData.idNumber = client.idNumber;
            if (client.email !== undefined) clientUpdateData.email = client.email || null;
            if (client.phone !== undefined) clientUpdateData.phone = client.phone || null;
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

        // Build case update data
        const caseUpdateData: Record<string, unknown> = {};
        if (Object.keys(clientUpdateData).length > 0) {
            caseUpdateData.client = { update: clientUpdateData };
        }
        if (closedAccounts !== undefined) caseUpdateData.closedAccounts = closedAccounts || 0;
        if (openAccounts !== undefined) caseUpdateData.openAccounts = openAccounts || 0;
        if (prescribedAccounts !== undefined) caseUpdateData.prescribedAccounts = prescribedAccounts || 0;
        if (ncrdcNo !== undefined) caseUpdateData.ncrdcNo = ncrdcNo || null;
        if (services !== undefined) caseUpdateData.services = services ? JSON.stringify(services) : null;
        if (serviceFee !== undefined) caseUpdateData.serviceFee = serviceFee ? parseFloat(String(serviceFee).replace(/[^0-9.]/g, '')) : null;
        if (instalments !== undefined) caseUpdateData.instalments = instalments || 1;
        if (client?.type !== undefined) caseUpdateData.category = client.type || 'Standard';
        if (affordabilityStatus !== undefined) caseUpdateData.affordabilityStatus = affordabilityStatus || null;
        // B2B/B2C fields - only update if provided
        if (acquisitionType !== undefined) caseUpdateData.acquisitionType = acquisitionType;
        if (partnerName !== undefined) caseUpdateData.partnerName = partnerName;
        if (partnerBranch !== undefined) caseUpdateData.partnerBranch = partnerBranch;
        if (r350Status !== undefined) caseUpdateData.r350Status = r350Status;
        if (partnerSplitPercent !== undefined) caseUpdateData.partnerSplitPercent = partnerSplitPercent;
        // DHS fields - only update if provided
        if (dhsStatus !== undefined) caseUpdateData.dhsStatus = dhsStatus;
        if (debtCounsellorName !== undefined) caseUpdateData.debtCounsellorName = debtCounsellorName;
        if (dcTradingName !== undefined) caseUpdateData.dcTradingName = dcTradingName;
        if (dcEmail !== undefined) caseUpdateData.dcEmail = dcEmail;
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

        // Normal update - update the existing client
        const session = await auth();
        if (session?.user?.id) {
            caseUpdateData.updatedBy = { connect: { id: session.user.id } };
        }

        const updatedCase = await prisma.case.update({
            where: { id },
            data: caseUpdateData,
            include: {
                client: true,
                updatedBy: {
                    select: {
                        firstName: true,
                        lastName: true
                    }
                },
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

        // Create log if description changed
        if (description !== undefined) {
            try {
                const session = await auth();
                await prisma.workflowLog.create({
                    data: {
                        caseId: id, fromStatus: updatedCase.status,
                        toStatus: updatedCase.status,
                        // action: 'EDIT',
                        notes: `[EDIT] Updated description`, // Shortened to avoid huge logs
                        userId: session?.user?.id
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
                const newTodos: any[] = JSON.parse(todos);

                // Find added tasks
                const addedTasks = newTodos.filter(nt => !oldTodos.find(ot => ot.id === nt.id));
                for (const task of addedTasks) {
                    await prisma.workflowLog.create({
                        data: {
                            caseId: id, fromStatus: updatedCase.status,
                            toStatus: updatedCase.status,
                            // action: 'TASK_CREATED', // Temporarily disabled due to schema/client mismatch
                            notes: `[TASK_CREATED] Created task: "${task.text}"`,
                            userId: session?.user?.id
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
                                userId: session?.user?.id
                            }
                        });
                    } else if (!task.done && oldTask.done) {
                        await prisma.workflowLog.create({
                            data: {
                                caseId: id, fromStatus: updatedCase.status,
                                toStatus: updatedCase.status,
                                // action: 'TASK_REOPENED',
                                notes: `[TASK_REOPENED] Reopened task: "${task.text}"`,
                                userId: session?.user?.id
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
                            userId: session?.user?.id
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
        const projectMap = new Map(allProjects.map(p => [p.id, p]));

        const getPath = (projectId: string): string => {
            const parts: { name: string; type: string }[] = [];
            let curr: { id: string; name: string; parentId: string | null; type: string } | undefined = projectMap.get(projectId) as { id: string; name: string; parentId: string | null; type: string } | undefined;

            while (curr) {
                if (curr.type !== 'ROOT') {
                    parts.unshift({ name: curr.name, type: curr.type });
                }
                if (curr.parentId) {
                    curr = projectMap.get(curr.parentId) as { id: string; name: string; parentId: string | null; type: string } | undefined;
                } else {
                    break;
                }
            }

            const clean = (name: string) => {
                let s = name;
                if (s === 'Letsatsi Referrals') s = 'Letsatsi';
                s = s.replace(/My Cases\s*-?\s*/gi, '').trim();
                return s;
            };

            const year = clean(parts.filter(p => p.type === 'YEAR').pop()?.name || '');
            const month = clean(parts.filter(p => p.type === 'MONTH').pop()?.name || '');
            const allSources = parts.filter(p => p.type === 'ACQUISITION_SOURCE');
            const specificSource = allSources.filter(p => p.name !== 'Cases').pop();
            const source = clean(specificSource?.name || allSources[0]?.name || '');
            const branches = parts
                .filter(p => (p.type === 'BRANCH' || p.type === 'FOLDER') && p.name !== source)
                .map(p => clean(p.name));
            const branch = branches.join(' ');

            if (year || month || source || branch) {
                return [source, branch, month, year].filter(Boolean).join(' ');
            }
            return parts.map(p => clean(p.name)).filter(Boolean).join(' ');
        };

        const projectsWithPaths = updatedCase.projects.map((cp) => ({
            ...cp,
            project: {
                ...cp.project,
                fullPath: getPath(cp.project.id)
            }
        }));

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
        const { id } = await params;

        // Check if case exists
        const existingCase = await prisma.case.findUnique({
            where: { id },
            include: { client: true }
        });

        if (!existingCase) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        // Delete related records first (due to foreign key constraints)
        // Note: CaseComment and Document have onDelete: Cascade, but we'll explicitly delete to be safe

        // Delete comment mentions first (foreign key to CaseComment)
        await prisma.commentMention.deleteMany({
            where: { comment: { caseId: id } }
        });

        // Delete case comments
        await prisma.caseComment.deleteMany({
            where: { caseId: id }
        });

        // Delete case-project links
        await prisma.caseProject.deleteMany({
            where: { caseId: id }
        });

        // Delete case documents
        await prisma.document.deleteMany({
            where: { caseId: id }
        });

        // Delete workflow logs (status history)
        await prisma.workflowLog.deleteMany({
            where: { caseId: id }
        });

        // Delete notification logs
        await prisma.notificationLog.deleteMany({
            where: { caseId: id }
        });

        // Finally delete the case
        await prisma.case.delete({
            where: { id }
        });

        // Check if the client has any other cases
        const otherCasesCount = await prisma.case.count({
            where: { clientId: existingCase.clientId }
        });

        // If no other cases exist, delete the client to free up the ID number
        if (otherCasesCount === 0) {
            logger.info(`Deleting orphaned client ${existingCase.clientId} for case ${existingCase.fileNumber}`);
            try {
                await prisma.client.delete({
                    where: { id: existingCase.clientId }
                });
            } catch (clientDeleteError) {
                logger.error('Failed to delete orphaned client:', clientDeleteError);
                // Don't fail the request if client delete fails, but log it
            }
        }

        return NextResponse.json({
            success: true,
            message: `Case ${existingCase.fileNumber} deleted successfully`
        });
    } catch (error) {
        logger.error('Error deleting case:', error);
        return NextResponse.json({ error: 'Failed to delete case' }, { status: 500 });
    }
}
