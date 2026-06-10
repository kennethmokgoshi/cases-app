'use server';

import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { auth, createLogger, getSMTPCredentials } from '@zenowethu/shared-lib';
import { z } from 'zod';
import { parseBody } from '@/lib/schemas';

const logger = createLogger('api/admin/settings/smtp/test');

// All fields optional — anything omitted (or a masked password) falls back to the
// currently saved credentials, so admins can test before or after saving.
const SmtpTestSchema = z.object({
    host:      z.string().min(1).max(200).optional(),
    port:      z.coerce.number().int().min(1).max(65535).optional(),
    secure:    z.boolean().optional(),
    username:  z.string().max(200).optional(),
    password:  z.string().max(200).optional(),
});

// POST /api/admin/settings/smtp/test — verify SMTP login (EHLO + AUTH only, no email sent)
export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin && !session?.user?.isExecutive) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const parsed = parseBody(SmtpTestSchema, await request.json().catch(() => ({})));
        if (!parsed.success) return parsed.response;
        const override = parsed.data as z.infer<typeof SmtpTestSchema>;

        const saved = await getSMTPCredentials();
        const effective = {
            host:     override.host || saved.host,
            port:     override.port ?? saved.port,
            secure:   override.secure ?? saved.secure,
            username: override.username || saved.username,
            password: (override.password && !override.password.includes('•')) ? override.password : saved.password,
        };

        if (!effective.host || !effective.username || !effective.password) {
            return NextResponse.json(
                { success: false, error: 'SMTP host, email address, and password must be configured before testing' },
                { status: 400 },
            );
        }

        const transporter = nodemailer.createTransport({
            host:   effective.host,
            port:   effective.port,
            secure: effective.secure,
            auth:   { user: effective.username, pass: effective.password },
            tls:    { rejectUnauthorized: false },
            connectionTimeout: 15000,
        });

        try {
            await transporter.verify();
            logger.info(`SMTP test OK for ${effective.username}@${effective.host} (by ${session.user.id})`);
            return NextResponse.json({ success: true, message: `Login successful as ${effective.username}` });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            logger.warn(`SMTP test failed for ${effective.username}@${effective.host}: ${message}`);
            return NextResponse.json({ success: false, error: message }, { status: 200 });
        }
    } catch (error) {
        logger.error('Error testing SMTP connection:', error);
        return NextResponse.json({ error: 'Failed to test SMTP connection' }, { status: 500 });
    }
}
