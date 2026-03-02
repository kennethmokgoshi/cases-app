import { NextResponse } from 'next/server';
import { SmtpEmailProvider, logger } from '@zenowethu/shared-lib';

export async function POST(request: Request) {
    try {
        const { to } = await request.json();

        if (!to) {
            return NextResponse.json({ error: 'To address is required' }, { status: 400 });
        }

        // Use hardcoded credentials for this specific test as requested by user
        const provider = new SmtpEmailProvider({
            host: 'mail.zenowethu.co.za',
            port: 587,
            secure: false, // Port 587 is usually STARTTLS, not implicit SSL (465)
            auth: {
                user: 'transfer@zenowethu.co.za',
                pass: 'Transfer@D2025'
            },
            fromEmail: 'transfer@zenowethu.co.za'
        });

        const result = await provider.send(
            to,
            'Test Email from Zenowethu System',
            '<h1>It Works!</h1><p>This is a test email sent from the Zenowethu system using the new transfer@zenowethu.co.za account.</p>',
            'It Works! This is a test email sent from the Zenowethu system using the new transfer@zenowethu.co.za account.'
        );

        return NextResponse.json(result);
    } catch (error: any) {
        logger.error('Test email failed:', error);
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
}
