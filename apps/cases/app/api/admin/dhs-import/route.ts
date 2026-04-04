import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { analyzeDocument, PROMPTS } from '@zenowethu/shared-lib/src/openai';
import { getOpenAI } from '@zenowethu/shared-lib/src/openai/client';
import { prisma } from '@zenowethu/database';
import busboy from 'busboy';
import { parseDhsXls, dhsRowsToCsv, dumpXlsAsText } from '../../../../lib/dhs-xls-parser';

const logger = createLogger('api/admin/dhs-import');
export const maxDuration = 300;
export const runtime = 'nodejs';

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

        // ── 1. Parse multipart upload ────────────────────────────────────────
        const contentType = request.headers.get('content-type') || '';
        const bodyBuffer = await request.arrayBuffer();

        const { file } = await new Promise<{ file: { name: string; buffer: Buffer; mimeType: string } | null }>((resolve, reject) => {
            const bb = busboy({ headers: { 'content-type': contentType }, limits: { fileSize: 50 * 1024 * 1024 } });
            let result: { name: string; buffer: Buffer; mimeType: string } | null = null;

            bb.on('file', (_field, stream, info) => {
                const chunks: Buffer[] = [];
                stream.on('data', (chunk) => chunks.push(chunk));
                stream.on('end', () => {
                    result = { name: info.filename, buffer: Buffer.concat(chunks), mimeType: info.mimeType };
                });
            });
            bb.on('error', reject);
            bb.on('finish', () => resolve({ file: result }));
            bb.end(Buffer.from(bodyBuffer));
        });

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        logger.info(`📋 DHS import: ${file.name} (${file.buffer.length} bytes, ${file.mimeType})`);

        // ── 2. AI extraction ─────────────────────────────────────────────────
        let records: any[] = [];

        const isXls = file.mimeType === 'application/vnd.ms-excel'
            || file.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            || file.name.toLowerCase().endsWith('.xls')
            || file.name.toLowerCase().endsWith('.xlsx');

        if (isXls) {
            logger.info('📊 Parsing XLS — trying fixed column positions first...');
            const fixedRows = parseDhsXls(file.buffer);
            logger.info(`   Fixed-column parse: ${fixedRows.length} rows`);

            let sheetText: string;
            if (fixedRows.length > 0) {
                sheetText = dhsRowsToCsv(fixedRows);
                logger.info('   Using pre-parsed CSV (fixed columns matched)');
            } else {
                sheetText = dumpXlsAsText(file.buffer);
                logger.info(`   Falling back to raw sheet dump (${sheetText.split('\n').length} lines)`);
            }

            const nonEmptyLines = sheetText.split('\n').filter((l) => l.trim()).length;
            if (nonEmptyLines <= 1) {
                return NextResponse.json(
                    { error: 'The uploaded XLS file appears to be empty or could not be read.' },
                    { status: 422 }
                );
            }

            const response = await getOpenAI().chat.completions.create({
                model: 'gpt-4o',
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'text', text: PROMPTS.DHS_SUMMARY_REPORT },
                        { type: 'text', text: `[SHEET DATA]\n\n${sheetText}` }
                    ]
                }],
                max_tokens: 8000,
                temperature: 0,
                response_format: { type: 'json_object' }
            });

            const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');
            records = parsed.records ?? [];
        } else {
            logger.info('📄 Processing PDF via AI vision...');
            const result = await analyzeDocument(file.buffer.toString('base64'), 'DHS_SUMMARY_REPORT' as any, file.mimeType);
            records = result.data?.records ?? [];
        }

        logger.info(`✅ AI extracted ${records.length} records — running DB comparison...`);

        // ── 3. DB enrichment: match each record by RSA ID ───────────────────
        const rsaIds = records
            .map((r: any) => String(r.rsa_id ?? '').trim())
            .filter((id) => id.length > 0);

        const clients = await prisma.client.findMany({
            where: { idNumber: { in: rsaIds } },
            select: {
                id: true,
                idNumber: true,
                firstName: true,
                lastName: true,
                cases: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: {
                        id: true,
                        fileNumber: true,
                        status: true,
                        dhsStatus: true,
                        dhsStatusDate: true,
                        consumerDhsStatus: true,
                    }
                }
            }
        });

        const clientMap = new Map(clients.map((c) => [c.idNumber, c]));

        const enriched = records.map((r: any) => {
            const client = clientMap.get(String(r.rsa_id ?? '').trim());
            const latestCase = client?.cases[0] ?? null;

            return {
                ...r,
                dbMatch: {
                    found: !!client,
                    clientId: client?.id ?? null,
                    clientName: client ? `${client.firstName} ${client.lastName}` : null,
                    caseId: latestCase?.id ?? null,
                    fileNumber: latestCase?.fileNumber ?? null,
                    caseStatus: latestCase?.status ?? null,
                    currentDhsStatus: latestCase?.dhsStatus ?? null,
                    currentDhsStatusDate: latestCase?.dhsStatusDate ?? null,
                },
                statusChanged: !!latestCase && latestCase.dhsStatus !== r.status_code,
            };
        });

        const stats = {
            total: enriched.length,
            matched: enriched.filter((r: any) => r.dbMatch.found).length,
            unmatched: enriched.filter((r: any) => !r.dbMatch.found).length,
            statusChanged: enriched.filter((r: any) => r.statusChanged).length,
        };

        logger.info(`📊 DB match: ${stats.matched} matched, ${stats.unmatched} unmatched, ${stats.statusChanged} status changes`);

        return NextResponse.json({ success: true, records: enriched, stats });

    } catch (error: any) {
        logger.error('❌ DHS import error:', error);
        return NextResponse.json({ error: error?.message || 'Import failed' }, { status: 500 });
    }
}
