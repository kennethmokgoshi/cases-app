// Allowlist validation for staff-uploaded resource files. Pure and Node/Edge
// safe. Rejects anything that could execute in a browser (html, svg, js) and
// checks the leading bytes match the claimed type, so a renamed file fails.

const MB = 1024 * 1024;

type Rule = { magic: number[][] | null; maxBytes: number };

// null magic = plain text/ZIP-less formats we cannot sniff reliably (csv, txt).
const RULES: Record<string, Rule> = {
    pdf: { magic: [[0x25, 0x50, 0x44, 0x46]], maxBytes: 25 * MB },
    png: { magic: [[0x89, 0x50, 0x4e, 0x47]], maxBytes: 10 * MB },
    jpg: { magic: [[0xff, 0xd8, 0xff]], maxBytes: 10 * MB },
    jpeg: { magic: [[0xff, 0xd8, 0xff]], maxBytes: 10 * MB },
    docx: { magic: [[0x50, 0x4b, 0x03, 0x04]], maxBytes: 25 * MB },
    xlsx: { magic: [[0x50, 0x4b, 0x03, 0x04]], maxBytes: 25 * MB },
    pptx: { magic: [[0x50, 0x4b, 0x03, 0x04]], maxBytes: 50 * MB },
    doc: { magic: [[0xd0, 0xcf, 0x11, 0xe0]], maxBytes: 25 * MB },
    xls: { magic: [[0xd0, 0xcf, 0x11, 0xe0]], maxBytes: 25 * MB },
    csv: { magic: null, maxBytes: 10 * MB },
    txt: { magic: null, maxBytes: 5 * MB },
};

export const ALLOWED_UPLOAD_EXTENSIONS = Object.keys(RULES);

/** `error` is set when `ok` is false. Not a discriminated union: apps compile with strict:false. */
export type UploadCheck = { ok: boolean; extension?: string; error?: string };

export function extensionOf(filename: string): string {
    const base = filename.split(/[\\/]/).pop() ?? '';
    const i = base.lastIndexOf('.');
    return i > 0 ? base.slice(i + 1).toLowerCase() : '';
}

export function validateUpload(filename: string, buffer: Uint8Array): UploadCheck {
    const extension = extensionOf(filename);
    const rule = RULES[extension];
    if (!rule) {
        return { ok: false, error: `File type ".${extension || '?'}" is not allowed` };
    }
    // Double extensions like invoice.html.pdf are fine; invoice.pdf.html is rejected above.
    if (buffer.length === 0) return { ok: false, error: 'File is empty' };
    if (buffer.length > rule.maxBytes) {
        return { ok: false, error: `File exceeds the ${Math.round(rule.maxBytes / MB)}MB limit for .${extension}` };
    }
    if (rule.magic && !rule.magic.some(sig => sig.every((b, i) => buffer[i] === b))) {
        return { ok: false, error: `File content does not match its .${extension} extension` };
    }
    return { ok: true, extension };
}
