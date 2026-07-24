import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const fileNumber = searchParams.get('fileNumber');

    if (!fileNumber) {
      return NextResponse.json({ error: 'Missing fileNumber parameter' }, { status: 400 });
    }

    const kase = await prisma.case.findUnique({
      where: { fileNumber: fileNumber.trim() },
      select: {
        client: {
          select: {
            firstName: true,
            lastName: true
          }
        }
      }
    });

    if (!kase) {
      return NextResponse.json({ found: false });
    }

    const clientName = `${kase.client.firstName} ${kase.client.lastName}`;
    return NextResponse.json({ found: true, clientName });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
