import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { createLogger, getAutomationUserId } from '@zenowethu/shared-lib';
import { z } from 'zod';

import { auth } from '@/auth';

const logger = createLogger('credo/api/consumer/cases/comments');

const commentSchema = z.object({
  content: z.string().trim().min(1, 'Comment cannot be empty').max(2000, 'Comment is too long'),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = commentSchema.safeParse(await request.json());
    if (!body.success) {
      return NextResponse.json({ error: body.error.issues[0].message }, { status: 400 });
    }

    const consumer = await prisma.consumerAccount.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        linkedClientId: true,
      },
    });
    if (!consumer?.linkedClientId) {
      return NextResponse.json({ error: 'Your Credo profile is not linked to a case yet.' }, { status: 404 });
    }

    const caseRecord = await prisma.case.findFirst({
      where: { id, clientId: consumer.linkedClientId, deletedAt: null },
      select: { id: true },
    });
    if (!caseRecord) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    const userId = await getAutomationUserId();
    if (!userId) {
      logger.error('Cannot create client comment because no automation user exists');
      return NextResponse.json({ error: 'Unable to record your comment right now.' }, { status: 500 });
    }

    const clientName = `${consumer.firstName} ${consumer.lastName}`.trim() || 'Client';
    const comment = await prisma.caseComment.create({
      data: {
        caseId: id,
        userId,
        content: `[CLIENT COMMENT] ${clientName}: ${body.data.content}`,
        type: 'COMMENT',
        isInternal: false,
        activityType: 'CLIENT_COMMENT',
        activityData: JSON.stringify({ consumerId: consumer.id, source: 'credo' }),
      },
      select: {
        id: true,
        content: true,
        activityType: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    logger.error('Failed to create consumer case comment', error);
    return NextResponse.json({ error: 'Failed to record your comment' }, { status: 500 });
  }
}
