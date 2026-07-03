/**
 * Website Lead Capture API
 * POST /api/leads — Saves a new lead from the assessment form, then
 *                    notifies all admin users via email.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@zenowethu/database';
import { sendInternalNotification } from '@zenowethu/shared-lib/src/notifications/service';

// ─── Validation schema ─────────────────────────────────────────────────────

const LeadSubmitSchema = z.object({
    firstName:    z.string().min(1, 'First name is required').max(100).trim(),
    lastName:     z.string().min(1, 'Surname is required').max(100).trim(),
    idNumber:     z.string().max(13).optional().nullable(),
    phone:        z.string().min(10, 'Valid mobile number required').max(20).trim(),
    email:        z.string().email('Valid email required').optional().nullable().or(z.literal('')),
    service:      z.enum(['debt-review-removal', 'court-rescission', 'credit-repair', 'insurance'], {
                      error: 'Please select a valid service',
                  }),
    popiaConsent: z.boolean().refine(v => v === true, 'You must accept the POPIA consent to proceed'),
});

// ─── Service display labels ────────────────────────────────────────────────

const SERVICE_LABELS: Record<string, string> = {
    'debt-review-removal': 'Debt Review Removal (17.W)',
    'court-rescission':    'Court Order Rescission',
    'credit-repair':       'Credit Repair / Judgments',
    'insurance':           'Lower Insurance Premiums',
};

// ─── POST handler ──────────────────────────────────────────────────────────

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => null);
        if (!body) {
            return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
        }

        const parsed = LeadSubmitSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
                { status: 422 },
            );
        }

        const data = parsed.data;

        // ── Save lead to database ─────────────────────────────────────────
        const lead = await prisma.lead.create({
            data: {
                firstName:    data.firstName,
                lastName:     data.lastName,
                idNumber:     data.idNumber || null,
                phone:        data.phone,
                email:        data.email || null,
                service:      data.service,
                status:       'NEW',
                source:       'WEBSITE_ASSESSMENT',
                popiaConsent: data.popiaConsent,
            },
        });

        // ── Notify admins (non-blocking) ──────────────────────────────────
        const leadsUrl = `${process.env.CASES_APP_URL || 'https://app.zenowethu.co.za'}/leads`;
        const serviceLabel = SERVICE_LABELS[data.service] ?? data.service;

        sendInternalNotification({
            role: 'ADMIN',
            statusCode: 'WEBSITE_LEAD',
            variables: {
                clientName:   `${data.firstName} ${data.lastName}`,
                service:      serviceLabel,
                phone:        data.phone,
                email:        data.email || 'Not provided',
                idNumber:     data.idNumber || 'Not provided',
                popiaConsent: data.popiaConsent ? 'Accepted' : 'Not accepted',
                leadsUrl,
            },
        }).catch(() => {
            // Non-blocking — lead is saved regardless of notification outcome
        });

        return NextResponse.json(
            { success: true, id: lead.id },
            { status: 201 },
        );
    } catch (error) {
        console.error('[leads API] Error:', error);
        return NextResponse.json(
            { error: 'Failed to save your enquiry. Please try again or call us on 081 747 7616.' },
            { status: 500 },
        );
    }
}
