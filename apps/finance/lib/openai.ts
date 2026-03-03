import { logger } from '@zenowethu/shared-lib';

/**
 * Validate a South African ID number
 * @param id - The ID number to validate
 * @returns Object with isValid boolean and error string
 */
export function validateSAID(id: string): { isValid: boolean; error: string } {
  try {
    // Remove any non-numeric characters
    const cleanId = id.replace(/\D/g, '');

    // SA ID must be 13 digits
    if (cleanId.length !== 13) {
      return { isValid: false, error: 'ID must be 13 digits' };
    }

    // Extract date components (YYMMDD format)
    const year = parseInt(cleanId.substring(0, 2), 10);
    const month = parseInt(cleanId.substring(2, 4), 10);
    const day = parseInt(cleanId.substring(4, 6), 10);

    // Basic date validation
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return { isValid: false, error: 'Invalid date in ID number' };
    }

    // Validate using Luhn algorithm
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      let digit = parseInt(cleanId[i], 10);

      if (i % 2 === 1) {
        // Every second digit is doubled
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }

      sum += digit;
    }

    const checkDigit = parseInt(cleanId[12], 10);
    const calculatedCheckDigit = (10 - (sum % 10)) % 10;

    if (checkDigit !== calculatedCheckDigit) {
      return { isValid: false, error: 'Invalid checksum' };
    }

    return { isValid: true, error: '' };
  } catch (error) {
    logger.error('[validateSAID] Error:', error);
    return { isValid: false, error: 'Validation failed' };
  }
}
