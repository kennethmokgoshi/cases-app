import { describe, it, expect } from 'vitest';
import { getPlanGenerationGate, buildPlanGenerationError } from './AIPlanTab';

describe('getPlanGenerationGate', () => {
    it('allows generation when documents are sufficient and staff marked the case ready', () => {
        const gate = getPlanGenerationGate({
            confidenceCanProceed: true,
            planReadyToStart: true,
        });
        expect(gate.canGenerate).toBe(true);
        expect(gate.blockedReason).toBe('');
    });

    it('blocks generation when required documents are missing', () => {
        const gate = getPlanGenerationGate({
            confidenceCanProceed: false,
            planReadyToStart: true,
        });
        expect(gate.canGenerate).toBe(false);
        expect(gate.blockedReason).toBe('Upload required documents first');
    });

    it('blocks ALL cases (including B2C) until the readiness checkbox is ticked — regression for the 403 dead end', () => {
        const gate = getPlanGenerationGate({
            confidenceCanProceed: true,
            planReadyToStart: false,
        });
        expect(gate.canGenerate).toBe(false);
        expect(gate.blockedReason).toBe('Tick the readiness checkbox above first');
    });

    it('reports the missing-documents reason ahead of the readiness flag', () => {
        const gate = getPlanGenerationGate({
            confidenceCanProceed: false,
            planReadyToStart: false,
        });
        expect(gate.blockedReason).toBe('Upload required documents first');
    });

    it('keeps generation allowed while a plan is in progress (regenerate is gated separately)', () => {
        const gate = getPlanGenerationGate({
            confidenceCanProceed: true,
            planReadyToStart: true,
            planStatus: 'IN_PROGRESS',
        });
        expect(gate.canGenerate).toBe(true);
        expect(gate.blockedReason).toBe('Cannot regenerate while plan is running');
    });
});

describe('buildPlanGenerationError', () => {
    it('passes through the structured error, code, detail, and hint from the API', () => {
        const err = buildPlanGenerationError({
            error: 'OpenRouter rejected the API key',
            code: 'AI_AUTH_FAILED',
            detail: 'OpenRouter returned 401 (401 Missing Authentication header).',
            hint: 'Check OPENROUTER_API_KEY in the environment (.env.local).',
        });
        expect(err.message).toBe('OpenRouter rejected the API key');
        expect(err.code).toBe('AI_AUTH_FAILED');
        expect(err.detail).toContain('401');
        expect(err.hint).toContain('OPENROUTER_API_KEY');
    });

    it('falls back to listing missing documents when the API sends no detail', () => {
        const err = buildPlanGenerationError({
            error: 'Insufficient documents to generate plan.',
            missingRequired: ['Form 17.W', 'Court Order'],
        });
        expect(err.detail).toBe('Missing required documents: Form 17.W, Court Order');
    });

    it('uses a generic message when the API body is empty', () => {
        const err = buildPlanGenerationError({});
        expect(err.message).toBe('Failed to generate plan');
        expect(err.detail).toBeUndefined();
        expect(err.hint).toBeUndefined();
    });
});
