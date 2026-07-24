import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';
import { z } from 'zod';

const LogUpdateSchema = z.object({
  category: z.string().min(2).optional(),
  description: z.string().min(5).optional(),
  durationMinutes: z.number().int().min(1).optional(),
  fileNumber: z.string().optional().nullable().transform((val) => val ? val.trim() : null),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const log = await prisma.workLog.findUnique({
      where: { id }
    });

    if (!log) {
      return NextResponse.json({ error: 'Work log entry not found' }, { status: 404 });
    }

    // Security Check: Only the creator of the log can edit it
    if (log.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Locking Check: Verified logs cannot be modified
    if (log.isVerified) {
      return NextResponse.json({ error: 'Cannot modify a verified work log' }, { status: 400 });
    }

    const body = await request.json();
    const parsed = LogUpdateSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input data', details: parsed.error.format() }, { status: 400 });
    }

    const updateData: any = { ...parsed.data };

    // If fileNumber is updated, validate it
    if (updateData.fileNumber) {
      const caseExists = await prisma.case.findUnique({
        where: { fileNumber: updateData.fileNumber }
      });
      if (!caseExists) {
        return NextResponse.json({ error: `Case file number "${updateData.fileNumber}" does not exist` }, { status: 400 });
      }
    }

    const updatedLog = await prisma.workLog.update({
      where: { id },
      data: updateData
    });

    return NextResponse.json(updatedLog);
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const log = await prisma.workLog.findUnique({
      where: { id }
    });

    if (!log) {
      return NextResponse.json({ error: 'Work log entry not found' }, { status: 404 });
    }

    // Security Check: Only the creator of the log can delete it
    if (log.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Locking Check: Verified logs cannot be deleted
    if (log.isVerified) {
      return NextResponse.json({ error: 'Cannot delete a verified work log' }, { status: 400 });
    }

    await prisma.workLog.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
