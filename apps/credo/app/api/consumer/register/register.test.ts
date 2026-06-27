import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@zenowethu/database";
import bcrypt from "bcryptjs";

/**
 * Integration tests for the Credo consumer account model.
 *
 * Policy under test (current):
 *  - The 13-digit ID number is the ONLY username and the only unique field.
 *  - Email and phone are NOT unique — two different people may share them.
 *  - Password is nullable: auto-provisioned profiles have none until activation.
 *  - Login is by ID number.
 */
describe("Credo Consumer Account model", () => {
  const testEmail = "test-auth@credo.co.za";
  const testIdNumber = "9001015009087";
  const secondIdNumber = "9001015009088";
  const testPassword = "SecurePassword123";
  const testPhoneNumber = "0825366384";

  async function cleanup() {
    await prisma.consumerAccount.deleteMany({
      where: {
        OR: [
          { email: testEmail },
          { idNumber: testIdNumber },
          { idNumber: secondIdNumber },
        ],
      },
    });
  }

  beforeEach(cleanup);
  afterEach(cleanup);

  it("creates a consumer account keyed by ID number", async () => {
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
        source: "SELF_REGISTERED",
        activatedAt: new Date(),
      },
    });

    expect(consumer.idNumber).toBe(testIdNumber);
    expect(consumer.email).toBe(testEmail);
    expect(consumer.activatedAt).not.toBeNull();
  });

  it("logs in by ID number (the username) and verifies the password", async () => {
    const hashedPassword = await bcrypt.hash(testPassword, 12);
    await prisma.consumerAccount.create({
      data: {
        email: testEmail,
        password: hashedPassword,
        firstName: "Test",
        lastName: "User",
        idNumber: testIdNumber,
        phone: testPhoneNumber,
        language: "English",
      },
    });

    const consumer = await prisma.consumerAccount.findUnique({
      where: { idNumber: testIdNumber },
    });

    expect(consumer).not.toBeNull();
    expect(consumer!.password).not.toBeNull();
    expect(await bcrypt.compare(testPassword, consumer!.password!)).toBe(true);
    expect(await bcrypt.compare("WrongPassword", consumer!.password!)).toBe(false);
  });

  it("allows two different people to share the same email and phone", async () => {
    const hashedPassword = await bcrypt.hash(testPassword, 12);

    await prisma.consumerAccount.create({
      data: {
        email: testEmail,
        password: hashedPassword,
        firstName: "Parent",
        lastName: "User",
        idNumber: testIdNumber,
        phone: testPhoneNumber,
        language: "English",
      },
    });

    // Same email + phone, different ID number — must succeed.
    const second = await prisma.consumerAccount.create({
      data: {
        email: testEmail,
        password: hashedPassword,
        firstName: "Child",
        lastName: "User",
        idNumber: secondIdNumber,
        phone: testPhoneNumber,
        language: "English",
      },
    });

    expect(second.email).toBe(testEmail);
    expect(second.idNumber).toBe(secondIdNumber);

    const shared = await prisma.consumerAccount.findMany({ where: { email: testEmail } });
    expect(shared.length).toBe(2);
  });

  it("auto-provisioned profiles have a null password until activation", async () => {
    const consumer = await prisma.consumerAccount.create({
      data: {
        email: testEmail,
        password: null,
        firstName: "Auto",
        lastName: "Provisioned",
        idNumber: testIdNumber,
        phone: testPhoneNumber,
        language: "English",
        source: "AUTO_PROVISIONED",
      },
    });

    expect(consumer.password).toBeNull();
    expect(consumer.activatedAt).toBeNull();
    expect(consumer.source).toBe("AUTO_PROVISIONED");
  });

  it("prevents duplicate ID number registrations", async () => {
    const hashedPassword = await bcrypt.hash(testPassword, 12);
    await prisma.consumerAccount.create({
      data: {
        email: testEmail,
        password: hashedPassword,
        firstName: "Test",
        lastName: "User",
        idNumber: testIdNumber,
        phone: testPhoneNumber,
        language: "English",
      },
    });

    try {
      await prisma.consumerAccount.create({
        data: {
          email: "another@credo.co.za",
          password: hashedPassword,
          firstName: "Duplicate",
          lastName: "ID",
          idNumber: testIdNumber,
          phone: "0821234567",
          language: "English",
        },
      });
      expect.fail("Should have thrown unique constraint error");
    } catch (error: any) {
      expect(error.code).toBe("P2002"); // Prisma unique constraint error
    }
  });
});
