import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  validateResetToken,
  resetPasswordWithToken,
  checkRateLimit,
  clientIpFromHeaders,
} from "@zenowethu/shared-lib";

// GET /api/consumer/reset-password?token=... — check a token's validity before
// showing the reset form (so the consumer sees expired/used messaging up front).
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  const { status } = await validateResetToken(token);
  return NextResponse.json({ status, valid: status === "VALID" });
}

const schema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function POST(req: NextRequest) {
  try {
    // Guard against token brute-forcing.
    const ip = clientIpFromHeaders(req.headers);
    const rate = checkRateLimit(`reset-password:${ip}`, 10, 15 * 60 * 1000);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
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

    const result = await resetPasswordWithToken(parsed.data.token, parsed.data.password);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: "Your password has been set. You can now log in with your ID number.",
    });
  } catch {
    return NextResponse.json(
      { error: "Could not reset your password. Please request a new link." },
      { status: 500 }
    );
  }
}
