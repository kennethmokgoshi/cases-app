/**
 * Pure helpers for website lead intake — kept out of the route file so they can
 * be unit tested (Next.js route modules may only export HTTP handlers).
 */

/** Submissions allowed per client IP per window before the API returns 429. */
export const LEAD_RATE_LIMIT = 5;
export const LEAD_RATE_WINDOW_MS = 15 * 60 * 1000;

/** A repeat submission with the same mobile number inside this window is flagged DUPLICATE. */
export const DUPLICATE_WINDOW_DAYS = 30;

/** Lead statuses that no longer count as "open" for duplicate detection. */
export const CLOSED_LEAD_STATUSES = ['REJECTED', 'CLOSED'];

/**
 * Normalise a South African mobile number to local format (`0821234567`).
 * Strips spaces, dashes, brackets and dots, and converts `+27` / `27` prefixes.
 * Numbers that don't look South African are returned with formatting stripped.
 */
export function normalisePhone(raw: string): string {
    const digits = raw.replace(/[\s\-().]/g, '');
    if (digits.startsWith('+27')) return `0${digits.slice(3)}`;
    if (/^27\d{9}$/.test(digits)) return `0${digits.slice(2)}`;
    return digits;
}

/**
 * Every stored form a normalised local number may have been saved in before
 * normalisation was introduced — used to match older leads.
 */
export function phoneVariants(normalised: string): string[] {
    if (!/^0\d{9}$/.test(normalised)) return [normalised];
    const national = normalised.slice(1);
    return [normalised, `+27${national}`, `27${national}`];
}
