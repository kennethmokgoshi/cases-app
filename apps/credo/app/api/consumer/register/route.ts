import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@zenowethu/database";
import { sendEmail, welcomeEmailHtml } from "@/lib/email";

const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  idNumber: z.string().length(13, "SA ID must be 13 digits").optional().or(z.literal("")),
  phone: z.string().optional(),
  province: z.string().optional(),
  language: z.string().default("English"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = registerSchema.parse(body);

    const existing = await prisma.consumerAccount.findUnique({
      where: { email: data.email },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    if (data.idNumber) {
      const existingId = await prisma.consumerAccount.findUnique({
        where: { idNumber: data.idNumber },
        select: { id: true },
      });
      if (existingId) {
        return NextResponse.json(
          { error: "This ID number is already registered" },
          { status: 409 }
        );
      }
    }

    // Match consumer to existing Client by ID number so their cases appear immediately
    let linkedClientId: string | null = null;
    if (data.idNumber) {
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
    }

    const hashedPassword = await bcrypt.hash(data.password, 12);

    const consumer = await prisma.consumerAccount.create({
      data: {
        email: data.email,
        password: hashedPassword,
        firstName: data.firstName,
        lastName: data.lastName,
        idNumber: data.idNumber || null,
        phone: data.phone || null,
        province: data.province || null,
        language: data.language,
        linkedClientId,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        createdAt: true,
        linkedClientId: true,
      },
    });

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
    }).catch((err) => console.error("Staff notification email failed:", err));

    return NextResponse.json(
      { success: true, consumer, linkedToExistingClient: linkedClientId !== null },
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

    return NextResponse.json(
      { error: `Registration failed: ${prismaError.message ?? "Unknown error"}. Please try again or contact support.` },
      { status: 500 }
    );
  }
}
