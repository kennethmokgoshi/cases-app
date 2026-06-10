/**
 * DHS Re-check Cron — /api/cron/dhs-recheck
 *
 * Re-checks all cases sitting in NOT_LINKED ("Not Linked on DHS"):
 *
 *  1. Run a DHS status check on the client's ID number.
 *  2. If DHS now finds the consumer, update the case status accordingly
 *     (REQUESTED_VIA_DHS / NOT_REQUESTED_VIA_DHS / ACCEPTED_VIA_DHS / DECLINED_VIA_DHS).
 *  3. If still NOT_LINKED, re-analyse the case's ID document with AI to
 *     re-extract the ID number:
 *       - Extracted ID differs from the database → update the client's ID
 *         number and run the DHS check again with the corrected ID.
 *       - Extracted ID matches the database → leave the case as NOT_LINKED
 *         and set nextUpdate +5 working days.
 *
 * Cases whose nextUpdate is still in the future are skipped (counted as
 * notDueYet) so re-checks stay spaced out.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { logAutomationRun } from '@zenowethu/shared-lib/src/automation/run-logger';
import { getAutomationUserId } from '@zenowethu/shared-lib/src/automation/automation-user';
import { updateCaseStatus, setNextUpdate, addSystemComment } from '@zenowethu/shared-lib/src/automation/workflow-engine';
import { checkTransferStatus, closeBrowser } from '@zenowethu/shared-lib/src/dhs';
import { analyzeDocument } from '@zenowethu/shared-lib/src/openai';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

const logger = createLogger('cron/dhs-recheck');

const MAX_CASES_PER_RUN = 25;
const DHS_TIMEOUT_MS = 90000;
const NOT_LINKED_RETRY_DAYS = 5;

type DHSCheckResult = Awaited<ReturnType<typeof checkTransferStatus>>;

/** Map a DHS check result to the case status it implies. Returns null when the consumer is still not linked. */
export function mapDhsResultToStatus(result: DHSCheckResult): { status: string; comment: string } | null {
    if (!result.found && result.status === 'NOT_LINKED') {
        return null;
    }
    if (!result.found) {
        return { status: 'NOT_REQUESTED_VIA_DHS', comment: 'Consumer now exists on DHS but no active transfer request found' };
    }
    if (result.status === 'PENDING') {
        return { status: 'REQUESTED_VIA_DHS', comment: `Transfer request is PENDING (${result.daysCounter || 'New'})` };
    }
    if (result.status === 'ACCEPTED' || result.status === 'AUTO_TRANSFERRED') {
        return { status: 'ACCEPTED_VIA_DHS', comment: 'Transfer ACCEPTED' };
    }
    if (result.status === 'DECLINED') {
        return { status: 'DECLINED_VIA_DHS', comment: `Transfer DECLINED — ${result.declineReason || 'no reason captured'}` };
    }
    return null;
}

/** Normalise an SA ID number to digits only; returns null if not a valid 13-digit ID. */
export function normalizeIdNumber(raw: string | null | undefined): string | null {
    const digits = (raw || '').replace(/\D/g, '');
    return digits.length === 13 ? digits : null;
}

async function withDHSTimeout(fn: () => Promise<DHSCheckResult>): Promise<DHSCheckResult | null> {
    try {
        return await Promise.race([
            fn(),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), DHS_TIMEOUT_MS)),
        ]);
    } catch (err) {
        logger.error('[DHS_RECHECK] DHS operation error:', err);
        return null;
    }
}

/** Re-run AI extraction on the case's most recent ID document and return the extracted ID number. */
async function reanalyseIdDocument(caseId: string): Promise<{ idNumber: string | null; reason: string }> {
    const idDoc = await prisma.document.findFirst({
        where: { caseId, type: 'ID' },
        orderBy: { uploadedAt: 'desc' },
        select: { id: true, fileUrl: true, fileName: true, mimeType: true, extractedData: true },
    });

    if (!idDoc) {
        return { idNumber: null, reason: 'No ID document on file to re-analyse' };
    }

    const filePath = join(process.cwd(), 'storage', 'uploads', idDoc.fileUrl.replace('/uploads/', ''));
    if (!existsSync(filePath)) {
        return { idNumber: null, reason: `ID document file missing on disk (${idDoc.fileName})` };
    }

    const buffer = await readFile(filePath);
    const result = await analyzeDocument(buffer.toString('base64'), 'ID', idDoc.mimeType || 'application/pdf');
    const extractedId = normalizeIdNumber(result.data?.idNumber);

    // Persist the fresh analysis on the document
    const previous = idDoc.extractedData ? JSON.parse(idDoc.extractedData as string) : {};
    await prisma.document.update({
        where: { id: idDoc.id },
        data: {
            extractedData: JSON.stringify({ ...previous, ...result.data, reanalyzedAt: new Date().toISOString() }),
            analyzedAt: new Date(),
        },
    });

    if (!extractedId) {
        return { idNumber: null, reason: 'AI re-analysis could not extract a valid 13-digit ID number' };
    }
    return { idNumber: extractedId, reason: 'OK' };
}

