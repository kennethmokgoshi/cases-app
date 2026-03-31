'use server';

import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const logger = createLogger('api/admin/settings/letterhead');

const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'letterhead');
const SETTINGS_KEY = 'letterhead_url';
const SETTINGS_CATEGORY = 'branding';

function isAuthorized(session: { user?: { isAdmin?: boolean; isExecutive?: boolean } | null } | null): boolean {
    return !!(session?.user?.isAdmin || session?.user?.isExecutive);
}

// GET /api/admin/settings/letterhead — return current letterhead URL and metadata
export async function GET() {
    try {
        const session = await auth();
        if (!isAuthorized(session)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const setting = await prisma.systemSettings.findUnique({
            where: { key: SETTINGS_KEY },
        });

        return NextResponse.json({
            url: setting?.value ?? null,
            updatedAt: setting?.updatedAt ?? null,
        });
    } catch (error) {
        logger.error('Error fetching letterhead setting:', error);
        return NextResponse.json({ error: 'Failed to fetch letterhead' }, { status: 500 });
    }
}

// POST /api/admin/settings/letterhead — upload new letterhead (multipart/form-data)
export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!isAuthorized(session)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const formData = await request.formData();
        const file = formData.get('file');

        if (!file || !(file instanceof File)) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        if (!ALLOWED_MIME_TYPES.includes(file.type)) {
            return NextResponse.json(
                { error: 'Invalid file type. Allowed: PNG, JPEG, WebP, PDF' },
                { status: 400 }
            );
        }

        if (file.size > MAX_FILE_SIZE_BYTES) {
            return NextResponse.json(
                { error: 'File too large. Maximum size is 5 MB' },
                { status: 400 }
            );
        }

        // Ensure upload directory exists
        if (!existsSync(UPLOAD_DIR)) {
            await mkdir(UPLOAD_DIR, { recursive: true });
        }

        // Delete previous letterhead file if one exists
        const existing = await prisma.systemSettings.findUnique({ where: { key: SETTINGS_KEY } });
        if (existing?.value) {
            const oldRelative = existing.value.replace('/uploads/letterhead/', '');
            const oldPath = path.join(UPLOAD_DIR, oldRelative);
            if (existsSync(oldPath)) {
                await unlink(oldPath).catch(() => {
                    // Non-fatal — old file may already be gone
                });
            }
        }

        // Save new file with a timestamp-based name to avoid caching issues
        const ext = file.name.split('.').pop() ?? 'png';
        const fileName = `letterhead-${Date.now()}.${ext}`;
        const filePath = path.join(UPLOAD_DIR, fileName);
        const buffer = Buffer.from(await file.arrayBuffer());
        await writeFile(filePath, buffer);

        const publicUrl = `/uploads/letterhead/${fileName}`;

        // Persist URL to SystemSettings
        await prisma.systemSettings.upsert({
            where: { key: SETTINGS_KEY },
            update: { value: publicUrl, updatedAt: new Date() },
            create: {
                key: SETTINGS_KEY,
                value: publicUrl,
                category: SETTINGS_CATEGORY,
                description: 'Zenowethu letterhead image URL — used on generated NCA documents',
                isEncrypted: false,
            },
        });

        logger.info(`Letterhead uploaded by user ${session?.user?.id}: ${publicUrl}`);

        return NextResponse.json({ success: true, url: publicUrl });
    } catch (error) {
        logger.error('Error uploading letterhead:', error);
        return NextResponse.json({ error: 'Failed to upload letterhead' }, { status: 500 });
    }
}

// DELETE /api/admin/settings/letterhead — remove current letterhead
export async function DELETE() {
    try {
        const session = await auth();
        if (!isAuthorized(session)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const existing = await prisma.systemSettings.findUnique({ where: { key: SETTINGS_KEY } });

        if (existing?.value) {
            const fileName = existing.value.replace('/uploads/letterhead/', '');
            const filePath = path.join(UPLOAD_DIR, fileName);
            if (existsSync(filePath)) {
                await unlink(filePath).catch(() => {});
            }
        }

        await prisma.systemSettings.deleteMany({ where: { key: SETTINGS_KEY } });

        logger.info(`Letterhead removed by user ${session?.user?.id}`);

        return NextResponse.json({ success: true, message: 'Letterhead removed' });
    } catch (error) {
        logger.error('Error removing letterhead:', error);
        return NextResponse.json({ error: 'Failed to remove letterhead' }, { status: 500 });
    }
}
