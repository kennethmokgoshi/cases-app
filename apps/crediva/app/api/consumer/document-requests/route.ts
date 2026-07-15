import { NextResponse } from "next/server";
import { prisma } from "@zenowethu/database";
import { auth } from "@/auth";

// GET /api/consumer/document-requests
// Returns the document requests staff have raised against the logged-in consumer,
// so the Credo app can tell them which documents are still required.
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const requests = await prisma.documentRequest.findMany({
      where: { consumerId: session.user.id },
      select: {
        id: true,
        category: true,
        label: true,
        notes: true,
        status: true,
        createdAt: true,
        reviewedAt: true,
        fulfilledDoc: {
          select: { id: true, originalName: true, createdAt: true },
        },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });

    const outstanding = requests.filter((r) => r.status === "REQUESTED").length;

    return NextResponse.json({ requests, outstanding });
  } catch {
    return NextResponse.json({ error: "Failed to fetch document requests" }, { status: 500 });
  }
}
