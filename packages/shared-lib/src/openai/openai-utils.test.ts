import { describe, it, expect } from 'vitest';
import { validateSAID, parseAIResponse, verifyIdNumbers } from './utils';

describe('OpenAI Utilities', () => {

    describe('validateSAID', () => {
        it('should validate a correct SA ID (Luhn check 40)', () => {
            const result = validateSAID('8301015009081');
            expect(result.isValid).toBe(true);
            expect(result.error).toBeUndefined();
        });

        it('should validate another correct SA ID (Luhn check 40)', () => {
            const result = validateSAID('9201015009082');
            expect(result.isValid).toBe(true);
        });

        it('should reject ID with incorrect length', () => {
            expect(validateSAID('830101500908').isValid).toBe(false); // 12 digits
            expect(validateSAID('83010150090811').isValid).toBe(false); // 14 digits
        });

        it('should reject mathematically incorrect ID', () => {
            // Changed last digit of a valid ID
            const result = validateSAID('8301015009082');
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Invalid Checksum');
        });

        it('should handle whitespace and non-digits', () => {
            const result = validateSAID('8301 015 009 081');
            expect(result.isValid).toBe(true);
        });

        it('should reject non-numeric input', () => {
            expect(validateSAID('ABCDEFGHIJKLM').isValid).toBe(false);
        });
    });

    describe('parseAIResponse', () => {
        it('should parse clean JSON', () => {
            const response = '{"name": "John", "age": 30}';
            const parsed = parseAIResponse(response);
            expect(parsed.name).toBe('John');
            expect(parsed.age).toBe(30);
        });

        it('should parse JSON inside markdown blocks', () => {
            const response = "Here is the data: ```json\n{\"key\": \"value\"}\n``` And that's all.";
            const parsed = parseAIResponse(response);
            expect(parsed.key).toBe('value');
        });

        it('should throw error on invalid JSON', () => {
            expect(() => parseAIResponse('Invalid JSON')).toThrow();
        });

        it('should throw error on empty response', () => {
            expect(() => parseAIResponse('')).toThrow();
        });
    });

    describe('verifyIdNumbers', () => {
        it('should verify if all IDs match', () => {
            const analysis = {
                id: { idNumber: '8301015009081' },
                creditReport: { consumer: { idNumber: '8301015009081' } }
            };
            const result = verifyIdNumbers(analysis);
            expect(result.isVerified).toBe(true);
            expect(result.bestId).toBe('8301015009081');
        });

        it('should warn and prefer ID document on mismatch', () => {
            const analysis = {
                id: { idNumber: '8301015009081' },
                creditReport: { consumer: { idNumber: '9201015009082' } }
            };
            const result = verifyIdNumbers(analysis);
            expect(result.isVerified).toBe(false);
            expect(result.bestId).toBe('8301015009081');
            expect(result.warning).toContain('mismatch');
        });

        it('should fallback to credit report if ID document is missing', () => {
            const analysis = {
                id: null,
                creditReport: { idNumber: '8301015009081' }
            };
            const result = verifyIdNumbers(analysis);
            expect(result.isVerified).toBe(true);
            expect(result.bestId).toBe('8301015009081');
        });

        it('should return error if no IDs found', () => {
            const result = verifyIdNumbers({});
            expect(result.isVerified).toBe(false);
            expect(result.bestId).toBeNull();
        });
    });
});
