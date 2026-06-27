import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { prisma } from "@zenowethu/database";
import { auth } from "@/auth";
import { z } from "zod";

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

const VALID_CATEGORIES = ["IDENTITY", "INCOME", "BUREAU", "LEGAL", "CORRESPONDENCE"] as const;

function getUploadDir(): string {
  return process.env.UPLOAD_DIR || join(process.cwd(), "uploads");
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const consumerId = session.user.id;

    const formData = await req.formData();
    const file = formData.get("file");
    const category = formData.get("category");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!VALID_CATEGORIES.includes(category as (typeof VALID_CATEGORIES)[number])) {
      return NextResponse.json(
        { error: `Category must be one of: ${VALID_CATEGORIES.join(", ")}` },
        { status: 400 }
      );
    }

    const ext = ALLOWED_MIME_TYPES[file.type];
    if (!ext) {
      return NextResponse.json(
        { error: "Unsupported file type. Allowed: PDF, JPG, PNG, DOCX" },
        { status: 415 }
      );
    }

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 10 MB." },
        { status: 413 }
      );
    }

    const storedName = `${crypto.randomUUID()}.${ext}`;
    const consumerDir = join(getUploadDir(), consumerId);
    await mkdir(consumerDir, { recursive: true });
    const storagePath = join(consumerDir, storedName);

    const bytes = await file.arrayBuffer();
    await writeFile(storagePath, Buffer.from(bytes));

    const doc = await prisma.credoDocument.create({
      data: {
        consumerId,
        fileName: storedName,
        originalName: file.name,
        mimeType: file.type,
        size: file.size,
        category: category as string,
        storagePath,
      },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        size: true,
        category: true,
        createdAt: true,
      },
    });

    // If staff requested a document of this category, mark the oldest open request
    // as fulfilled so it disappears from the consumer's "required" list and shows
    // as received on the Cases side.
    const openRequest = await prisma.documentRequest.findFirst({
      where: { consumerId, category: category as string, status: "REQUESTED" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (openRequest) {
      await prisma.documentRequest.update({
        where: { id: openRequest.id },
        data: { status: "UPLOADED", fulfilledDocId: doc.id },
      });
    }

    return NextResponse.json({ success: true, document: doc, fulfilledRequest: !!openRequest }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    const err = error as { code?: string; message?: string };
    return NextResponse.json(
      { error: `Upload failed: ${err.message ?? "Unknown error"}` },
      { status: 500 }
    );
  }
}
