import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@zenowethu/database";
import bcrypt from "bcryptjs";

describe("Credo Consumer Registration & Authentication", () => {
  const testEmail = "test-auth@credo.co.za";
  const testIdNumber = "9001015009087";
  const testPassword = "SecurePassword123";
  const testPhoneNumber = "0825366384";

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

  it("should create a consumer account with email and optional ID number", async () => {
    const hashedPassword = await bcrypt.hash(testPassword, 12);

    const consumer = await prisma.consumerAccount.create({
      data: {
        email: testEmail,
        password: hashedPassword,
        firstName: "Test",
        lastName: "User",
        idNumber: testIdNumber,
        phone: testPhoneNumber,
        province: "Gauteng",
        language: "English",
      },
    });

    expect(consumer.email).toBe(testEmail);
    expect(consumer.idNumber).toBe(testIdNumber);
    expect(consumer.firstName).toBe("Test");
    expect(consumer.lastName).toBe("User");
    expect(consumer.phone).toBe(testPhoneNumber);
  });

  it("should allow login with email as username", async () => {
    const hashedPassword = await bcrypt.hash(testPassword, 12);

    await prisma.consumerAccount.create({
      data: {
        email: testEmail,
        password: hashedPassword,
        firstName: "Test",
        lastName: "User",
        idNumber: testIdNumber,
        phone: testPhoneNumber,
        province: "Gauteng",
        language: "English",
      },
    });

    // Simulate login with email
    const consumer = await prisma.consumerAccount.findUnique({
      where: { email: testEmail },
    });

    expect(consumer).toBeDefined();
    const passwordValid = await bcrypt.compare(testPassword, consumer!.password);
    expect(passwordValid).toBe(true);
  });

  it("should allow login with ID number as username", async () => {
    const hashedPassword = await bcrypt.hash(testPassword, 12);

    await prisma.consumerAccount.create({
      data: {
        email: testEmail,
        password: hashedPassword,
        firstName: "Test",
        lastName: "User",
        idNumber: testIdNumber,
        phone: testPhoneNumber,
        province: "Gauteng",
        language: "English",
      },
    });

    // Simulate login with ID number
    const consumer = await prisma.consumerAccount.findUnique({
      where: { idNumber: testIdNumber },
    });

    expect(consumer).toBeDefined();
    const passwordValid = await bcrypt.compare(testPassword, consumer!.password);
    expect(passwordValid).toBe(true);
  });

  it("should reject login with wrong password", async () => {
    const hashedPassword = await bcrypt.hash(testPassword, 12);

    await prisma.consumerAccount.create({
      data: {
        email: testEmail,
        password: hashedPassword,
        firstName: "Test",
        lastName: "User",
        idNumber: testIdNumber,
        phone: testPhoneNumber,
        province: "Gauteng",
        language: "English",
      },
    });

    const consumer = await prisma.consumerAccount.findUnique({
      where: { email: testEmail },
    });

    expect(consumer).toBeDefined();
    const passwordValid = await bcrypt.compare("WrongPassword", consumer!.password);
    expect(passwordValid).toBe(false);
  });

  it("should create consumer without ID number (optional)", async () => {
    const hashedPassword = await bcrypt.hash(testPassword, 12);

    const consumer = await prisma.consumerAccount.create({
      data: {
        email: testEmail,
        password: hashedPassword,
        firstName: "NoID",
        lastName: "User",
        phone: testPhoneNumber,
        province: "Western Cape",
        language: "English",
        // idNumber intentionally omitted
      },
    });

    expect(consumer.email).toBe(testEmail);
    expect(consumer.idNumber).toBeNull();
    expect(consumer.firstName).toBe("NoID");
  });

  it("should prevent duplicate email registrations", async () => {
    const hashedPassword = await bcrypt.hash(testPassword, 12);

    await prisma.consumerAccount.create({
      data: {
        email: testEmail,
        password: hashedPassword,
        firstName: "Test",
        lastName: "User",
        phone: testPhoneNumber,
        province: "Gauteng",
        language: "English",
      },
    });

    // Try to create another account with same email
    try {
      await prisma.consumerAccount.create({
        data: {
          email: testEmail,
          password: hashedPassword,
          firstName: "Duplicate",
          lastName: "User",
          phone: "0821234567",
          province: "Gauteng",
          language: "English",
        },
      });
      expect.fail("Should have thrown unique constraint error");
    } catch (error: any) {
      expect(error.code).toBe("P2002"); // Prisma unique constraint error
    }
  });

  it("should prevent duplicate ID number registrations", async () => {
    const hashedPassword = await bcrypt.hash(testPassword, 12);

    await prisma.consumerAccount.create({
      data: {
        email: testEmail,
        password: hashedPassword,
        firstName: "Test",
        lastName: "User",
        idNumber: testIdNumber,
        phone: testPhoneNumber,
        province: "Gauteng",
        language: "English",
      },
    });

    // Try to create another account with same ID number
    try {
      await prisma.consumerAccount.create({
        data: {
          email: "another@credo.co.za",
          password: hashedPassword,
          firstName: "Duplicate",
          lastName: "ID",
          idNumber: testIdNumber,
          phone: "0821234567",
          province: "Gauteng",
          language: "English",
        },
      });
      expect.fail("Should have thrown unique constraint error");
    } catch (error: any) {
      expect(error.code).toBe("P2002"); // Prisma unique constraint error
    }
  });
});
