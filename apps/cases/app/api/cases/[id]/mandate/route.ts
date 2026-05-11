import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@zenowethu/database'
import { generateMandatePdf } from '@/lib/mandate-pdf'
import nodemailer from 'nodemailer'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const { to, subject, bankDetails, paymentDetails, salesPerson } = body

    if (!to) {
      return NextResponse.json({ error: 'Recipient email is required' }, { status: 400 })
    }

    // 1. Fetch Case & Client Data
    const caseData = await prisma.case.findUnique({
      where: { id },
      include: {
        client: true,
        jointClient: true,
      }
    })

    if (!caseData) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 })
    }

    // 2. Generate PDF
    const pdfBytes = await generateMandatePdf({
      invoiceNumber: caseData.fileNumber,
      client: {
        firstName: caseData.client.firstName,
        lastName: caseData.client.lastName,
        idNumber: caseData.client.idNumber,
        phone: caseData.client.phone || '',
        address: caseData.client.address || '',
      },
      jointClient: caseData.jointClient ? {
        firstName: caseData.jointClient.firstName,
        lastName: caseData.jointClient.lastName,
        idNumber: caseData.jointClient.idNumber,
      } : undefined,
      bankDetails: bankDetails || {
        bankName: (caseData as any).bankName || '',
        accountHolder: (caseData as any).accountHolderName || '',
        accountNumber: (caseData as any).accountNumber || '',
        branchCode: (caseData as any).branchNumber || '',
        accountType: (caseData as any).accountType || '',
      },
      paymentDetails: paymentDetails || {
        contractAmount: caseData.totalDebtAmount?.toString() || '',
        instalmentAmount: caseData.totalMonthlyInstallment?.toString() || '',
        numInstalments: (caseData as any).instalments?.toString() || '',
        frequency: 'Monthly',
        firstDate: '',
        lastDate: '',
      },
      salesPerson: salesPerson || '',
      issuedAt: new Date(),
    })

    // 3. Setup Mailer
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    })

    // 4. Send Email
    await transporter.sendMail({
      from: `"Zenowethu Debt Management" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to,
      subject: subject || 'Debit Order Mandate - Zenowethu',
      text: `Please find attached the Debit Order Mandate for ${caseData.client.firstName} ${caseData.client.lastName}${caseData.jointClient ? ` & ${caseData.jointClient.firstName} ${caseData.jointClient.lastName}` : ''}.`,
      attachments: [
        {
          filename: `Mandate_${caseData.fileNumber}.pdf`,
          content: Buffer.from(pdfBytes),
        },
      ],
    })

    // 5. Log Activity
    await prisma.workflowLog.create({
      data: {
        caseId: id,
        fromStatus: caseData.status,
        toStatus: caseData.status,
        notes: `Debit Order Mandate sent to ${to}`,
        timestamp: new Date()
      }
    })

    return NextResponse.json({ success: true, message: 'Mandate sent successfully' })
  } catch (error: any) {
    console.error('Error sending mandate:', error)
    return NextResponse.json({ error: error.message || 'Failed to send mandate' }, { status: 500 })
  }
}
