import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load env from apps/cases
const envPath = path.join(process.cwd(), 'apps', 'cases', '.env.local');
if (fs.existsSync(envPath)) {
    const env = dotenv.parse(fs.readFileSync(envPath));
    Object.assign(process.env, env);
}

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

async function main() {
    const now = new Date();
    const today = new Date(); today.setHours(23, 59, 59, 999);
    const staleThreshold = new Date(); staleThreshold.setDate(staleThreshold.getDate() - 14);
    const docThreshold = new Date(); docThreshold.setMonth(docThreshold.getMonth() - 3);
    const r350Threshold = new Date(); r350Threshold.setDate(r350Threshold.getDate() - 30);
    const terminal = ['COMPLETED', 'CASE_WON', 'CASE_LOST', 'DUPLICATE', 'WITHDRAWN'];

    const candidates: any[] = [];

    // 1. PENDING_VIA_DHS due for re-check
    const dhs = await prisma.case.findMany({
        where: { status: 'PENDING_VIA_DHS', deletedAt: null, nextUpdate: { lte: today } },
        include: { client: { select: { firstName: true, lastName: true, idNumber: true } } },
        take: 3,
    });
    for (const c of dhs) {
        candidates.push({
            type: 'DHS_RECHECK',
            fileNumber: c.fileNumber,
            client: `${c.client.firstName} ${c.client.lastName}`,
            idNumber: c.client.idNumber,
            status: c.status,
            detail: `nextUpdate: ${c.nextUpdate?.toLocaleDateString('en-ZA') ?? 'none'}`,
        });
    }

    // 2. Stale cases (no activity 14+ days)
    const stale = await prisma.case.findMany({
        where: { deletedAt: null, status: { notIn: terminal }, updatedAt: { lt: staleThreshold } },
        include: { client: { select: { firstName: true, lastName: true, idNumber: true } } },
        orderBy: { updatedAt: 'asc' },
        take: 3,
    });
    for (const c of stale) {
        const days = Math.floor((now.getTime() - c.updatedAt.getTime()) / 86400000);
        candidates.push({
            type: 'STALE_CASE',
            fileNumber: c.fileNumber,
            client: `${c.client.firstName} ${c.client.lastName}`,
            idNumber: c.client.idNumber,
            status: c.status,
            detail: `${days} days no activity`,
        });
    }

    // 3. Document expiry
    const docExpiry = await prisma.case.findMany({
        where: {
            deletedAt: null,
            status: { notIn: terminal },
            documents: { some: { type: { in: ['ID', 'PAYSLIP', 'BANK_STATEMENT'] }, createdAt: { lt: docThreshold } } },
        },
        include: {
            client: { select: { firstName: true, lastName: true, idNumber: true } },
            documents: { where: { type: { in: ['ID', 'PAYSLIP', 'BANK_STATEMENT'] }, createdAt: { lt: docThreshold } }, select: { type: true } },
        },
        take: 2,
    });
    for (const c of docExpiry) {
        const types = [...new Set(c.documents.map((d: any) => d.type))].join(', ');
        candidates.push({
            type: 'DOCUMENT_EXPIRY',
            fileNumber: c.fileNumber,
            client: `${c.client.firstName} ${c.client.lastName}`,
            idNumber: c.client.idNumber,
            status: c.status,
            detail: `Expired docs: ${types}`,
        });
    }

    // 4. R350 reminders — B2C direct clients only, exclude inactive/terminal/incomplete statuses
    const r350ExcludeStatuses = ['NOT_LINKED', 'NEW_LEAD', 'DUPLICATE', 'COMPLETED', 'CASE_WON', 'CASE_LOST', 'WITHDRAWN'];
    const r350 = await prisma.case.findMany({
        where: {
            deletedAt: null,
            r350Status: 'PENDING',
            acquisitionType: { not: 'B2B' },
            createdAt: { lt: r350Threshold },
            status: { notIn: r350ExcludeStatuses },
        },
        include: { client: { select: { firstName: true, lastName: true, idNumber: true } } },
        take: 2,
    });
    for (const c of r350) {
        const days = Math.floor((now.getTime() - c.createdAt.getTime()) / 86400000);
        candidates.push({
            type: 'R350_REMINDER',
            fileNumber: c.fileNumber,
            client: `${c.client.firstName} ${c.client.lastName}`,
            idNumber: c.client.idNumber,
            status: c.status,
            detail: `R350 pending ${days} days`,
        });
    }

    console.log('\n=== CRON CANDIDATES (Top 10) ===\n');
    const top10 = candidates.slice(0, 10);
    if (top10.length === 0) {
        console.log('No candidates found matching any cron criteria.');
    } else {
        top10.forEach((c, i) => {
            console.log(`${i + 1}. [${c.type}] ${c.fileNumber} — ${c.client} (${c.idNumber})`);
            console.log(`   Status: ${c.status}`);
            console.log(`   Detail: ${c.detail}\n`);
        });
    }

    console.log(`Total found: ${candidates.length}`);
    await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
