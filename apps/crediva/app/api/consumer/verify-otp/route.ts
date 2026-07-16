import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@zenowethu/database";

const verifyOtpSchema = z.object({
  // ID number is the only login identifier — see generate-otp for rationale.
  username: z.string().regex(/^\d{13}$/, "Enter your 13-digit ID number"),
  otpCode: z.string().length(6, "OTP must be 6 digits").regex(/^\d+$/, "OTP must contain only digits"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = verifyOtpSchema.parse(body);

    const idNumber = data.username.trim();

    // Look the consumer up by ID number only.
    const consumer = await prisma.consumerAccount.findUnique({
      where: { idNumber },
      select: { id: true },
    });

    if (!consumer) {
      return NextResponse.json(
        { error: "Invalid ID number or OTP" },
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
