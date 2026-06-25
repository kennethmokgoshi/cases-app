import { describe, it, expect, vi, beforeEach } from "vitest";

// Shared spy for whichever email provider gets constructed. Hoisted so it can be
// referenced inside the vi.mock factory below.
const { sendSpy } = vi.hoisted(() => ({ sendSpy: vi.fn() }));

// Mock the SMTP credential lookup (which otherwise hits the DB) and the provider
// classes, so we can control which provider is built and what its send() returns.
vi.mock("../integrations/smtp-config", () => ({
  getSMTPCredentials: vi.fn(),
}));

vi.mock("./providers", () => ({
  SmtpEmailProvider: class {
    send = sendSpy;
  },
  ResendEmailProvider: class {
    send = sendSpy;
  },
  MockEmailProvider: class {
    send = sendSpy;
  },
}));

import { sendOtpEmail, generateOtpCode, isValidOtpFormat } from "./otp-service";
import { getSMTPCredentials } from "../integrations/smtp-config";

const mockedGetSmtp = getSMTPCredentials as unknown as ReturnType<typeof vi.fn>;

describe("generateOtpCode / isValidOtpFormat", () => {
  it("generates a 6-digit numeric code", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateOtpCode();
      expect(code).toMatch(/^\d{6}$/);
      expect(isValidOtpFormat(code)).toBe(true);
    }
  });

  it("rejects malformed codes", () => {
    expect(isValidOtpFormat("12345")).toBe(false);
    expect(isValidOtpFormat("1234567")).toBe(false);
    expect(isValidOtpFormat("12a456")).toBe(false);
  });
});

describe("sendOtpEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.RESEND_API_KEY;
    // SMTP host present → SmtpEmailProvider is selected.
    mockedGetSmtp.mockResolvedValue({
      host: "smtp.test",
      port: 587,
      secure: false,
      username: "user@zenowethu.co.za",
      password: "secret",
      fromEmail: "no-reply@zenowethu.co.za",
    });
  });

  it("sends the code via the email provider and returns true on success (happy path)", async () => {
    sendSpy.mockResolvedValue({ success: true, provider: "SMTP" });

    const result = await sendOtpEmail({
      email: "consumer@example.co.za",
      otpCode: "123456",
      firstName: "Thandi",
    });

    expect(result).toBe(true);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const [to, subject, html, text] = sendSpy.mock.calls[0];
    expect(to).toBe("consumer@example.co.za");
    expect(subject).toContain("123456");
    expect(html).toContain("123456");
    expect(text).toContain("123456");
  });

  it("returns false when the provider reports failure", async () => {
    sendSpy.mockResolvedValue({ success: false, provider: "SMTP", error: "bounced" });

    const result = await sendOtpEmail({
      email: "consumer@example.co.za",
      otpCode: "111222",
      firstName: "Lerato",
    });

    expect(result).toBe(false);
  });

  it("returns false when the provider throws (error path)", async () => {
    sendSpy.mockRejectedValue(new Error("smtp connection refused"));

    const result = await sendOtpEmail({
      email: "consumer@example.co.za",
      otpCode: "654321",
      firstName: "Sipho",
    });

    expect(result).toBe(false);
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });
});
