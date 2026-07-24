import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';
import { getUserActivitySignature } from '@zenowethu/shared-lib/src/metrics/activity-verification';
import { z } from 'zod';
import { startOfDay, endOfDay, parseISO } from 'date-fns';

const LogCreateSchema = z.object({
  date: z.string().transform((val) => new Date(val)),
  category: z.string().min(2),
  description: z.string().min(5),
  durationMinutes: z.number().int().min(1),
  fileNumber: z.string().optional().nullable().transform((val) => val ? val.trim() : null),
});

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = LogCreateSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input data', details: parsed.error.format() }, { status: 400 });
    }

    const { date, category, description, durationMinutes, fileNumber } = parsed.data;

    // Validate fileNumber exists if provided
    if (fileNumber) {
      const caseExists = await prisma.case.findUnique({
        where: { fileNumber }
      });
      if (!caseExists) {
        return NextResponse.json({ error: `Case file number "${fileNumber}" does not exist` }, { status: 400 });
      }
    }

    const log = await prisma.workLog.create({
      data: {
        userId: session.user.id,
        date,
        category,
        description,
        durationMinutes,
        fileNumber,
      }
    });

    return NextResponse.json(log, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userIdParam = searchParams.get('userId');
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const category = searchParams.get('category');
    const includeSignature = searchParams.get('includeSignature') === 'true';

    // Access check: only Admin/Executive can view other users' logs
    const isExecutive = session.user.isAdmin || session.user.isExecutive;
    const targetUserId = (isExecutive && userIdParam) ? userIdParam : session.user.id;

    if (!targetUserId) {
      return NextResponse.json({ error: 'Missing userId parameter' }, { status: 400 });
    }

    // Default filters
    const where: any = { userId: targetUserId };

    if (startDateParam && endDateParam) {
      where.date = {
        gte: startOfDay(parseISO(startDateParam)),
        lte: endOfDay(parseISO(endDateParam))
      };
    } else if (startDateParam) {
      where.date = {
        gte: startOfDay(parseISO(startDateParam))
      };
    }

    if (category && category !== 'ALL') {
      where.category = category;
    }

    const logs = await prisma.workLog.findMany({
      where,
      orderBy: { date: 'desc' },
      include: {
        verifiedBy: {
          select: {
            firstName: true,
            lastName: true
          }
        }
      }
    });

    // If manager is viewing a single day's details, fetch the system activity signature
    let signature = null;
    if (includeSignature && startDateParam && targetUserId) {
      const targetDate = parseISO(startDateParam);
      signature = await getUserActivitySignature(targetUserId, targetDate);
    }

    // Compute simple aggregates
    const totalMinutes = logs.reduce((sum, item) => sum + item.durationMinutes, 0);
    const categoryBreakdown = logs.reduce((acc: Record<string, number>, item) => {
      acc[item.category] = (acc[item.category] || 0) + item.durationMinutes;
      return acc;
    }, {});

    return NextResponse.json({
      logs,
      totalMinutes,
      categoryBreakdown,
      signature
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
