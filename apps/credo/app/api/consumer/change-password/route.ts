import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@zenowethu/database";
import {
  setConsumerPassword,
  checkRateLimit,
  clientIpFromHeaders,
} from "@zenowethu/shared-lib";
import { auth } from "@/auth";

const schema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

// POST /api/consumer/change-password — authenticated password change. Enforces
// the strength policy and the last-5-passwords reuse rule, and clears the
// mustChangePassword flag set on default/staff-issued passwords.
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = clientIpFromHeaders(req.headers);
    const rate = checkRateLimit(`change-password:${session.user.id}:${ip}`, 5, 15 * 60 * 1000);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
      );
    }

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const consumer = await prisma.consumerAccount.findUnique({
      where: { id: session.user.id },
      select: { id: true, password: true },
    });
    if (!consumer?.password) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const currentValid = await bcrypt.compare(parsed.data.currentPassword, consumer.password);
    if (!currentValid) {
      return NextResponse.json({ error: "Your current password is incorrect." }, { status: 400 });
    }

    const result = await setConsumerPassword(consumer.id, parsed.data.newPassword);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: "Your password has been changed.",
    });
  } catch {
    return NextResponse.json(
      { error: "Could not change your password. Please try again." },
      { status: 500 }
    );
  }
}
