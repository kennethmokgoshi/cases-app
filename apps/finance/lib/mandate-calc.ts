// Pure debit-order mandate calculation engine — no Prisma/Next, fully unit-testable.
//
// This is the "AI does the work" core of the mandate form:
//   • bank name      → universal branch code (auto-fill)
//   • total ÷ monthly → number of instalments
//   • count × monthly → total amount
//   • first date + count + frequency → last collection date
//
// `deriveMandateTerms` reconciles whichever fields the user has entered and
// fills in the rest, so staff only ever type the two things they actually know.

// ── SA universal branch codes ─────────────────────────────────────────────────
// Most South African banks accept a single "universal" branch code for EFT /
// debit-order processing regardless of the branch the account was opened at.

export type BankOption = {
    /** Canonical bank name stored on the mandate / shown in the dropdown. */
    name: string;
    /** Universal branch code (digits only). */
    branchCode: string;
    /** Lower-cased strings that should resolve to this bank. */
    aliases: string[];
};

export const SA_BANKS: BankOption[] = [
    { name: 'First National Bank (FNB)', branchCode: '250655', aliases: ['fnb', 'first national', 'first national bank'] },
    { name: 'Standard Bank', branchCode: '051001', aliases: ['standard', 'standard bank', 'sbsa'] },
    { name: 'ABSA Bank', branchCode: '632005', aliases: ['absa', 'absa bank'] },
    { name: 'Nedbank', branchCode: '198765', aliases: ['nedbank', 'ned bank'] },
    { name: 'Capitec Bank', branchCode: '470010', aliases: ['capitec', 'capitec bank'] },
    { name: 'Investec Private Bank', branchCode: '580105', aliases: ['investec', 'investec private', 'investec private bank'] },
    { name: 'Discovery Bank', branchCode: '679000', aliases: ['discovery', 'discovery bank'] },
    { name: 'African Bank', branchCode: '430000', aliases: ['african', 'african bank'] },
    { name: 'Bidvest Bank', branchCode: '462005', aliases: ['bidvest', 'bidvest bank'] },
    { name: 'SA Postbank', branchCode: '460005', aliases: ['postbank', 'sa postbank', 'post bank', 'sapo'] },
];

/**
 * Resolve a typed/selected bank name to its universal branch code.
 * Returns null when the bank is unknown (staff can then type the code manually).
 */
export function lookupBranchCode(bankName: string | null | undefined): string | null {
    if (!bankName) return null;
    const needle = bankName.trim().toLowerCase();
    if (!needle) return null;
    for (const bank of SA_BANKS) {
        if (bank.name.toLowerCase() === needle) return bank.branchCode;
        if (bank.aliases.includes(needle)) return bank.branchCode;
    }
    // Loose contains match as a fallback (e.g. "Capitec Business Account").
    for (const bank of SA_BANKS) {
        if (bank.aliases.some(a => needle.includes(a))) return bank.branchCode;
    }
    return null;
}

// ── Numeric helpers ───────────────────────────────────────────────────────────

function toNumber(v: number | string | null | undefined): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : null;
}

/** Round to 2 decimal places, avoiding binary floating-point drift. */
export function round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ── Core calculations (each maps to one rule the user described) ───────────────

/** total ÷ monthly → number of instalments (rounded up — the final one may be smaller). */
export function calcNumInstalments(
    total: number | string | null | undefined,
    monthly: number | string | null | undefined,
): number | null {
    const t = toNumber(total);
    const m = toNumber(monthly);
    if (t === null || m === null || m <= 0 || t <= 0) return null;
    return Math.ceil(round2(t) / m);
}

/** count × monthly → total amount payable. */
export function calcTotalFromInstalments(
    numInstalments: number | string | null | undefined,
    monthly: number | string | null | undefined,
): number | null {
    const n = toNumber(numInstalments);
    const m = toNumber(monthly);
    if (n === null || m === null || n <= 0 || m <= 0) return null;
    return round2(Math.trunc(n) * m);
}

/** total ÷ count → monthly instalment. */
export function calcMonthlyFromTotal(
    total: number | string | null | undefined,
    numInstalments: number | string | null | undefined,
): number | null {
    const t = toNumber(total);
    const n = toNumber(numInstalments);
    if (t === null || n === null || t <= 0 || n <= 0) return null;
    return round2(t / Math.trunc(n));
}

