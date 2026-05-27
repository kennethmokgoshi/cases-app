import { prisma } from '@zenowethu/database';
import { logger } from '@zenowethu/shared-lib';
import type { ConfidenceReport, MissingInfoItem } from './types';

const STANDARD_REQUIRED_DOCS = [
  {
    type: 'CREDIT_REPORT' as const,
    description: 'Credit report required to analyse accounts and determine workflow',
    isRequired: true,
    weight: 40,
    impactIfMissing: 'Cannot determine prescribed accounts, insurance premiums, or debt amounts. Plan cannot start.',
    docTypes: ['CREDIT_REPORT', 'CREDIT_BUREAU_REPORT', 'CREDIT_REPORT_OTHER', 'CREDIT_REPORT_EXPERIAN', 'CREDIT_REPORT_TRANSUNION', 'CREDIT_REPORT_XDS', 'CREDIT_REPORT_LIGHTSTONE', 'EXPERIAN', 'TRANSUNION', 'XDS', 'CLEAR_SCORE', 'KUDOUGH'],
  },
  {
    type: 'ID_DOCUMENT' as const,
    description: 'Identity document required for legal correspondence and DHS actions',
    isRequired: true,
    weight: 30,
    impactIfMissing: 'Cannot send legal letters or initiate DHS transfer without verified identity.',
    docTypes: ['ID', 'PASSPORT', 'IDENTITY_DOCUMENT', 'SMART_CARD', 'GREEN_ID_BOOK'],
  },
  {
    type: 'POA' as const,
    description: 'Power of Attorney required to act on behalf of the client',
    isRequired: true,
    weight: 20,
    impactIfMissing: 'Cannot legally represent client without signed POA.',
    docTypes: ['POA', 'ZENOWETHU_POA', 'ZDM_POA', 'ZDM', 'POWER_OF_ATTORNEY', 'AUTHORIZATION', 'APPLICATION_FORM'],
  },
];

const REMOVAL_REQUIRED_DOCS = [
  {
    type: 'ID_DOCUMENT' as const,
    description: 'Identity document required for legal correspondence and DHS actions',
    isRequired: true,
    weight: 30,
    impactIfMissing: 'Cannot send legal letters or initiate DHS transfer without verified identity.',
    docTypes: ['ID', 'PASSPORT', 'IDENTITY_DOCUMENT', 'SMART_CARD', 'GREEN_ID_BOOK'],
  },
  {
    type: 'FORM_17W' as const,
    description: 'Form 17.W is required to prove withdrawal or clearance of debt review',
    isRequired: true,
    weight: 40,
    impactIfMissing: 'Cannot remove debt review flag without the 17.W withdrawal form or Clearance Certificate.',
    docTypes: ['FORM_17W', '17W'],
  },
  {
    type: 'COURT_ORDER' as const,
    description: 'Court Order required to legally instruct bureaus',
    isRequired: true,
    weight: 20,
    impactIfMissing: 'Many bureaus require the rescission court order alongside the 17.W.',
    docTypes: ['COURT_ORDER'],
  },
];

const OPTIONAL_DOCS = [
  {
    type: 'PAYSLIP' as const,
    description: 'Latest payslip for affordability assessment',
    isRequired: false,
    weight: 5,
    impactIfMissing: 'Affordability assessment will be less accurate.',
    docTypes: ['PAYSLIP', 'SALARY_SLIP'],
  },
  {
    type: 'BANK_STATEMENT' as const,
    description: 'Latest bank statement for financial verification (Added Advantage)',
    isRequired: false,
    weight: 5,
    impactIfMissing: 'Financial verification will be less robust.',
    docTypes: ['BANK_STATEMENT', 'BANK_CONFIRMATION', 'STATEMENT'],
  },
];

export async function checkConfidence(caseId: string, isFlagRemoval: boolean = false): Promise<ConfidenceReport> {
  const documents = await prisma.document.findMany({ where: { caseId }, select: { type: true } });
  const docTypes = documents.map((d) => d.type.toUpperCase());
  const presentItems: string[] = [];
  const missingRequired: MissingInfoItem[] = [];
  const missingOptional: MissingInfoItem[] = [];
  let scoreDeducted = 0;

  const requiredDocsList = isFlagRemoval ? REMOVAL_REQUIRED_DOCS : STANDARD_REQUIRED_DOCS;

  for (const req of requiredDocsList) {
    if (req.docTypes.some((t) => docTypes.includes(t))) {
      presentItems.push(req.type);
    } else {
      missingRequired.push({
        type: req.type,
        description: req.description,
        isRequired: true,
        weight: req.weight,
        impactIfMissing: req.impactIfMissing,
      });
      scoreDeducted += req.weight;
    }
  }

  for (const opt of OPTIONAL_DOCS) {
    if (opt.docTypes.some((t) => docTypes.includes(t))) {
      presentItems.push(opt.type);
    } else {
      missingOptional.push({
        type: opt.type,
        description: opt.description,
        isRequired: false,
        weight: opt.weight,
        impactIfMissing: opt.impactIfMissing,
      });
      scoreDeducted += opt.weight;
    }
  }

  const score = Math.max(0, 100 - scoreDeducted);
  const canProceed = missingRequired.length === 0;
  logger.info(`[Confidence] Case ${caseId}: score=${score}, canProceed=${canProceed}`);
  return { score, canProceed, missingRequired, missingOptional, presentItems };
}
