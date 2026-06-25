import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@zenowethu/database";

const generateOtpSchema = z.object({
  username: z.string().min(1, "Username is required"),
});

// Generate a random 6-digit OTP code
function generateOtpCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = generateOtpSchema.parse(body);

    const username = data.username.trim();

    // Find consumer by email or ID number
    let consumer = await prisma.consumerAccount.findFirst({
      where: { email: username },
      select: { id: true, phone: true, firstName: true },
    });

    if (!consumer && /^\d{13}$/.test(username)) {
      consumer = await prisma.consumerAccount.findUnique({
        where: { idNumber: username },
        select: { id: true, phone: true, firstName: true },
      });
    }

    if (!consumer) {
      // Return generic message for security (don't reveal if account exists)
      return NextResponse.json(
        { message: "If an account exists with this username, an OTP will be sent to the registered phone number." },
        { status: 200 }
      );
    }

    if (!consumer.phone) {
      return NextResponse.json(
        { error: "No phone number on file. Please reset your password or contact support." },
        { status: 400 }
      );
    }

    // Generate OTP code
    const otpCode = generateOtpCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now

    // Save OTP session to database
    await prisma.credoOtpSession.upsert({
      where: { consumerId: consumer.id },
      update: {
        otpCode,
        phone: consumer.phone,
        attempts: 0,
        isVerified: false,
        expiresAt,
      },
      create: {
        consumerId: consumer.id,
        otpCode,
        phone: consumer.phone,
        expiresAt,
      },
    });

    // TODO: Send OTP via SMS using GHL or Twilio
    // For now, just log it for development
    console.log(`[OTP] ${consumer.firstName}: ${otpCode} (expires ${expiresAt.toISOString()})`);

    // In production, implement SMS sending here:
    // await sendOtpViaSms(consumer.phone, otpCode, consumer.firstName);

    return NextResponse.json(
      {
        message: "OTP sent to your registered phone number",
        // For development only — remove in production
        ...(process.env.NODE_ENV === "development" && { debugOtp: otpCode }),
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 }
      );
    }

    console.error("[OTP Generation Error]", error);
    return NextResponse.json(
      { error: "Failed to generate OTP. Please try again." },
      { status: 500 }
    );
  }
}
