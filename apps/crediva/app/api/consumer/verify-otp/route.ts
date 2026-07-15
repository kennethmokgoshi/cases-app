import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@zenowethu/database";

const verifyOtpSchema = z.object({
  username: z.string().min(1, "Username is required"),
  otpCode: z.string().length(6, "OTP must be 6 digits").regex(/^\d+$/, "OTP must contain only digits"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = verifyOtpSchema.parse(body);

    const username = data.username.trim();

    // Find consumer by email or ID number
    let consumer = await prisma.consumerAccount.findFirst({
      where: { email: username },
      select: { id: true },
    });

    if (!consumer && /^\d{13}$/.test(username)) {
      consumer = await prisma.consumerAccount.findUnique({
        where: { idNumber: username },
        select: { id: true },
      });
    }

    if (!consumer) {
      return NextResponse.json(
        { error: "Invalid username or OTP" },
        { status: 401 }
      );
    }

    // Get OTP session
    const otpSession = await prisma.credoOtpSession.findUnique({
      where: { consumerId: consumer.id },
    });

    if (!otpSession) {
      return NextResponse.json(
        { error: "No OTP found. Please request a new one." },
        { status: 401 }
      );
    }

    // Check if OTP is expired
    if (otpSession.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "OTP has expired. Please request a new one." },
        { status: 401 }
      );
    }

    // Check if max attempts exceeded
    if (otpSession.attempts >= otpSession.maxAttempts) {
      return NextResponse.json(
        { error: "Too many failed attempts. Please request a new OTP." },
        { status: 429 }
      );
    }

    // Verify OTP code
    if (otpSession.otpCode !== data.otpCode) {
      // Increment attempts and update
      await prisma.credoOtpSession.update({
        where: { consumerId: consumer.id },
        data: { attempts: otpSession.attempts + 1 },
      });

      return NextResponse.json(
        { error: "Invalid OTP. Please try again.", remainingAttempts: otpSession.maxAttempts - otpSession.attempts - 1 },
        { status: 401 }
      );
    }

    // OTP is valid — mark as verified
    await prisma.credoOtpSession.update({
      where: { consumerId: consumer.id },
      data: { isVerified: true },
    });

    return NextResponse.json(
      { success: true, message: "OTP verified successfully" },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 }
      );
    }

    console.error("[OTP Verification Error]", error);
    return NextResponse.json(
      { error: "Failed to verify OTP. Please try again." },
      { status: 500 }
    );
  }
}
