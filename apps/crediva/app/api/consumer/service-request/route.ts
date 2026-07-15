import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@zenowethu/database";
import { auth } from "@/auth";
import { z } from "zod";

const serviceRequestSchema = z.object({
  services: z.array(z.string()).min(1, "Please select at least one service"),
  subtotal: z.number().min(0),
  couponCode: z.string().optional(),
  discountPercent: z.number().optional().default(0),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const consumerId = session.user.id;
    const body = await req.json();
    const data = serviceRequestSchema.parse(body);

    // Calculate totals securely
    const total = data.subtotal * (1 - data.discountPercent / 100);
    const vatAmount = total * 0.15;
    const grandTotal = total + vatAmount;

    // Check if coupon exists
    let couponId: string | undefined;
    if (data.couponCode) {
      const coupon = await prisma.couponCode.findUnique({
        where: { code: data.couponCode },
      });
      if (coupon && coupon.isActive) {
        couponId = coupon.id;
      }
    }

    const request = await prisma.serviceRequest.create({
      data: {
        consumerId,
        services: JSON.stringify(data.services),
        subtotal: data.subtotal,
        vatAmount,
        total: grandTotal,
        discountPercent: data.discountPercent,
        couponId,
        notes: data.notes,
        status: "PENDING",
      },
      include: {
        consumer: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          }
        }
      }
    });

    return NextResponse.json({ success: true, requestId: request.id });
  } catch (error) {
    console.error("[ServiceRequest API Error]", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
