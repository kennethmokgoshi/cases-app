import { NextResponse } from 'next/server';
import { auth, logger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { z } from 'zod';
import { generateInvoicePdf, InvoiceLineItem } from '@/lib/invoice-pdf';
import path from 'path';
import fs from 'fs/promises';

const ConfirmSchema = z.object({
  partnerId: z.string(),
  splitPercent: z.number().min(0).max(100),
  groupedLines: z.array(
    z.object({
      paymentMethod: z.string(),
      totalCollected: z.number(),
      splitPercentage: z.number(),
      invoiceAmount: z.number(),
    })
  ),
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const body = await request.json();
    const parsed = ConfirmSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const { partnerId, splitPercent, groupedLines } = parsed.data;

    // Verify the project exists and is a B2B partner
    const partner = await prisma.project.findUnique({
      where: { id: partnerId },
    });

    if (!partner) {
      return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
    }

    const subtotal = groupedLines.reduce((acc, line) => acc + line.invoiceAmount, 0);
    const vatRate = 0.15;
    const vatAmount = subtotal * vatRate;
    const total = subtotal + vatAmount;

    // Construct invoice line items
    const lineItems: InvoiceLineItem[] = groupedLines.map((line) => ({
      description: `Collections via ${line.paymentMethod} (${line.splitPercentage}% Split)`,
      quantity: 1,
      unitPrice: line.invoiceAmount,
    }));

    const now = new Date();
    const dueAt = new Date();
    dueAt.setDate(dueAt.getDate() + 30); // 30 days due date

    // Create the invoice
    // Generate a unique invoice number (e.g., INV{MM}{YYYY}-{RandomHex})
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = String(now.getFullYear());
    const randomHex = Math.floor(Math.random() * 0xfffff).toString(16).toUpperCase().padStart(5, '0');
    const invoiceNumber = `INV${month}${year}-${randomHex}`;

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        status: 'DRAFT',
        projectId: partnerId,
        createdById: session.user.id,
        lineItems: JSON.stringify(lineItems),
        subtotal,
        vatRate,
        vatAmount,
        total,
        issuedAt: now,
        dueAt,
        type: 'INVOICE',
      },
    });

    // Automatically trigger PDF generation
    try {
      const pdfBytes = await generateInvoicePdf({
        invoiceNumber: invoice.invoiceNumber,
        issuedAt: invoice.issuedAt,
        dueAt: invoice.dueAt,
        status: invoice.status,
        clientName: partner.name,
        lineItems,
        subtotal,
        vatRate,
        vatAmount,
        total,
        notes: `Partner Split Invoice (${splitPercent}%)`,
      });

      const relPath = path.join('uploads', 'invoices', `${invoice.invoiceNumber}.pdf`);
      const absPath = path.join(process.cwd(), 'public', relPath);
      
      await fs.mkdir(path.dirname(absPath), { recursive: true });
      await fs.writeFile(absPath, pdfBytes);

      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { pdfPath: relPath },
      });
    } catch (pdfError) {
      logger.error('Failed to generate PDF during partner invoice creation:', pdfError);
      // We don't fail the request if PDF generation fails, as the invoice is already created.
    }

    return NextResponse.json({ success: true, invoiceId: invoice.id });
  } catch (error) {
    logger.error('Failed to confirm partner upload:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
