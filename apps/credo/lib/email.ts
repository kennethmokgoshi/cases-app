import nodemailer from "nodemailer";

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
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:40px 20px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
        <!-- Header -->
        <tr><td style="background:#0B1D35;padding:32px 40px">
          <h1 style="margin:0;color:#FFFFFF;font-size:22px;font-weight:700;letter-spacing:-0.02em">Credo</h1>
          <p style="margin:4px 0 0;color:#C4953A;font-size:13px;font-weight:500">Credit Repair &amp; Financial Wellness</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:36px 40px">
          <h2 style="margin:0 0 12px;color:#0F172A;font-size:20px;font-weight:700">Welcome, ${firstName}!</h2>
          <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6">
            Your Credo account is ready. You can now access your Document Vault, track your credit repair cases,
            and chat with our AI Credit Coach — all in one place.
          </p>
          <a href="${process.env.NEXTAUTH_URL || "http://localhost:3005"}/dashboard"
             style="display:inline-block;background:#0B1D35;color:#FFFFFF;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600">
            Go to my dashboard →
          </a>
        </td></tr>
        <!-- Steps -->
        <tr><td style="padding:0 40px 32px">
          <p style="margin:0 0 14px;color:#0F172A;font-size:14px;font-weight:600">Get started in 3 steps:</p>
          <table cellpadding="0" cellspacing="0" width="100%">
            ${[
              ["1", "Upload your ID & payslip", "We need these to open your credit repair case."],
              ["2", "Request a credit report pull", "We'll fetch your score from all 4 bureaus."],
              ["3", "Let us dispute the negatives", "Our team files NCA Section 72 dispute letters on your behalf."],
            ].map(([num, title, desc]) => `
            <tr><td style="padding:10px 0;border-top:1px solid #F1F5F9">
              <table cellpadding="0" cellspacing="0"><tr>
                <td style="width:28px;height:28px;background:#E4EDF8;border-radius:50%;text-align:center;vertical-align:middle;font-size:12px;font-weight:700;color:#0B1D35">${num}</td>
                <td style="padding-left:12px">
                  <p style="margin:0;font-size:13px;font-weight:600;color:#0F172A">${title}</p>
                  <p style="margin:2px 0 0;font-size:12px;color:#64748B">${desc}</p>
                </td>
              </tr></table>
            </td></tr>`).join("")}
          </table>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#F8F9FA;padding:20px 40px;border-top:1px solid #E2E8F0">
          <p style="margin:0;font-size:12px;color:#94A3B8;line-height:1.6">
            Zenowethu Consulting &bull; 012 035 1824 &bull; zenowethu@gmail.com<br>
            This email was sent because you registered at Credo. You can manage your notification preferences in your account settings.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
