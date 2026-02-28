import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

type PolicyDetails = {
    policyNumber: string;
    insurerName: string;
    clientName: string;
    idNumber: string;
    startDate: string;
    premiumAmount: number;
    coverAmount: number;
    coverBenefits: {
        death: boolean;
        disability: boolean;
        retrenchment: boolean;
        funeral: boolean;
    };
    accounts: Array<{
        creditorName: string;
        accountNumber: string;
        outstandingBalance: number;
        premium: number;
    }>;
};

export async function generatePolicySchedule(details: PolicyDetails): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage();
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const fontSize = 10;
    const margin = 50;
    let y = height - margin;

    const drawText = (text: string, options: { x?: number, font?: any, size?: number, color?: any } = {}) => {
        page.drawText(text, {
            x: options.x || margin,
            y,
            size: options.size || fontSize,
            font: options.font || font,
            color: options.color || rgb(0, 0, 0)
        });
        y -= (options.size || fontSize) + 6;
    };

    const drawLine = () => {
        page.drawLine({
            start: { x: margin, y },
            end: { x: width - margin, y },
            thickness: 1,
            color: rgb(0.8, 0.8, 0.8),
        });
        y -= 15;
    };

    // Header
    drawText('ZENOWETHU INSURANCE SERVICES', { font: boldFont, size: 18, color: rgb(0.02, 0.71, 0.83) });
    y -= 5;
    drawText('POLICY SCHEDULE & CERTIFICATE OF COVER', { font: boldFont, size: 12 });
    y -= 20;

    // Policy Info
    drawText(`Policy Number: ${details.policyNumber}`, { font: boldFont });
    drawText(`Insurer: ${details.insurerName}`);
    drawText(`Effective Date: ${details.startDate}`);
    y -= 10;
    drawLine();

    // Client Details
    drawText('POLICYHOLDER DETAILS', { font: boldFont });
    drawText(`Name: ${details.clientName}`);
    drawText(`ID Number: ${details.idNumber}`);
    y -= 10;
    drawLine();

    // Cover Summary
    drawText('BENEFIT SUMMARY', { font: boldFont });
    drawText(`Total Sum Insured: R${details.coverAmount.toLocaleString()}`);
    drawText(`Monthly Premium: R${details.premiumAmount.toFixed(2)}`);
    y -= 5;

    drawText('Included Covers:', { size: 9, font: boldFont });
    if (details.coverBenefits.death) drawText('  • Death Benefit (NCA Section 106 compliant)', { size: 9 });
    if (details.coverBenefits.disability) drawText('  • Permanent & Temporary Disability', { size: 9 });
    if (details.coverBenefits.retrenchment) drawText('  • Involuntary Retrenchment / Unemployment', { size: 9 });
    if (details.coverBenefits.funeral) drawText('  • Funeral Benefit add-on', { size: 9 });

    y -= 10;
    drawLine();

    // Accounts Table
    drawText('COVERED CREDIT AGREEMENTS', { font: boldFont });
    y -= 5;

    const tableHeaderY = y;
    page.drawText('Creditor', { x: margin, y, font: boldFont, size: 9 });
    page.drawText('Account No', { x: margin + 180, y, font: boldFont, size: 9 });
    page.drawText('Balance', { x: margin + 300, y, font: boldFont, size: 9 });
    page.drawText('Premium', { x: margin + 400, y, font: boldFont, size: 9 });
    y -= 15;

    details.accounts.forEach(acc => {
        if (y < 100) { // Very basic page overflow
            // In a production app we'd add a new page
        }
        page.drawText(acc.creditorName.substring(0, 30), { x: margin, y, size: 9 });
        page.drawText(acc.accountNumber.substring(0, 15), { x: margin + 180, y, size: 9 });
        page.drawText(`R${acc.outstandingBalance.toLocaleString()}`, { x: margin + 300, y, size: 9 });
        page.drawText(`R${acc.premium.toFixed(2)}`, { x: margin + 400, y, size: 9 });
        y -= 12;
    });

    y -= 20;
    drawLine();

    // Footer / Legal
    y = 80;
    drawText('This policy is issued subject to the terms and conditions outlined in the Master Policy.', { size: 8 });
    drawText('Zenowethu is an authorized Financial Services Provider.', { size: 8 });

    return await pdfDoc.save();
}
