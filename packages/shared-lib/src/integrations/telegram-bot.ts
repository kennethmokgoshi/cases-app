// Telegram bot conversation handler.
//
// Drives a small state machine per chat:
//   AWAITING_ID  → consumer sends 13-digit SA ID; we look up their Client and
//                  email a 6-digit code (reusing the existing OTP email service)
//   AWAITING_OTP → consumer enters the code; on match we bind the chat to the Client
//   VERIFIED     → questions are answered by the AI auto-reply engine, grounded in
//                  the consumer's real case context
//
// Security/POPIA: a Telegram chat is anonymous, so NO file detail is revealed until
// the consumer has proven identity via the email OTP. The verified binding is stored
// on TelegramSession.clientId (and mirrored to Client.telegramNumber so outbound
// notifications can reach them too).

import { prisma } from '@zenowethu/database';
import { createLogger } from '../logger';
import { generateOtpCode, isValidOtpFormat, sendOtpEmail } from '../notifications/otp-service';
import { generateAutoReply } from '../ai/auto-reply';
import { formatStatus } from '../statuses/statuses';

const logger = createLogger('telegram-bot');

const OTP_TTL_MIN = 15;
const MAX_ATTEMPTS = 5;
const COMPANY_PHONE = process.env.COMPANY_PHONE || '012 035 1824';

export interface TelegramInbound {
    chatId: string;
    text: string;
    firstName?: string;
}

export interface TelegramReply {
    reply: string;
    state: 'AWAITING_ID' | 'AWAITING_OTP' | 'VERIFIED';
    clientId?: string | null;
    escalated?: boolean;
}

function maskEmail(email: string): string {
    return email.replace(/(^.).*(@.*$)/, '$1***$2');
}

const MSG = {
    welcome:
        '👋 Welcome to the Zenowethu Assistant.\n\n' +
        'I can give you updates on your case file. First I need to verify your identity.\n\n' +
        'Please reply with your 13-digit South African ID number.',
    askId: 'Please reply with your 13-digit South African ID number to continue.',
    idNotFound: `I couldn't find a file linked to that ID number. Please check and try again, or call our office on ${COMPANY_PHONE}.`,
    noEmail: `I found your file, but there's no email address on record to send a verification code to. Please call our office on ${COMPANY_PHONE} so we can verify you.`,
    otpSent: (masked: string) =>
        `✅ I've emailed a 6-digit verification code to ${masked}.\n\nPlease reply with the code to confirm it's you. It expires in ${OTP_TTL_MIN} minutes.`,
    otpInvalid: "That code doesn't match. Please re-enter the 6-digit code from your email.",
    otpExpired: 'That code has expired. Please reply with your ID number to request a new one.',
    otpFormat: 'Please reply with the 6-digit code from your email (numbers only).',
    verified: (name: string) =>
        `🎉 Thanks ${name}, you're verified.\n\n` +
        'You can now ask me about your file — for example "What\'s the status of my case?" or "What documents are still outstanding?".',
    tooManyAttempts: `Too many incorrect attempts. For your security I've paused verification. Please call our office on ${COMPANY_PHONE}.`,
    escalated: `Thanks for your message. I've passed this to a team member who will follow up with you within 1–2 business days. For anything urgent, call ${COMPANY_PHONE}.`,
    noCase: `You're verified, but I can't find an active case on your profile right now. A team member will be in touch — or call us on ${COMPANY_PHONE}.`,
    loggedOut: 'You have been logged out. Reply with your ID number any time to verify again.',
};

/**
 * Process one inbound Telegram message and return the bot's reply.
 * Pure of transport: callers send `reply` back to the chat and handle logging.
 */
export async function handleTelegramMessage(input: TelegramInbound): Promise<TelegramReply> {
    const chatId = String(input.chatId);
    const text = (input.text || '').trim();
    const firstName = input.firstName || 'there';

    let session = await prisma.telegramSession.findUnique({ where: { chatId } });
    if (!session) {
        session = await prisma.telegramSession.create({
            data: { chatId, state: 'AWAITING_ID', lastInboundAt: new Date() },
        });
    } else {
        await prisma.telegramSession.update({ where: { chatId }, data: { lastInboundAt: new Date() } });
    }

    const lower = text.toLowerCase();

    // Commands
    if (lower === '/start') {
        return { reply: MSG.welcome, state: 'AWAITING_ID' };
    }
    if (lower === '/logout' || lower === '/stop') {
        await unbind(chatId, session.clientId);
        return { reply: MSG.loggedOut, state: 'AWAITING_ID' };
    }

    // Verified consumer → AI Q&A grounded in their case
    if (session.state === 'VERIFIED' && session.clientId) {
        return answerQuestion(session.clientId, text);
    }

    // Mid-verification: awaiting the emailed code
    if (session.state === 'AWAITING_OTP') {
        return handleOtp(session, text);
    }

    // Default: awaiting the ID number
    return handleIdNumber(session, text, firstName);
}

