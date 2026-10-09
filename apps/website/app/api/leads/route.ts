/**
 * Website Lead Capture API
 * POST /api/leads — Saves a new lead from the assessment form, then
 *                    notifies all admin users via email.
 *
 * Abuse controls: per-IP rate limit, a honeypot field bots fill in, and
 * duplicate detection on the mobile number (duplicates are saved with status
 * DUPLICATE and do not re-notify staff).
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@zenowethu/database';
import { sendInternalNotification } from '@zenowethu/shared-lib/src/notifications/service';
import { checkRateLimit, clientIpFromHeaders } from '@zenowethu/shared-lib/src/auth/rate-limit';
import { createLogger } from '@zenowethu/shared-lib/src/logger';
import { getCompanyProfile } from '@zenowethu/shared-lib/src/company/company-profile-service';
import { getPlatformConfig } from '@zenowethu/shared-lib/src/company/profile';
import {
    CLOSED_LEAD_STATUSES,
    DUPLICATE_WINDOW_DAYS,
    LEAD_RATE_LIMIT,
    LEAD_RATE_WINDOW_MS,
    normalisePhone,
    phoneVariants,
} from '../../../lib/leads';

const logger = createLogger('website-leads');

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
    /** Honeypot — hidden from people, so any value means a bot filled the form. */
    website:      z.string().max(500).optional().nullable(),
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
        const ip = clientIpFromHeaders(request.headers);
        const limit = checkRateLimit(`website-lead:${ip}`, LEAD_RATE_LIMIT, LEAD_RATE_WINDOW_MS);
        if (!limit.allowed) {
            logger.warn({ ip }, 'Lead submission rate limited');
            const { phone } = await getCompanyProfile();
            return NextResponse.json(
                { error: `Too many submissions. Please try again later or call us on ${phone}.` },
                { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
            );
        }

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

        // ── Honeypot: pretend success so the bot learns nothing ───────────
        if (data.website?.trim()) {
            logger.warn({ ip }, 'Lead submission rejected by honeypot');
            return NextResponse.json({ success: true }, { status: 201 });
        }

        const phone = normalisePhone(data.phone);

        // ── Duplicate check: same mobile, still open, recent ──────────────
        const since = new Date(Date.now() - DUPLICATE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
        const existing = await prisma.lead.findFirst({
            where: {
                phone:     { in: phoneVariants(phone) },
                status:    { notIn: CLOSED_LEAD_STATUSES },
                createdAt: { gte: since },
            },
            orderBy: { createdAt: 'desc' },
            select:  { id: true },
        });

        // ── Save lead to database ─────────────────────────────────────────
        const lead = await prisma.lead.create({
            data: {
                firstName:    data.firstName,
                lastName:     data.lastName,
                idNumber:     data.idNumber || null,
                phone,
                email:        data.email || null,
                service:      data.service,
                status:       existing ? 'DUPLICATE' : 'NEW',
                source:       'WEBSITE_ASSESSMENT',
                popiaConsent: data.popiaConsent,
                notes:        existing
                    ? `Possible duplicate of lead ${existing.id} (same mobile number within ${DUPLICATE_WINDOW_DAYS} days).`
                    : null,
            },
        });

        if (existing) {
            logger.info({ leadId: lead.id, duplicateOf: existing.id }, 'Duplicate website lead saved');
            return NextResponse.json({ success: true, id: lead.id }, { status: 201 });
        }

        // ── Notify admins (non-blocking) ──────────────────────────────────
        const leadsUrl = `${(process.env.CASES_APP_URL || getPlatformConfig().url).replace(/\/+$/, '')}/leads`;
        const serviceLabel = SERVICE_LABELS[data.service] ?? data.service;

        sendInternalNotification({
            role: 'ADMIN',
            statusCode: 'WEBSITE_LEAD',
            variables: {
                clientName:   `${data.firstName} ${data.lastName}`,
                service:      serviceLabel,
                phone,
                email:        data.email || 'Not provided',
                idNumber:     data.idNumber || 'Not provided',
                popiaConsent: data.popiaConsent ? 'Accepted' : 'Not accepted',
                leadsUrl,
            },
        }).catch((err: unknown) => {
            // Non-blocking — lead is saved regardless of notification outcome
            logger.error({ err, leadId: lead.id }, 'Admin notification for website lead failed');
        });

        return NextResponse.json(
            { success: true, id: lead.id },
            { status: 201 },
        );
    } catch (error) {
        logger.error({ err: error }, 'Failed to save website lead');
        const { phone } = await getCompanyProfile();
        return NextResponse.json(
            { error: `Failed to save your enquiry. Please try again or call us on ${phone}.` },
            { status: 500 },
        );
    }
}
