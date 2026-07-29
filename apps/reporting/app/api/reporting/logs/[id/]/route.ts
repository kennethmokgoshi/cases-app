// TODO: Fix Next.js 16 dynamic route type validation on Windows
// For now, this endpoint is not used. The work log verification uses the bulk-verify endpoint.

import { NextResponse } from 'next/server'

export async function PATCH() {
  return NextResponse.json({ error: 'Not implemented' }, { status: 501 })
}
