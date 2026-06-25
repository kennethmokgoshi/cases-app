import { createLogger } from "../logger";

const logger = createLogger("OtpService");

export interface SendOtpOptions {
  phone: string;
  otpCode: string;
  firstName: string;
  method?: "SMS" | "WHATSAPP"; // Extensible for future channel support
}

/**
 * Sends an OTP code to a consumer via SMS or WhatsApp
 * Currently logs to console; implement actual SMS sending with Twilio, GHL, etc.
 *
 * TODO: Wire to real SMS provider (Twilio, GHL SMS, etc.)
 */
export async function sendOtp(options: SendOtpOptions): Promise<void> {
  const { phone, otpCode, firstName, method = "SMS" } = options;

  logger.info({
    msg: "OTP requested",
    phone: phone.replace(/\d(?=\d{4})/g, "*"), // mask phone for logs
    firstName,
    method,
    expiresIn: "15 minutes",
  });

  // TODO: Implement real SMS sending here
  // For now, just log it for development
  if (process.env.NODE_ENV === "development") {
    console.log(`[OTP ${method}] ${firstName}: ${otpCode} (valid for 15 minutes)`);
  }

  // Future implementation:
  // if (method === "SMS") {
  //   await sendSmsTwilio(phone, otpCode, firstName);
  // } else if (method === "WHATSAPP") {
  //   await sendWhatsAppViaGhl(phone, otpCode, firstName);
  // }
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
