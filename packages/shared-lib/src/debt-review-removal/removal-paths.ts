/**
 * Debt Review Removal — DHS Status Transition Paths
 *
 * Maps a consumer's current DHS status code to the target status they need
 * to reach for debt review to be formally removed, and the documents required
 * to submit that status change on the DHS portal.
 *
 * DHS Status Codes (as scraped from ncrdebthelp.co.za):
 *   A  — Under debt review (accepted, no court order)
 *   B  — Assessment resulted in rejection
 *   C  — Under debt review (no court order)
 *   D4 — Under debt review with magistrate court order
 *   F1 — All restructured debts settled EXCEPT mortgage
 *   F2 — All restructured debts have been settled
 *   G  — Magistrate rescinded court order / consumer opposed and was dismissed
 */

export interface RemovalPath {
    /** DHS status the consumer is currently on */
    fromStatus: string;
    /** DHS status to update to on the portal */
    toStatus: string;
    /** Human-readable description of this path */
    description: string;
    /** Document types that must be in the case vault before this transition */
    requiredDocTypes: string[];
    /** Whether this path means the debt review is already removed (F1/F2/G = ready) */
    alreadyExitable: boolean;
}

export interface RemovalAssessment {
    caseId: string;
    fileNumber: string;
    clientName: string;
    consumerDhsStatus: string | null;
    recommendedPath: RemovalPath | null;
    /** Multiple candidate paths when DHS status is D4 */
    candidatePaths: RemovalPath[];
    confidence: 'HIGH' | 'MEDIUM' | 'UNCERTAIN';
    requiredDocTypes: string[];
    presentDocTypes: string[];
    missingDocTypes: string[];
    readyForRemoval: boolean;
    action: 'PROCEED' | 'REQUEST_DOCS' | 'ESCALATE' | 'NO_ACTION';
    actionReason: string;
}

// ─── Document type constants ───────────────────────────────────────────────────
// These match the free-form `Document.type` strings stored in the database.
// Checks are case-insensitive and partial-match friendly (see matchesDocType()).

export const DOC_TYPES = {
    FORM_16:                 'FORM_16',
    FORM_17_2A:              'FORM_17_2A',
    FORM_17_2C:              'FORM_17_2C',
    FORM_17W:                'FORM_17W',
    FORM_19:                 'FORM_19',
    CERTIFIED_FORM_19:       'CERTIFIED_FORM_19',
    PAID_UP_LETTERS:         'PAID_UP_LETTERS',
    AFFORDABILITY_ASSESSMENT:'AFFORDABILITY_ASSESSMENT',
    NOTICE_OF_MOTION:        'NOTICE_OF_MOTION',
    FOUNDING_AFFIDAVIT:      'FOUNDING_AFFIDAVIT',
    COURT_ORDER:             'COURT_ORDER',
    COURT_ORDER_GRANTED:     'COURT_ORDER_GRANTED',
    POA:                     'POA',
    ZENOWETHU_POA:           'ZENOWETHU_POA',
    ID:                      'ID',
} as const;

/** Aliases used when matching documents — handles naming variations */
export const DOC_TYPE_ALIASES: Record<string, string[]> = {
    FORM_19:            ['FORM_19', 'CERTIFIED_FORM_19', 'FORM19'],
    CERTIFIED_FORM_19:  ['CERTIFIED_FORM_19', 'FORM_19', 'FORM19'],
    COURT_ORDER:        ['COURT_ORDER', 'COURT_ORDER_GRANTED', 'COURT ORDER'],
    COURT_ORDER_GRANTED:['COURT_ORDER_GRANTED', 'COURT_ORDER', 'COURT ORDER'],
    PAID_UP_LETTERS:    ['PAID_UP_LETTERS', 'PAID_UP_LETTER', 'PAID UP', 'PRESCRIPTION_LETTER', 'PAIDUP'],
    NOTICE_OF_MOTION:   ['NOTICE_OF_MOTION', 'NOTICE OF MOTION', 'NOM'],
    FOUNDING_AFFIDAVIT: ['FOUNDING_AFFIDAVIT', 'FOUNDING AFFIDAVIT', 'AFFIDAVIT'],
    FORM_17_2A:         ['FORM_17_2A', 'FORM 17.2(A)', 'FORM17_2A'],
    FORM_17_2C:         ['FORM_17_2C', 'FORM 17.2(C)', 'FORM17_2C'],
    FORM_17W:           ['FORM_17W', 'FORM 17W', 'FORM17W', 'FORM_17_W'],
    FORM_16:            ['FORM_16', 'FORM 16', 'FORM16'],
    POA:                ['POA', 'ZENOWETHU_POA', 'POWER_OF_ATTORNEY'],
};

