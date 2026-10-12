import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { imagesToPdf, sniffImageKind, ImagesToPdfError } from './images-to-pdf';

// 1x1 PNG
const PNG = Uint8Array.from(Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
));

async function makeJpeg(): Promise<Uint8Array> {
    // Minimal valid baseline JPEG (1x1 white)
    return Uint8Array.from(Buffer.from(
        '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
        'base64',
    ));
}

describe('sniffImageKind', () => {
    it('detects PNG and JPEG by magic bytes and rejects others', async () => {
        expect(sniffImageKind(PNG)).toBe('png');
        expect(sniffImageKind(await makeJpeg())).toBe('jpeg');
        expect(sniffImageKind(Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBeNull();
    });
});

describe('imagesToPdf', () => {
    it('ID_SHEET puts front and back on a single A4 page', async () => {
        const out = await imagesToPdf([PNG, PNG], 'ID_SHEET');
        const doc = await PDFDocument.load(out);
        expect(doc.getPageCount()).toBe(1);
        const { width, height } = doc.getPage(0).getSize();
        expect(Math.round(width)).toBe(595);
        expect(Math.round(height)).toBe(842);
    });

    it('PAGES makes one page per image, in order', async () => {
        const out = await imagesToPdf([PNG, PNG, PNG], 'PAGES');
        expect((await PDFDocument.load(out)).getPageCount()).toBe(3);
    });

    it('rejects an empty list, non-images, and too many ID sheet images', async () => {
        await expect(imagesToPdf([], 'PAGES')).rejects.toBeInstanceOf(ImagesToPdfError);
        await expect(imagesToPdf([Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9])], 'PAGES'))
            .rejects.toThrow(/not a JPEG or PNG/);
        await expect(imagesToPdf([PNG, PNG, PNG], 'ID_SHEET')).rejects.toThrow(/front and back/);
    });
});
