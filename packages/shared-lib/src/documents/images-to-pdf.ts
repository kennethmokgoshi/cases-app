import { PDFDocument, type PDFImage } from 'pdf-lib';

/**
 * Turns uploaded images (phone photos / scans) into a single PDF.
 *
 *  - `ID_SHEET` — front and back of an ID together on ONE A4 page (1–2 images).
 *  - `PAGES`    — one image per A4 page, in the order given (POA, payslips, etc.).
 *
 * Only JPEG and PNG are embedded. Callers must normalise other formats and apply
 * EXIF rotation first (pdf-lib ignores EXIF), which the browser does before upload.
 */

export type ImagesToPdfLayout = 'ID_SHEET' | 'PAGES';

export const IMAGES_TO_PDF_LIMITS = {
    maxImages: 12,
    maxIdSheetImages: 2,
    maxImageBytes: 15 * 1024 * 1024,
} as const;

export class ImagesToPdfError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ImagesToPdfError';
    }
}

const A4 = { width: 595.28, height: 841.89 } as const;
const PAGE_MARGIN = 18;
const SHEET_MARGIN = 40;
const SHEET_GAP = 24;

export type ImageKind = 'jpeg' | 'png';

/** Identify an image from its magic bytes — never trust the client's MIME type. */
export function sniffImageKind(bytes: Uint8Array): ImageKind | null {
    if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
    if (
        bytes.length > 8 &&
        bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
        bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
    ) return 'png';
    return null;
}

async function embed(pdf: PDFDocument, bytes: Uint8Array, index: number): Promise<PDFImage> {
    const kind = sniffImageKind(bytes);
    if (!kind) throw new ImagesToPdfError(`Image ${index + 1} is not a JPEG or PNG file.`);
    try {
        return kind === 'jpeg' ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
    } catch {
        throw new ImagesToPdfError(`Image ${index + 1} is corrupt or could not be read.`);
    }
}

/** Scale (width, height) to fit inside a box without enlarging past the box. */
function contain(w: number, h: number, maxW: number, maxH: number) {
    const scale = Math.min(maxW / w, maxH / h);
    return { width: w * scale, height: h * scale };
}

export async function imagesToPdf(
    images: Uint8Array[],
    layout: ImagesToPdfLayout,
): Promise<Uint8Array> {
    if (images.length === 0) throw new ImagesToPdfError('Add at least one image.');
    if (images.length > IMAGES_TO_PDF_LIMITS.maxImages) {
        throw new ImagesToPdfError(`A maximum of ${IMAGES_TO_PDF_LIMITS.maxImages} images is allowed.`);
    }
    if (layout === 'ID_SHEET' && images.length > IMAGES_TO_PDF_LIMITS.maxIdSheetImages) {
        throw new ImagesToPdfError('An ID sheet takes the front and back only (2 images).');
    }
    for (const [i, img] of images.entries()) {
        if (img.byteLength > IMAGES_TO_PDF_LIMITS.maxImageBytes) {
            throw new ImagesToPdfError(`Image ${i + 1} is larger than 15 MB.`);
        }
    }

    const pdf = await PDFDocument.create();
    const embedded: PDFImage[] = [];
    for (const [i, img] of images.entries()) embedded.push(await embed(pdf, img, i));

    if (layout === 'ID_SHEET') {
        const page = pdf.addPage([A4.width, A4.height]);
        const usableW = A4.width - SHEET_MARGIN * 2;
        const usableH = A4.height - SHEET_MARGIN * 2;
        const slotH = (usableH - SHEET_GAP * (embedded.length - 1)) / embedded.length;
        // Pin to the top so one image alone doesn't float mid-page.
        let top = A4.height - SHEET_MARGIN;
        for (const image of embedded) {
            const { width, height } = contain(image.width, image.height, usableW, slotH);
            page.drawImage(image, { x: (A4.width - width) / 2, y: top - height, width, height });
            top -= slotH + SHEET_GAP;
        }
    } else {
        for (const image of embedded) {
            const landscape = image.width > image.height * 1.15;
            const pageW = landscape ? A4.height : A4.width;
            const pageH = landscape ? A4.width : A4.height;
            const page = pdf.addPage([pageW, pageH]);
            const { width, height } = contain(
                image.width, image.height, pageW - PAGE_MARGIN * 2, pageH - PAGE_MARGIN * 2,
            );
            page.drawImage(image, { x: (pageW - width) / 2, y: (pageH - height) / 2, width, height });
        }
    }

    return pdf.save();
}
