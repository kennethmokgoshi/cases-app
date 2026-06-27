import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import {
    auth,
    createLogger,
    provisionConsumerForClient,
    sendTransactionalEmail,
    renderBrandedEmail,
} from '@zenowethu/shared-lib';
import { z } from 'zod';

const logger = createLogger('api/cases/[id]/document-requests');

const VALID_CATEGORIES = ['IDENTITY', 'INCOME', 'BUREAU', 'LEGAL', 'CORRESPONDENCE'] as const;

const CreateSchema = z.object({
    category: z.enum(VALID_CATEGORIES),
    label: z.string().min(1, 'A description of the required document is required').max(200),
    notes: z.string().max(1000).optional(),
});

/** Resolve (and auto-provision if needed) the Credo consumer for a case's primary client. */
async function resolveConsumerForCase(caseId: string): Promise<{ consumerId: string; email: string | null } | null> {
    const c = await prisma.case.findUnique({
        where: { id: caseId },
        select: { clientId: true, client: { select: { id: true, consumerAccount: { select: { id: true, email: true } } } } },
    });
    if (!c?.client) return null;
    if (c.client.consumerAccount) {
        return { consumerId: c.client.consumerAccount.id, email: c.client.consumerAccount.email };
    }
    // No profile yet — provision one (won't email here; caller decides).
    const result = await provisionConsumerForClient(c.client.id);
    if (!result) return null;
    const consumer = await prisma.consumerAccount.findUnique({
        where: { id: result.consumerId },
        select: { id: true, email: true },
    });
    return consumer ? { consumerId: consumer.id, email: consumer.email } : null;
}

// GET — list document requests for this case
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const { id: caseId } = await params;

        const requests = await prisma.documentRequest.findMany({
            where: { caseId },
            select: {
                id: true,
                category: true,
                label: true,
                notes: true,
                status: true,
                createdAt: true,
                reviewedAt: true,
                fulfilledDoc: { select: { id: true, originalName: true, createdAt: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json({ requests });
    } catch (error) {
        logger.error('Error fetching document requests:', error);
        return NextResponse.json({ error: 'Failed to fetch document requests' }, { status: 500 });
    }
}

// POST — staff requests a document from the consumer
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const { id: caseId } = await params;

        const body = await request.json();
        const parsed = CreateSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        }

        const consumer = await resolveConsumerForCase(caseId);
        if (!consumer) {
            return NextResponse.json(
                { error: 'This case has no client with a valid ID number, so no Credo profile could be created to request documents from.' },
                { status: 400 }
            );
        }

        const docRequest = await prisma.documentRequest.create({
            data: {
                consumerId: consumer.consumerId,
                caseId,
                category: parsed.data.category,
                label: parsed.data.label,
                notes: parsed.data.notes || null,
                requestedById: session.user.id,
            },
            select: { id: true, category: true, label: true, notes: true, status: true, createdAt: true },
        });

        // Notify the consumer by email (non-blocking, never breaks the request).
        if (consumer.email && !consumer.email.endsWith('@no-email.zenowethu.co.za')) {
            const html = renderBrandedEmail(
                `
                  <h2 style="margin:0 0 15px;color:#0B1D35;font-size:22px;">A document is needed for your case</h2>
                  <p style="margin:0 0 16px;color:#475569;font-size:16px;line-height:1.6">
                    Our team needs the following document to move your case forward:
                  </p>
                  <p style="margin:0 0 16px;color:#0F172A;font-size:16px;font-weight:600">${parsed.data.label}</p>
                  ${parsed.data.notes ? `<p style="margin:0 0 16px;color:#475569;font-size:15px;line-height:1.6">${parsed.data.notes}</p>` : ''}
                  <p style="margin:0;color:#475569;font-size:15px;line-height:1.6">
                    Log in to Credo with your 13-digit ID number and upload it under your Documents.
                  </p>
                `,
                {
                    title: 'Document required',
                    previewText: `Please upload: ${parsed.data.label}`,
                    button: { text: 'Upload my document →', url: `${process.env.CREDO_URL || 'https://credo.zenowethu.co.za'}/documents` },
                    companyName: 'Zenowethu Consulting (Credo)',
                },
            );
            sendTransactionalEmail({ to: consumer.email, subject: 'Action needed: a document is required for your case', html })
                .catch((err) => logger.error('Document-request email failed:', err));
        }

        return NextResponse.json({ request: docRequest }, { status: 201 });
    } catch (error) {
        logger.error('Error creating document request:', error);
        return NextResponse.json({ error: 'Failed to create document request' }, { status: 500 });
    }
}
