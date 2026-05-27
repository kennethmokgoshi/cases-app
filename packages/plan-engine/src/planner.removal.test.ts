import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generatePlan } from './planner';
import { prisma } from '@zenowethu/database';

const { mockCreate } = vi.hoisted(() => {
    return { mockCreate: vi.fn() };
});

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: {
            findUnique: vi.fn()
        }
    }
}));

vi.mock('@zenowethu/shared-lib', () => ({
    logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
    }
}));

// Mock OpenAI
vi.mock('openai', () => {
    return {
        default: vi.fn().mockImplementation(() => ({
            chat: {
                completions: {
                    create: mockCreate
                }
            }
        }))
    };
});

describe('planner flag removal triggers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCreate.mockResolvedValue({
            choices: [
                {
                    message: {
                        content: JSON.stringify({
                            caseType: 'DEBT_REVIEW_FLAG_REMOVAL',
                            summary: 'Need to request Form 17.W and Court Order.',
                            reasoning: 'Missing required removal documents.',
                            steps: [
                                {
                                    stepNumber: 1,
                                    title: 'Request Form 17.W',
                                    description: 'Request Form 17.W from current DC',
                                    ownerApp: 'CASES',
                                    category: 'DOCUMENT_REQUEST',
                                    actionType: 'REQUEST_FILE_FROM_DC',
                                    actionParams: {},
                                    requiresApproval: false,
                                    waitingForEvent: null,
                                    timeoutHours: null,
                                    timeoutAction: null
                                }
                            ]
                        })
                    }
                }
            ]
        } as any);
    });

    it('should identify missing Form 17.W and Court Order for DEBT_REVIEW_FLAG_REMOVAL service', async () => {
        // Arrange
        vi.mocked(prisma.case.findUnique).mockResolvedValue({
            id: 'case-123',
            fileNumber: 'ZEN-123',
            status: 'NEW',
            dhsStatus: null,
            debtCounsellorName: 'Test DC',
            dcEmail: 'dc@test.com',
            acquisitionType: 'Organic',
            services: JSON.stringify(['debt_review_flag_removal']),
            client: { firstName: 'John', lastName: 'Doe', idNumber: '9001015000000', netSalary: 10000 },
            creditAccounts: [],
            documents: [
                // Only has ID, missing 17.W and Court Order
                { type: 'ID', fileName: 'id.pdf', analyzedAt: new Date(), extractedData: null, uploadedAt: new Date() }
            ],
            comments: [],
            LegalMatter: [],
            InsuranceAssessment: [],
            ForensicAudit: []
        } as any);

        // Act
        const plan = await generatePlan('case-123');

        // Assert
        expect(prisma.case.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'case-123' } }));
        expect(mockCreate).toHaveBeenCalledTimes(1);

        const promptCall = mockCreate.mock.calls[0][0];
        const userPrompt = promptCall.messages.find((m: any) => m.role === 'user').content;

        // Ensure the prompt identifies missing removal documents correctly
        expect(userPrompt).toContain('✗ Form 17.W — MISSING');
        expect(userPrompt).toContain('✗ Court Order — MISSING');
        expect(userPrompt).toContain('✓ Identity Document — PRESENT');
        expect(userPrompt).toContain('Missing removal documents: Form 17.W, Court Order');
        expect(userPrompt).toContain('REQUEST_FILE_FROM_DC');
        
        // Ensure the plan output has the correct case type
        expect(plan.caseType).toBe('DEBT_REVIEW_FLAG_REMOVAL');
    });

    it('should NOT demand Form 17.W for a standard debt review application', async () => {
        // Arrange
        vi.mocked(prisma.case.findUnique).mockResolvedValue({
            id: 'case-124',
            fileNumber: 'ZEN-124',
            status: 'NEW',
            services: JSON.stringify(['debt_review_application']), // Standard application!
            client: { firstName: 'Jane', lastName: 'Smith', idNumber: '9002025000000', netSalary: 10000 },
            creditAccounts: [],
            documents: [
                // Only has ID
                { type: 'ID', fileName: 'id.pdf', analyzedAt: new Date(), extractedData: null, uploadedAt: new Date() }
            ],
            comments: [],
            LegalMatter: [],
            InsuranceAssessment: [],
            ForensicAudit: []
        } as any);

        // Act
        await generatePlan('case-124');

        // Assert
        const promptCall = mockCreate.mock.calls[0][0];
        const userPrompt = promptCall.messages.find((m: any) => m.role === 'user').content;

        // Ensure it asks for standard docs, not 17.W
        expect(userPrompt).not.toContain('Form 17.W — MISSING');
        expect(userPrompt).toContain('✗ Credit Report — MISSING');
        expect(userPrompt).toContain('✗ Power of Attorney — MISSING');
        const triggersMatch = userPrompt.match(/TRIGGERS(.*?)\n\nINSTRUCTION/s);
        const triggersText = triggersMatch ? triggersMatch[1] : '';
        expect(triggersText).not.toContain('REQUEST_FILE_FROM_DC'); // New intakes shouldn't request from DC
    });
});
