import { NextResponse } from 'next/server';
import { createLogger } from '@zenowethu/shared-lib';
import { handleTelegramMessage } from '@zenowethu/shared-lib/src/integrations/telegram-bot';
import { TelegramBotProvider } from '@zenowethu/shared-lib/src/notifications/providers';

const logger = createLogger('api/webhooks/telegram');

/**
 * Telegram Bot webhook.
 *
 * Register it once (after deploy) with:
 *   curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
 *     -d url="https://app.zenowethu.co.za/api/webhooks/telegram" \
 *     -d secret_token="<TELEGRAM_WEBHOOK_SECRET>"
 *
 * Telegram sends the secret back in the X-Telegram-Bot-Api-Secret-Token header on
 * every call — we reject anything that doesn't match when the secret is configured.
 */
export async function POST(request: Request) {
    try {
        const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
        if (secret) {
            const provided = request.headers.get('x-telegram-bot-api-secret-token');
            if (provided !== secret) {
                logger.warn('[Telegram Webhook] Rejected — bad secret token');
                return NextResponse.json({ ok: true }); // 200 so Telegram doesn't retry
            }
        }

        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) {
            logger.error('[Telegram Webhook] TELEGRAM_BOT_TOKEN not configured — cannot reply');
            return NextResponse.json({ ok: true });
        }

        const update = await request.json();
        const message = update?.message ?? update?.edited_message;
        const chatId = message?.chat?.id;
        const text = message?.text;

        // Ignore non-text updates (stickers, joins, callback queries, etc.)
        if (!chatId || typeof text !== 'string') {
            return NextResponse.json({ ok: true });
        }

        const { reply } = await handleTelegramMessage({
            chatId: String(chatId),
            text,
            firstName: message?.from?.first_name,
        });

        if (reply) {
            const bot = new TelegramBotProvider(token);
            const res = await bot.send(String(chatId), reply);
            if (!res.success) logger.error(`[Telegram Webhook] Reply failed: ${res.error}`);
        }

        return NextResponse.json({ ok: true });
    } catch (error: any) {
        logger.error('[Telegram Webhook] Error:', error);
        // Always 200 so Telegram does not hammer retries on a transient error
        return NextResponse.json({ ok: true });
    }
}

// Health check
export async function GET() {
    return NextResponse.json({ status: 'active', service: 'Zeno Telegram Bot' });
}
