import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { maxZdmSequence, buildZdmFileNumber } from '../../../../../lib/file-number';

const logger = createLogger('api/admin/dhs-import/apply');
export const runtime = 'nodejs';

// ── Status → services mapping ────────────────────────────────────────────────
// Active debt review statuses → Debt Review Application service
// Removal statuses → Debt Review Flag Removal service
// Portal owner accepted statuses (A/C/D3/D4) get BOTH services
const STATUS_SERVICES: Record<string, string[]> = {
    F1: ['debt_review_application'],
    F2: ['debt_review_application'],
    G:  ['debt_review_application'],
    G1: ['debt_review_application'],
    A:  ['debt_review_application', 'debt_review_flag_removal'],
    A1: ['debt_review_application'],
    D3: ['debt_review_application', 'debt_review_flag_removal'],
    D4: ['debt_review_application', 'debt_review_flag_removal'],
    H:  ['debt_review_flag_removal'],
    B:  ['debt_review_flag_removal'],
    C:  ['debt_review_application', 'debt_review_flag_removal'],  // Transferred — both services
};

// When the portal owner uploads their OWN data, these statuses should be
// set as requestedDhsStatus and the case should show as "Accepted via DHS"
const PORTAL_OWNER_ACCEPTED_STATUSES = new Set(['A', 'C', 'D3', 'D4']);

type DcOwner = {
    ncrdcNo: string;
    debtCounsellorName: string;
    dcTradingName: string;
};

type ApplyAction = {
    rsa_id: string;
    ncr_ref: string;          // NCR Sys Ref from DHS report
    surname: string;
    first_name: string;
    additional_names: string;
    status_code: string;
    status_label: string;
    action: 'update' | 'create' | 'skip';
    caseId?: string;
    clientId?: string;
};

/** Reads every ZDM-{year} file number and returns the highest sequence (numeric). */
async function currentFileSequence(year: number): Promise<number> {
    const cases = await prisma.case.findMany({
        where: { fileNumber: { startsWith: `ZDM-${year}-` } },
        select: { fileNumber: true }
    });
    return maxZdmSequence(cases.map((c) => c.fileNumber), year);
}

