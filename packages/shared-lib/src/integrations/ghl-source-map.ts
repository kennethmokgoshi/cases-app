export const LEAD_SOURCES = [
    'WEBSITE_ASSESSMENT',
    'FACEBOOK_AD',
    'INSTAGRAM_AD',
    'TIKTOK',
    'LINKEDIN',
    'PINTEREST',
    'WEBSITE_CHAT',
    'WEBSITE_VOICE',
    'GHL_MANUAL',
    'REFERRAL',
] as const;

export type LeadSource = typeof LEAD_SOURCES[number];

const TAG_MAP: Array<[RegExp, LeadSource]> = [
    [/facebook|fb[_-]?ad/i,               'FACEBOOK_AD'],
    [/instagram|ig[_-]?ad/i,              'INSTAGRAM_AD'],
    [/tiktok|tik[_-]?tok/i,               'TIKTOK'],
    [/linkedin/i,                          'LINKEDIN'],
    [/pinterest/i,                         'PINTEREST'],
    [/website[_-]?chat|chat[_-]?bot/i,    'WEBSITE_CHAT'],
    [/website[_-]?voice|voice[_-]?bot/i,  'WEBSITE_VOICE'],
    [/referral/i,                          'REFERRAL'],
    [/website[_-]?assessment|assessment/i, 'WEBSITE_ASSESSMENT'],
];

/**
 * Maps GHL contact tags and custom fields to a LeadSource value.
 * Custom field `lead_source` takes precedence over tags.
 * Falls back to 'GHL_MANUAL' when no match found.
 */
export function mapGhlSourceToLeadSource(
    tags: string[],
    customFields: Record<string, string>,
): LeadSource {
    const fieldVal = customFields['lead_source']
        ?.trim()
        .toUpperCase()
        .replace(/[^A-Z_]/g, '_');
    if (fieldVal && (LEAD_SOURCES as readonly string[]).includes(fieldVal)) {
        return fieldVal as LeadSource;
    }

    for (const tag of tags) {
        for (const [pattern, source] of TAG_MAP) {
            if (pattern.test(tag)) return source;
        }
    }

    return 'GHL_MANUAL';
}
