
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger } from '@zenowethu/shared-lib';
import * as XLSX from 'xlsx';

// Helper to normalize keys to find headers regardless of case or spacing
const normalizeKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '');

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = /\.(xlsx|xls)$/i;

export async function POST(req: NextRequest) {
    // 1. Auth & Role Check
    const session = await auth();
    const userRole = session?.user?.role;

    if (!session?.user?.id || !['ADMIN', 'FINANCE', 'ACCOUNTS'].includes(userRole || '')) {
        return NextResponse.json({ error: 'Unauthorized access' }, { status: 401 });
    }

    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        if (!ALLOWED_EXTENSIONS.test(file.name)) {
            return NextResponse.json({ error: 'Only .xlsx or .xls files are accepted' }, { status: 400 });
        }

        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json({ error: 'File size must not exceed 10MB' }, { status: 400 });
        }

        // 2. Parse Excel
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'buffer' });

        if (workbook.SheetNames.length === 0) {
            return NextResponse.json({ error: 'Invalid Excel file: No sheets found' }, { status: 400 });
        }

        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (jsonData.length === 0) {
            return NextResponse.json({ error: 'Empty file or could not parse data' }, { status: 400 });
        }

        // 3. Create Batch Record
        const batch = await prisma.paymentBatch.create({
            data: {
                fileName: file.name,
                uploadedById: session.user.id,
                status: 'PROCESSING',
                totalAmount: 0,
                matchCount: 0,
                unmatchCount: 0
            }
        });

        const paymentsToCreate: any[] = [];
        let totalAmount = 0;
        let matchCount = 0;
        let unmatchCount = 0;

        // 4. Process Rows
        for (const row of jsonData as any[]) {
            const keys = Object.keys(row);

            // Heuristic Column Mapping
            const idKey = keys.find(k => {
                const n = normalizeKey(k);
                return n === 'id' || n === 'idnumber' || n.includes('identity');
            });
            const amountKey = keys.find(k => {
                const n = normalizeKey(k);
                return n === 'amount' || n === 'credit' || (n === 'paid' && !n.includes('date'));
            });
            const dateKey = keys.find(k => normalizeKey(k).includes('date'));
            const refKey = keys.find(k => {
                const n = normalizeKey(k);
                return n === 'reference' || n === 'ref' || n === 'description' || n === 'remarks';
            });

            // Skip rows without amount
            if (!amountKey) continue;

            // Extract & Validate Amount
            let amountVal = row[amountKey];
            if (typeof amountVal === 'string') {
                amountVal = parseFloat(amountVal.replace(/[^0-9.-]/g, ''));
            }
            if (isNaN(amountVal) || amountVal === 0) continue;

            const amount = amountVal;

            // Extract ID
            const idNumberRaw = idKey ? String(row[idKey]).trim() : '';
            // Clean ID (remove spaces)
            const idNumber = idNumberRaw.replace(/\s/g, '');

            // Extract Date
            let date = new Date();
            const dateVal = dateKey ? row[dateKey] : null;
            if (typeof dateVal === 'number') {
                // Excel serial date
                date = new Date(Math.round((dateVal - 25569) * 86400 * 1000));
            } else if (dateVal) {
                const parsed = new Date(dateVal);
                if (!isNaN(parsed.getTime())) date = parsed;
            }

            // Extract Reference
            const reference = refKey ? String(row[refKey]).trim() : 'Batch Import';

            // 5. Match Client
            let clientId: string | null = null;
            let caseId: string | null = null;
            let status = 'UNALLOCATED';

            if (idNumber && idNumber.length > 6) {
                // Try exact match first
                let client = await prisma.client.findUnique({
                    where: { idNumber: idNumber }
                });

                // If not found, try contains? (Dangerous, but maybe useful if ID has slight mismatch. Let's stick to exact or very close for now to be safe financially)
                // Actually, let's trust the ID number for now.

                if (client) {
                    clientId = client.id;
                    status = 'PENDING'; // Matched, waiting for review/posting
                    matchCount++;

                    // Find latest case
                    const recentCase = await prisma.case.findFirst({
                        where: { clientId: client.id },
                        orderBy: { createdAt: 'desc' }
                    });
                    if (recentCase) caseId = recentCase.id;
                } else {
                    unmatchCount++;
                }
            } else {
                unmatchCount++;
            }

            totalAmount += amount;

            paymentsToCreate.push({
                amount: amount,
                date: date,
                method: 'PARTNER_PAYOVER', // Assuming partner import
                reference: reference,
                notes: `Original ID: ${idNumberRaw} | Row Data: ${JSON.stringify(row)}`,
                status: status,
                clientId: clientId,
                caseId: caseId,
                batchId: batch.id,
                unmatchedId: idNumberRaw || 'NO_ID',
                recordedById: session.user.id,
                category: 'INSTALLMENT'
            });
        }

        // 6. Bulk Insert
        if (paymentsToCreate.length > 0) {
            await prisma.payment.createMany({
                data: paymentsToCreate
            });
        }

        // 7. Update Batch Record
        await prisma.paymentBatch.update({
            where: { id: batch.id },
            data: {
                status: 'COMPLETED',
                totalAmount: totalAmount,
                matchCount: matchCount,
                unmatchCount: unmatchCount
            }
        });

        return NextResponse.json({
            success: true,
            batchId: batch.id,
            matchCount,
            unmatchCount,
            totalAmount
        });

    } catch (e: any) {
        logger.error('Payment Import Error:', e);
        return NextResponse.json({ error: 'Failed to process file: ' + e.message }, { status: 500 });
    }
}
