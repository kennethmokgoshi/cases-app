import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';
import { checkConfidence } from '@zenowethu/plan-engine';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { caseId } = await params;

    const caseRecord = await prisma.case.findUnique({
      where: { id: caseId },
      select: {
        id: true,
        acquisitionType: true,
        services: true,
        planReadyToStart: true,
        plan: {
          include: {
            steps: { orderBy: { stepNumber: 'asc' } },
            updates: { orderBy: { createdAt: 'desc' }, take: 10 },
            events: { orderBy: { createdAt: 'desc' }, take: 10 },
          },
        },
        documents: {
          select: {
            type: true,
          },
        },
      },
    });

    if (!caseRecord) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    let isFlagRemoval = false;
    try {
      const services = caseRecord.services ? JSON.parse(caseRecord.services as string) : [];
      isFlagRemoval = services.includes('debt_review_flag_removal');
    } catch {}

    const confidence = await checkConfidence(caseId, isFlagRemoval);
    const uploadedDocTypes = caseRecord.documents.map((d) => d.type.toUpperCase());

    return NextResponse.json({
      plan: caseRecord.plan,
      confidence,
      planReadyToStart: caseRecord.planReadyToStart,
      acquisitionType: caseRecord.acquisitionType,
      uploadedDocTypes,
    });
  } catch (error) {
    console.error('[AI Plan GET]', error);
    return NextResponse.json({ error: 'Failed to fetch plan data' }, { status: 500 });
  }
}
