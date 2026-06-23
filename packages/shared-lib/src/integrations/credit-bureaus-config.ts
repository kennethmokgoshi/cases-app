/**
 * Credit Bureaus Configuration
 *
 * ⚠️ IMPORTANT POLICY:
 * - DO NOT auto-send emails to credit bureaus about DEBT REVIEW REMOVAL
 * - CAN customize template for CREDIT PROFILE UPDATES (account info, clearance letters, etc.)
 * - Template REQUEST_FILE_CREDIT_BUREAU exists but is NOT automated
 * - Manual customization allowed for non-debt-review communications
 */

export interface CreditBureauConfig {
  name: string;
  code: string;
  email: string;
  phone?: string;
  website?: string;
  postalAddress?: string;
  notes?: string;
}

/**
 * South African Credit Bureaus
 * Standard contact details for correspondence
 */
export const CREDIT_BUREAUS: CreditBureauConfig[] = [
  {
    name: 'TransUnion XDS',
    code: 'XDS',
    email: 'disputes@xds.co.za',
    phone: '+27 11 214 2000',
    website: 'https://www.xds.co.za',
    postalAddress: 'TransUnion, PO Box 11649, Johannesburg, 2000',
    notes: 'Accessed via https://www.online.xds.co.za for consumer reports'
  },
  {
    name: 'Experian',
    code: 'EXP',
    email: 'consumer@experian.co.za',
    phone: '+27 11 622 2600',
    website: 'https://www.experian.co.za',
    postalAddress: 'Experian, 1 Protea Place, Sandton, 2146',
    notes: 'South African credit bureau'
  },
  {
    name: 'Compuscan',
    code: 'CPS',
    email: 'info@compuscan.co.za',
    phone: '+27 11 627 2000',
    website: 'https://www.compuscan.co.za',
    postalAddress: 'Compuscan (Pty) Ltd, 132 Main Road, Bryanston, 2191',
    notes: 'South African credit bureau'
  }
];

export function getBureauByCode(code: string): CreditBureauConfig | undefined {
  return CREDIT_BUREAUS.find(b => b.code.toUpperCase() === code.toUpperCase());
}

export function getAllBureaus(): CreditBureauConfig[] {
  return CREDIT_BUREAUS;
}

export function getBureauEmails(): string[] {
  return CREDIT_BUREAUS.map(b => b.email);
}
