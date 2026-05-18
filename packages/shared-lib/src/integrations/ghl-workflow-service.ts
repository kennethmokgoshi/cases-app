import { prisma } from '@zenowethu/database';
import { logger } from '../logger';
import { GhlService } from './ghl-service';

export class GhlWorkflowService {
    /**
     * Called after a file is requested from the previous DC.
     * Applies 'dc_file_requested' to start GHL's automated follow-up chase sequence.
     */
    static async onFileRequestSent(caseId: string): Promise<void> {
        await GhlService.applyTags(caseId, ['dc_file_requested']);
        logger.info(`[GHL Workflow] DC file-request follow-up sequence started for case ${caseId}`);
    }

    /**
     * Called when a DC rejects the transfer (e.g. "fees owed", "missing docs").
     * Notifies the client via SMS + Email and records a system comment.
     */
    static async onDebtCounsellorRejection(caseId: string, reason: string): Promise<void> {
        const caseRecord = await prisma.case.findUnique({
            where: { id: caseId },
            include: { client: true },
        });
        if (!caseRecord) throw new Error(`Case not found: ${caseId}`);

        const smsText = `Hi ${caseRecord.client.firstName}, your debt review transfer was rejected by your current Debt Counsellor. Reason: ${reason}. Our team will contact you shortly.`;

        const emailHtml = `
<p>Hi ${caseRecord.client.firstName},</p>
<p>Your debt review transfer has been rejected by your current Debt Counsellor with the following reason:</p>
<blockquote style="border-left:3px solid #e53e3e;padding-left:12px;color:#c53030;">${reason}</blockquote>
<p>Our team will contact you shortly to discuss the next steps.</p>
<p>Regards,<br/>Zenowethu Debt Management<br/>012 035 1824</p>
        `.trim();

        await Promise.allSettled([
            GhlService.sendMessage(caseId, 'SMS', smsText),
            GhlService.sendMessage(caseId, 'EMAIL', emailHtml, `Transfer Update — ${caseRecord.fileNumber}`),
            GhlService.applyTags(caseId, ['dc_rejection']),
        ]);

        const systemUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
        await prisma.caseComment.create({
            data: {
                caseId,
                userId: systemUser?.id ?? 'system',
                content: `DC rejected transfer. Reason: ${reason}. Client notified via SMS and Email.`,
                type: 'SYSTEM',
                isInternal: true,
                activityType: 'STATUS_CHANGE',
            },
        });

        logger.info(`[GHL Workflow] DC rejection handled for case ${caseId}: ${reason}`);
    }

    /**
     * Called when a consumer's proof of payment is received and verified.
     * Confirms receipt to the client, forwards PoP to the DC, and applies tags.
     */
    static async onConsumerPayment(caseId: string, proofUrl: string): Promise<void> {
        const caseRecord = await prisma.case.findUnique({
            where: { id: caseId },
            include: { client: true },
        });
        if (!caseRecord) throw new Error(`Case not found: ${caseId}`);

        const confirmationSms = `Hi ${caseRecord.client.firstName}, we have received your proof of payment. We will forward this to the Debt Counsellor and follow up on your behalf.`;

        const dcEmailHtml = `
<p>Please find the attached proof of payment for <strong>${caseRecord.client.firstName} ${caseRecord.client.lastName}</strong> (ID: ${caseRecord.client.idNumber}) regarding case <strong>${caseRecord.fileNumber}</strong>.</p>
<p>Regards,<br/>Zenowethu Debt Management</p>
        `.trim();

        const tasks: Promise<unknown>[] = [
            GhlService.sendMessage(caseId, 'SMS', confirmationSms),
            GhlService.applyTags(caseId, ['pop_received', 'awaiting_dc_confirmation']),
        ];

        if (caseRecord.dcEmail) {
            tasks.push(
                GhlService.sendMessage(
                    caseId,
                    'EMAIL',
                    dcEmailHtml,
                    `Proof of Payment — ${caseRecord.fileNumber}`,
                    caseRecord.dcEmail,
                    [proofUrl],
                )
            );
        }

        await Promise.allSettled(tasks);

        const systemUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
        await prisma.caseComment.create({
            data: {
                caseId,
                userId: systemUser?.id ?? 'system',
                content: `Proof of payment received. Client confirmed via SMS. PoP forwarded to DC at ${caseRecord.dcEmail ?? 'no DC email on record'}.`,
                type: 'SYSTEM',
                isInternal: true,
                activityType: 'PROOF_OF_PAYMENT_RECEIVED',
            },
        });

        logger.info(`[GHL Workflow] Consumer payment handled for case ${caseId}`);
    }

    /**
     * Called when a DHS transfer is approved by the NCR.
     * Notifies the client via WhatsApp and SMS.
     */
    static async onDHSTransferApproved(caseId: string): Promise<void> {
        const caseRecord = await prisma.case.findUnique({
            where: { id: caseId },
            include: { client: true },
        });
        if (!caseRecord) throw new Error(`Case not found: ${caseId}`);

        const message = `Great news, ${caseRecord.client.firstName}! Your debt review transfer to Zenowethu has been approved by the NCR. We will be in touch shortly with your restructured repayment plan.`;

        await Promise.allSettled([
            GhlService.sendMessage(caseId, 'WHATSAPP', message),
            GhlService.sendMessage(caseId, 'SMS', message),
            GhlService.applyTags(caseId, ['dhs_approved', 'transfer_complete']),
        ]);

        const systemUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
        await prisma.caseComment.create({
            data: {
                caseId,
                userId: systemUser?.id ?? 'system',
                content: 'DHS transfer approved by NCR. Client notified via WhatsApp and SMS.',
                type: 'SYSTEM',
                isInternal: true,
                activityType: 'STATUS_CHANGE',
            },
        });

        logger.info(`[GHL Workflow] DHS approval notification sent for case ${caseId}`);
    }
}
