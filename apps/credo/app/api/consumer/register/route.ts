import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@zenowethu/database";

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
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, consumer }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message, field: error.errors[0].path[0] },
        { status: 400 }
      );
    }

    // Prisma error codes
    const prismaError = error as { code?: string; message?: string };
    if (prismaError.code === "P2002") {
      const target = prismaError.message?.includes("email") ? "email address" : "ID number";
      return NextResponse.json(
        { error: `This ${target} is already registered. Please log in instead.`, field: prismaError.message?.includes("email") ? "email" : "idNumber" },
        { status: 409 }
      );
    }
    if (prismaError.code === "P2021" || prismaError.code === "P1001" || prismaError.code === "P1003") {
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
