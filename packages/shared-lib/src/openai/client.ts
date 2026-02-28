import OpenAI from 'openai';
import { logger } from '../logger';

if (!process.env.OPENAI_API_KEY) {
    logger.warn('⚠️ OPENAI_API_KEY not found in environment variables. AI features will be disabled.');
} else {
    logger.info('✅ OpenAI API Key loaded:', process.env.OPENAI_API_KEY?.substring(0, 20) + '...');
}

export const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'missing_key',
    timeout: 120 * 1000
});