export async function POST(request: Request) {
    const cronSecret = request.headers.get('x-cron-secret');
    const isValidCron = cronSecret && cronSecret === process.env.CRON_SECRET;

    if (!isValidCron) {
        const session = await auth();
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    const startedAt = new Date();
    logger.info('[CRON] DHS re-check (NOT_LINKED) starting...');

    const stats = {
        scanned: 0,
        notDueYet: 0,
        checked: 0,
        statusChanged: 0,
        reanalysed: 0,
        idCorrected: 0,
        stillNotLinked: 0,
        errors: 0,
    };
    const details: Array<Record<string, string>> = [];

    try {
        const automationUserId = await getAutomationUserId();
        const adminId = automationUserId
            ?? (await prisma.user.findFirst({ where: { isAdmin: true }, select: { id: true } }))?.id;

        const now = new Date();
        const allNotLinked = await prisma.case.findMany({
            where: { status: 'NOT_LINKED', deletedAt: null },
            include: {
                client: { select: { id: true, firstName: true, lastName: true, idNumber: true } },
            },
            orderBy: { nextUpdate: 'asc' },
        });

        stats.scanned = allNotLinked.length;
        const dueCases = allNotLinked.filter(c => !c.nextUpdate || c.nextUpdate <= now).slice(0, MAX_CASES_PER_RUN);
        stats.notDueYet = allNotLinked.length - dueCases.length;
        logger.info(`[CRON] ${allNotLinked.length} NOT_LINKED case(s) found, ${dueCases.length} due for re-check`);

        for (const c of dueCases) {
            const clientName = `${c.client.firstName} ${c.client.lastName}`.trim();
            try {
                // ── Step 1: Check DHS with the ID currently in the database ──
                const firstCheck = await withDHSTimeout(() => checkTransferStatus(c.client.idNumber));
                if (!firstCheck) {
                    stats.errors++;
                    details.push({ fileNumber: c.fileNumber, client: clientName, outcome: 'DHS check timed out' });
                    continue;
                }
                stats.checked++;

                const mapped = mapDhsResultToStatus(firstCheck);
                if (mapped) {
                    // No longer NOT_LINKED — update the case and move on
                    await updateCaseStatus(c.id, mapped.status, adminId);
                    await addSystemComment(c.id, `[AUTO] DHS Re-check: ${mapped.comment}. Status → ${mapped.status}. Next update +3 working days.`, adminId);
                    stats.statusChanged++;
                    details.push({ fileNumber: c.fileNumber, client: clientName, outcome: `Status → ${mapped.status}` });
                    continue;
                }

                // ── Step 2: Still NOT_LINKED — re-analyse the ID document ──
                stats.reanalysed++;
                const reanalysis = await reanalyseIdDocument(c.id);

                if (!reanalysis.idNumber) {
                    await setNextUpdate(c.id, NOT_LINKED_RETRY_DAYS, adminId);
                    await addSystemComment(c.id, `[AUTO] DHS Re-check: Still NOT_LINKED. ID re-analysis inconclusive — ${reanalysis.reason}. Staff to verify ID number manually. Next update +${NOT_LINKED_RETRY_DAYS} working days.`, adminId);
                    stats.stillNotLinked++;
                    details.push({ fileNumber: c.fileNumber, client: clientName, outcome: `Still NOT_LINKED — ${reanalysis.reason}` });
                    continue;
                }

                const dbId = normalizeIdNumber(c.client.idNumber);
                if (reanalysis.idNumber === dbId) {
                    // ── ID matches — genuinely not linked, retry in 5 working days ──
                    await setNextUpdate(c.id, NOT_LINKED_RETRY_DAYS, adminId);
                    await addSystemComment(c.id, `[AUTO] DHS Re-check: Still NOT_LINKED. ID document re-analysed — extracted ID matches the database (${reanalysis.idNumber}). Consumer is genuinely not on DHS yet. Next update +${NOT_LINKED_RETRY_DAYS} working days.`, adminId);
                    stats.stillNotLinked++;
                    details.push({ fileNumber: c.fileNumber, client: clientName, outcome: 'ID matches — still NOT_LINKED, +5 working days' });
                    continue;
                }

                // ── Step 3: ID differs — correct the database and re-check DHS ──
                try {
                    await prisma.client.update({
                        where: { id: c.client.id },
                        data: { idNumber: reanalysis.idNumber },
                    });
                } catch (err: unknown) {
                    const isUniqueViolation = typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
                    if (isUniqueViolation) {
                        await setNextUpdate(c.id, NOT_LINKED_RETRY_DAYS, adminId);
                        await addSystemComment(c.id, `[AUTO] DHS Re-check: ID re-analysis extracted a different ID (${reanalysis.idNumber}) but another client already has that ID number. Staff to review possible duplicate. Next update +${NOT_LINKED_RETRY_DAYS} working days.`, adminId);
                        stats.errors++;
                        details.push({ fileNumber: c.fileNumber, client: clientName, outcome: `Corrected ID ${reanalysis.idNumber} collides with another client` });
                        continue;
                    }
                    throw err;
                }
                stats.idCorrected++;
                logger.info(`[DHS_RECHECK] ${c.fileNumber}: ID corrected ${c.client.idNumber} → ${reanalysis.idNumber}`);

                const secondCheck = await withDHSTimeout(() => checkTransferStatus(reanalysis.idNumber));
                if (!secondCheck) {
                    await setNextUpdate(c.id, NOT_LINKED_RETRY_DAYS, adminId);
                    await addSystemComment(c.id, `[AUTO] DHS Re-check: ID number corrected from ${c.client.idNumber} to ${reanalysis.idNumber} (AI re-analysis of ID document). Follow-up DHS check timed out — will retry. Next update +${NOT_LINKED_RETRY_DAYS} working days.`, adminId);
                    stats.errors++;
                    details.push({ fileNumber: c.fileNumber, client: clientName, outcome: 'ID corrected, second DHS check timed out' });
                    continue;
                }

                const remapped = mapDhsResultToStatus(secondCheck);
                if (remapped) {
                    await updateCaseStatus(c.id, remapped.status, adminId);
                    await addSystemComment(c.id, `[AUTO] DHS Re-check: ID number corrected from ${c.client.idNumber} to ${reanalysis.idNumber} (AI re-analysis of ID document). Re-checked DHS with corrected ID: ${remapped.comment}. Status → ${remapped.status}. Next update +3 working days.`, adminId);
                    stats.statusChanged++;
                    details.push({ fileNumber: c.fileNumber, client: clientName, outcome: `ID corrected, status → ${remapped.status}` });
                } else {
                    await setNextUpdate(c.id, NOT_LINKED_RETRY_DAYS, adminId);
                    await addSystemComment(c.id, `[AUTO] DHS Re-check: ID number corrected from ${c.client.idNumber} to ${reanalysis.idNumber} (AI re-analysis of ID document), but the corrected ID is also not found on DHS. Remains NOT_LINKED. Next update +${NOT_LINKED_RETRY_DAYS} working days.`, adminId);
                    stats.stillNotLinked++;
                    details.push({ fileNumber: c.fileNumber, client: clientName, outcome: 'ID corrected, still NOT_LINKED' });
                }
            } catch (err) {
                stats.errors++;
                logger.error(`[DHS_RECHECK] Error on ${c.fileNumber}:`, err);
                await setNextUpdate(c.id, NOT_LINKED_RETRY_DAYS, adminId).catch(() => null);
                details.push({ fileNumber: c.fileNumber, client: clientName, outcome: `Error: ${err instanceof Error ? err.message : String(err)}` });
            }
        }

        await closeBrowser();

        await logAutomationRun({
            type: 'DHS_RECHECK',
            status: stats.errors > 0 && stats.checked === 0 ? 'FAILED' : 'SUCCESS',
            startedAt,
            logs: { ...stats, details },
        });

        logger.info('[CRON] DHS re-check complete:', stats);
        return NextResponse.json({ success: true, stats, details, ranAt: new Date().toISOString() });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error('[CRON] DHS re-check failed:', error);
        await closeBrowser().catch(() => null);
        await logAutomationRun({ type: 'DHS_RECHECK', status: 'FAILED', startedAt, errorMessage: msg, logs: stats });
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

export const maxDuration = 300; // DHS Puppeteer checks + AI re-analysis are slow
