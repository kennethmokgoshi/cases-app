import { describe, it, expect } from 'vitest';
import { interpretPoaResponse } from './SendPoaModal';

describe('interpretPoaResponse', () => {
    it('reports a successful email send', () => {
        const result = interpretPoaResponse(true, {
            success: true,
            sentTo: ['Mlangeni Botshelo Nthabiseng'],
        }, 'EMAIL');

        expect(result.ok).toBe(true);
        expect(result.message).toBe('POA sent via email to Mlangeni Botshelo Nthabiseng.');
        expect(result.sent).toEqual(['Mlangeni Botshelo Nthabiseng']);
    });

    it('never reports success when nothing was sent or saved', () => {
        // Regression: the modal used to fall back to the client name and claim
        // "sent successfully" while also listing the same person as skipped.
        const result = interpretPoaResponse(false, {
            success: false,
            error: 'Email delivery failed: Invalid login',
            failures: [{ name: 'Mlangeni Botshelo Nthabiseng', reason: 'Email delivery failed: Invalid login' }],
        }, 'EMAIL');

        expect(result.ok).toBe(false);
        expect(result.sent).toEqual([]);
        expect(result.message).toBe('Email delivery failed: Invalid login');
        expect(result.failures).toHaveLength(1);
    });

    it('treats an empty 200 response as a failure, not a send', () => {
        const result = interpretPoaResponse(true, { success: true }, 'EMAIL');

        expect(result.ok).toBe(false);
        expect(result.sent).toEqual([]);
    });

    it('summarises a save-only run', () => {
        const result = interpretPoaResponse(true, {
            success: true,
            savedDocuments: [{ name: 'Jane Dube', fileName: 'ZDM_POA_8001015009087_1.pdf', fileUrl: '/uploads/c1/1-ZDM_POA.pdf' }],
        }, 'EMAIL');

        expect(result.ok).toBe(true);
        expect(result.message).toBe('POA saved to case Documents for Jane Dube.');
        expect(result.saved).toHaveLength(1);
    });

    it('summarises a send-and-save run', () => {
        const result = interpretPoaResponse(true, {
            success: true,
            sentTo: ['Jane Dube'],
            savedDocuments: [{ name: 'Jane Dube', fileName: 'ZDM_POA.pdf', fileUrl: '/uploads/c1/ZDM_POA.pdf' }],
        }, 'WHATSAPP');

        expect(result.ok).toBe(true);
        expect(result.message).toBe('POA sent via WhatsApp to Jane Dube, and saved to case Documents for Jane Dube.');
    });

    it('keeps partial failures visible alongside a success', () => {
        const result = interpretPoaResponse(true, {
            success: true,
            sentTo: ['Jane Dube'],
            failures: [{ name: 'John Dube', reason: 'Email delivery failed.' }],
            skippedClients: ['Sipho Dube'],
        }, 'EMAIL');

        expect(result.ok).toBe(true);
        expect(result.failures).toEqual([{ name: 'John Dube', reason: 'Email delivery failed.' }]);
        expect(result.skipped).toEqual(['Sipho Dube']);
    });

    it('surfaces incomplete staff profile fields', () => {
        const result = interpretPoaResponse(false, {
            error: 'incomplete_staff_profile',
            message: 'Your staff profile is incomplete.',
            missingFields: ['ID Number', 'Residential Address'],
        }, 'EMAIL');

        expect(result.ok).toBe(false);
        expect(result.message).toBe('Your staff profile is incomplete.');
        expect(result.missingFields).toEqual(['ID Number', 'Residential Address']);
    });
});