export type Frequency = 'MONTHLY' | 'WEEKLY';

/**
 * first date + count + frequency → last collection date.
 * Monthly steps clamp to the end of short months (e.g. 31 Jan + 1 month → 28/29 Feb).
 * Returns an ISO yyyy-mm-dd string, or null when inputs are insufficient.
 */
export function calcLastCollectionDate(
    firstDate: string | Date | null | undefined,
    numInstalments: number | string | null | undefined,
    frequency: Frequency = 'MONTHLY',
): string | null {
    if (!firstDate) return null;
    const n = toNumber(numInstalments);
    if (n === null || n < 1) return null;
    const start = firstDate instanceof Date ? firstDate : new Date(`${firstDate}T00:00:00`);
    if (Number.isNaN(start.getTime())) return null;

    const steps = Math.trunc(n) - 1; // first instalment is on firstDate itself
    if (frequency === 'WEEKLY') {
        const d = new Date(start);
        d.setDate(d.getDate() + steps * 7);
        return toIsoDate(d);
    }
    // MONTHLY — add `steps` months, clamping the day to the target month's length.
    const targetMonthIndex = start.getMonth() + steps;
    const targetYear = start.getFullYear() + Math.floor(targetMonthIndex / 12);
    const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
    const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
    const day = Math.min(start.getDate(), lastDayOfTargetMonth);
    return toIsoDate(new Date(targetYear, targetMonth, day));
}

function toIsoDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// ── Reconciliation engine ─────────────────────────────────────────────────────

export type MandateTerms = {
    totalAmount: number | null;
    monthlyInstalment: number | null;
    numInstalments: number | null;
    frequency: Frequency;
    firstCollectionDate: string | null;
    lastCollectionDate: string | null;
};

export type TermField = 'totalAmount' | 'monthlyInstalment' | 'numInstalments' | 'firstCollectionDate' | 'frequency';

/**
 * Fill in whatever can be derived from what the user has entered.
 *
 * The (total, monthly, count) triangle: any two determine the third. `justEdited`
 * tells us which field the user touched last so we recompute the *other* one and
 * never overwrite what they just typed:
 *   • edited count    → recompute total   (count × monthly)
 *   • edited total    → recompute count   (⌈total ÷ monthly⌉)
 *   • edited monthly  → recompute count   (keeps the agreed total honest)
 * When nothing was just edited (e.g. initial load) we simply fill the one blank.
 *
 * The last collection date is always recomputed from (firstDate, count, frequency).
 */
export function deriveMandateTerms(input: Partial<MandateTerms>, justEdited?: TermField): MandateTerms {
    const out: MandateTerms = {
        totalAmount: toNumber(input.totalAmount),
        monthlyInstalment: toNumber(input.monthlyInstalment),
        numInstalments: input.numInstalments != null ? Math.trunc(Number(input.numInstalments)) || null : null,
        frequency: input.frequency === 'WEEKLY' ? 'WEEKLY' : 'MONTHLY',
        firstCollectionDate: input.firstCollectionDate || null,
        lastCollectionDate: input.lastCollectionDate || null,
    };

    const { totalAmount: total, monthlyInstalment: monthly, numInstalments: count } = out;

    if (justEdited === 'numInstalments' && monthly && count) {
        out.totalAmount = calcTotalFromInstalments(count, monthly);
    } else if ((justEdited === 'totalAmount' || justEdited === 'monthlyInstalment') && total && monthly) {
        out.numInstalments = calcNumInstalments(total, monthly);
    } else if (justEdited == null || justEdited === 'firstCollectionDate' || justEdited === 'frequency') {
        // Fill the single missing value of the triangle.
        if (count == null && total && monthly) out.numInstalments = calcNumInstalments(total, monthly);
        else if (total == null && count && monthly) out.totalAmount = calcTotalFromInstalments(count, monthly);
        else if (monthly == null && total && count) out.monthlyInstalment = calcMonthlyFromTotal(total, count);
    }

    out.lastCollectionDate = calcLastCollectionDate(out.firstCollectionDate, out.numInstalments, out.frequency)
        ?? out.lastCollectionDate;

    return out;
}
