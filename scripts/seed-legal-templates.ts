/**
 * Seed: Debt Review Removal Legal Templates
 *
 * Registers the 6 court document templates as DocumentResource records
 * so staff can download them from the admin panel.
 *
 * Run: npx tsx scripts/seed-legal-templates.ts
 */

import { PrismaClient } from '@prisma/client';
import { statSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

const BASE_URL = '/legal-templates/debt-review-removal';
const PUBLIC_DIR = join(process.cwd(), 'apps', 'cases', 'public', 'legal-templates', 'debt-review-removal');
const MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const TEMPLATES = [
    {
        name: 'Notice of Motion',
        description: 'Primary application document to initiate debt review removal proceedings. Use for every standard removal case. Required for: C→G and D4→G paths.',
        fileName: '01_Notice_of_Motion.docx',
        category: 'LEGAL_TEMPLATE_DEBT_REVIEW_REMOVAL',
        acquisitionType: null,
    },
    {
        name: 'Founding Affidavit',
        description: 'Sworn statement supporting the application. Contains 3 scenarios: A (Full Payment 100%), B (Substantially Paid 90%+), C (Changed Circumstances). Delete unused scenarios before filing. Attach annexures A–G.',
        fileName: '02_Founding_Affidavit.docx',
        category: 'LEGAL_TEMPLATE_DEBT_REVIEW_REMOVAL',
        acquisitionType: null,
    },
    {
        name: 'Notice of Set Down',
        description: 'Schedules the hearing date with the court. Use after the 10-day opposition period expires. Two versions: Unopposed (no answering affidavits) and Opposed.',
        fileName: '03_Notice_of_Set_Down.docx',
        category: 'LEGAL_TEMPLATE_DEBT_REVIEW_REMOVAL',
        acquisitionType: null,
    },
    {
        name: 'Notice of Motion in Rescission',
        description: 'Specialised rescission application under Rule 42 of the Uniform Rules. Use for complex cases with stronger legal grounds (5 legal bases: A–E). More technical than standard Notice of Motion.',
        fileName: '04_Notice_of_Motion_Rescission.docx',
        category: 'LEGAL_TEMPLATE_DEBT_REVIEW_REMOVAL',
        acquisitionType: null,
    },
    {
        name: 'Court Order Granted',
        description: 'Template of the final court order. Submit as draft order with application. Includes directives to credit bureaus (7-day deadline), NCR (14-day compliance), and all credit providers. Select cost option (A–D).',
        fileName: '05_Court_Order_Granted.docx',
        category: 'LEGAL_TEMPLATE_DEBT_REVIEW_REMOVAL',
        acquisitionType: null,
    },
    {
        name: 'Proof of Service',
        description: 'Legal proof that all parties were properly served. Three formats: A (Sheriff Return — most formal), B (Attorney/Agent Affidavit), C (Email Service Certificate). Complete for every party served.',
        fileName: '06_Proof_of_Service.docx',
        category: 'LEGAL_TEMPLATE_DEBT_REVIEW_REMOVAL',
        acquisitionType: null,
    },
];

async function main() {
    console.log('Seeding debt review removal legal templates...\n');

    for (const t of TEMPLATES) {
        const filePath = join(PUBLIC_DIR, t.fileName);
        let fileSize = 0;
        try {
            fileSize = statSync(filePath).size;
        } catch {
            console.warn(`  ⚠️  File not found: ${filePath} — skipping`);
            continue;
        }

        const fileUrl = `${BASE_URL}/${t.fileName}`;

        // Upsert so re-running is safe
        const existing = await prisma.documentResource.findFirst({
            where: { name: t.name, category: t.category },
        });

        if (existing) {
            await prisma.documentResource.update({
                where: { id: existing.id },
                data: {
                    description: t.description,
                    fileUrl,
                    fileSize,
                    mimeType: MIME,
                },
            });
            console.log(`  ✏️  Updated: ${t.name}`);
        } else {
            await prisma.documentResource.create({
                data: {
                    name: t.name,
                    description: t.description,
                    fileUrl,
                    fileSize,
                    mimeType: MIME,
                    category: t.category,
                    acquisitionType: t.acquisitionType,
                },
            });
            console.log(`  ✅  Created: ${t.name}`);
        }
    }

    console.log('\n✅ Legal templates seeded successfully.');
    console.log('   Visible in admin panel under: Resources → Legal Templates - Debt Review Removal');
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
