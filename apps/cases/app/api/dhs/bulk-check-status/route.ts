import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { closeBrowser } from '@zenowethu/shared-lib/src/dhs';
import { logAutomationRun } from '@zenowethu/shared-lib/src/automation/run-logger';
import { getDhsOverdueAccessWhere } from '@/lib/dhs-overdue-access';
import { POST as dhsLookupPost } from '../lookup/route';

const logger = createLogger('api/dhs/bulk-check-status');

// Same cap the existing DHS_RECHECK cron uses for the same class of operation
// (sequential Puppeteer DHS checks) — keeps a single click bounded to a
// reasonable worst-case runtime instead of an unbounded batch.
const MAX_CASES_PER_RUN = 25;

export interface BulkCheckStatusResult {
    caseId: string;
    fileNumber: string;
    clientName: string;
    previousStatus: string;
    newStatus?: string;
    outcome: string;
    error?: string;
}

/**
 * Runs the existing single-case "Check Request Status" DHS action
 * (POST /api/dhs/lookup, action=check_status) across a batch of cases —
 * the bulk counterpart to the DHS Compliance dashboard button, which finds
 * overdue "Requested via DHS" cases but doesn't act on them by itself.
 *
 * Deliberately calls the existing route handler in-process (same Request/
 * Response contract Next.js itself uses) rather than re-implementing the
 * DHS check_status rules — that logic is business-critical (drives
 * accepted/declined consumer emails) and already lives in one place.
 *
 * Re-validates every caseId against the caller's own DHS-overdue access
 * scope (see /api/dashboard/dhs-overdue) so a client can't submit case IDs
 * outside the projects it's allowed to see.
 */
export async function POST(request: Request) {
    const startedAt = new Date();
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json().catch(() => ({}));
        const requestedIds: string[] = Array.isArray(body?.caseIds)
            ? body.caseIds.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
            : [];

        if (requestedIds.length === 0) {
            return NextResponse.json({ error: 'caseIds array is required' }, { status: 400 });
        }

        const accessWhere = await getDhsOverdueAccessWhere(session.user);
        const eligibleCases = await prisma.case.findMany({
            where: { id: { in: requestedIds }, deletedAt: { equals: null }, ...accessWhere },
            select: {
                id: true,
                fileNumber: true,
                status: true,
                client: { select: { idNumber: true, firstName: true, lastName: true } },
            },
        });

        const forbiddenCount = requestedIds.length - eligibleCases.length;
        const batch = eligibleCases.slice(0, MAX_CASES_PER_RUN);
        const skippedCount = eligibleCases.length - batch.length;

        const results: BulkCheckStatusResult[] = [];
        const summary = { accepted: 0, declined: 0, pending: 0, notLinked: 0, notRequested: 0, zdmClient: 0, other: 0, errors: 0 };

        for (const c of batch) {
            const clientName = `${c.client?.firstName ?? ''} ${c.client?.lastName ?? ''}`.trim() || 'Unknown Client';

            if (!c.client?.idNumber) {
                results.push({ caseId: c.id, fileNumber: c.fileNumber, clientName, previousStatus: c.status, outcome: 'Skipped — no ID number on file', error: 'Missing ID number' });
                summary.errors++;
                continue;
            }

            try {
                const lookupReq = new Request('http://internal.local/api/dhs/lookup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ idNumber: c.client.idNumber, caseId: c.id, action: 'check_status' }),
                });
                const lookupRes = await dhsLookupPost(lookupReq);
                const lookupJson: any = await lookupRes.json().catch(() => ({}));

                if (!lookupRes.ok || lookupJson?.error) {
                    const message = lookupJson?.error || lookupJson?.details || `DHS check failed (HTTP ${lookupRes.status})`;
                    results.push({ caseId: c.id, fileNumber: c.fileNumber, clientName, previousStatus: c.status, outcome: message, error: message });
                    summary.errors++;
                    continue;
                }

                const updated = await prisma.case.findUnique({ where: { id: c.id }, select: { status: true } });
                const newStatus = updated?.status ?? c.status;

                switch (newStatus) {
                    case 'ACCEPTED_VIA_DHS': summary.accepted++; break;
                    case 'DECLINED_VIA_DHS': summary.declined++; break;
                    case 'REQUESTED_VIA_DHS': summary.pending++; break;
                    case 'NOT_LINKED': summary.notLinked++; break;
                    case 'NOT_REQUESTED_VIA_DHS': summary.notRequested++; break;
                    case 'ZDM_CLIENT': summary.zdmClient++; break;
                    default: summary.other++; break;
                }

                results.push({
                    caseId: c.id,
                    fileNumber: c.fileNumber,
                    clientName,
                    previousStatus: c.status,
                    newStatus,
                    outcome: lookupJson?.message || `Status → ${newStatus}`,
                });
            } catch (err: any) {
                logger.error(`[BulkCheckStatus] Error checking ${c.fileNumber}:`, err);
                const message = err?.message || 'Unknown error';
                results.push({ caseId: c.id, fileNumber: c.fileNumber, clientName, previousStatus: c.status, outcome: `Error: ${message}`, error: message });
                summary.errors++;
            }
        }

        await closeBrowser().catch(() => null);

        logger.info(`[BulkCheckStatus] User=${session.user.id} requested=${requestedIds.length} processed=${batch.length} skipped=${skippedCount} forbidden=${forbiddenCount}`, summary);

        await logAutomationRun({
            type: 'DHS_BULK_CHECK_STATUS',
            status: batch.length > 0 && summary.errors === batch.length ? 'FAILED' : 'SUCCESS',
            startedAt,
            triggeredById: session.user.id,
            logs: { requested: requestedIds.length, forbidden: forbiddenCount, processed: batch.length, skipped: skippedCount, summary, results },
        });

        return NextResponse.json({
            processed: batch.length,
            skipped: skippedCount,
            forbidden: forbiddenCount,
            summary,
            results,
        });
    } catch (error: any) {
        logger.error('[BulkCheckStatus] Fatal error:', error);
        await closeBrowser().catch(() => null);
        await logAutomationRun({ type: 'DHS_BULK_CHECK_STATUS', status: 'FAILED', startedAt, errorMessage: error?.message }).catch(() => null);
        return NextResponse.json({ error: 'Failed to run bulk DHS status check' }, { status: 500 });
    }
}

// DHS Puppeteer checks are slow and run sequentially across the whole batch —
// mirrors the DHS_RECHECK cron's own maxDuration for the same class of work.
export const maxDuration = 300;
