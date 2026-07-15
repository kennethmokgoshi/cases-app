import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@zenowethu/database";

export async function GET(req: NextRequest) {
  try {
    // In a real app, check for staff/admin role
    
    const requests = await prisma.serviceRequest.findMany({
      where: {
        status: "PENDING",
      },
      include: {
        consumer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            idNumber: true,
            phone: true,
            linkedClientId: true,
          }
        }
      },
      orderBy: {
        createdAt: "desc",
      }
    });

    return NextResponse.json(requests);
  } catch (error) {
    console.error("[CredivaRequests Listing Error]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
