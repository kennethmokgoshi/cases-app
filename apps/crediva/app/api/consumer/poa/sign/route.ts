import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@zenowethu/database";
import { auth } from "@/auth";
import { completePoaSigning } from "@zenowethu/shared-lib/src/poa/signing-service";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const consumerId = session.user.id;
    const { signatureImage, poaSigningToken } = await req.json();

    if (!signatureImage) {
      return NextResponse.json({ error: "No signature provided" }, { status: 400 });
    }

    // If a signing token was provided (linked from email/WhatsApp), use the shared service
    if (poaSigningToken) {
      const ipAddress = req.headers.get('x-forwarded-for')
        || req.headers.get('x-real-ip')
        || 'unknown';
      const userAgent = req.headers.get('user-agent') || 'unknown';

      const result = await completePoaSigning({
        token: poaSigningToken,
        signatureImage,
        ipAddress,
        userAgent,
      });

      if ('error' in result) {
        return NextResponse.json(
          { error: result.error },
          { status: result.status },
        );
      }

      return NextResponse.json({
        success: true,
        documentId: result.documentId,
        message: 'POA digitally signed and saved successfully.',
      });
    }

    // Otherwise, direct Credo signing (no token) — create inline
    const consumer = await prisma.consumerAccount.findUnique({
      where: { id: consumerId },
      include: { linkedClient: true }
    });

    if (!consumer) {
      return NextResponse.json({ error: "Consumer not found" }, { status: 404 });
    }

    // Use shared service with an internal token
    const token = 'credo-inline-' + crypto.randomUUID();

    // Create a temporary PoaSigningRequest
    await prisma.poaSigningRequest.create({
      data: {
        token,
        poaType: 'STANDARD',
        channel: 'CREDO',
        consumerId,
        status: 'SIGNED',
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        signedAt: new Date(),
      }
    });

    const ipAddress = req.headers.get('x-forwarded-for')
      || req.headers.get('x-real-ip')
      || 'unknown';

    const result = await completePoaSigning({
      token,
      signatureImage,
      ipAddress,
      userAgent: req.headers.get('user-agent') || 'unknown',
    });

    if ('error' in result) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }

    return NextResponse.json({
      success: true,
      documentId: result.documentId,
      message: 'POA digitally signed and saved successfully.',
    });

  } catch (error: any) {
    console.error('POA Signing Error:', error);
    return NextResponse.json(
      { error: `Signing failed: ${error.message ?? "Unknown error"}` },
      { status: 500 }
    );
  }
}
