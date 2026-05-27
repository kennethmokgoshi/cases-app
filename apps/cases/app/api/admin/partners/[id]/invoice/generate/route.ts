import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';
import { generateInvoicePdf, InvoiceData } from '@/lib/invoice-pdf';
import { parsePartnerUsageReport } from '@/lib/partner-usage-parser';
import { sendEmailWithAttachments } from '@/lib/email-with-attachments';
import { randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: projectId } = await params;
        const project = await prisma.project.findUnique({
            where: { id: projectId }
        });

        if (!project || project.type !== 'ACQUISITION_SOURCE') {
            return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
        }

        const formData = await req.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        // Parse Excel file using extracted utility
        const buffer = await file.arrayBuffer();
        let parsed;
        try {
            parsed = parsePartnerUsageReport(buffer);
        } catch (parseError: any) {
            return NextResponse.json({ error: parseError.message }, { status: 400 });
        }

        const { lineItems, subtotal } = parsed;

        const vatRate = 0.15;
        const vatAmount = subtotal * vatRate;
        const total = subtotal + vatAmount;

        const invoiceNumber = `INV-${project.name.substring(0, 3).toUpperCase()}-${Date.now().toString().slice(-6)}`;
        const issuedAt = new Date();
        const dueAt = new Date();
        dueAt.setDate(dueAt.getDate() + 14); // Net 14

        const invoiceData: InvoiceData = {
            invoiceNumber,
            issuedAt,
            dueAt,
            status: 'DRAFT',
            clientName: project.name,
            clientEmail: project.billingEmail || 'accounts@zenowethu.co.za',
            lineItems,
            subtotal,
            vatRate,
            vatAmount,
            total,
            notes: 'Generated from B2B Partner Usage Report'
        };

        const pdfBytes = await generateInvoicePdf(invoiceData);
        
        // Save PDF to public/uploads/invoices
        const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'invoices');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        
        const fileName = `${invoiceNumber}.pdf`;
        const pdfPath = `/uploads/invoices/${fileName}`;
        fs.writeFileSync(path.join(uploadDir, fileName), pdfBytes);

        // Create Database Record
        const publicToken = randomBytes(16).toString('hex');
        
        const invoice = await prisma.invoice.create({
            data: {
                invoiceNumber,
                status: 'DRAFT',
                projectId,
                lineItems: lineItems as any,
                subtotal,
                vatRate,
                vatAmount,
                total,
                issuedAt,
                dueAt,
                pdfPath,
                type: 'INVOICE',
                publicToken,
                createdById: session.user.id
            }
        });

        // Trigger Email dispatch if billingEmail exists
        if (project.billingEmail) {
            try {
                const trackingLink = `${process.env.NEXT_PUBLIC_APP_URL || 'https://cases.zenowethu.co.za'}/public/invoices/${publicToken}`;
                
                await sendEmailWithAttachments({
                    to: project.billingEmail,
                    subject: `New Invoice ${invoiceNumber} from Zenowethu`,
                    html: `<p>Hi Team,</p><p>Please find your latest invoice attached. You can also view and download it here: <a href="${trackingLink}">${trackingLink}</a></p><p>Thank you,<br/>Zenowethu Finance Team</p>`,
                    text: `Hi Team,\n\nPlease find your latest invoice attached. You can view and download it here: ${trackingLink}\n\nThank you,\nZenowethu Finance Team`,
                    attachments: [
                        {
                            filename: fileName,
                            content: Buffer.from(pdfBytes),
                            contentType: 'application/pdf'
                        }
                    ],
                    fromName: 'Zenowethu Finance',
                    fromEmail: 'accounts@zenowethu.co.za'
                });
            } catch (e) {
                console.error('Failed to send invoice email:', e);
            }
        }

        return NextResponse.json({ 
            success: true, 
            invoiceNumber, 
            invoiceId: invoice.id 
        });

    } catch (error: any) {
        console.error('B2B Invoice generation error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
