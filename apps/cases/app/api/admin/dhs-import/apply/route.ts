import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';

const logger = createLogger('api/admin/dhs-import/apply');
export const runtime = 'nodejs';

type ApplyAction = {
    rsa_id: string;
    ncr_ref: string;
    surname: string;
    first_name: string;
    additional_names: string;
    status_code: string;
    status_label: string;
    action: 'update' | 'create' | 'skip';
    caseId?: string;
    clientId?: string;
};

async function generateFileNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const lastCase = await prisma.case.findFirst({
        where: { fileNumber: { startsWith: `ZDM-${year}-` } },
        orderBy: { fileNumber: 'desc' },
        select: { fileNumber: true }
    });
    let nextNumber = 1;
    if (lastCase) {
        const parts = lastCase.fileNumber.split('-');
        const lastNum = parseInt(parts[2] || '0', 10);
        nextNumber = (isNaN(lastNum) ? 0 : lastNum) + 1;
    }
    return `ZDM-${year}-${String(nextNumber).padStart(3, '0')}`;
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

        if (!actions.length) {
            return NextResponse.json({ error: 'No actions provided' }, { status: 400 });
        }

        const results = { updated: 0, created: 0, skipped: 0, errors: [] as string[] };
        const now = new Date();

        for (const item of actions) {
            try {
                if (item.action === 'skip') {
                    results.skipped++;
                    continue;
                }

                // ── UPDATE: set dhsStatus on the existing case ───────────────
                if (item.action === 'update' && item.caseId) {
                    await prisma.case.update({
                        where: { id: item.caseId },
                        data: {
                            dhsStatus: item.status_code,
                            dhsStatusDate: now,
                        }
                    });
                    results.updated++;
                    logger.info(`✅ Updated case ${item.caseId} dhsStatus → ${item.status_code}`);
                    continue;
                }

                // ── CREATE: new client + case from DHS record ────────────────
                if (item.action === 'create') {
                    const rsaId = String(item.rsa_id ?? '').trim();
                    const firstName = item.first_name?.trim() || 'Unknown';
                    const lastName = item.surname?.trim() || 'Unknown';

                    // Check if client already exists (guard against race condition)
                    let client = rsaId
                        ? await prisma.client.findUnique({ where: { idNumber: rsaId } })
                        : null;

                    if (!client && rsaId) {
                        client = await prisma.client.create({
                            data: {
                                firstName,
                                lastName,
                                idNumber: rsaId,
                            }
                        });
                        logger.info(`👤 Created client ${client.id} — ${firstName} ${lastName}`);
                    }

                    if (!client) {
                        results.errors.push(`Could not create client for RSA ID "${rsaId}" — ID missing or invalid`);
                        continue;
                    }

                    // Retry up to 3 times for fileNumber uniqueness
                    let created = false;
                    for (let attempt = 0; attempt < 3; attempt++) {
                        const fileNumber = await generateFileNumber();
                        try {
                            await prisma.case.create({
                                data: {
                                    fileNumber,
                                    clientId: client.id,
                                    status: 'NEW_LEAD',
                                    dhsStatus: item.status_code,
                                    dhsStatusDate: now,
                                    createdById: user.id ?? null,
                                }
                            });
                            logger.info(`📁 Created case ${fileNumber} for ${firstName} ${lastName} — DHS ${item.status_code}`);
                            results.created++;
                            created = true;
                            break;
                        } catch (err: any) {
                            if (err?.code === 'P2002' && attempt < 2) continue; // unique conflict — retry
                            throw err;
                        }
                    }

                    if (!created) {
                        results.errors.push(`Failed to create case for ${firstName} ${lastName} after retries`);
                    }
                }
            } catch (err: any) {
                logger.error(`❌ Error processing record ${item.ncr_ref}:`, err);
                results.errors.push(`NCR ${item.ncr_ref}: ${err.message}`);
            }
        }

        logger.info(`✅ Apply complete — updated: ${results.updated}, created: ${results.created}, skipped: ${results.skipped}, errors: ${results.errors.length}`);

        return NextResponse.json({ success: true, results });

    } catch (error: any) {
        logger.error('❌ Apply error:', error);
        return NextResponse.json({ error: error?.message || 'Apply failed' }, { status: 500 });
    }
}
