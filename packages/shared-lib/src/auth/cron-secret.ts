// Constant-time shared-secret checks for cron / internal routes.
// Pure JS (no node:crypto) so it also runs in Edge middleware.

/**
 * Compare two secrets without leaking, through timing, how many leading
 * characters matched. Returns false when either side is missing or empty.
 */
export function secretsMatch(provided: string | null | undefined, expected: string | null | undefined): boolean {
    if (!provided || !expected) return false;
    const length = Math.max(provided.length, expected.length);
    let diff = provided.length ^ expected.length;
    for (let i = 0; i < length; i++) {
        diff |= (provided.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
    }
    return diff === 0;
}

/** True when `provided` equals the configured CRON_SECRET (never true if it is unset). */
export function isValidCronSecret(provided: string | null | undefined): boolean {
    return secretsMatch(provided, process.env.CRON_SECRET);
}

/** Accepts an `Authorization: Bearer <CRON_SECRET>` header value. */
export function isValidCronBearer(authorization: string | null | undefined): boolean {
    if (!authorization?.startsWith('Bearer ')) return false;
    return isValidCronSecret(authorization.slice('Bearer '.length));
}
