import { NextResponse } from 'next/server';
import { resolveSigningToken } from '@zenowethu/shared-lib/src/poa/signing-service';

/**
 * GET /api/poa/validate/[token]
 *
 * Public endpoint (no auth required).
 * Returns token validity and document details for the signing page.
 */
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;

    const resolved = await resolveSigningToken(token);

    if ('error' in resolved) {
      return NextResponse.json(
        { error: resolved.error },
        { status: resolved.status },
      );
    }

    const { record } = resolved;

    // Build client name from available data
    const clientName = record.client
      ? `${record.client.firstName} ${record.client.lastName}`
      : record.consumer
      ? `${record.consumer.firstName} ${record.consumer.lastName}`
      : 'Unknown';

    const expiryMs = new Date(record.expiresAt).getTime() - Date.now();
    const expiryHours = Math.ceil(expiryMs / (60 * 60 * 1000));

    return NextResponse.json({
      clientName,
      poaType: record.poaType,
      channel: record.channel,
      expiryHours: Math.max(expiryHours, 0),
    });

  } catch (error) {
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    );
  }
}
