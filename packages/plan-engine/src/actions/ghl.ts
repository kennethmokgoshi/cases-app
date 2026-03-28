import { prisma } from '@zenowethu/database';
import {
  logger,
  getGHLCredentials,
  GhlSmsProvider,
  GhlEmailProvider,
  GhlWhatsAppProvider,
} from '@zenowethu/shared-lib';
import { stepRegistry } from '../step-registry';
import type { ActionContext } from '../step-registry';
import type { StepExecutionResult } from '../types';

type GhlChannel = 'SMS' | 'EMAIL' | 'WHATSAPP';

interface GhlStepResult {
  channel: GhlChannel;
  recipient: string;
  messageId?: string;
  sentAt: string;
}

async function sendViaGhl(
  ctx: ActionContext,
  channel: GhlChannel,
  message: string,
  subject?: string,
): Promise<StepExecutionResult> {
  const { caseId, caseRecord } = ctx;

  const client = await prisma.client.findUnique({
    where: { id: caseRecord.clientId },
    select: { id: true, phone: true, email: true, whatsappNumber: true, ghlContactId: true },
  });

  if (!client) return { success: false, error: 'Client not found' };

  const ghl = await getGHLCredentials();
  if (!ghl.apiKey || !ghl.locationId) {
    return { success: false, error: 'GHL not configured: missing apiKey or locationId' };
  }

  const rawTo = channel === 'EMAIL' ? client.email : (client.whatsappNumber ?? client.phone);
  if (!rawTo) {
    const missing = channel === 'EMAIL' ? 'email' : 'phone/whatsappNumber';
    return { success: false, error: `Client has no ${missing} — cannot send ${channel}` };
  }

  // Format SA numbers: 0821234567 → +27821234567
  const to = channel !== 'EMAIL' && rawTo.startsWith('0') ? '+27' + rawTo.substring(1) : rawTo;

  let sendResult: { success: boolean; messageId?: string; contactId?: string; error?: string; provider: string };

  if (channel === 'SMS') {
    const provider = new GhlSmsProvider(ghl.apiKey, ghl.locationId);
    sendResult = await provider.send(to, message);
  } else if (channel === 'EMAIL') {
    const provider = new GhlEmailProvider(ghl.apiKey, ghl.locationId);
    sendResult = await provider.send(to, subject ?? 'Update from Zenowethu Debt Counsellors', message);
  } else {
    const provider = new GhlWhatsAppProvider(ghl.apiKey, ghl.locationId);
    sendResult = await provider.send(to, message);
  }

  // Persist contactId on Client after first successful send
  if (sendResult.contactId && !client.ghlContactId) {
    await prisma.client.update({
      where: { id: client.id },
      data: { ghlContactId: sendResult.contactId },
    });
  }

  // Log every attempt to NotificationLog
  await prisma.notificationLog.create({
    data: {
      caseId,
      channel,
      recipient: to,
      recipientType: 'CLIENT',
      message,
      success: sendResult.success,
      externalId: sendResult.messageId,
      error: sendResult.error,
      provider: 'GoHighLevel',
      senderId: caseRecord.assignedToId,
    },
  });

  if (!sendResult.success) {
    logger.warn(`[GHL_SEND_${channel}] Case ${caseId}: send failed — ${sendResult.error}`);
    return { success: false, error: sendResult.error };
  }

  logger.info(`[GHL_SEND_${channel}] Case ${caseId}: sent to ${to} (msgId=${sendResult.messageId})`);

  const result: GhlStepResult = {
    channel,
    recipient: to,
    messageId: sendResult.messageId,
    sentAt: new Date().toISOString(),
  };

  return { success: true, result: result as unknown as Record<string, unknown> };
}

stepRegistry.register('GHL_SEND_SMS', async (ctx: ActionContext): Promise<StepExecutionResult> => {
  try {
    const message = (ctx.actionParams.message as string) || 'Message from Zenowethu Debt Counsellors.';
    return await sendViaGhl(ctx, 'SMS', message);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
});

stepRegistry.register('GHL_SEND_EMAIL', async (ctx: ActionContext): Promise<StepExecutionResult> => {
  try {
    const message = (ctx.actionParams.message as string) || 'Email from Zenowethu Debt Counsellors.';
    const subject = (ctx.actionParams.subject as string) || 'Update from Zenowethu Debt Counsellors';
    return await sendViaGhl(ctx, 'EMAIL', message, subject);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
});

stepRegistry.register('GHL_SEND_WHATSAPP', async (ctx: ActionContext): Promise<StepExecutionResult> => {
  try {
    const message = (ctx.actionParams.message as string) || 'WhatsApp from Zenowethu Debt Counsellors.';
    return await sendViaGhl(ctx, 'WHATSAPP', message);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
});

stepRegistry.register('GHL_WAIT_DOCUMENT', async (ctx: ActionContext): Promise<StepExecutionResult> => {
  try {
    const documentType = (ctx.actionParams.documentType as string) || 'document';
    logger.info(`[GHL_WAIT_DOCUMENT] Case ${ctx.caseId}: waiting for ${documentType}`);
    return {
      success: true,
      requiresUserAction: true,
      userActionPrompt: `Waiting for client to upload: ${documentType}. This step will auto-complete when the document is received.`,
      result: { waitingFor: documentType, waitStartedAt: new Date().toISOString() },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
});

stepRegistry.register('GHL_WAIT_REPLY', async (ctx: ActionContext): Promise<StepExecutionResult> => {
  try {
    const replyContext = (ctx.actionParams.context as string) || 'client reply';
    logger.info(`[GHL_WAIT_REPLY] Case ${ctx.caseId}: waiting for ${replyContext}`);
    return {
      success: true,
      requiresUserAction: true,
      userActionPrompt: `Waiting for reply: ${replyContext}. This step will auto-complete when a reply is received.`,
      result: { waitingFor: replyContext, waitStartedAt: new Date().toISOString() },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
});
