import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { prisma } from "@zenowethu/database";
import { auth } from "@/auth";
import { generateStandardPoa } from "@zenowethu/shared-lib/src/poa/poa-generator";

function getUploadDir(): string {
  return process.env.UPLOAD_DIR || join(process.cwd(), "uploads");
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const consumerId = session.user.id;

    const { signatureImage, requestId } = await req.json();

    if (!signatureImage) {
      return NextResponse.json({ error: "No signature provided" }, { status: 400 });
    }

    // 1. Fetch Consumer Details
    const consumer = await prisma.consumerAccount.findUnique({
      where: { id: consumerId },
      include: { linkedClient: true }
    });

    if (!consumer) {
      return NextResponse.json({ error: "Consumer not found" }, { status: 404 });
    }

    // 2. Prepare Data for POA
    // Use linked client data if available, otherwise fallback to consumer account data
    const rawIdNumber = consumer.idNumber || consumer.linkedClient?.idNumber || "";
    const cleanIdNumber = rawIdNumber.replace(/\D/g, '');

    const poaData = {
      fullName: `${consumer.firstName} ${consumer.lastName}`,
      idNumber: cleanIdNumber,
      dateOfBirth: cleanIdNumber ? idToDateOfBirth(cleanIdNumber) : '',
      address: consumer.linkedClient?.address || "",
      phone: consumer.phone || consumer.linkedClient?.phone || "",
      email: consumer.email,
      signatureImage: signatureImage, // This will be embedded into the PDF
      signedCity: consumer.province || "Pretoria",
      signedDate: new Date().toLocaleDateString('en-ZA').replace(/\//g, '/') // YYYY/MM/DD
    };

    // 3. Generate the Signed PDF
    const pdfBuffer = await generateStandardPoa(poaData);

    // 4. Save to Storage
    const fileName = `Signed_POA_${crypto.randomUUID()}.pdf`;
    const consumerDir = join(getUploadDir(), consumerId);
    await mkdir(consumerDir, { recursive: true });
    const storagePath = join(consumerDir, fileName);

    await writeFile(storagePath, pdfBuffer);

    // 5. Create Document Record
    const doc = await prisma.credoDocument.create({
      data: {
        consumerId,
        fileName: fileName,
        originalName: "Signed Power of Attorney.pdf",
        mimeType: "application/pdf",
        size: pdfBuffer.length,
        category: "LEGAL",
        storagePath,
      }
    });

    // 6. If linked to a request, update the request status
    if (requestId) {
        await prisma.serviceRequest.update({
            where: { id: requestId },
            data: { status: 'SIGNED' }
        }).catch(e => console.error('Failed to update request status:', e));
    }

    return NextResponse.json({ 
        success: true, 
        documentId: doc.id,
        message: "POA digitally signed and saved successfully." 
    });

  } catch (error: any) {
    console.error('POA Signing Error:', error);
    return NextResponse.json(
      { error: `Signing failed: ${error.message ?? "Unknown error"}` },
      { status: 500 }
    );
  }
}

/** Extract DD/MM/YYYY date of birth from a 13-digit SA ID number */
function idToDateOfBirth(idNumber: string): string {
    if (idNumber.length < 6) return '';
    const yy = idNumber.substring(0, 2);
    const mm = idNumber.substring(2, 4);
    const dd = idNumber.substring(4, 6);
    const year = parseInt(yy) > 30 ? `19${yy}` : `20${yy}`;
    return `${dd}/${mm}/${year}`;
}
