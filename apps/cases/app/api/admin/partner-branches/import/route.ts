import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { z } from 'zod';
import { parseBranchCsv } from '@/lib/partner-branch-csv';
import type { BranchCsvField } from '@/lib/partner-branch-csv';
import { syncPartnerContacts } from '@zenowethu/shared-lib/src/partners/contact-sync';

const logger = createLogger('api/admin/partner-branches/import');

const ImportSchema = z.object({
    partnerProjectId: z.string().min(1),
    csv: z.string().min(1).max(1_000_000),
    /** Preview first; nothing is written until the caller confirms. */
    dryRun: z.boolean().default(true),
    /** Create branches that are in the CSV but not yet in the directory. */
    createMissing: z.boolean().default(true) });

type RowOutcome = 'CREATE' | 'UPDATE' | 'UNCHANGED' | 'ERROR';

interface RowPreview {
    line: number;
    name: string;
    outcome: RowOutcome;
    /** Fields this row would change, with their before/after values. */
    changes: { field: string; from: string | null; to: string | null }[];
    errors: string[];
}

const UPDATABLE_FIELDS: BranchCsvField[] = [
    'code', 'contactPerson', 'email', 'phone', 'alternatePhone',
    'whatsappNumber', 'addressLine', 'city', 'province', 'postalCode', 'notes',
];

// POST /api/admin/partner-branches/import — preview or apply a CSV contact list
export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const user = session.user;
        if (!user.isAdmin && !user.isExecutive && !user.isSeniorManager && user.role !== 'MANAGER') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const parsedBody = ImportSchema.safeParse(await request.json());
        if (!parsedBody.success) {
            return NextResponse.json({ error: 'Validation failed', issues: parsedBody.error.issues }, { status: 422 });
        }
        const { partnerProjectId, csv, dryRun, createMissing } = parsedBody.data;

        const partner = await prisma.project.findUnique({
            where: { id: partnerProjectId },
            select: { id: true, name: true } });
        if (!partner) {
            return NextResponse.json({ error: 'Partner not found' }, { status: 422 });
        }

        const parsed = parseBranchCsv(csv);
        if (parsed.errors.length > 0) {
            return NextResponse.json({ error: parsed.errors.join(' '), unknownHeaders: parsed.unknownHeaders }, { status: 422 });
        }

        const existing = await prisma.partnerBranch.findMany({
            where: { partnerProjectId },
            select: {
                id: true, name: true, code: true, contactPerson: true, email: true, phone: true,
                alternatePhone: true, whatsappNumber: true, addressLine: true, city: true,
                province: true, postalCode: true, notes: true } });

        const byName = new Map(existing.map((b) => [b.name.trim().toLowerCase(), b]));

        const previews: RowPreview[] = [];
        const writes: { id?: string; name: string; data: Record<string, string> }[] = [];
        const seenNames = new Set<string>();

        for (const row of parsed.rows) {
            const name = row.values.name ?? '';
            const preview: RowPreview = { line: row.line, name, outcome: 'ERROR', changes: [], errors: [...row.errors] };

            if (preview.errors.length > 0) {
                previews.push(preview);
                continue;
            }

            const key = name.trim().toLowerCase();
            if (seenNames.has(key)) {
                preview.errors.push('Duplicate branch name earlier in this file.');
                previews.push(preview);
                continue;
            }
            seenNames.add(key);

            const match = byName.get(key);
            const data: Record<string, string> = {};

            for (const field of UPDATABLE_FIELDS) {
                const incoming = row.values[field];
                if (!incoming) continue; // A blank cell leaves the stored value alone.
                const current = (match?.[field] ?? null) as string | null;
                if (current === incoming) continue;
                data[field] = incoming;
                preview.changes.push({ field, from: current, to: incoming });
            }

            if (!match) {
                if (!createMissing) {
                    preview.outcome = 'ERROR';
                    preview.errors.push('Branch is not in the directory and "create missing" is off.');
                    previews.push(preview);
                    continue;
                }
                preview.outcome = 'CREATE';
                writes.push({ name, data });
            } else if (preview.changes.length > 0) {
                preview.outcome = 'UPDATE';
                writes.push({ id: match.id, name, data });
            } else {
                preview.outcome = 'UNCHANGED';
            }

            previews.push(preview);
        }

        const summary = {
            create: previews.filter((p) => p.outcome === 'CREATE').length,
            update: previews.filter((p) => p.outcome === 'UPDATE').length,
            unchanged: previews.filter((p) => p.outcome === 'UNCHANGED').length,
            errors: previews.filter((p) => p.outcome === 'ERROR').length };

        if (dryRun) {
            return NextResponse.json({
                dryRun: true,
                partner,
                summary,
                rows: previews,
                unknownHeaders: parsed.unknownHeaders });
        }

        // Apply. Rows with errors were never queued, so a bad row does not stop
        // the good ones — the response reports exactly what was skipped.
        await prisma.$transaction(
            writes.map((write) =>
                write.id
                    ? prisma.partnerBranch.update({ where: { id: write.id }, data: write.data })
                    : prisma.partnerBranch.create({
                        data: { partnerProjectId, name: write.name, ...write.data } })
            )
        );

        // Push the imported contact details onto each branch's Referrer record
        // so a bulk import populates both sides in one pass.
        const synced = await syncPartnerContacts(partnerProjectId);

        logger.info(
            { partnerProjectId, userId: user.id, ...summary, syncedReferrers: synced.length },
            'Partner branch CSV import applied'
        );

        return NextResponse.json({
            dryRun: false,
            partner,
            summary,
            syncedReferrers: synced.length,
            rows: previews,
            unknownHeaders: parsed.unknownHeaders });
    } catch (error) {
        logger.error({ err: error }, 'Partner branch CSV import failed');
        return NextResponse.json({ error: 'Import failed' }, { status: 500 });
    }
}
