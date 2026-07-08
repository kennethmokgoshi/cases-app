import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requestPasswordReset, checkRateLimit, clientIpFromHeaders } from "@zenowethu/shared-lib";

const schema = z.object({
  idNumber: z.string().regex(/^\d{13}$/, "Enter your 13-digit ID number"),
});

export async function POST(req: NextRequest) {
  try {
    // Reset emails are expensive and abusable — cap requests per IP.
    const ip = clientIpFromHeaders(req.headers);
    const rate = checkRateLimit(`forgot-password:${ip}`, 5, 15 * 60 * 1000);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many reset requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
      );
    }

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    // Never leak whether the ID exists — always return a generic success.
    await requestPasswordReset(parsed.data.idNumber);

    return NextResponse.json({
      success: true,
      message:
        "If a Credo profile exists for that ID number and has an email on file, a reset link has been sent.",
    });
  } catch {
    // Still return generic success to avoid enumeration / leaking internal errors.
    return NextResponse.json({
      success: true,
      message:
        "If a Credo profile exists for that ID number and has an email on file, a reset link has been sent.",
    });
  }
}
