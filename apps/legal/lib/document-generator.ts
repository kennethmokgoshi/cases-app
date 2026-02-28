import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

/**
 * Generates a formal Notice of Application for Rescission of Judgment.
 */
export async function generateRescissionApplication(data: {
    clientName: string;
    caseNumber: string;
    courtName: string;
    judgmentDate: string;
    creditorName: string;
    district?: string;
}) {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Court Header
    page.drawText('IN THE MAGISTRATE\'S COURT FOR THE DISTRICT OF', { x: 50, y: height - 60, size: 10, font: boldFont });
    page.drawText(`${data.district?.toUpperCase() || data.courtName.toUpperCase()} HELD AT ${data.courtName.toUpperCase()}`, { x: 50, y: height - 75, size: 10, font: boldFont });

    page.drawText(`CASE NO: ${data.caseNumber}`, { x: 420, y: height - 100, size: 10, font: boldFont });

    page.drawText('In the matter between:', { x: 50, y: height - 130, size: 10, font });

    page.drawText(`${data.clientName.toUpperCase()}`, { x: 50, y: height - 150, size: 11, font: boldFont });
    page.drawText('Applicant', { x: 450, y: height - 150, size: 10, font });

    page.drawText('and', { x: 50, y: height - 175, size: 10, font });

    page.drawText(`${data.creditorName.toUpperCase()}`, { x: 50, y: height - 200, size: 11, font: boldFont });
    page.drawText('Respondent', { x: 450, y: height - 200, size: 10, font });

    // Title
    const title = 'NOTICE OF APPLICATION FOR RESCISSION OF JUDGMENT';
    const titleWidth = boldFont.widthOfTextAtSize(title, 14);
    page.drawText(title, { x: (width - titleWidth) / 2, y: height - 260, size: 14, font: boldFont });
    page.drawLine({ start: { x: 100, y: height - 265 }, end: { x: width - 100, y: height - 265 }, thickness: 1 });

    // Body
    const bodyText = `BE PLEASED TO TAKE NOTICE that the Applicant hereby applies for an order in the following terms:
1. Rescinding the judgment granted against the Applicant on ${data.judgmentDate} in favor of the Respondent.
2. Directing that the costs of this application be costs in the cause, unless opposed.
3. Further and/or alternative relief.

TAKE NOTICE FURTHER that the affidavit of ${data.clientName}, annexed hereto, will be used in support of this application.`;

    const lines = bodyText.split('\n');
    let currentY = height - 320;
    lines.forEach(line => {
        page.drawText(line, { x: 50, y: currentY, size: 11, font, maxWidth: width - 100 });
        currentY -= 18;
    });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes).toString('base64');
}

/**
 * Generates a formal Section 72 Dispute Letter for Credit Bureaus.
 */
export async function generateDisputeLetter(data: {
    clientName: string;
    idNumber: string;
    creditorName: string;
    accountNumber?: string;
    notes?: string;
}) {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Letterhead
    page.drawText('NATIONAL CREDIT ACT SECTION 72 DISPUTE', { x: 50, y: height - 50, size: 12, font: boldFont, color: rgb(0, 0, 0.5) });

    const today = new Date().toLocaleDateString();
    page.drawText(`Date: ${today}`, { x: 50, y: height - 80, size: 10, font });

    page.drawText('To: Relevant Credit Bureau(s)', { x: 50, y: height - 110, size: 10, font: boldFont });
    page.drawText('Re: FORMAL DISPUTE IN TERMS OF SECTION 72 OF THE NATIONAL CREDIT ACT', { x: 50, y: height - 130, size: 10, font: boldFont });

    const intro = `I, ${data.clientName}, (ID: ${data.idNumber}), hereby lodge a formal dispute regarding information appearing on my credit profile.`;
    page.drawText(intro, { x: 50, y: height - 160, size: 11, font, maxWidth: width - 100 });

    page.drawText('DISPUTED INFORMATION:', { x: 50, y: height - 200, size: 10, font: boldFont });
    page.drawText(`Creditor: ${data.creditorName}`, { x: 70, y: height - 220, size: 10, font });
    page.drawText(`Account Number: ${data.accountNumber || 'N/A'}`, { x: 70, y: height - 235, size: 10, font });

    page.drawText('REASON FOR DISPUTE:', { x: 50, y: height - 265, size: 10, font: boldFont });
    const reason = data.notes || 'The information provided is inaccurate/obsolete. I request a full investigation and removal/correction of this listing within 20 business days as prescribed by the Act.';
    page.drawText(reason, { x: 70, y: height - 280, size: 10, font, maxWidth: width - 140, lineHeight: 14 });

    page.drawText('Kindly provide confirmation of receipt and the outcome of your investigation.', { x: 50, y: height - 350, size: 10, font });

    page.drawText('Yours faithfully,', { x: 50, y: height - 400, size: 10, font });
    page.drawText('_______________________', { x: 50, y: height - 430, size: 10, font });
    page.drawText(`${data.clientName}`, { x: 50, y: height - 445, size: 10, font: boldFont });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes).toString('base64');
}

/**
 * Legacy text-based affidavit (maintained for backward compatibility if needed)
 */
