import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { z } from 'zod';

const logger = createLogger('api/admin/credit-providers/[id]/service-consents');

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const MetadataSchema = z.object({
    title: z.string().min(1).max(200).optional(),
    receivedFrom: z.string().max(200).optional(),
    effectiveDate: z.string().date().optional(),
    expiresAt: z.string().date().optional(),
    notes: z.string().max(1000).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

type ServiceConsentSession = {
    user?: {
        isAdmin?: boolean;
        isExecutive?: boolean;
        isSeniorManager?: boolean;
    };
} | null | undefined;

function canMutateServiceConsents(session: ServiceConsentSession): boolean {
    return Boolean(
        session?.user?.isAdmin ||
        session?.user?.isExecutive ||
        session?.user?.isSeniorManager
    );
}

function cleanText(value: FormDataEntryValue | null): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function safeFileName(fileName: string): string {
    const parsed = path.parse(fileName);
    const base = parsed.name.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'service-consent';
    const ext = parsed.ext.replace(/[^a-zA-Z0-9.]/g, '').slice(0, 12);
    return `${base}${ext || '.pdf'}`;
}

function toDate(value: string | undefined): Date | null {
    return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

export async function GET(_request: Request, { params }: RouteContext) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const provider = await prisma.creditProvider.findUnique({
            where: { id },
            select: { id: true, name: true },
        });
        if (!provider) {
            return NextResponse.json({ error: 'Credit provider not found' }, { status: 404 });
        }

        const documents = await prisma.creditProviderServiceConsentDocument.findMany({
            where: { creditProviderId: id },
            orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
            include: {
                uploadedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
            },
        });

        return NextResponse.json({ provider, documents });
    } catch (error) {
        logger.error('Error fetching service consent documents:', error);
        return NextResponse.json({ error: 'Failed to fetch service consent documents' }, { status: 500 });
    }
}

export async function POST(request: Request, { params }: RouteContext) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if (!canMutateServiceConsents(session)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { id } = await params;
        const provider = await prisma.creditProvider.findUnique({
            where: { id },
            select: { id: true, name: true },
        });
        if (!provider) {
            return NextResponse.json({ error: 'Credit provider not found' }, { status: 404 });
        }

        const formData = await request.formData();
        const file = formData.get('file');
        if (!(file instanceof File)) {
            return NextResponse.json({ error: 'A consent-service document file is required' }, { status: 422 });
        }
        if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
            return NextResponse.json({ error: 'File must be between 1 byte and 25MB' }, { status: 422 });
        }
        if (!ALLOWED_MIME_TYPES.has(file.type)) {
            return NextResponse.json({ error: 'Only PDF, Word, JPEG, PNG, or WebP documents are supported' }, { status: 422 });
        }

        const parsed = MetadataSchema.safeParse({
            title: cleanText(formData.get('title')),
            receivedFrom: cleanText(formData.get('receivedFrom')),
            effectiveDate: cleanText(formData.get('effectiveDate')),
            expiresAt: cleanText(formData.get('expiresAt')),
            notes: cleanText(formData.get('notes')),
        });
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 });
        }

        const originalName = safeFileName(file.name);
        const storedName = `${new Date().toISOString().slice(0, 10)}-${randomUUID()}-${originalName}`;
        const relativeDir = path.join('credit-provider-service-consents', id);
        const uploadDir = path.join(process.cwd(), 'storage', 'uploads', relativeDir);
        if (!existsSync(uploadDir)) {
            await mkdir(uploadDir, { recursive: true });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        await writeFile(path.join(uploadDir, storedName), buffer);

        const document = await prisma.creditProviderServiceConsentDocument.create({
            data: {
                creditProviderId: id,
                title: parsed.data.title ?? file.name,
                fileName: file.name,
                fileUrl: `/uploads/${relativeDir.replace(/\\/g, '/')}/${storedName}`,
                fileSize: file.size,
                mimeType: file.type,
                receivedFrom: parsed.data.receivedFrom ?? null,
                effectiveDate: toDate(parsed.data.effectiveDate),
                expiresAt: toDate(parsed.data.expiresAt),
                notes: parsed.data.notes ?? null,
                uploadedById: session.user.id,
            },
        });

        logger.info('Credit provider service consent document uploaded', {
            providerId: id,
            providerName: provider.name,
            documentId: document.id,
            userId: session.user.id,
        });

        return NextResponse.json({ document }, { status: 201 });
    } catch (error) {
        logger.error('Error uploading service consent document:', error);
        return NextResponse.json({ error: 'Failed to upload service consent document' }, { status: 500 });
    }
}
