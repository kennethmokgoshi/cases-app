import { NextResponse } from 'next/server';
import { z } from 'zod';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { prisma } from '@zenowethu/database';
import { createLogger, touchCaseAction } from '@zenowethu/shared-lib';
import { requireStaff } from '@zenowethu/shared-lib/src/auth/route-guards';
import {
    imagesToPdf,
    sniffImageKind,
    ImagesToPdfError,
    IMAGES_TO_PDF_LIMITS,
} from '@zenowethu/shared-lib/src/documents/images-to-pdf';

const logger = createLogger('api/cases/[id]/documents/images-to-pdf');

export const maxDuration = 120;

const IMAGE_PDF_TYPES = [
    'ID', 'POA', 'ZENOWETHU_POA', 'PAYSLIP', 'BANK_STATEMENT', 'PROOF_OF_RESIDENCE',
    'COURT_ORDER', 'AFFIDAVIT', 'CONSENT_FORM', 'INSURANCE_POLICY', 'OTHER',
] as const;

const FieldsSchema = z.object({
    type: z.enum(IMAGE_PDF_TYPES),
    layout: z.enum(['ID_SHEET', 'PAGES']),
    isAdminOnly: z.enum(['true', 'false']).optional(),
});

const safe = (name: string) => name.replace(/[^a-zA-Z0-9.-]/g, '_');

const EXT: Record<'jpeg' | 'png', string> = { jpeg: 'jpg', png: 'png' };

/**
 * POST multipart/form-data
 *   type, layout            — see FieldsSchema
 *   pages[]                 — the images placed on the PDF (JPEG/PNG, already rotated)
 *   originals[]             — the files as uploaded, kept in the vault alongside the PDF
 *                             (same count and order as pages[])
 */
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        // Staff only: referrer / B2B-partner portal users have no use for this feature
        // and must not be able to write into arbitrary cases by ID.
        const guard = await requireStaff();
        if (guard.response) return guard.response;
        const user = guard.user!;

        const { id: caseId } = await params;
        const caseRecord = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true } });
        if (!caseRecord) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

        const form = await request.formData().catch(() => null);
        if (!form) return NextResponse.json({ error: 'Invalid upload' }, { status: 400 });

        const fields = FieldsSchema.safeParse({
            type: form.get('type'),
            layout: form.get('layout'),
            isAdminOnly: form.get('isAdminOnly') ?? undefined,
        });
        if (!fields.success) {
            return NextResponse.json({ error: 'Invalid document type or layout' }, { status: 400 });
        }

        const pages = form.getAll('pages').filter((v): v is File => v instanceof File);
        const originals = form.getAll('originals').filter((v): v is File => v instanceof File);
        if (pages.length === 0) return NextResponse.json({ error: 'Add at least one image.' }, { status: 400 });
        if (pages.length !== originals.length) {
            return NextResponse.json({ error: 'Each image must include its original file.' }, { status: 400 });
        }
        if (originals.some((f) => f.size > IMAGES_TO_PDF_LIMITS.maxImageBytes)) {
            return NextResponse.json({ error: 'An original image is larger than 15 MB.' }, { status: 400 });
        }

        const pageBytes = await Promise.all(pages.map(async (f) => new Uint8Array(await f.arrayBuffer())));

        let pdfBytes: Uint8Array;
        try {
            pdfBytes = await imagesToPdf(pageBytes, fields.data.layout);
        } catch (error) {
            if (error instanceof ImagesToPdfError) {
                return NextResponse.json({ error: error.message }, { status: 400 });
            }
            throw error;
        }

        const { type, layout } = fields.data;
        const isAdmin = user.isAdmin === true;
        const isAdminOnly = isAdmin && fields.data.isAdminOnly === 'true';

        const uploadsDir = join(process.cwd(), 'storage', 'uploads', caseId);
        await mkdir(uploadsDir, { recursive: true });

        const stamp = Date.now();
        const label = type === 'ID' ? 'ID Document' : type === 'POA' ? 'Power of Attorney' : type.replace(/_/g, ' ');
        const pdfName = `${label}${layout === 'ID_SHEET' ? ' (front and back)' : ''}.pdf`;
        const pdfStored = `${stamp}-${safe(pdfName)}`;
        await writeFile(join(uploadsDir, pdfStored), pdfBytes);

        const pdfDoc = await prisma.document.create({
            data: {
                caseId,
                type,
                fileName: pdfName,
                fileUrl: `/uploads/${caseId}/${pdfStored}`,
                fileSize: pdfBytes.byteLength,
                mimeType: 'application/pdf',
                uploadedById: user.id,
                isAdminOnly,
            },
        });

        // Originals are kept for the record, typed OTHER so they never compete with
        // the PDF when automation looks for "the" ID / POA of a case.
        const originalDocs = [];
        for (const [i, file] of originals.entries()) {
            const bytes = new Uint8Array(await file.arrayBuffer());
            const kind = sniffImageKind(bytes);
            const ext = kind ? EXT[kind] : (file.name.split('.').pop() || 'bin');
            const side = layout === 'ID_SHEET' ? (i === 0 ? 'front' : 'back') : `page ${i + 1}`;
            const name = `${label} - ${side} (original).${safe(ext)}`;
            const stored = `${stamp}-${i + 1}-${safe(name)}`;
            await writeFile(join(uploadsDir, stored), bytes);
            originalDocs.push(await prisma.document.create({
                data: {
                    caseId,
                    type: 'OTHER',
                    fileName: name,
                    fileUrl: `/uploads/${caseId}/${stored}`,
                    fileSize: bytes.byteLength,
                    mimeType: file.type || (kind ? `image/${kind}` : 'application/octet-stream'),
                    uploadedById: user.id,
                    isAdminOnly,
                },
            }));
        }

        await touchCaseAction(caseId, 'DOCUMENT_UPLOAD', { userId: user.id });
        logger.info({ caseId, type, layout, images: pages.length }, 'Images combined into PDF');

        return NextResponse.json({ document: pdfDoc, originals: originalDocs });
    } catch (error) {
        logger.error({ error }, 'Failed to create PDF from images');
        return NextResponse.json({ error: 'Could not create the PDF. Please try again.' }, { status: 500 });
    }
}