async function handleIdNumber(
    session: { chatId: string; attempts: number },
    text: string,
    _firstName: string,
): Promise<TelegramReply> {
    const id = text.replace(/\D/g, '');
    if (id.length !== 13) {
        return { reply: MSG.askId, state: 'AWAITING_ID' };
    }

    const client = await prisma.client.findUnique({ where: { idNumber: id } });
    if (!client) {
        const attempts = session.attempts + 1;
        await prisma.telegramSession.update({ where: { chatId: session.chatId }, data: { attempts } });
        if (attempts >= MAX_ATTEMPTS) {
            await prisma.telegramSession.update({ where: { chatId: session.chatId }, data: { attempts: 0 } });
            return { reply: MSG.tooManyAttempts, state: 'AWAITING_ID' };
        }
        return { reply: MSG.idNotFound, state: 'AWAITING_ID' };
    }

    if (!client.email) {
        return { reply: MSG.noEmail, state: 'AWAITING_ID' };
    }

    const otp = generateOtpCode();
    const otpExpiresAt = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000);
    await prisma.telegramSession.update({
        where: { chatId: session.chatId },
        data: { state: 'AWAITING_OTP', candidateClientId: client.id, otpCode: otp, otpExpiresAt, attempts: 0 },
    });

    await sendOtpEmail({ email: client.email, otpCode: otp, firstName: client.firstName });
    logger.info(`[Telegram] OTP emailed for chat ${chatMask(session.chatId)} (candidate=${client.id})`);

    return { reply: MSG.otpSent(maskEmail(client.email)), state: 'AWAITING_OTP' };
}

async function handleOtp(
    session: {
        chatId: string;
        attempts: number;
        otpCode: string | null;
        otpExpiresAt: Date | null;
        candidateClientId: string | null;
    },
    text: string,
): Promise<TelegramReply> {
    const code = text.replace(/\D/g, '');
    if (!isValidOtpFormat(code)) {
        return { reply: MSG.otpFormat, state: 'AWAITING_OTP' };
    }

    if (!session.otpCode || !session.otpExpiresAt || session.otpExpiresAt < new Date() || !session.candidateClientId) {
        await prisma.telegramSession.update({
            where: { chatId: session.chatId },
            data: { state: 'AWAITING_ID', otpCode: null, otpExpiresAt: null, candidateClientId: null },
        });
        return { reply: MSG.otpExpired, state: 'AWAITING_ID' };
    }

    if (code !== session.otpCode) {
        const attempts = session.attempts + 1;
        if (attempts >= MAX_ATTEMPTS) {
            await prisma.telegramSession.update({
                where: { chatId: session.chatId },
                data: { state: 'AWAITING_ID', otpCode: null, otpExpiresAt: null, candidateClientId: null, attempts: 0 },
            });
            return { reply: MSG.tooManyAttempts, state: 'AWAITING_ID' };
        }
        await prisma.telegramSession.update({ where: { chatId: session.chatId }, data: { attempts } });
        return { reply: MSG.otpInvalid, state: 'AWAITING_OTP' };
    }

    // Success — bind the chat to the Client
    const clientId = session.candidateClientId;
    await prisma.telegramSession.update({
        where: { chatId: session.chatId },
        data: { state: 'VERIFIED', clientId, candidateClientId: null, otpCode: null, otpExpiresAt: null, attempts: 0 },
    });
    // Mirror onto the Client so outbound notifications can reach this chat too
    await prisma.client
        .update({ where: { id: clientId }, data: { telegramNumber: session.chatId } })
        .catch((err) => logger.error('[Telegram] Failed to mirror chatId onto Client:', err));

    const client = await prisma.client.findUnique({ where: { id: clientId } });
    logger.info(`[Telegram] Chat ${chatMask(session.chatId)} verified and bound to client ${clientId}`);
    return { reply: MSG.verified(client?.firstName || 'there'), state: 'VERIFIED', clientId };
}

async function answerQuestion(clientId: string, text: string): Promise<TelegramReply> {
    const ctx = await loadCaseContext(clientId);
    if (!ctx) {
        return { reply: MSG.noCase, state: 'VERIFIED', clientId, escalated: true };
    }

    const ai = await generateAutoReply({
        inboundMessage: text,
        channel: 'TELEGRAM',
        senderType: 'CLIENT',
        caseContext: ctx,
        companyPhone: COMPANY_PHONE,
    });

    if (ai.shouldSend && ai.body?.trim()) {
        return { reply: ai.body, state: 'VERIFIED', clientId };
    }

    // The AI declined (needs a human / legal decision / not enough info) → escalate
    logger.info(`[Telegram] Escalating question for client ${clientId}: "${text.slice(0, 80)}"`);
    return { reply: MSG.escalated, state: 'VERIFIED', clientId, escalated: true };
}

async function loadCaseContext(clientId: string) {
    const c = await prisma.case.findFirst({
        where: { clientId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        include: { client: true },
    });
    if (!c) return null;

    return {
        fileNumber: c.fileNumber,
        statusLabel: formatStatus(c.status),
        nextUpdate: c.nextUpdate ? c.nextUpdate.toISOString() : null,
        clientFirstName: c.client.firstName,
        clientFullName: `${c.client.firstName} ${c.client.lastName}`,
        dcName: c.debtCounsellorName ?? null,
    };
}

async function unbind(chatId: string, clientId: string | null) {
    await prisma.telegramSession.update({
        where: { chatId },
        data: { state: 'AWAITING_ID', clientId: null, candidateClientId: null, otpCode: null, otpExpiresAt: null, attempts: 0 },
    });
    if (clientId) {
        await prisma.client
            .update({ where: { id: clientId }, data: { telegramNumber: null } })
            .catch(() => {});
    }
}

function chatMask(chatId: string): string {
    return chatId.length > 4 ? `***${chatId.slice(-4)}` : chatId;
}