async function getOrCreateDhsProject(): Promise<{ id: string; name: string }> {
    const now = new Date();
    const year = now.getFullYear();
    const monthName = now.toLocaleString('en-ZA', { month: 'long' });
    const childName = `DHS Import ${monthName} ${year}`;

    let parent = await prisma.project.findFirst({
        where: { name: 'DHS Imports', parentId: null },
        select: { id: true }
    });
    if (!parent) {
        parent = await prisma.project.create({
            data: { name: 'DHS Imports', type: 'ROOT' },
            select: { id: true }
        });
        logger.info(`📂 Created parent project "DHS Imports" (${parent.id})`);
    }

    let child = await prisma.project.findFirst({
        where: { name: childName, parentId: parent.id },
        select: { id: true }
    });
    if (!child) {
        child = await prisma.project.create({
            data: { name: childName, type: 'FOLDER', parentId: parent.id },
            select: { id: true }
        });
        logger.info(`📁 Created child project "${childName}" (${child.id})`);
    }

    return { id: child.id, name: childName };
}

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = session.user as any;
        if (!user.isAdmin && !user.isExecutive) {
            return NextResponse.json({ error: 'Forbidden — Admins and Executives only' }, { status: 403 });
        }

        const body = await request.json();
        const actions: ApplyAction[] = body.actions ?? [];
        const dc: DcOwner = body.dc ?? {
            ncrdcNo: 'NCRDC3693',
            debtCounsellorName: 'Aaron Nzotho',
            dcTradingName: 'Zenowethu Debt Management',
        };
        // isPortalOwner = true when the uploader confirmed this is their own DHS data.
        // When true, statuses A/C/D3/D4 are stored as requestedDhsStatus
        // and the case is marked as accepted via DHS.
        const isPortalOwner: boolean = body.isPortalOwner ?? true;

        if (!actions.length) {
            return NextResponse.json({ error: 'No actions provided' }, { status: 400 });
        }

        const results = { updated: 0, created: 0, skipped: 0, errors: [] as string[] };
        const now = new Date();

        const hasCreates = actions.some((a) => a.action === 'create');
        const dhsProject = hasCreates ? await getOrCreateDhsProject() : null;
        const dhsProjectId = dhsProject?.id ?? null;
        const dhsProjectName = dhsProject?.name ?? null;

        // Seed the file-number sequence once (numeric max), then increment in
        // memory across creates. Re-synced from the DB only on a collision.
        // Seeded whenever a create is possible — including "update" actions that
        // may fall back to create when their case is missing.
        const fileYear = now.getFullYear();
        const mayCreate = hasCreates || actions.some((a) => a.action === 'update');
        let fileSeq = mayCreate ? await currentFileSequence(fileYear) : 0;

        for (const item of actions) {
            try {
                if (item.action === 'skip') {
                    results.skipped++;
                    continue;
                }

                // An "update" with no case to update (e.g. a client left behind by a
                // previously-failed import) is really a create — build the missing case.
                if (item.action === 'update' && !item.caseId) {
                    item.action = 'create';
                }

                const services = STATUS_SERVICES[item.status_code] ?? ['debt_review_application'];

                // ── UPDATE ────────────────────────────────────────────────────
                if (item.action === 'update' && item.caseId) {
                    const isAcceptedViaPortal = isPortalOwner && PORTAL_OWNER_ACCEPTED_STATUSES.has(item.status_code);

                    // Merge services without wiping existing ones
                    const existing = await prisma.case.findUnique({
                        where: { id: item.caseId },
                        select: { services: true }
                    });
                    let currentServices: string[] = [];
                    try { currentServices = JSON.parse(existing?.services ?? '[]'); } catch { /* */ }
                    const merged = Array.from(new Set([...currentServices, ...services]));

                    await prisma.case.update({
                        where: { id: item.caseId },
                        data: {
                            dhsStatus: item.status_code,
                            dhsStatusDate: now,
                            ncrSysRef: item.ncr_ref || null,
                            ncrdcNo: dc.ncrdcNo,
                            debtCounsellorName: dc.debtCounsellorName,
                            dcTradingName: dc.dcTradingName,
                            services: JSON.stringify(merged),
                            // Portal owner accepted statuses — update workflow status + mark as accepted via DHS
                            ...(isAcceptedViaPortal ? {
                                status: 'ACCEPTED_VIA_DHS',
                                requestedDhsStatus: item.status_code,
                                consumerDhsStatus: item.status_code,
                            } : {}),
                            updatedBy: { connect: { id: user.id } }
                        }
                    });

                    results.updated++;
                    logger.info(`✅ Updated case ${item.caseId} — DHS ${item.status_code}${isAcceptedViaPortal ? ' (accepted via DHS)' : ''}, NCR Sys Ref ${item.ncr_ref}`);
                    continue;
                }

                // ── CREATE ────────────────────────────────────────────────────
                if (item.action === 'create') {
                    const rsaId = String(item.rsa_id ?? '').trim();
                    const firstName = item.first_name?.trim() || 'Unknown';
                    const lastName = item.surname?.trim() || 'Unknown';

                    if (!rsaId) {
                        results.errors.push(`Could not create file for "${firstName} ${lastName}" — RSA ID missing or invalid`);
                        continue;
                    }

                    const isAcceptedViaPortalCreate = isPortalOwner && PORTAL_OWNER_ACCEPTED_STATUSES.has(item.status_code);

                    let created = false;
                    let lastErr: any = null;
                    for (let attempt = 0; attempt < 4 && !created; attempt++) {
                        const fileNumber = buildZdmFileNumber(fileYear, ++fileSeq);
                        try {
                            // Client + Case in ONE transaction so a failed case never
                            // leaves an orphan client behind (the previous code created
                            // the client first, outside any transaction).
                            await prisma.$transaction(async (tx) => {
                                let client = await tx.client.findUnique({ where: { idNumber: rsaId } });
                                if (!client) {
                                    client = await tx.client.create({ data: { firstName, lastName, idNumber: rsaId } });
                                }
                                await tx.case.create({
                                    data: {
                                        fileNumber,
                                        clientId: client.id,
                                        status: isAcceptedViaPortalCreate ? 'ACCEPTED_VIA_DHS' : 'NEW_LEAD',
                                        // DHS data
                                        dhsStatus: item.status_code,
                                        dhsStatusDate: now,
                                        ncrSysRef: item.ncr_ref || null,
                                        // Portal owner accepted statuses — mark as accepted via DHS
                                        ...(isAcceptedViaPortalCreate ? {
                                            requestedDhsStatus: item.status_code,
                                            consumerDhsStatus: item.status_code,
                                        } : {}),
                                        // Services derived from status
                                        services: JSON.stringify(services),
                                        // DC on record
                                        ncrdcNo: dc.ncrdcNo,
                                        debtCounsellorName: dc.debtCounsellorName,
                                        dcTradingName: dc.dcTradingName,
                                        createdById: user.id ?? null,
                                        // Assign to DHS import project
                                        projects: dhsProjectId ? {
                                            create: [{ projectId: dhsProjectId }]
                                        } : undefined,
                                    }
                                });
                            });
                            logger.info(`📁 Created case ${fileNumber} — ${firstName} ${lastName}, DHS ${item.status_code}${isAcceptedViaPortalCreate ? ' (accepted via DHS)' : ''}, services: ${services.join(', ')}`);
                            results.created++;
                            created = true;
                        } catch (err: any) {
                            lastErr = err;
                            // fileNumber collided (e.g. a concurrent create) — re-sync the
                            // sequence from the DB and retry with the next number.
                            if (err?.code === 'P2002') {
                                fileSeq = await currentFileSequence(fileYear);
                                continue;
                            }
                            throw err;
                        }
                    }

                    if (!created) {
                        results.errors.push(`Failed to create case for ${firstName} ${lastName}: ${lastErr?.message ?? 'unknown error'}`);
                    }
                }
            } catch (err: any) {
                logger.error(`❌ Error processing NCR ${item.ncr_ref}:`, err);
                results.errors.push(`NCR ${item.ncr_ref}: ${err.message}`);
            }
        }

        logger.info(`✅ Apply complete — updated: ${results.updated}, created: ${results.created}, skipped: ${results.skipped}, errors: ${results.errors.length}`);
        return NextResponse.json({ success: true, results, dhsProjectName });

    } catch (error: any) {
        logger.error('❌ Apply error:', error);
        return NextResponse.json({ error: error?.message || 'Apply failed' }, { status: 500 });
    }
}
