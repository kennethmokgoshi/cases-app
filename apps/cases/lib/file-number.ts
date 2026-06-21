/**
 * Case file-number helpers (ZDM-{year}-{seq}).
 *
 * IMPORTANT: file numbers must be compared NUMERICALLY, not lexicographically.
 * The previous implementation used a Prisma `orderBy: { fileNumber: 'desc' }`
 * (a text sort), which ranks "ZDM-2026-999" above "ZDM-2026-1000" — so once the
 * sequence passed 999 the generator kept reusing 1000 and every subsequent
 * `case.create` hit the fileNumber unique constraint. These helpers compute the
 * max by parsing the integer segment, which is correct beyond 999/9999.
 */

/**
 * Highest sequence number among the given file numbers for a specific year.
 * Returns 0 when there are no matching file numbers.
 */
export function maxZdmSequence(fileNumbers: string[], year: number): number {
    let max = 0;
    for (const fn of fileNumbers) {
        const parts = (fn ?? '').split('-');
        if (parts[0] === 'ZDM' && parts[1] === String(year)) {
            const n = parseInt(parts[2] ?? '', 10);
            if (Number.isFinite(n) && n > max) max = n;
        }
    }
    return max;
}

/**
 * Builds a ZDM file number, zero-padded to at least 3 digits.
 * Sequences ≥ 1000 are left unpadded (e.g. "ZDM-2026-1000").
 */
export function buildZdmFileNumber(year: number, seq: number): string {
    return `ZDM-${year}-${String(seq).padStart(3, '0')}`;
}