/** Check if an uploaded document type matches a required type (alias-aware) */
export function matchesDocType(uploadedType: string, requiredType: string): boolean {
    const u = uploadedType.toUpperCase().replace(/\s+/g, '_');
    const r = requiredType.toUpperCase().replace(/\s+/g, '_');
    if (u === r) return true;
    const aliases = DOC_TYPE_ALIASES[r] ?? [r];
    return aliases.some(alias => u.includes(alias.toUpperCase().replace(/\s+/g, '_')));
}

// ─── Transition path definitions ──────────────────────────────────────────────

/** A → B: Assessment rejection (consumer never entered debt review formally) */
export const PATH_A_TO_B: RemovalPath = {
    fromStatus: 'A',
    toStatus: 'B',
    description: 'Assessment resulted in rejection — exit before debt review commenced',
    requiredDocTypes: [DOC_TYPES.FORM_16, DOC_TYPES.FORM_17_2A, DOC_TYPES.AFFORDABILITY_ASSESSMENT],
    alreadyExitable: false,
};

/** C → G: Under review (no court order) → court order rescission */
export const PATH_C_TO_G: RemovalPath = {
    fromStatus: 'C',
    toStatus: 'G',
    description: 'Magistrate rescinded court order / consumer opposed debt review application',
    requiredDocTypes: [DOC_TYPES.NOTICE_OF_MOTION, DOC_TYPES.FOUNDING_AFFIDAVIT, DOC_TYPES.COURT_ORDER_GRANTED],
    alreadyExitable: false,
};

/** D4 → F2: All debts settled (most common exit) */
export const PATH_D4_TO_F2: RemovalPath = {
    fromStatus: 'D4',
    toStatus: 'F2',
    description: 'All restructured debts have been settled',
    requiredDocTypes: [DOC_TYPES.CERTIFIED_FORM_19, DOC_TYPES.PAID_UP_LETTERS],
    alreadyExitable: false,
};

/** D4 → F1: All settled EXCEPT mortgage */
export const PATH_D4_TO_F1: RemovalPath = {
    fromStatus: 'D4',
    toStatus: 'F1',
    description: 'All restructured debts settled except mortgage agreement',
    requiredDocTypes: [
        DOC_TYPES.CERTIFIED_FORM_19,
        DOC_TYPES.PAID_UP_LETTERS,
        DOC_TYPES.FORM_17_2C,
        DOC_TYPES.COURT_ORDER_GRANTED,
    ],
    alreadyExitable: false,
};

/** D4 → G: Court order rescinded by magistrate */
export const PATH_D4_TO_G: RemovalPath = {
    fromStatus: 'D4',
    toStatus: 'G',
    description: 'Magistrate rescinded debt review court order',
    requiredDocTypes: [DOC_TYPES.NOTICE_OF_MOTION, DOC_TYPES.FOUNDING_AFFIDAVIT, DOC_TYPES.COURT_ORDER_GRANTED],
    alreadyExitable: false,
};

/** F1 / F2 / G — already at an exitable status, just needs DHS submission */
export const PATH_ALREADY_EXITABLE: RemovalPath = {
    fromStatus: 'EXITABLE',
    toStatus: 'REMOVE',
    description: 'Consumer DHS status is already at an exit status — ready for formal removal',
    requiredDocTypes: [],
    alreadyExitable: true,
};

/** All D4 candidate paths — evaluated in priority order */
export const D4_CANDIDATE_PATHS: RemovalPath[] = [
    PATH_D4_TO_G,   // Court order rescission (check first — highest evidence bar)
    PATH_D4_TO_F1,  // Mortgage present
    PATH_D4_TO_F2,  // All settled (most common — suggested if no clearer signal)
];

/** Get all possible removal paths for a given DHS status */
export function getRemovalPaths(dhsStatus: string | null | undefined): RemovalPath[] {
    if (!dhsStatus) return [];
    const s = dhsStatus.trim().toUpperCase();
    if (['F1', 'F2', 'G'].includes(s)) return [PATH_ALREADY_EXITABLE];
    if (s === 'A') return [PATH_A_TO_B];
    if (s === 'C') return [PATH_C_TO_G];
    if (s === 'D4') return D4_CANDIDATE_PATHS;
    return [];
}
