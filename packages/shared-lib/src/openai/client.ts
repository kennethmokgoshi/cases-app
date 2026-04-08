import OpenAI from 'openai';
import { logger } from '../logger';

let _openai: OpenAI | null = null;

/**
 * Returns the legacy env-based OpenAI client.
 * Prefer getAiClientForTask() from '../ai/provider-client' for new code —
 * it routes to the correct model per task using the admin-configured providers.
 */
export const getOpenAI = (): OpenAI => {
    if (!_openai) {
        if (!process.env.OPENAI_API_KEY) {
            logger.warn('⚠️ OPENAI_API_KEY not found. Configure a provider in Admin → AI Providers, or set OPENAI_API_KEY in .env.');
        } else {
            logger.info('✅ OpenAI env key loaded (fallback client).');
        }

        _openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY || 'missing_key',
            timeout: 120 * 1000
        });
    }
    return _openai;
};
