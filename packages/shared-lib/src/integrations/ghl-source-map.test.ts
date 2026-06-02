import { describe, it, expect } from 'vitest';
import { mapGhlSourceToLeadSource } from './ghl-source-map';

describe('mapGhlSourceToLeadSource', () => {
    it('returns GHL_MANUAL for empty tags and no custom field', () => {
        expect(mapGhlSourceToLeadSource([], {})).toBe('GHL_MANUAL');
    });

    it('returns GHL_MANUAL for unrecognised tag', () => {
        expect(mapGhlSourceToLeadSource(['unknown-source', 'random'], {})).toBe('GHL_MANUAL');
    });

    it('maps facebook tag to FACEBOOK_AD', () => {
        expect(mapGhlSourceToLeadSource(['facebook-ad'], {})).toBe('FACEBOOK_AD');
    });

    it('maps fb_ad tag to FACEBOOK_AD', () => {
        expect(mapGhlSourceToLeadSource(['fb_ad'], {})).toBe('FACEBOOK_AD');
    });

    it('maps instagram tag to INSTAGRAM_AD', () => {
        expect(mapGhlSourceToLeadSource(['instagram'], {})).toBe('INSTAGRAM_AD');
    });

    it('maps ig_ad tag to INSTAGRAM_AD', () => {
        expect(mapGhlSourceToLeadSource(['ig_ad'], {})).toBe('INSTAGRAM_AD');
    });

    it('maps tiktok-bio tag to TIKTOK', () => {
        expect(mapGhlSourceToLeadSource(['tiktok-bio'], {})).toBe('TIKTOK');
    });

    it('maps linkedin tag to LINKEDIN', () => {
        expect(mapGhlSourceToLeadSource(['linkedin'], {})).toBe('LINKEDIN');
    });

    it('maps pinterest tag to PINTEREST', () => {
        expect(mapGhlSourceToLeadSource(['pinterest'], {})).toBe('PINTEREST');
    });

    it('maps website-chat tag to WEBSITE_CHAT', () => {
        expect(mapGhlSourceToLeadSource(['website-chat'], {})).toBe('WEBSITE_CHAT');
    });

    it('maps voice-bot tag to WEBSITE_VOICE', () => {
        expect(mapGhlSourceToLeadSource(['voice-bot'], {})).toBe('WEBSITE_VOICE');
    });

    it('maps referral tag to REFERRAL', () => {
        expect(mapGhlSourceToLeadSource(['referral'], {})).toBe('REFERRAL');
    });

    it('maps assessment tag to WEBSITE_ASSESSMENT', () => {
        expect(mapGhlSourceToLeadSource(['website-assessment'], {})).toBe('WEBSITE_ASSESSMENT');
    });

    it('custom field lead_source overrides tag', () => {
        expect(mapGhlSourceToLeadSource(['facebook-ad'], { lead_source: 'LINKEDIN' })).toBe('LINKEDIN');
    });

    it('custom field with special chars is normalised', () => {
        expect(mapGhlSourceToLeadSource([], { lead_source: 'tiktok' })).toBe('TIKTOK');
    });

    it('invalid custom field value falls through to tag matching', () => {
        expect(mapGhlSourceToLeadSource(['facebook-ad'], { lead_source: 'NOT_VALID' })).toBe('FACEBOOK_AD');
    });
});
