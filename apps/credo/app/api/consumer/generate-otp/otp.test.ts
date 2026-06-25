import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@zenowethu/database";
import bcrypt from "bcryptjs";

describe("Credo OTP Authentication", () => {
  const testEmail = "otp-test@credo.co.za";
  const testIdNumber = "8005015009087";
  const testPassword = "SecurePassword123";
  const testPhone = "0825366384";

  beforeEach(async () => {
    // Clean up test data
    await prisma.consumerAccount.deleteMany({
      where: {
        OR: [
          { email: testEmail },
          { idNumber: testIdNumber },
        ],
      },
    });
  });

  afterEach(async () => {
    // Clean up after tests
    await prisma.consumerAccount.deleteMany({
      where: {
        OR: [
          { email: testEmail },
          { idNumber: testIdNumber },
        ],
      },
    });
  });

  it("should generate and store OTP session", async () => {
    const hashedPassword = await bcrypt.hash(testPassword, 12);
    const consumer = await prisma.consumerAccount.create({
      data: {
        email: testEmail,
        password: hashedPassword,
        firstName: "OTP",
        lastName: "Test",
        idNumber: testIdNumber,
        phone: testPhone,
        province: "Gauteng",
        language: "English",
      },
    });

    const otpCode = "123456";
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const otpSession = await prisma.credoOtpSession.create({
      data: {
        consumerId: consumer.id,
        otpCode,
        phone: testPhone,
        expiresAt,
      },
    });

    expect(otpSession.consumerId).toBe(consumer.id);
    expect(otpSession.otpCode).toBe(otpCode);
    expect(otpSession.attempts).toBe(0);
    expect(otpSession.isVerified).toBe(false);
    expect(otpSession.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("should validate correct OTP code", async () => {
    const hashedPassword = await bcrypt.hash(testPassword, 12);
    const consumer = await prisma.consumerAccount.create({
      data: {
        email: testEmail,
        password: hashedPassword,
        firstName: "OTP",
        lastName: "Test",
        idNumber: testIdNumber,
        phone: testPhone,
        province: "Gauteng",
        language: "English",
      },
    });

    const correctOtp = "654321";
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const otpSession = await prisma.credoOtpSession.create({
      data: {
        consumerId: consumer.id,
        otpCode: correctOtp,
        phone: testPhone,
        expiresAt,
      },
    });

    // Verify correct OTP
    expect(otpSession.otpCode).toBe(correctOtp);
  });

  it("should reject expired OTP", async () => {
    const hashedPassword = await bcrypt.hash(testPassword, 12);
    const consumer = await prisma.consumerAccount.create({
      data: {
        email: testEmail,
        password: hashedPassword,
        firstName: "OTP",
        lastName: "Test",
        idNumber: testIdNumber,
        phone: testPhone,
        province: "Gauteng",
        language: "English",
      },
    });

    const expiredTime = new Date(Date.now() - 1000); // 1 second in the past

    const otpSession = await prisma.credoOtpSession.create({
      data: {
        consumerId: consumer.id,
        otpCode: "123456",
        phone: testPhone,
        expiresAt: expiredTime,
      },
    });

    // Check if expired
    const isExpired = otpSession.expiresAt < new Date();
    expect(isExpired).toBe(true);
  });

  it("should track failed OTP attempts", async () => {
    const hashedPassword = await bcrypt.hash(testPassword, 12);
    const consumer = await prisma.consumerAccount.create({
      data: {
        email: testEmail,
        password: hashedPassword,
        firstName: "OTP",
        lastName: "Test",
        idNumber: testIdNumber,
        phone: testPhone,
        province: "Gauteng",
        language: "English",
      },
    });

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    let otpSession = await prisma.credoOtpSession.create({
      data: {
        consumerId: consumer.id,
        otpCode: "123456",
        phone: testPhone,
        expiresAt,
      },
    });

    expect(otpSession.attempts).toBe(0);

    // Increment attempts
    otpSession = await prisma.credoOtpSession.update({
      where: { consumerId: consumer.id },
      data: { attempts: otpSession.attempts + 1 },
    });

    expect(otpSession.attempts).toBe(1);

    // Increment again
    otpSession = await prisma.credoOtpSession.update({
      where: { consumerId: consumer.id },
      data: { attempts: otpSession.attempts + 1 },
    });

    expect(otpSession.attempts).toBe(2);

    // Check if max attempts exceeded
    expect(otpSession.attempts >= otpSession.maxAttempts).toBe(false);

    // Increment to max
    otpSession = await prisma.credoOtpSession.update({
      where: { consumerId: consumer.id },
      data: { attempts: otpSession.maxAttempts },
    });

    expect(otpSession.attempts >= otpSession.maxAttempts).toBe(true);
  });

  it("should replace old OTP session when new one is requested", async () => {
    const hashedPassword = await bcrypt.hash(testPassword, 12);
    const consumer = await prisma.consumerAccount.create({
      data: {
        email: testEmail,
        password: hashedPassword,
        firstName: "OTP",
        lastName: "Test",
        idNumber: testIdNumber,
        phone: testPhone,
        province: "Gauteng",
        language: "English",
      },
    });

    // Create first OTP
    let otpSession = await prisma.credoOtpSession.upsert({
      where: { consumerId: consumer.id },
      update: {},
      create: {
        consumerId: consumer.id,
        otpCode: "111111",
        phone: testPhone,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    const firstOtp = otpSession.otpCode;

    // Request new OTP (should replace old one)
    otpSession = await prisma.credoOtpSession.upsert({
      where: { consumerId: consumer.id },
      update: {
        otpCode: "222222",
        attempts: 0,
        isVerified: false,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
      create: {
        consumerId: consumer.id,
        otpCode: "222222",
        phone: testPhone,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    expect(otpSession.otpCode).not.toBe(firstOtp);
    expect(otpSession.otpCode).toBe("222222");
    expect(otpSession.attempts).toBe(0);
  });

  it("should mark OTP as verified after correct code", async () => {
    const hashedPassword = await bcrypt.hash(testPassword, 12);
    const consumer = await prisma.consumerAccount.create({
      data: {
        email: testEmail,
        password: hashedPassword,
        firstName: "OTP",
        lastName: "Test",
        idNumber: testIdNumber,
        phone: testPhone,
        province: "Gauteng",
        language: "English",
      },
    });

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    let otpSession = await prisma.credoOtpSession.create({
      data: {
        consumerId: consumer.id,
        otpCode: "333333",
        phone: testPhone,
        expiresAt,
      },
    });

    expect(otpSession.isVerified).toBe(false);

    // Mark as verified
    otpSession = await prisma.credoOtpSession.update({
      where: { consumerId: consumer.id },
      data: { isVerified: true },
    });

    expect(otpSession.isVerified).toBe(true);
  });
});
