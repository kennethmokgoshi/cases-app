
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

type ClientDetails = {
    fullName: string;
    idNumber: string;
    address: string;
    occupation: string;
    isMarried: boolean;
    spouseName?: string;
};

type CaseDetails = {
    court: 'High Court' | 'Magistrates Court';
    jurisdiction: string; // e.g., "Held at Johannesburg"
    caseNumber: string;
    applicantName: string; // Usually the client
    respondentName: string; // Usually the Debt Counsellor or NCR
};

/**
 * Generates the "Notice of Motion" (Rule 55) for the rescission application.
 */
export async function generateNoticeOfMotion(client: ClientDetails, caseInfo: CaseDetails): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage();
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const fontSize = 12;
    const margin = 50;
    let y = height - margin;

    const drawText = (text: string, options: { font?: any, size?: number, x?: number } = {}) => {
        page.drawText(text, {
            x: options.x || margin,
            y,
            size: options.size || fontSize,
            font: options.font || font,
            color: rgb(0, 0, 0) });
        y -= (options.size || fontSize) + 6;
    };

    // Header
    drawText(`IN THE ${caseInfo.court.toUpperCase()} OF SOUTH AFRICA`, { font: boldFont, x: 150 });
    drawText(`(${caseInfo.jurisdiction})`, { font: boldFont, x: 200 });
    y -= 20;

    drawText(`CASE NO: ${caseInfo.caseNumber || '__________'}`);
    y -= 20;

    drawText('In the matter between:', { font: boldFont });
    drawText(`${caseInfo.applicantName.toUpperCase()}`, { font: boldFont });
    drawText('Applicant', { x: 400 });
    y -= 10;
    drawText('and');
    y -= 10;
    drawText(`${caseInfo.respondentName.toUpperCase()}`, { font: boldFont });
    drawText('Respondent', { x: 400 });
    y -= 30;

    // Title
    drawText('NOTICE OF MOTION', { font: boldFont, size: 14, x: 200 });
    y -= 20;

    // Body
    drawText('BE PLEASED TO TAKE NOTICE that application will be made on behalf of the above-named');
    drawText('Applicant on a date to be determined by the Registrar for an order in the following terms:');
    y -= 20;

    const orders = [
        '1. Declaring that the Applicant is no longer over-indebted.',
        '2. Rescinding the debt review order granted under the above case number.',
        '3. Removing the Applicant\'s name from the records of the Credit Bureaus.',
        '4. Granting the Applicant further and/or alternative relief.',
    ];

    orders.forEach(order => drawText(order));
    y -= 20;

    drawText('TAKE NOTICE FURTHER that the affidavit of the Applicant annexed hereto will be used');
    drawText('in support of this application.');

    y -= 40;

    drawText('DATED at ________________ on this ____ day of ________________ 20__');
    y -= 50;

    drawText('__________________________');
    drawText('Attorney for Applicant');

    return await pdfDoc.save();
}

/**
 * Generates the "Founding Affidavit" for the client to sign.
 */
export async function generateFoundingAffidavit(client: ClientDetails, caseInfo: CaseDetails): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage();
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // ... logic similar to Notice of Motion to draw the affidavit content ...
    // Using a simplified version for this example

    let y = height - 50;
    const margin = 50;

    page.drawText('FOUNDING AFFIDAVIT', { x: 200, y, size: 14, font: boldFont });
    y -= 40;

    page.drawText(`I, the undersigned, ${client.fullName}, do hereby make oath and say:`, { x: margin, y, size: 12, font });
    y -= 30;

    page.drawText('1. I am an adult person residing at ' + client.address, { x: margin, y, size: 12, font });
    y -= 20;
    page.drawText('2. The facts herein contained are within my own personal knowledge.', { x: margin, y, size: 12, font });
    y -= 20;
    page.drawText('3. I am no longer over-indebted and can afford my financial obligations.', { x: margin, y, size: 12, font });

    return await pdfDoc.save();
}