export function generateFoundingAffidavit(params: any): string {
    const surplus = params.currentIncome - params.currentExpenses;

    return `
IN THE MAGISTRATE'S COURT FOR THE DISTRICT OF ${params.courtName.toUpperCase()}
HELD AT ${params.courtName.toUpperCase()}

CASE NO: ${params.caseNumber}

In the matter between:

${params.clientName.toUpperCase()}
(Applicant / Judgment Debtor)

and

${params.creditorName.toUpperCase()}
(Respondent / Judgment Creditor)

____________________________________________________________________________
FOUNDING AFFIDAVIT
____________________________________________________________________________

I, the undersigned,

${params.clientName.toUpperCase()}
(ID: ${params.idNumber})

do hereby make oath and state as follows:

1.
The facts contained herein are, unless the context indicates otherwise, within my own personal knowledge and are to the best of my belief both true and correct.

2.
I am an adult male/female residing at ${params.clientAddress}, and I am the Applicant in this matter.

3.
I hereby apply for the rescission of the judgment granted against me in this Honourable Court on ${params.judgmentDate}.

4. REASON FOR DEFAULT
At the time the judgment was granted, I was unable to defend the action due to the following reasons:
${params.reasonForDefault}

5. BONA FIDE DEFENCE & CURRENT FINANCIAL STATUS
I submit that I have a bona fide defence and, more importantly, I am currently financially solvent and able to satisfy the judgment debt if properly proven.

6. SOLVENCY PROOF
I am currently employed and earn a net monthly income of R${params.currentIncome.toFixed(2)}.
My total monthly living expenses amount to R${params.currentExpenses.toFixed(2)}.
This leaves a surplus of R${surplus.toFixed(2)} which is available for debt repayment.

7.
I respectfully submit that there is no willful default on my part and that I have verified my ability to pay. The judgment listing is prejudicial to my economic activity.

WHEREFORE I pray for an order as follows:
1. Rescinding the judgment granted under case number ${params.caseNumber}.
2. Directing the credit bureaus to remove the adverse listing.
3. Granting me such further and/or alternative relief as this Honourable Court may deem fit.

________________________
DEPONENT

THUS SIGNED AND SWORN TO BEFORE ME AT ________________ ON THIS ____ DAY OF ____________ 20___, THE DEPONENT HAVING ACKNOWLEDGED THAT HE/SHE KNOWS AND UNDERSTANDS THE CONTENTS OF THIS AFFIDAVIT.

________________________
COMMISSIONER OF OATHS
    `;
}

/**
 * Generates a formal Notice of Prescribed Debt (NCA Section 126B).
 * This notice informs the creditor that their attempt to collect prescribed debt is prohibited.
 */
export async function generateSection126BNotice(data: {
    clientName: string;
    idNumber: string;
    creditorName: string;
    accountNumber?: string;
    lastActivityDate: string;
    reason: string;
}) {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Header
    page.drawText('NOTICE OF PRESCRIBED DEBT', { x: 50, y: height - 50, size: 14, font: boldFont, color: rgb(0.8, 0, 0) });
    page.drawText('IN TERMS OF SECTION 126B OF THE NATIONAL CREDIT ACT', { x: 50, y: height - 68, size: 10, font: boldFont });

    const today = new Date().toLocaleDateString();
    page.drawText(`Date: ${today}`, { x: 50, y: height - 100, size: 10, font });

    page.drawText(`To: ${data.creditorName.toUpperCase()}`, { x: 50, y: height - 130, size: 11, font: boldFont });
    page.drawText(`Account Number: ${data.accountNumber || 'NOT PROVIDED'}`, { x: 50, y: height - 145, size: 10, font });

    page.drawText('FINAL NOTICE: PROHIBITION ON COLLECTION OF PRESCRIBED DEBT', { x: 50, y: height - 180, size: 10, font: boldFont });

    const body = `I, ${data.clientName}, (ID: ${data.idNumber}), hereby notify you that the above-mentioned debt has prescribed and is no longer legally enforceable.

Section 126B(1)(a) of the National Credit Act (NCA) expressly prohibits a credit provider from continuing to collect or sell debt that has prescribed under the Prescription Act 68 of 1969.

FACTUAL BASIS:
1. The last activity/payment on this account was on ${data.lastActivityDate}.
2. A period of more than 3 years has elapsed since then.
3. No legal summons has been served to interrupt this period.

In accordance with the Act, I demand that you immediately cease all collection activities, stop all automated debits, and update the relevant credit bureaus to reflect the prescribed status of this account.

Any further attempt to collect this debt will be reported to the National Credit Regulator (NCR) as a direct violation of the NCA.`;

    const lines = body.split('\n');
    let currentY = height - 210;
    lines.forEach(line => {
        if (line.trim() === '') {
            currentY -= 10;
            return;
        }
        page.drawText(line, { x: 50, y: currentY, size: 11, font, maxWidth: width - 100, lineHeight: 15 });
        const lineCount = Math.ceil(font.widthOfTextAtSize(line, 11) / (width - 100)) || 1;
        currentY -= (15 * lineCount) + 5;
    });

    page.drawText('Yours faithfully,', { x: 50, y: currentY - 20, size: 11, font });
    page.drawText('_______________________', { x: 50, y: currentY - 50, size: 11, font });
    page.drawText(`${data.clientName}`, { x: 50, y: currentY - 65, size: 11, font: boldFont });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes).toString('base64');
}
