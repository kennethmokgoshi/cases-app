import { createLogger } from "../logger";
import { getSMTPCredentials } from "../integrations/smtp-config";
import {
  SmtpEmailProvider,
  ResendEmailProvider,
  MockEmailProvider,
  type EmailProvider,
} from "./providers";

const logger = createLogger("OtpService");

function maskEmail(email: string): string {
  return email.replace(/(^.).*(@.*$)/, "$1***$2");
}

/**
 * Builds a transactional email provider for OTP delivery.
 *
 * Deliberately SMTP-first (then Resend, then Mock) rather than going through the
 * GHL-first chain used for conversational/case email — an OTP is a one-shot
 * transactional code that should be delivered directly, not routed as a CRM message.
 */
async function getTransactionalEmailProvider(): Promise<EmailProvider> {
  const smtp = await getSMTPCredentials();

  if (smtp.host) {
    return new SmtpEmailProvider({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.username, pass: smtp.password },
      fromEmail: smtp.fromEmail || undefined,
    });
  }

  if (process.env.RESEND_API_KEY) {
    return new ResendEmailProvider(
      process.env.RESEND_API_KEY,
      smtp.fromEmail || "notifications@zenowethu.co.za"
    );
  }

  return new MockEmailProvider();
}

function otpEmailHtml(firstName: string, otpCode: string): string {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#F8F9FA;font-family:Inter,Arial,sans-serif;">
    <div style="max-width:480px;margin:0 auto;padding:32px 16px;">
      <div style="background:#FFFFFF;border-radius:16px;padding:36px 32px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <div style="display:inline-block;background:#0B1D35;color:#FFFFFF;font-weight:700;font-size:18px;border-radius:8px;padding:6px 14px;letter-spacing:-0.02em;">Credo</div>
        <h1 style="font-size:20px;color:#0F172A;margin:24px 0 8px;">Your login code</h1>
        <p style="font-size:15px;color:#64748B;margin:0 0 24px;">Hi ${firstName}, use the code below to sign in to your Credo account.</p>
        <div style="font-size:34px;font-weight:700;letter-spacing:8px;color:#0B1D35;background:#F1F5F9;border-radius:10px;padding:18px;text-align:center;">${otpCode}</div>
        <p style="font-size:13px;color:#94A3B8;margin:20px 0 0;">This code is valid for 15 minutes. If you did not request it, you can safely ignore this email.</p>
        <hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0;" />
        <p style="font-size:12px;color:#94A3B8;margin:0;">Zenowethu Debt Management | NCRDC3693 | notifications@zenowethu.co.za | www.zenowethu.co.za</p>
      </div>
    </div>
  </body>
</html>`;
}

export interface SendOtpEmailOptions {
  email: string;
  otpCode: string;
  firstName: string;
}

/**
 * Sends an OTP code to a consumer by email (SMTP, with Resend fallback).
 *
 * This is the active OTP delivery channel — SMS is not yet wired up. Returns
 * true when the provider reports success.
 */
export async function sendOtpEmail(options: SendOtpEmailOptions): Promise<boolean> {
  const { email, otpCode, firstName } = options;

  const provider = await getTransactionalEmailProvider();
  const subject = `Your Credo login code: ${otpCode}`;
  const html = otpEmailHtml(firstName || "there", otpCode);
  const text = `Hi ${firstName || "there"},\n\nYour Credo login code is ${otpCode}. It is valid for 15 minutes.\n\nIf you did not request this, you can ignore this email.\n\n— Zenowethu / Credo`;

  try {
    const result = await provider.send(email, subject, html, text);
    logger.info({
      msg: "OTP email send",
      provider: result.provider,
      success: result.success,
      to: maskEmail(email),
      expiresIn: "15 minutes",
    });
    return result.success;
  } catch (err) {
    logger.error({
      msg: "OTP email send failed",
      to: maskEmail(email),
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

export interface SendOtpOptions {
  phone: string;
  otpCode: string;
  firstName: string;
  method?: "SMS" | "WHATSAPP"; // Extensible for future channel support
}

/**
 * Sends an OTP code to a consumer via SMS or WhatsApp.
 *
 * NOT YET IMPLEMENTED — SMS/WhatsApp delivery is deferred to a later stage.
 * Use {@link sendOtpEmail} for the active email channel.
 *
 * TODO: Wire to real SMS provider (Twilio, GHL SMS, etc.)
 */
export async function sendOtp(options: SendOtpOptions): Promise<void> {
  const { phone, otpCode, firstName, method = "SMS" } = options;

  logger.info({
    msg: "OTP requested (SMS channel not yet implemented)",
    phone: phone.replace(/\d(?=\d{4})/g, "*"), // mask phone for logs
    firstName,
    method,
    expiresIn: "15 minutes",
  });

  // TODO: Implement real SMS sending here
  if (process.env.NODE_ENV === "development") {
    console.log(`[OTP ${method}] ${firstName}: ${otpCode} (valid for 15 minutes)`);
  }
}

/**
 * Validates an OTP code format (6 digits)
 */
export function isValidOtpFormat(code: string): boolean {
  return /^\d{6}$/.test(code);
}

/**
 * Generates a random 6-digit OTP code
 */
export function generateOtpCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
