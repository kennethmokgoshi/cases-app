export const RETENTION_PERIODS = {
    ADVERSE: 1, // Years
    JUDGMENT: 5,
    ADMINISTRATION: 5,
    SEQUESTRATION: 5,
    ENQUIRY: 1,
    PAYMENT_PROFILE: 5
};

/**
 * Checks if a debt is prescribed under the Prescription Act.
 * Generally, debt prescribes after 3 years if no payment or admission is made,
 * and no summons is issued.
 */
export function checkPrescription(lastPaymentDate: Date, summonsDate?: Date): { isPrescribed: boolean; reason: string } {
    const today = new Date();
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(today.getFullYear() - 3);

    // If summons was issued before prescription date, it interrupts prescription
    if (summonsDate) {
        // Simple check: if summons was issued within the 3 years of last payment
        // (Real logic is complex, but this is a good heuristic for the tool)
        const prescriptionDate = new Date(lastPaymentDate);
        prescriptionDate.setFullYear(prescriptionDate.getFullYear() + 3);

        if (summonsDate < prescriptionDate) {
            return { isPrescribed: false, reason: 'Prescription interrupted by Summons' };
        }
    }

    if (lastPaymentDate < threeYearsAgo) {
        return { isPrescribed: true, reason: '3 years lapsed without payment or summons' };
    }

    return { isPrescribed: false, reason: 'Debt is active (< 3 years)' };
}

/**
 * Calculates when an adverse listing should be removed.
 */
export function getRetentionExpiry(category: keyof typeof RETENTION_PERIODS, listingDate: Date): Date {
    const years = RETENTION_PERIODS[category] || 5;
    const expiry = new Date(listingDate);
    expiry.setFullYear(expiry.getFullYear() + years);
    return expiry;
}
