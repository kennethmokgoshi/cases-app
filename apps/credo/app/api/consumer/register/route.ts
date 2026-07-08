import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@zenowethu/database";
import {
  validatePasswordStrength,
  checkRateLimit,
  clientIpFromHeaders,
  createLogger,
} from "@zenowethu/shared-lib";
import { sendEmail, welcomeEmailHtml } from "@/lib/email";

const logger = createLogger("credo/register");

const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  // ID number is the login username, so it is required and must be 13 digits.
  idNumber: z.string().regex(/^\d{13}$/, "Enter a valid 13-digit SA ID number"),
  phone: z.string().optional(),
  province: z.string().optional(),
  language: z.string().default("English"),
});

export async function POST(req: NextRequest) {
  try {
    const ip = clientIpFromHeaders(req.headers);
    const rate = checkRateLimit(`register:${ip}`, 5, 60 * 60 * 1000);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many registration attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
      );
    }

    const body = await req.json();
    const data = registerSchema.parse(body);

    const strength = validatePasswordStrength(data.password);
    if (!strength.ok) {
      return NextResponse.json({ error: strength.error, field: "password" }, { status: 400 });
    }

    // Email and cell number are intentionally NOT unique — two different people
    // (e.g. a parent helping a child) may legitimately share them. Only the ID
    // number identifies a Credo profile, so that is the sole uniqueness check.
    const existingId = await prisma.consumerAccount.findUnique({
      where: { idNumber: data.idNumber },
      select: { id: true, activatedAt: true, linkedClientId: true },
    });
    if (existingId?.activatedAt) {
      // Already a real, activated account — direct them to log in.
      return NextResponse.json(
        { error: "This ID number is already registered. Please log in instead.", field: "idNumber" },
        { status: 409 }
      );
    }

    const hashedPassword = await bcrypt.hash(data.password, 12);
    const consumerSelect = {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      createdAt: true,
      linkedClientId: true,
    } as const;

    let consumer: {
      id: string; email: string; firstName: string; lastName: string;
      createdAt: Date; linkedClientId: string | null;
    };

    if (existingId) {
      // An auto-provisioned (un-activated) profile already exists for this ID.
      // Claim it: set the password and the consumer's own details, and activate.
      consumer = await prisma.consumerAccount.update({
        where: { id: existingId.id },
        data: {
          email: data.email,
          password: hashedPassword,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone || null,
          province: data.province || null,
          language: data.language,
          source: "SELF_REGISTERED",
          activatedAt: new Date(),
          mustChangePassword: false,
          passwordChangedAt: new Date(),
        },
        select: consumerSelect,
      });
    } else {
      // Match to an existing Client by ID number so their cases appear immediately.
      let linkedClientId: string | null = null;
      const matchedClient = await prisma.client.findFirst({
        where: { idNumber: data.idNumber },
        select: { id: true },
      });
      if (matchedClient) {
        const alreadyLinked = await prisma.consumerAccount.findFirst({
          where: { linkedClientId: matchedClient.id },
          select: { id: true },
        });
        if (!alreadyLinked) {
          linkedClientId = matchedClient.id;
        }
      }

      consumer = await prisma.consumerAccount.create({
        data: {
          email: data.email,
          password: hashedPassword,
          firstName: data.firstName,
          lastName: data.lastName,
          idNumber: data.idNumber,
          phone: data.phone || null,
          province: data.province || null,
          language: data.language,
          linkedClientId,
          source: "SELF_REGISTERED",
          activatedAt: new Date(),
        },
        select: consumerSelect,
      });
    }

    // Notify User
    sendEmail({
      to: consumer.email,
      subject: "Welcome to Credo — your credit repair journey starts here",
      html: welcomeEmailHtml(consumer.firstName),
    }).catch(() => undefined);

    // Notify Staff (Zenowethu Support)
    sendEmail({
      to: "support@zenowethu.co.za",
      subject: `🚨 ACTION REQUIRED: New Credo Registration - ${consumer.firstName} ${consumer.lastName}`,
      html: `
        <h2>New Credo Registration</h2>
        <p>A new consumer has registered on the Credo portal and is awaiting credit report uploads.</p>
        <ul>
          <li><strong>Name:</strong> ${consumer.firstName} ${consumer.lastName}</li>
          <li><strong>Email:</strong> ${consumer.email}</li>
          <li><strong>ID Number:</strong> ${data.idNumber || "Not provided"}</li>
          <li><strong>Registration Date:</strong> ${new Date().toLocaleString()}</li>
        </ul>
        <p><a href="https://cases.zenowethu.co.za/clients/${consumer.linkedClientId || ''}">View Client in Cases App</a></p>
        <p>Please pull and upload the 4-bureau credit reports to the client's case to activate their dashboard.</p>
      `,
    }).catch((err) => logger.error("Staff notification email failed:", err));

    return NextResponse.json(
      { success: true, consumer, linkedToExistingClient: consumer.linkedClientId !== null },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message, field: error.issues[0].path[0] },
        { status: 400 }
      );
    }

    const prismaError = error as { code?: string; message?: string };
    if (prismaError.code === "P2002") {
      const target = prismaError.message?.includes("email") ? "email address" : "ID number";
      return NextResponse.json(
        { error: `This ${target} is already registered. Please log in instead.`, field: prismaError.message?.includes("email") ? "email" : "idNumber" },
        { status: 409 }
      );
    }
    if (["P2021", "P1001", "P1003"].includes(prismaError.code ?? "")) {
      return NextResponse.json(
        { error: "Database is temporarily unavailable. Please try again in a few minutes." },
        { status: 503 }
      );
    }

    // Never echo internal error details (SQL, stack fragments) to the client.
    logger.error("Registration failed:", error);
    return NextResponse.json(
      { error: "Registration failed. Please try again or contact support." },
      { status: 500 }
    );
  }
}
