const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding Realistic Pilot User — Lindiwe Mazibuko...");

  const email = "lindiwe@pilot.credo.co.za";
  const idNumber = "8805125184082";
  const passwordHash = "$2a$10$96x6f5x6f5x6f5x6f5x6f5u6uL6E6S6v6f6G6e6u6Z6i."; // 'password123'

  try {
    // 1. Create Client
    const client = await prisma.client.upsert({
      where: { idNumber },
      update: {},
      create: {
        firstName: "Lindiwe",
        lastName: "Mazibuko",
        idNumber,
        email,
        phone: "071 555 9876",
        grossSalary: 28500,
        netSalary: 21200,
        type: "Standard",
      },
    });

    // 2. Create Consumer Account
    // We need to use prisma.consumerAccount.findUnique or upsert
    const consumer = await prisma.consumerAccount.upsert({
      where: { email },
      update: { linkedClientId: client.id },
      create: {
        email,
        password: passwordHash,
        firstName: "Lindiwe",
        lastName: "Mazibuko",
        idNumber,
        phone: "071 555 9876",
        province: "KwaZulu-Natal",
        language: "isiZulu",
        linkedClientId: client.id,
      },
    });

    // 3. Create Case 1: Judgment Rescission
    const case1 = await prisma.case.upsert({
      where: { fileNumber: "ZDM-2026-005" },
      update: { status: "IN_PROGRESS" },
      create: {
        fileNumber: "ZDM-2026-005",
        clientId: client.id,
        status: "IN_PROGRESS",
        acquisitionType: "B2C",
        partnerName: "Credo Pilot",
        category: "Standard",
        description: "Judgment Rescission — Standard Bank Home Loan",
      },
    });

    await prisma.workflowLog.create({
      data: {
        caseId: case1.id,
        toStatus: "IN_PROGRESS",
        action: "STATUS_CHANGE",
        notes: "Legal drafting for Rule 49 application initiated.",
      },
    });

    // 4. Create Case 2: Prescription Challenge
    const case2 = await prisma.case.upsert({
      where: { fileNumber: "ZDM-2025-142" },
      update: { status: "RESOLVED" },
      create: {
        fileNumber: "ZDM-2025-142",
        clientId: client.id,
        status: "RESOLVED",
        acquisitionType: "B2C",
        partnerName: "Credo Pilot",
        category: "Standard",
        description: "Prescription Challenge — Edgars Retail Account",
      },
    });

    await prisma.workflowLog.create({
      data: {
        caseId: case2.id,
        toStatus: "RESOLVED",
        action: "STATUS_CHANGE",
        notes: "Bureau confirmed removal of prescribed listing.",
      },
    });

    // 5. Create Credit Accounts
    await prisma.creditAccount.deleteMany({ where: { clientId: client.id } });
    
    await prisma.creditAccount.createMany({
      data: [
        {
          caseId: case1.id,
          clientId: client.id,
          creditorName: "Standard Bank",
          accountType: "MORTGAGE",
          outstandingBalance: 1240000,
          monthlyInstalment: 9800,
          status: "JUDGMENT_LISTED",
        },
        {
          caseId: case2.id,
          clientId: client.id,
          creditorName: "Edgars",
          accountType: "RETAIL",
          outstandingBalance: 1840,
          status: "PRESCRIBED",
          isPrescribed: true,
        },
        {
          caseId: case1.id,
          clientId: client.id,
          creditorName: "Capitec",
          accountType: "OVERDRAFT",
          outstandingBalance: 15200,
          status: "DEFAULT_LISTED",
        },
        {
          caseId: case1.id,
          clientId: client.id,
          creditorName: "Nedbank",
          accountType: "PERSONAL_LOAN",
          outstandingBalance: 45000,
          monthlyInstalment: 1850,
          status: "CURRENT",
        },
      ],
    });

    console.log("Seeding complete! User: lindiwe@pilot.credo.co.za / password123");
  } catch (err) {
    console.error("Seeding failed:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
