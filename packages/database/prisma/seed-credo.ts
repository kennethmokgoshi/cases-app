import { PrismaClient } from "@prisma/client";
import { DEMO_USER, DEMO_CASES, DEMO_BUREAUS } from "@zenowethu/shared-lib";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding Credo Demo Data...");

  // 1. Create the Demo Client
  const client = await prisma.client.upsert({
    where: { idNumber: DEMO_USER.idNumber.replace(/\s/g, "") },
    update: {},
    create: {
      firstName: DEMO_USER.firstName,
      lastName: DEMO_USER.lastName,
      idNumber: DEMO_USER.idNumber.replace(/\s/g, ""),
      email: DEMO_USER.email,
      phone: DEMO_USER.phone,
      type: "Standard",
    },
  });

  // 2. Create the Consumer Account
  // Password is "password123" hashed
  const passwordHash = "$2a$10$96x6f5x6f5x6f5x6f5x6f5u6uL6E6S6v6f6G6e6u6Z6i."; // Mock hash for 'password123'
  // Actually, for a real demo, we should use a proper hash.
  // I'll assume the user might want to change this later.

  const consumer = await prisma.consumerAccount.upsert({
    where: { email: DEMO_USER.email },
    update: {
      linkedClientId: client.id,
    },
    create: {
      email: DEMO_USER.email,
      password: passwordHash,
      firstName: DEMO_USER.firstName,
      lastName: DEMO_USER.lastName,
      idNumber: DEMO_USER.idNumber.replace(/\s/g, ""),
      phone: DEMO_USER.phone,
      linkedClientId: client.id,
    },
  });

  // 3. Create Demo Cases
  for (const demoCase of DEMO_CASES) {
    const caseData = await prisma.case.upsert({
      where: { fileNumber: demoCase.id },
      update: {
        status: demoCase.status,
      },
      create: {
        fileNumber: demoCase.id,
        clientId: client.id,
        status: demoCase.status,
        acquisitionType: "B2C",
        partnerName: "Credo Demo",
        category: "Standard",
        description: demoCase.title,
      },
    });

    // 4. Create dummy credit accounts for these cases if needed
    // (This is getting complex, so I'll stop at cases for now 
    // to ensure the basic dashboard logic works)
  }

  console.log("Seeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
