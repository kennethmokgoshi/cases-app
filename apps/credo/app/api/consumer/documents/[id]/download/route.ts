import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { prisma } from "@zenowethu/database";
import { auth } from "@/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const doc = await prisma.credoDocument.findFirst({
      where: { id, consumerId: session.user.id },
      select: { originalName: true, mimeType: true, storagePath: true },
    });

    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const buffer = await readFile(doc.storagePath);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(doc.originalName)}"`,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (error) {
    const err = error as { code?: string };
    if (err.code === "ENOENT") {
      return NextResponse.json({ error: "File not found on server" }, { status: 404 });
    }
    return NextResponse.json({ error: "Download failed" }, { status: 500 });
  }
}
