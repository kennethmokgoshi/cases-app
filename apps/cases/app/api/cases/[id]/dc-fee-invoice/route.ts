/**
 * POST /api/cases/[id]/dc-fee-invoice
 *
 * Raise a fee-recovery invoice addressed TO the debt counsellor who requested a
 * DHS transfer of this case's consumer (whom Zenowethu declined because the
 * consumer still owes fees). The consumer and case are linked automatically.
 */

import { auth } from '@zenowethu/shared-lib';
import { dcFeeInvoiceInputSchema } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { createDcFeeInvoice } from '@zenowethu/shared-lib/src/finance/dc-fee-invoice-service';
import { logger } from '@zenowethu/shared-lib';
import { NextResponse } from 'next/server';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = dcFeeInvoiceInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  try {
    const caseData = await prisma.case.findUnique({
      where: { id },
      select: { id: true, clientId: true },
    });
    if (!caseData) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

    const invoice = await createDcFeeInvoice({
      input: parsed.data,
      caseId: caseData.id,
      clientId: caseData.clientId,
      createdById: session.user.id,
    });

    logger.info(
      `[dc-fee-invoice] ${invoice.invoiceNumber} raised for case ${id} → DC "${parsed.data.dcName}" by ${session.user.id}`,
    );

    return NextResponse.json(
      { id: invoice.id, invoiceNumber: invoice.invoiceNumber, total: Number(invoice.total) },
      { status: 201 },
    );
  } catch (err) {
    logger.error('[POST /api/cases/[id]/dc-fee-invoice]', err);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
