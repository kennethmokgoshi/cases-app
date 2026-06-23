import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { z } from 'zod';

const logger = createLogger('api/cases/[id]/dhs-decline/draft-client-email');

const BodySchema = z.object({
    declineReason: z.string().min(1, 'Decline reason is required'),
});

/**
 * POST /api/cases/[id]/dhs-decline/draft-client-email
 *
 * Staff-triggered endpoint to draft an email to the client based on the decline reason.
 * Uses your decline-response prompt logic to auto-draft a personalized template.
 *
 * Body: { declineReason: string }
 * Returns: { clientName, clientId, idNumber, caseId, currentDc, declineReason, draftEmail }
 */
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
        const parsed = BodySchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0]?.message || 'Invalid request body' },
                { status: 400 }
            );
        }

        const { declineReason } = parsed.data;

        // Fetch case with client and DC details
        const caseData = await prisma.case.findUnique({
            where: { id: caseId },
            select: {
                id: true,
                fileNumber: true,
                clientId: true,
                currentDCId: true,
                client: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        idNumber: true,
                        whatsappNumber: true,
                    },
                },
                currentDC: {
                    select: {
                        id: true,
                        ncrdcNo: true,
                        tradingName: true,
                        fullName: true,
                    },
                },
            },
        });

        if (!caseData || !caseData.client) {
            return NextResponse.json({ error: 'Case or client not found' }, { status: 404 });
        }

        if (!caseData.currentDC) {
            return NextResponse.json({ error: 'Current DC not found' }, { status: 404 });
        }

        // Draft the email based on decline reason
        const draftEmail = draftClientConsentEmail({
            clientName: `${caseData.client.firstName} ${caseData.client.lastName}`,
            clientId: caseData.client.id,
            idNumber: caseData.client.idNumber,
            caseId: caseData.id,
            currentDc: caseData.currentDC.tradingName || caseData.currentDC.fullName || `DC ${caseData.currentDC.ncrdcNo}`,
            declineReason,
        });

        return NextResponse.json({
            clientName: `${caseData.client.firstName} ${caseData.client.lastName}`,
            clientId: caseData.client.id,
            idNumber: caseData.client.idNumber,
            caseId: caseData.id,
            currentDc: caseData.currentDC.tradingName || caseData.currentDC.fullName || `DC ${caseData.currentDC.ncrdcNo}`,
            declineReason,
            draftEmail,
            whatsappNumber: caseData.client.whatsappNumber || null,
        });
    } catch (error) {
        logger.error('Error drafting client email:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

/**
 * Draft a WhatsApp email to the client based on the decline reason.
 * Addresses the specific objection and requests clear action.
 */
function draftClientConsentEmail(params: {
    clientName: string;
    clientId: string;
    idNumber: string;
    caseId: string;
    currentDc: string;
    declineReason: string;
}): string {
    const { clientName, idNumber, currentDc, declineReason } = params;
    const r = declineReason.toUpperCase();

    let body = '';

    // Address the specific reason
    if (
        r.includes('UNABLE TO CONFIRM TRANSFER WITH CLIENT') ||
        r.includes('CLIENT HAS NOT CONSENTED') ||
        r.includes('CONFIRM WITH CLIENT') ||
        r.includes('CLIENT CONTACT')
    ) {
        body = `Hi ${clientName.split(' ')[0]},\n\nYour debt counsellor transfer application has been received, but ${currentDc} (current DC) needs you to confirm directly with them that you want to proceed.\n\nPlease contact your current debt counsellor as soon as possible and confirm in writing (via email or WhatsApp) that you consent to the transfer. Once they have your confirmation, the transfer can move forward.\n\nIf you have any questions, please let us know.\n\nBest regards,\nZenowethu Team`;
    } else if (r.includes('CLIENT MUST CONTACT') || r.includes('CLIENT TO CONTACT') || r.includes('CONSUMER TO CONTACT')) {
        body = `Hi ${clientName.split(' ')[0]},\n\nYour debt counsellor transfer is waiting on your action. Your current debt counsellor ${currentDc} requires you to contact them directly to proceed with the transfer.\n\nPlease reach out to them today and confirm that you want to move forward with the transfer. Make sure to mention your case ID: ${idNumber.slice(-4)}\n\nOnce you've done this, we can continue with the process.\n\nThank you,\nZenowethu Team`;
    } else if (r.includes('NOT YET CONSENTED') || r.includes('NOT CONSENT')) {
        body = `Hi ${clientName.split(' ')[0]},\n\nWe're following up on your debt counsellor transfer. ${currentDc} is waiting for your formal consent before they can approve the transfer.\n\nPlease contact your debt counsellor to provide your written consent to the transfer. This is a necessary step for the process to continue.\n\nThank you,\nZenowethu Team`;
    } else if (r.includes('CONSUMER CONSENT') || r.includes('KINDLY REQUEST THAT CLIENT CONTACTS')) {
        body = `Hi ${clientName.split(' ')[0]},\n\nYour debt counsellor has requested that you confirm your consent to the transfer directly with them. This is a standard requirement in the debt review process.\n\nPlease contact ${currentDc} today and confirm that you want to proceed. Once they have your confirmation, the transfer will be approved.\n\nThank you,\nZenowethu Team`;
    } else {
        // Generic template for unmatched reasons
        body = `Hi ${clientName.split(' ')[0]},\n\nWe're following up on your debt counsellor transfer application. Your current debt counsellor has indicated that they need further information or action from you before the transfer can be approved.\n\nPlease contact ${currentDc} to find out what is needed and ensure the transfer can proceed.\n\nIf you need any assistance, please let us know.\n\nBest regards,\nZenowethu Team`;
    }

    return body;
}
