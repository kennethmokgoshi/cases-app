import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import OpenAI from 'openai';
import { z } from 'zod';
import { parseBody } from '@/lib/schemas';

const logger = createLogger('api/admin/ai-providers/test');

const TestSchema = z.object({
    apiKey: z.string().min(1),
    baseUrl: z.string().url().optional().nullable(),
    model: z.string().min(1).optional().default('gpt-4o-mini'),
});

// POST /api/admin/ai-providers/test — verify a provider key works
export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const parsed = parseBody<z.infer<typeof TestSchema>>(TestSchema, await request.json());
        if (!parsed.success) return parsed.response;
        const { apiKey, baseUrl, model } = parsed.data;

        const client = new OpenAI({
            apiKey,
            baseURL: baseUrl ?? undefined,
            timeout: 15 * 1000,
            defaultHeaders: baseUrl?.includes('openrouter.ai')
                ? { 'HTTP-Referer': 'https://zenowethu.co.za', 'X-Title': 'Zenowethu Cases' }
                : undefined,
        });

        const response = await client.chat.completions.create({
            model: model ?? 'gpt-4o-mini',
            messages: [{ role: 'user', content: 'Reply with just the word: OK' }],
            max_tokens: 5,
        });

        const reply = response.choices[0]?.message?.content ?? '';
        logger.info('AI provider test succeeded', { model, baseUrl: baseUrl ?? 'default' });

        return NextResponse.json({
            success: true,
            message: `Connection successful. Model responded: "${reply.trim()}"`,
            model: response.model,
        });
    } catch (error: any) {
        logger.error('AI provider test failed:', error?.message);
        return NextResponse.json({
            success: false,
            message: error?.message ?? 'Connection failed',
        });
    }
}
