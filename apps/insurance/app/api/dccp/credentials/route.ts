import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@zenowethu/database'
import { auth } from '@zenowethu/shared-lib'
import { logger } from '@zenowethu/shared-lib/src/logger'
import { invalidateDCCPCredentialsCache } from '@zenowethu/shared-lib/src/integrations/dccp-config'
import { dccpService } from '@zenowethu/shared-lib/src/integrations/dccp'
import { encryptSecret } from '@zenowethu/shared-lib/src/security/encryption'

// ─── Validation ───────────────────────────────────────────────────────────────

const SaveCredentialsSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
  portalUrl: z.string().url('Must be a valid URL').optional(),
  testFirst: z.boolean().optional().default(false),
})

// ─── GET /api/dccp/credentials ────────────────────────────────────────────────
// Returns whether the logged-in user has DCCP credentials configured.
// Password is NEVER returned — only the username and a boolean "isConfigured".

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const credential = await prisma.dCCPCredential.findUnique({
      where: { userId: session.user.id },
      select: {
        username: true,
        portalUrl: true,
        isActive: true,
        updatedAt: true,
      },
    })

    if (!credential) {
      return NextResponse.json({
        isConfigured: false,
        username: null,
        portalUrl: null,
      })
    }

    return NextResponse.json({
      isConfigured: true,
      username: credential.username,
      // Mask the username slightly so it can be displayed without full exposure
      usernameDisplay: credential.username.length > 3
        ? credential.username.slice(0, 3) + '•'.repeat(credential.username.length - 3)
        : credential.username,
      portalUrl: credential.portalUrl,
      isActive: credential.isActive,
      lastUpdated: credential.updatedAt,
    })
  } catch (error) {
    logger.error('[DCCP Credentials] GET error', error)
    return NextResponse.json({ error: 'Failed to fetch credential status' }, { status: 500 })
  }
}

// ─── POST /api/dccp/credentials ──────────────────────────────────────────────
// Save (upsert) the logged-in user's DCCP portal credentials.
// Optionally tests the connection before saving (testFirst: true).

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = SaveCredentialsSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const { username, password, portalUrl, testFirst } = parsed.data
    const resolvedPortalUrl = portalUrl ?? 'https://portal.colms.co.za/arsys/shared/login.jsp?/arsys/'

    // Optional: test connection before saving
    if (testFirst) {
      const testResult = await dccpService.testConnection({ username, password, portalUrl: resolvedPortalUrl })
      if (!testResult.success) {
        return NextResponse.json({
          error: 'Connection test failed',
          message: testResult.message,
          saved: false,
        }, { status: 422 })
      }
    }

    const encryptedPassword = encryptSecret(password)

    // Upsert: create or update the credential record for this user
    const credential = await prisma.dCCPCredential.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        username,
        password: encryptedPassword,
        portalUrl: resolvedPortalUrl,
        isActive: true,
      },
      update: {
        username,
        password: encryptedPassword,
        portalUrl: resolvedPortalUrl,
        isActive: true,
      },
      select: {
        username: true,
        portalUrl: true,
        updatedAt: true,
      },
    })

    // Clear the in-memory cache so the next automation call fetches fresh credentials
    invalidateDCCPCredentialsCache(session.user.id)

    logger.info('[DCCP Credentials] Saved for user', { userId: session.user.id })

    return NextResponse.json({
      saved: true,
      username: credential.username,
      portalUrl: credential.portalUrl,
      updatedAt: credential.updatedAt,
      message: 'DCCP portal credentials saved successfully.',
    })
  } catch (error) {
    logger.error('[DCCP Credentials] POST error', error)
    return NextResponse.json({ error: 'Failed to save credentials' }, { status: 500 })
  }
}

// ─── DELETE /api/dccp/credentials ────────────────────────────────────────────
// Remove the logged-in user's DCCP credentials.

export async function DELETE() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await prisma.dCCPCredential.deleteMany({
      where: { userId: session.user.id },
    })

    invalidateDCCPCredentialsCache(session.user.id)
    logger.info('[DCCP Credentials] Removed for user', { userId: session.user.id })

    return NextResponse.json({ removed: true })
  } catch (error) {
    logger.error('[DCCP Credentials] DELETE error', error)
    return NextResponse.json({ error: 'Failed to remove credentials' }, { status: 500 })
  }
}
