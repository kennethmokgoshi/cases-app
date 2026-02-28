/**
 * South African Prescription Act Logic
 * 
 * Standard debt (credit cards, personal loans) prescribes after 3 years.
 * Mortgage bonds, Judgments, and State debt prescribe after 30 years.
 */

export type DebtType = 'STANDARD' | 'JUDGMENT' | 'MORTGAGE' | 'STATE';

export interface PrescriptionResult {
    isPrescribed: boolean;
    reason: string;
    prescriptionDate: Date;
    daysRemaining: number;
}

/**
 * Calculates prescription status based on the South African Prescription Act.
 * 
 * @param lastActivityDate The date of the last payment or written acknowledgement of debt.
 * @param type The type of debt (determines the period: 3 or 30 years).
 * @param summonsDate Optional: Date a summons was served, which interrupts prescription.
 */
export function calculatePrescriptionStatus(
    lastActivityDate: Date,
    type: DebtType = 'STANDARD',
    summonsDate?: Date | null
): PrescriptionResult {
    const today = new Date();
    const periodYears = (type === 'STANDARD') ? 3 : 30;

    // Calculate the theoretical prescription date
    const prescriptionDate = new Date(lastActivityDate);
    prescriptionDate.setFullYear(prescriptionDate.getFullYear() + periodYears);

    // 1. Check if prescription was interrupted by a summons
    if (summonsDate && summonsDate < prescriptionDate) {
        return {
            isPrescribed: false,
            reason: `Prescription interrupted by summons served on ${summonsDate.toLocaleDateString()}`,
            prescriptionDate,
            daysRemaining: -1 // Indefinite while legal action is pending
        };
    }

    // 2. Calculate remaining days
    const diffTime = prescriptionDate.getTime() - today.getTime();
    const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (daysRemaining <= 0) {
        return {
            isPrescribed: true,
            reason: `${periodYears} years lapsed without payment, acknowledgement, or summons.`,
            prescriptionDate,
            daysRemaining: 0
        };
    }

    return {
        isPrescribed: false,
        reason: `Debt is active. Prescribes in ~${daysRemaining} days.`,
        prescriptionDate,
        daysRemaining
    };
}
