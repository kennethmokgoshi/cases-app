import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger } from '@zenowethu/shared-lib';
import { TemplateCreateSchema, parseBody } from '@/lib/schemas';
import { z } from 'zod';

// GET - List all message templates
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const templates = await prisma.messageTemplate.findMany({
            orderBy: { name: 'asc' } });

        return NextResponse.json(templates);
    } catch (error) {
        logger.error('Error fetching templates:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// POST - Create a new message template
export async function POST(request: Request) {
    try {
        const session = await auth();
        // @ts-ignore - isAdmin check
        if (!session?.user?.isAdmin && session?.user?.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const parsed = parseBody(TemplateCreateSchema, await request.json());
        if (!parsed.success) return parsed.response;
        const body = parsed.data as z.infer<typeof TemplateCreateSchema>;
        const { name, description, content, channel, category } = body;

        const template = await prisma.messageTemplate.create({
            data: {
                name,
                description,
                content,
                channel,
                category } });

        return NextResponse.json(template, { status: 201 });
    } catch (error) {
        logger.error('Error creating template:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

