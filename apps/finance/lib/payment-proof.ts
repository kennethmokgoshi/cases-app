import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export const PROOF_MAX_SIZE = 10 * 1024 * 1024; // 10MB
export const PROOF_ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

/**
 * Reads a payment request body that is either plain JSON (no attachment) or
 * multipart/form-data with an optional `proofOfPayment` file field.
 */
export async function readPaymentRequest(request: Request): Promise<{
    body: Record<string, unknown>;
    proofFile: File | null;
}> {
    if ((request.headers.get('content-type') || '').includes('multipart/form-data')) {
        const form = await request.formData();
        const body: Record<string, unknown> = {};
        let proofFile: File | null = null;
        for (const [key, value] of form.entries()) {
            if (key === 'proofOfPayment') {
                if (value instanceof File && value.size > 0) proofFile = value;
            } else if (typeof value === 'string') {
                body[key] = value;
            }
        }
        return { body, proofFile };
    }
    return { body: await request.json(), proofFile: null };
}

/** Returns a user-facing error message, or null if the file is acceptable. */
export function validateProofFile(file: File): string | null {
    if (!PROOF_ALLOWED_TYPES.includes(file.type)) {
        return 'Proof of payment must be a PDF, JPG, PNG, or WebP file';
    }
    if (file.size > PROOF_MAX_SIZE) {
        return 'Proof of payment file is too large (max 10MB)';
    }
    return null;
}

/** Writes the proof file to per-payment storage and returns its serving URL. */
export async function saveProofFile(paymentId: string, file: File): Promise<string> {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileName = `${Date.now()}-${safeName}`;
    const dir = join(process.cwd(), 'storage', 'uploads', 'payments', paymentId);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, fileName), Buffer.from(await file.arrayBuffer()));
    return `/uploads/payments/${paymentId}/${fileName}`;
}
