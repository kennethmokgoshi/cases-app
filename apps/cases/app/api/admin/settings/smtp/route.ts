'use server';

import { NextResponse } from 'next/server';
import { auth, createLogger, invalidateSMTPCredentialsCache } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { z } from 'zod';
import { parseBody } from '@/lib/schemas';

const logger = createLogger('api/admin/settings/smtp');

const SmtpSettingsSchema = z.object({
    host:      z.string().min(1, 'SMTP host is required').max(200),
    port:      z.coerce.number().int().min(1).max(65535).default(587),
    secure:    z.boolean().default(false),
    username:  z.string().email('Username must be a valid email address').max(200),
    password:  z.string().min(1, 'Password is required').max(200),
    fromEmail: z.string().email('From address must be a valid email').max(200),
});

const SETTING_DESCRIPTIONS: Record<string, string> = {
    smtp_host:     'SMTP Server Host',
    smtp_port:     'SMTP Server Port',
    smtp_secure:   'SMTP Use TLS/SSL (port 465)',
    smtp_user:     'SMTP Login Email Address',
    smtp_password: 'SMTP Login Password',
    smtp_from:     'Email From Address',
};

async function upsertSetting(key: string, value: string, isEncrypted = false) {
    await prisma.systemSettings.upsert({
        where: { key },
        update: { value, updatedAt: new Date() },
        create: {
            key,
            value,
            category: 'smtp',
            description: SETTING_DESCRIPTIONS[key] ?? key,
            isEncrypted,
        },
    });
}

// GET /api/admin/settings/smtp — Retrieve current SMTP settings (password masked)
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin && !session?.user?.isExecutive) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const smtpSettings = await prisma.systemSettings.findMany({
            where: { category: 'smtp' },
            select: { key: true, value: true, updatedAt: true },
        });

        const settings: Record<string, string> = {};
        let lastUpdated: Date | null = null;

        for (const s of smtpSettings) {
            if (s.key === 'smtp_password') {
                settings[s.key] = s.value ? '••••••••' : '';
            } else {
                settings[s.key] = s.value;
            }
            if (!lastUpdated || s.updatedAt > lastUpdated) {
                lastUpdated = s.updatedAt;
            }
        }

        // Fallback to environment defaults if nothing stored yet
        if (Object.keys(settings).length === 0) {
            settings.smtp_host = process.env.SMTP_HOST || '';
            settings.smtp_port = process.env.SMTP_PORT || '587';
            settings.smtp_secure = process.env.SMTP_SECURE === 'true' ? 'true' : 'false';
            settings.smtp_user = process.env.SMTP_USER || '';
            settings.smtp_password = (process.env.SMTP_PASSWORD || process.env.SMTP_PASS) ? '••••••••' : '';
            settings.smtp_from = process.env.EMAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || '';
        }

        return NextResponse.json({ settings, lastUpdated });
    } catch (error) {
        logger.error('Error fetching SMTP settings:', error);
        return NextResponse.json({ error: 'Failed to fetch SMTP settings' }, { status: 500 });
    }
}

// POST /api/admin/settings/smtp — Save SMTP settings
export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin && !session?.user?.isExecutive) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const parsed = parseBody(SmtpSettingsSchema, await request.json());
        if (!parsed.success) return parsed.response;
        const { host, port, secure, username, password, fromEmail } = parsed.data as z.infer<typeof SmtpSettingsSchema>;

        await upsertSetting('smtp_host', host);
        await upsertSetting('smtp_port', String(port));
        await upsertSetting('smtp_secure', secure ? 'true' : 'false');
        await upsertSetting('smtp_user', username);
        await upsertSetting('smtp_from', fromEmail);

        // Only update password if a real value is provided (not the masked placeholder)
        if (password && !password.includes('•')) {
            await upsertSetting('smtp_password', password, true);
        }

        // Invalidate the cache so the new credentials are picked up immediately
        invalidateSMTPCredentialsCache();

        logger.info(`SMTP settings updated by admin ${session.user.id}`);
        return NextResponse.json({ success: true, message: 'Email (SMTP) settings updated successfully' });
    } catch (error) {
        logger.error('Error updating SMTP settings:', error);
        return NextResponse.json({ error: 'Failed to update SMTP settings' }, { status: 500 });
    }
}

// DELETE /api/admin/settings/smtp — Reset to environment defaults
export async function DELETE() {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin && !session?.user?.isExecutive) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await prisma.systemSettings.deleteMany({ where: { category: 'smtp' } });

        // Invalidate the cache so the next request re-reads from env
        invalidateSMTPCredentialsCache();

        logger.info(`SMTP settings reset by admin ${session?.user?.id}`);
        return NextResponse.json({ success: true, message: 'Email (SMTP) settings reset to defaults' });
    } catch (error) {
        logger.error('Error resetting SMTP settings:', error);
        return NextResponse.json({ error: 'Failed to reset SMTP settings' }, { status: 500 });
    }
}
