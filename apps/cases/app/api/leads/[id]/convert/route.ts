/**
 * POST /api/leads/[id]/convert
 *
 * Converts a website lead into a Client + Case.
 * Marks the lead status as CONVERTED and stores the new caseId.
 * Requires: projectId, optional services + acquisitionType.
 */

import { NextResponse } from 'next/server';
import { auth, createLogger, calculateSlaDeadline } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { LeadConvertSchema } from '@/lib/schemas';

const logger = createLogger('api/leads/[id]/convert');

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteCtx) {
    try {
        const { id } = await params;

        const session = await auth();
        if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const isAuthorised =
            session.user.isAdmin || session.user.isExecutive ||
            session.user.isSeniorManager || session.user.isManager ||
            session.user.role === 'STAFF' || session.user.userType === 'STAFF';
        if (!isAuthorised) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        // ── Validate body ──────────────────────────────────────────────────
        const body = await request.json().catch(() => ({}));
        const parsed = LeadConvertSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
                { status: 422 },
            );
        }

        // ── Fetch lead ─────────────────────────────────────────────────────
        const lead = await prisma.lead.findUnique({ where: { id } });
        if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

        if (lead.status === 'CONVERTED') {
            return NextResponse.json(
                { error: 'Lead already converted', caseId: lead.convertedCaseId },
                { status: 409 },
            );
        }

        // ── Check for duplicate by ID number ─────────────────────────────
        if (lead.idNumber) {
            const existingClient = await prisma.client.findUnique({
                where: { idNumber: lead.idNumber },
                include: { cases: { where: { status: { not: 'CLOSED' } }, take: 1 } },
            });
            if (existingClient?.cases.length) {
                return NextResponse.json(
                    {
                        error: 'A client with this ID number already has an active case',
                        existingCaseId: existingClient.cases[0]!.id,
                    },
                    { status: 409 },
                );
            }
        }

        const { projectId, secondaryProjectIds, services, acquisitionType } = parsed.data;

        // ── Derive file number ─────────────────────────────────────────────
        const count = await prisma.case.count();
        const fileNumber = `ZEN-${String(count + 1).padStart(5, '0')}`;
        const deadline = calculateSlaDeadline(new Date());

        // ── Create Client + Case in a transaction ──────────────────────────
        const { newCase, client } = await prisma.$transaction(async tx => {
            // 1. Upsert client (reuse if ID number matches an existing inactive client)
            let existingClientId: string | null = null;
            if (lead.idNumber) {
                const existing = await tx.client.findUnique({ where: { idNumber: lead.idNumber } });
                if (existing) existingClientId = existing.id;
            }

            const client = existingClientId
                ? await tx.client.update({
                      where: { id: existingClientId },
                      data: {
                          firstName: lead.firstName,
                          lastName:  lead.lastName,
                          phone:     lead.phone,
                          email:     lead.email,
                      },
                  })
                : await tx.client.create({
                      data: {
                          firstName: lead.firstName,
                          lastName:  lead.lastName,
                          idNumber:  lead.idNumber ?? `NOID-${Date.now()}`,
                          phone:     lead.phone,
                          email:     lead.email,
                      },
                  });

            // 2. Create case
            const newCase = await tx.case.create({
                data: {
                    fileNumber,
                    status:          'NEW_LEAD',
                    nextUpdate:      deadline,
                    acquisitionType: acquisitionType ?? 'B2C',
                    services:        services ? JSON.stringify(services) : null,
                    leadSource:      lead.source,
                    client:          { connect: { id: client.id } },
                    createdBy:       session?.user?.id ? { connect: { id: session.user.id } } : undefined,
                    projects: {
                        create: [
                            { projectId, isPrimary: true },
                            ...(secondaryProjectIds ?? []).map(pid => ({ projectId: pid, isPrimary: false })),
                        ],
                    },
                },
            });

            // 3. Mark lead as converted
            await tx.lead.update({
                where: { id },
                data: { status: 'CONVERTED', convertedCaseId: newCase.id },
            });

            return { newCase, client };
        });

        logger.info(`[convert] Lead ${id} → Case ${newCase.id} (client ${client.id})`);

        return NextResponse.json({ caseId: newCase.id, clientId: client.id, fileNumber }, { status: 201 });
    } catch (error) {
        logger.error('[leads/[id]/convert] Error:', error);
        return NextResponse.json({ error: 'Failed to convert lead' }, { status: 500 });
    }
}
