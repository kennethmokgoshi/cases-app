import { NextResponse } from 'next/server';
import { auth } from '@zenowethu/shared-lib';
import { logger } from '@zenowethu/shared-lib';
import { parsePartnerReport } from '@/lib/partner-invoice';

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const splitPercentStr = formData.get('splitPercent') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const splitPercent = splitPercentStr ? parseFloat(splitPercentStr) : 50;
    
    if (isNaN(splitPercent) || splitPercent < 0 || splitPercent > 100) {
      return NextResponse.json({ error: 'Invalid split percentage' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    
    const result = parsePartnerReport(buffer, splitPercent);

    if (result.errors && result.errors.length > 0) {
      return NextResponse.json({ error: result.errors[0] }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    logger.error('Failed to preview partner upload:', error);
    return NextResponse.json({ error: 'Failed to process file' }, { status: 500 });
  }
}
