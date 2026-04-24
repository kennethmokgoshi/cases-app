import { NextRequest, NextResponse } from "next/server";
import { unlink } from "fs/promises";
import { prisma } from "@zenowethu/database";
import { auth } from "@/auth";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const docs = await prisma.credoDocument.findMany({
      where: { consumerId: session.user.id },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        size: true,
        category: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ documents: docs });
  } catch {
    return NextResponse.json({ error: "Failed to fetch documents" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Document ID required" }, { status: 400 });
    }

    const doc = await prisma.credoDocument.findFirst({
      where: { id, consumerId: session.user.id },
      select: { id: true, storagePath: true },
    });

    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    await prisma.credoDocument.delete({ where: { id } });

    // Delete the physical file (non-critical — DB record is already gone)
    unlink(doc.storagePath).catch(() => undefined);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete document" }, { status: 500 });
  }
}
