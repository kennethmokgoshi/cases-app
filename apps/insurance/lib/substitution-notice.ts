
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

type SubstitutionDetails = {
    clientName: string;
    idNumber: string;
    accountNumber: string;
    insurerName: string;
    policyNumber: string;
    newInsurerName: string;
    effectiveDate: string;
};

export async function generateSubstitutionNotice(details: SubstitutionDetails): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage();
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const fontSize = 12;
    const margin = 50;
    let y = height - margin;

    // Helper to draw text and move cursor down
    const drawText = (text: string, options: { font?: any, size?: number, color?: any } = {}) => {
        page.drawText(text, {
            x: margin,
            y,
            size: options.size || fontSize,
            font: options.font || font,
            color: options.color || rgb(0, 0, 0) });
        y -= (options.size || fontSize) + 6;
    };

    // Header
    drawText('NOTICE OF SUBSTITUTION OF CREDIT LIFE INSURANCE', { font: boldFont, size: 16 });
    y -= 10;
    drawText('SECTION 106(4) OF THE NATIONAL CREDIT ACT 34 OF 2005', { font: boldFont, size: 10 });
    y -= 30;

    // Date
    drawText(`Date: ${new Date().toLocaleDateString()}`);
    y -= 20;

    // Recipient (Insurer)
    drawText('TO:', { font: boldFont });
    drawText(details.insurerName);
    drawText(`Policy Number: ${details.policyNumber}`);
    y -= 20;

    // Client Details
    drawText('RE: SUBSTITUTION OF CREDIT LIFE POLICY', { font: boldFont });
    drawText(`Client Name: ${details.clientName}`);
    drawText(`ID Number: ${details.idNumber}`);
    drawText(`Credit Agreement Account No: ${details.accountNumber}`);
    y -= 30;

    // Body
    const bodyText = [
        `Please take notice that I, ${details.clientName}, hereby exercise my right under`,
        `Section 106(4) of the National Credit Act to substitute my current credit life insurance policy`,
        `with a policy of my choice.`,
        ``,
        `I have obtained start-up cover with ${details.newInsurerName}, effective from ${details.effectiveDate}.`,
        ``,
        `Accordingly, please cancel the existing policy referenced above with effect from`,
        `${details.effectiveDate}, or as soon as is reasonably possible thereafter.`,
        ``,
        `Please confirm cancellation in writing within 5 business days.`
    ];

    bodyText.forEach(line => {
        drawText(line);
    });

    y -= 40;

    // Signature
    drawText('__________________________');
    drawText('Signed by Client');

    return await pdfDoc.save();
}
