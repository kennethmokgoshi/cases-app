import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@zenowethu/database";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: requestId } = await params;

    const request = await prisma.serviceRequest.findUnique({
      where: { id: requestId },
      include: {
        consumer: true,
      }
    });

    if (!request) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    if (request.status !== "PENDING") {
      return NextResponse.json({ error: `Request already processed (Status: ${request.status})` }, { status: 400 });
    }

    const consumer = request.consumer;
    let clientId = consumer.linkedClientId;

    // 1. Create client if not exists
    if (!clientId) {
      // Check if a client with this ID number already exists despite not being linked
      if (consumer.idNumber) {
        const existingClient = await prisma.client.findUnique({
            where: { idNumber: consumer.idNumber },
            select: { id: true }
        });
        if (existingClient) {
            clientId = existingClient.id;
        }
      }

      if (!clientId) {
        const newClient = await prisma.client.create({
          data: {
            firstName: consumer.firstName,
            lastName: consumer.lastName,
            email: consumer.email,
            phone: consumer.phone,
            idNumber: consumer.idNumber || `TEMP-${Date.now()}`,
            type: "Credo Portal",
          },
        });
        clientId = newClient.id;
      }

      // Link consumer to client
      await prisma.consumerAccount.update({
        where: { id: consumer.id },
        data: { linkedClientId: clientId },
      });
    }

    // 2. Generate file number (e.g. CRD-2026-XXXX)
    const year = new Date().getFullYear();
    const count = await prisma.case.count({
      where: { fileNumber: { startsWith: `CRD-${year}` } }
    });
    const fileNumber = `CRD-${year}-${String(count + 1).padStart(4, '0')}`;

    // 3. Create the Case
    const services = JSON.parse(request.services as string) as string[];
    const newCase = await prisma.case.create({
      data: {
        fileNumber,
        clientId: clientId!,
        status: "NEW_LEAD",
        description: `Credo Request: ${services.join(", ")}`,
        services: services.join(", "),
        totalDebtAmount: request.total,
        acquisitionType: "Credo Portal",
      },
    });

    // 4. Update ServiceRequest
    await prisma.serviceRequest.update({
      where: { id: requestId },
      data: {
        status: "CONVERTED",
        linkedCaseId: newCase.id,
      },
    });

    // 5. Create a comment in the case
    await prisma.caseComment.create({
      data: {
        caseId: newCase.id,
        content: `Case automatically created from Credo Service Request #${requestId}.`,
        userId: "system", // Or staff ID if available
        type: "SYSTEM",
      }
    });

    return NextResponse.json({ success: true, caseId: newCase.id, fileNumber: newCase.fileNumber });
  } catch (error) {
    console.error("[Credo Conversion Error]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
