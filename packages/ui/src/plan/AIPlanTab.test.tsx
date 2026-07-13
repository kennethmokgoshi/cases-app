import { describe, it, expect } from 'vitest';
import { getPlanGenerationGate } from './AIPlanTab';

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
