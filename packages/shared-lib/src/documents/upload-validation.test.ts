import { describe, it, expect } from 'vitest';
import { validateUpload, extensionOf } from './upload-validation';

const pdf = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);

describe('validateUpload', () => {
    it('accepts a real PDF', () => {
        expect(validateUpload('Guide.PDF', pdf)).toEqual({ ok: true, extension: 'pdf' });
    });

    it('rejects executable-in-browser and unknown types', () => {
        for (const name of ['x.html', 'x.svg', 'x.js', 'x.exe', 'x.php', 'noext', 'x.pdf.html']) {
            expect(validateUpload(name, pdf).ok).toBe(false);
        }
    });

    it('rejects content that does not match the extension', () => {
        const html = new TextEncoder().encode('<script>alert(1)</script>');
        expect(validateUpload('evil.pdf', html)).toMatchObject({ ok: false });
        expect(validateUpload('evil.png', pdf)).toMatchObject({ ok: false });
    });

    it('rejects empty and oversize files', () => {
        expect(validateUpload('a.pdf', new Uint8Array(0))).toMatchObject({ ok: false });
        const big = new Uint8Array(26 * 1024 * 1024);
        big.set(pdf);
        expect(validateUpload('a.pdf', big)).toMatchObject({ ok: false });
    });

    it('allows csv/txt without magic bytes', () => {
        expect(validateUpload('a.csv', new TextEncoder().encode('a,b'))).toEqual({ ok: true, extension: 'csv' });
    });
});

describe('extensionOf', () => {
    it('handles paths and dotfiles', () => {
        expect(extensionOf('C:\\x\\y.PNG')).toBe('png');
        expect(extensionOf('.env')).toBe('');
    });
});
