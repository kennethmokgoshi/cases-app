import { auth } from '@zenowethu/shared-lib'
import { logger, renderBrandedEmail } from '@zenowethu/shared-lib'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import path from 'path'
import fs from 'fs'
import { sendEmail } from '@/lib/email'

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const OVERCHARGE_TYPES = [
  'debit_order_overcharge',
  'double_debit',
  'unauthorised_debit',
  'other',
] as const

const SendRefundFormSchema = z.object({
  consumerName:    z.string().min(1).max(200),
  email:           z.string().email(),
  phone:           z.string().max(20).optional(),
  caseRef:         z.string().max(100).optional(),
  overchargeTypes: z.array(z.enum(OVERCHARGE_TYPES)).min(1, 'Select at least one overcharge type'),
  message:         z.string().max(2000).optional(),
})

type SendRefundFormInput = z.infer<typeof SendRefundFormSchema>

// ---------------------------------------------------------------------------
// Email HTML
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<(typeof OVERCHARGE_TYPES)[number], string> = {
  debit_order_overcharge: 'Debit Order Overcharge',
  double_debit:           'Double Debit',
  unauthorised_debit:     'Unauthorised Debit',
  other:                  'Other Overcharge / Billing Error',
}

function buildRefundEmailHtml(input: SendRefundFormInput): string {
  const typeList = input.overchargeTypes
    .map(t => `<li style="margin-bottom:4px;">${TYPE_LABELS[t]}</li>`)
    .join('')

  const content = `
    <h2 style="margin:0 0 8px;color:#0B1D35;font-size:20px;">Overcharge Refund Request Form</h2>
    <p style="margin:0 0 20px;color:#6B7280;font-size:13px;">
      Dear ${input.consumerName},
    </p>

    ${input.message
      ? `<p style="margin:0 0 20px;color:#374151;line-height:1.7;">${input.message.replace(/\n/g, '<br/>')}</p>`
      : `<p style="margin:0 0 20px;color:#374151;line-height:1.7;">
          We have attached the <strong>Zenowethu Consumer Overcharge Refund Request Form</strong> to this email.
          Please complete all sections in full, sign the declaration, and return the completed form to us at
          <a href="mailto:info@zenowethu.co.za" style="color:#C4953A;">info@zenowethu.co.za</a>
          or hand-deliver it to our office.
        </p>`}

    <div style="background:#F5F7FA;border:1px solid #E5E7EB;border-radius:8px;padding:18px 20px;margin:0 0 24px;">
      <p style="margin:0 0 8px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#9CA3AF;">
        Overcharge type(s) identified
      </p>
      <ul style="margin:0;padding-left:18px;font-size:14px;color:#0B1D35;">
        ${typeList}
      </ul>
      ${input.caseRef
        ? `<p style="margin:12px 0 0;font-size:13px;color:#6B7280;">
             Reference: <strong style="color:#0B1D35;">${input.caseRef}</strong>
           </p>`
        : ''}
    </div>

    <p style="margin:0 0 8px;color:#374151;font-size:14px;">
      <strong>What to do next:</strong>
    </p>
    <ol style="margin:0 0 24px;padding-left:20px;color:#374151;font-size:14px;line-height:1.8;">
      <li>Open the attached PDF using Adobe Acrobat or any PDF viewer.</li>
      <li>Fill in <em>all</em> required fields and attach your bank statement showing the overcharge.</li>
      <li>Sign the declaration on page 2.</li>
      <li>Return the completed form to <a href="mailto:info@zenowethu.co.za" style="color:#C4953A;">info@zenowethu.co.za</a>.</li>
    </ol>

    <p style="margin:0 0 6px;font-size:13px;color:#6B7280;">Processing time: <strong>5–10 business days</strong> from receipt of completed form.</p>
    <p style="margin:0;font-size:13px;color:#6B7280;">Questions? Call us on <strong>+27 81 747 7616</strong> or WhatsApp <strong>082 363 8207</strong>.</p>
  `

  return renderBrandedEmail(content, {
    title:       'Overcharge Refund Request Form',
    previewText: `Your refund request form from Zenowethu is attached — please complete and return it.`,
  })
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = SendRefundFormSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 422 },
    )
  }

  const input = parsed.data

  try {
    // Locate the static refund form PDF shipped with the app
    const pdfPath = path.join(process.cwd(), 'public', 'forms', 'Zenowethu_Refund_Request_Form.pdf')
    if (!fs.existsSync(pdfPath)) {
      logger.error('[refund-form/send] PDF not found at', pdfPath)
      return NextResponse.json({ error: 'Refund form PDF not found on server.' }, { status: 500 })
    }
    const pdfBuffer = fs.readFileSync(pdfPath)

    const subject =
      `Refund Request Form${input.caseRef ? ` — Ref: ${input.caseRef}` : ''} | Zenowethu`

    const result = await sendEmail({
      to:          input.email,
      fromName:    session.user.name ?? 'Zenowethu Finance',
      fromEmail:   session.user.email ?? undefined,
      subject,
      html:        buildRefundEmailHtml(input),
      attachments: [{
        filename:    'Zenowethu_Refund_Request_Form.pdf',
        content:     pdfBuffer,
        contentType: 'application/pdf',
      }],
    })

    if (!result.success) {
      logger.error('[refund-form/send] Email delivery failed:', result.error)
      return NextResponse.json({ error: 'Email delivery failed: ' + result.error }, { status: 502 })
    }

    logger.info(
      `[refund-form/send] Sent to ${input.email} for "${input.consumerName}" by ${session.user.id}`,
    )

    return NextResponse.json({ success: true, sentTo: input.email })
  } catch (err) {
    logger.error('[POST /api/finance/refund-form/send]', err)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
