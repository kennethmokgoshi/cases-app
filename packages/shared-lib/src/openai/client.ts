import OpenAI from 'openai';
import { logger } from '../logger';

let _openai: OpenAI | null = null;

export const getOpenAI = (): OpenAI => {
    if (!_openai) {
        if (!process.env.OPENAI_API_KEY) {
            logger.warn('⚠️ OPENAI_API_KEY not found in environment variables. AI features will be disabled.');
        } else {
            logger.info('✅ OpenAI API Key loaded.');
        }

        _openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY || 'missing_key',
            timeout: 120 * 1000
        });
    }
    return _openai;
};
