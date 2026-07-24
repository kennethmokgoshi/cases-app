import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';
import { z } from 'zod';

const BulkVerifySchema = z.object({
  logIds: z.array(z.string()),
  isVerified: z.boolean(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Access Check: Only Admins or Executives can verify logs
    const isExecutive = session.user.isAdmin || session.user.isExecutive;
    if (!isExecutive) {
      return NextResponse.json({ error: 'Forbidden: Managers only' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = BulkVerifySchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input data', details: parsed.error.format() }, { status: 400 });
    }

    const { logIds, isVerified } = parsed.data;

    if (logIds.length === 0) {
      return NextResponse.json({ success: true, count: 0 });
    }

    const updateData: any = isVerified
      ? {
          isVerified: true,
          verifiedById: session.user.id,
          verifiedAt: new Date()
        }
      : {
          isVerified: false,
          verifiedById: null,
          verifiedAt: null
        };

    const result = await prisma.workLog.updateMany({
      where: {
        id: { in: logIds }
      },
      data: updateData
    });

    return NextResponse.json({ success: true, count: result.count });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
