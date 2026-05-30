/**
 * Seed: Debt Review Removal Legal Templates
 * Registers the 6 court document templates as DocumentResource records.
 *
 * Run from repo root:
 *   node packages/database/prisma/seed-legal-templates.js
 */

const { PrismaClient } = require('@prisma/client');
const { statSync } = require('fs');
const { join } = require('path');

const prisma = new PrismaClient();

const BASE_URL = '/legal-templates/debt-review-removal';
const PUBLIC_DIR = join(__dirname, '..', '..', '..', 'apps', 'cases', 'public', 'legal-templates', 'debt-review-removal');
const MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const TEMPLATES = [
    {
        name: 'Notice of Motion',
        description: 'Primary application document to initiate debt review removal proceedings. Use for every standard removal case. Required for C→G and D4→G paths. Insert case number, applicant details, all credit providers as respondents.',
        fileName: '01_Notice_of_Motion.docx',
        category: 'LEGAL_TEMPLATE_DEBT_REVIEW_REMOVAL',
    },
    {
        name: 'Founding Affidavit',
        description: 'Sworn statement supporting the application. Three scenarios — A: Full Payment (100%, success rate 95%+), B: Substantially Paid (90%+, 80–90%), C: Changed Circumstances (60–75%). Delete unused scenarios before filing. Attach annexures A–G.',
        fileName: '02_Founding_Affidavit.docx',
        category: 'LEGAL_TEMPLATE_DEBT_REVIEW_REMOVAL',
    },
    {
        name: 'Notice of Set Down',
        description: 'Schedules the hearing with the court. Use after the 10-day opposition period expires. Two versions: Unopposed and Opposed. Serve on all parties at least 10 days before hearing.',
        fileName: '03_Notice_of_Set_Down.docx',
        category: 'LEGAL_TEMPLATE_DEBT_REVIEW_REMOVAL',
    },
    {
        name: 'Notice of Motion in Rescission',
        description: 'Specialised rescission under Rule 42 of the Uniform Rules. Use for complex cases. Five legal grounds: A (Fulfilment), B (Changed Circumstances), C (Error in Proceedings), D (Absence), E (Interests of Justice).',
        fileName: '04_Notice_of_Motion_Rescission.docx',
        category: 'LEGAL_TEMPLATE_DEBT_REVIEW_REMOVAL',
    },
    {
        name: 'Court Order Granted',
        description: 'Template of the final court order. Submit as draft order with application. Includes directives to all credit bureaus (7-day deadline), NCR (14-day compliance), and all credit providers. Four cost options.',
        fileName: '05_Court_Order_Granted.docx',
        category: 'LEGAL_TEMPLATE_DEBT_REVIEW_REMOVAL',
    },
    {
        name: 'Proof of Service',
        description: 'Legal proof that all parties were properly served. Three formats: A (Sheriff Return), B (Attorney/Agent Affidavit), C (Email Service Certificate). File with court before set down.',
        fileName: '06_Proof_of_Service.docx',
        category: 'LEGAL_TEMPLATE_DEBT_REVIEW_REMOVAL',
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

        const existing = await prisma.documentResource.findFirst({
            where: { name: t.name, category: t.category },
        });

        if (existing) {
            await prisma.documentResource.update({
                where: { id: existing.id },
                data: { description: t.description, fileUrl, fileSize, mimeType: MIME },
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
                },
            });
            console.log(`  ✅  Created: ${t.name}`);
        }
    }

    console.log('\n✅ Done. Templates visible in admin panel under:');
    console.log('   Resources → Legal Templates - Debt Review Removal\n');
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
