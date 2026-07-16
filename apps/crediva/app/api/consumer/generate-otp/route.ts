import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@zenowethu/database";
import { generateOtpCode, sendOtpEmail } from "@zenowethu/shared-lib";

const generateOtpSchema = z.object({
  // The 13-digit SA ID number is the ONLY login identifier. Email and cell
  // number are not unique (two consumers may legitimately share them), so they
  // cannot identify a single account and are never accepted as identifiers.
  username: z.string().regex(/^\d{13}$/, "Enter your 13-digit ID number"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = generateOtpSchema.parse(body);

    const idNumber = data.username.trim();

    // Look the consumer up by ID number only. The emailed code is still
    // delivered to the email on file, but the ID is what identifies the account.
    const consumer = await prisma.consumerAccount.findUnique({
      where: { idNumber },
      select: { id: true, email: true, firstName: true },
    });

    if (!consumer) {
      // Return generic message for security (don't reveal if account exists)
      return NextResponse.json(
        { message: "If an account exists for this ID number, a login code will be sent to the registered email address." },
        { status: 200 }
      );
    }

    if (!consumer.email) {
      return NextResponse.json(
        { error: "No email address on file. Please reset your password or contact support." },
        { status: 400 }
      );
    }

    // Generate OTP code
    const otpCode = generateOtpCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now

    // Save OTP session to database.
    // The `phone` column stores the delivery destination — currently the email
    // address, since OTP is delivered by email (SMS is deferred to a later stage).
    await prisma.credoOtpSession.upsert({
      where: { consumerId: consumer.id },
      update: {
        otpCode,
        phone: consumer.email,
        attempts: 0,
        isVerified: false,
        expiresAt,
      },
      create: {
        consumerId: consumer.id,
        otpCode,
        phone: consumer.email,
        expiresAt,
      },
    });

    // Deliver the OTP by email (SMTP, with Resend fallback).
    const sent = await sendOtpEmail({
      email: consumer.email,
      otpCode,
      firstName: consumer.firstName ?? "there",
    });

    if (!sent && process.env.NODE_ENV !== "development") {
      return NextResponse.json(
        { error: "Could not send the login code right now. Please try again shortly." },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        message: "A login code has been sent to your registered email address.",
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
      { error: "Failed to generate login code. Please try again." },
      { status: 500 }
    );
  }
}
