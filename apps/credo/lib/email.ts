import nodemailer from "nodemailer";
import { renderBrandedEmail, withMonitoringBcc } from "@zenowethu/shared-lib";

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  fromName?: string;
  fromEmail?: string;
}

interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
  // --- 1. SMTP ---
  if (process.env.SMTP_HOST) {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER || "",
        pass: process.env.SMTP_PASSWORD || process.env.SMTP_PASS || "",
      },
      tls: { rejectUnauthorized: false },
    });

    try {
      const info = await transporter.sendMail({
        from:    opts.fromEmail || process.env.SMTP_FROM || process.env.EMAIL_FROM || process.env.SMTP_USER,
        to:      opts.to,
        bcc:     withMonitoringBcc()?.join(", "),
        subject: opts.subject,
        html:    opts.html,
        text:    opts.html.replace(/<[^>]*>/g, ""),
      });
      return { success: true, messageId: info.messageId };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  // --- 2. Resend Fallback ---
  if (process.env.RESEND_API_KEY) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type':  'application/json'
        },
        body: JSON.stringify({
          from:    opts.fromEmail || process.env.EMAIL_FROM || process.env.SMTP_FROM || 'notifications@zenowethu.co.za',
          to:      [opts.to],
          bcc:     withMonitoringBcc(),
          subject: opts.subject,
          html:    opts.html,
          text:    opts.html.replace(/<[^>]*>/g, '')
        })
      });

      const data = await response.json() as { id?: string; message?: string };

      if (response.ok && data.id) {
        return { success: true, messageId: data.id };
      }
      return { success: false, error: data.message || `Resend HTTP ${response.status}` };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  // --- 3. GHL Webhook Fallback ---
  if (process.env.GHL_EMAIL_WEBHOOK_URL || process.env.GHL_WEBHOOK_URL) {
    const webhookUrl = process.env.GHL_EMAIL_WEBHOOK_URL || process.env.GHL_WEBHOOK_URL;
    try {
      await fetch(webhookUrl!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email:   opts.to,
          subject: opts.subject,
          message: opts.html.replace(/<[^>]*>/g, ''),
          html:    opts.html,
          from_name:  opts.fromName || 'Credo',
          from_email: opts.fromEmail || 'notifications@zenowethu.co.za',
          bcc:        withMonitoringBcc(),
          first_name: opts.fromName ? opts.fromName.split(' ')[0] : 'Credo',
          last_name:  opts.fromName ? opts.fromName.split(' ').slice(1).join(' ') : '',
          pre_header: opts.subject
        }),
      });
      return { success: true, messageId: `ghl-${Date.now()}` };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: `GHL Fallback Error: ${message}` };
    }
  }

  // --- 4. Mock Fallback (Dev Only) ---
  const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
  if (!isDev) {
    return { success: false, error: "Email provider (SMTP/Resend/GHL) not configured on live server." };
  }

  // Dev fallback — log to console
  console.info("[MOCK EMAIL]", { to: opts.to, subject: opts.subject });
  return { success: true, messageId: `mock-${Date.now()}` };
}

export function welcomeEmailHtml(firstName: string): string {
    const content = `
        <h2 style="margin: 0 0 15px; color: #0d3870; font-size: 22px;">Welcome to the family, ${firstName}!</h2>
        <p style="margin: 0 0 20px; color: #475569; font-size: 16px; line-height: 1.6">
            Your Credo account is ready. You can now access your Document Vault, track your credit repair cases,
            and chat with our AI Credit Coach — all in one place.
        </p>
        
        <p style="margin: 0 0 15px; color: #0f172a; font-size: 15px; font-weight: 600">Get started in 3 simple steps:</p>
        
        <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 25px;">
            <tr>
                <td style="padding: 12px 0; border-top: 1px solid #f1f5f9">
                    <table cellpadding="0" cellspacing="0">
                        <tr>
                            <td style="width: 32px; height: 32px; background: #e4edf8; border-radius: 50%; text-align: center; vertical-align: middle; font-size: 14px; font-weight: 700; color: #0d3870">1</td>
                            <td style="padding-left: 15px">
                                <p style="margin: 0; font-size: 14px; font-weight: 600; color: #0f172a">Upload your ID & payslip</p>
                                <p style="margin: 2px 0 0; font-size: 13px; color: #64748b">Required to open your credit repair case.</p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
            <tr>
                <td style="padding: 12px 0; border-top: 1px solid #f1f5f9">
                    <table cellpadding="0" cellspacing="0">
                        <tr>
                            <td style="width: 32px; height: 32px; background: #e4edf8; border-radius: 50%; text-align: center; vertical-align: middle; font-size: 14px; font-weight: 700; color: #0d3870">2</td>
                            <td style="padding-left: 15px">
                                <p style="margin: 0; font-size: 14px; font-weight: 600; color: #0f172a">Request a credit report pull</p>
                                <p style="margin: 2px 0 0; font-size: 13px; color: #64748b">We'll fetch your scores from all major bureaus.</p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
            <tr>
                <td style="padding: 12px 0; border-top: 1px solid #f1f5f9; border-bottom: 1px solid #f1f5f9">
                    <table cellpadding="0" cellspacing="0">
                        <tr>
                            <td style="width: 32px; height: 32px; background: #e4edf8; border-radius: 50%; text-align: center; vertical-align: middle; font-size: 14px; font-weight: 700; color: #0d3870">3</td>
                            <td style="padding-left: 15px">
                                <p style="margin: 0; font-size: 14px; font-weight: 600; color: #0f172a">Let us dispute the negatives</p>
                                <p style="margin: 2px 0 0; font-size: 13px; color: #64748b">Our team files formal dispute letters on your behalf.</p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
        
        <p style="margin-bottom: 20px;">We are excited to help you on your journey to financial wellness!</p>
    `;

    return renderBrandedEmail(content, {
        title: "Welcome to Credo",
        previewText: "Your account is ready. Let's get started on your credit repair journey.",
        button: {
            text: "Go to my dashboard →",
            url: `${process.env.NEXTAUTH_URL || "https://credo.zenowethu.co.za"}/dashboard`
        },
        companyName: "Zenowethu Consulting (Credo)"
    });
}
