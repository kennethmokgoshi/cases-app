import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StandardPoaInput {
    fullName:    string;
    idNumber:    string;
    dateOfBirth: string;  // DD/MM/YYYY
    address:     string;
    phone:       string;
    email:       string;
    signedCity?: string;
    signedDate?: string;  // DD/MM/YYYY — leave blank for client to fill in
}

export interface WesbankPoaInput {
    clientFullName: string;
    clientIdNumber: string;
    clientAddress:  string;
    agentFullName:  string;
    agentIdNumber:  string;
    agentAddress:   string;
    signedAtCity?:  string;
    signedDate?:    string;
}

// ─── Template loader ──────────────────────────────────────────────────────────

async function loadTemplate(filename: string): Promise<Uint8Array> {
    const candidates = [
        join(process.cwd(), 'apps', 'cases', 'public', 'templates', 'poa', filename),
        join(process.cwd(), 'public', 'templates', 'poa', filename),
        '/app/apps/cases/public/templates/poa/' + filename,
        '/app/public/templates/poa/' + filename,
    ];
    for (const p of candidates) {
        if (existsSync(p)) return readFile(p);
    }
    throw new Error(
        `POA template "${filename}" not found. Searched:\n${candidates.join('\n')}`,
    );
}

// ─── Standard ZDM POA ─────────────────────────────────────────────────────────
//
// Template: ZDM_POA_Colour_Online.pdf  (3 pages)
// Fields filled on Page 1 (Principal Details) and Page 3 (Signatures).
// Coordinates are in PDF points, origin at bottom-left of each page.

export async function generateStandardPoa(input: StandardPoaInput): Promise<Buffer> {
    const templateBytes = await loadTemplate('ZDM_POA_Colour_Online.pdf');
    const pdfDoc = await PDFDocument.load(templateBytes);
    const font   = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const BLACK  = rgb(0.08, 0.08, 0.08);

    // ── Page 1 — Principal Details ───────────────────────────────────────────
    const p1 = pdfDoc.getPage(0);
    const d1 = (text: string, x: number, y: number, size = 10) =>
        p1.drawText(text ?? '', { x, y, size, font, color: BLACK });

    d1(input.fullName,     72,  558);  // Full Name & Surname
    d1(input.idNumber,     72,  524);  // Identity Number
    d1(input.dateOfBirth, 315,  524);  // Date of Birth
    d1(input.address,      72,  490);  // Residential Address
    d1(input.phone,        72,  453);  // Contact Number
    d1(input.email,       315,  453);  // Email Address

    // ── Page 3 — Signatures ──────────────────────────────────────────────────
    const p3 = pdfDoc.getPage(2);
    const d3 = (text: string, x: number, y: number, size = 10) =>
        p3.drawText(text ?? '', { x, y, size, font, color: BLACK });

    d3(input.signedCity ?? 'MABOPANE', 72, 647);
    if (input.signedDate) d3(input.signedDate, 315, 647);

    return Buffer.from(await pdfDoc.save());
}

// ─── Wesbank POA ──────────────────────────────────────────────────────────────
//
// Template: POA_Wesbank_Template.pdf  (2 pages, filled example used as template)
// White rectangles erase the existing sample data before new values are drawn.

export async function generateWesbankPoa(input: WesbankPoaInput): Promise<Buffer> {
    const templateBytes = await loadTemplate('POA_Wesbank_Template.pdf');
    const pdfDoc = await PDFDocument.load(templateBytes);
    const font   = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const BLACK  = rgb(0.08, 0.08, 0.08);
    const WHITE  = rgb(1, 1, 1);

    const p1 = pdfDoc.getPage(0);

    // Erase existing sample data and write new value
    const fill = (text: string, x: number, y: number, w = 340, size = 10) => {
        p1.drawRectangle({ x, y: y - 2, width: w, height: 14, color: WHITE });
        p1.drawText(text ?? '', { x, y, size, font, color: BLACK });
    };

    // ── Client details ───────────────────────────────────────────────────────
    fill(input.clientFullName, 225, 573);  // FULL NAME AND SURNAME
    fill(input.clientIdNumber, 225, 553);  // IDENTITY NUMBER
    fill(input.clientAddress,  225, 533);  // RESIDING AT

    // ── Agent details ────────────────────────────────────────────────────────
    fill(input.agentFullName,  225, 480);  // AUTHORISED AGENT
    fill(input.agentIdNumber,  225, 460);  // AUTHORISED AGENT ID
    fill(input.agentAddress,   225, 440);  // RESIDING AT

    // ── Signed at line ───────────────────────────────────────────────────────
    const today = new Date();
    const city  = input.signedAtCity ?? 'MABOPANE';
    const dd    = today.getDate().toString();
    const month = today.toLocaleString('en-ZA', { month: 'long' }).toUpperCase();
    const yyyy  = today.getFullYear().toString();

    p1.drawRectangle({ x: 74, y: 343, width: 490, height: 14, color: WHITE });
    p1.drawText(
        `Signed at ${city}   on the ${dd}   day of ${month}   ${yyyy}.`,
        { x: 74, y: 345, size: 10, font, color: BLACK },
    );

    return Buffer.from(await pdfDoc.save());
}
