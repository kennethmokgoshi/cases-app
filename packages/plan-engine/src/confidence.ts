import { prisma } from '@zenowethu/database';
import { logger } from '@zenowethu/shared-lib';
import type { ConfidenceReport, MissingInfoItem } from './types';

const REQUIRED_DOCS = [
  {
    type: 'CREDIT_REPORT' as const,
    description: 'Credit report required to analyse accounts and determine workflow',
    isRequired: true,
    weight: 40,
    impactIfMissing: 'Cannot determine prescribed accounts, insurance premiums, or debt amounts. Plan cannot start.',
    docTypes: ['CREDIT_REPORT', 'CREDIT_BUREAU_REPORT'],
  },
  {
    type: 'ID_DOCUMENT' as const,
    description: 'Identity document required for legal correspondence and DHS actions',
    isRequired: true,
    weight: 30,
    impactIfMissing: 'Cannot send legal letters or initiate DHS transfer without verified identity.',
    docTypes: ['ID', 'PASSPORT', 'IDENTITY_DOCUMENT'],
  },
  {
    type: 'POA' as const,
    description: 'Power of Attorney required to act on behalf of the client',
    isRequired: true,
    weight: 20,
    impactIfMissing: 'Cannot legally represent client without signed POA.',
    docTypes: ['POA', 'ZENOWETHU_POA', 'POWER_OF_ATTORNEY'],
  },
];

const OPTIONAL_DOCS = [
  {
    type: 'PAYSLIP' as const,
    description: 'Latest payslip for affordability assessment',
    isRequired: false,
    weight: 10,
    impactIfMissing: 'Affordability assessment will be less accurate.',
    docTypes: ['PAYSLIP', 'SALARY_SLIP'],
  },
];

export async function checkConfidence(caseId: string): Promise<ConfidenceReport> {
  const documents = await prisma.document.findMany({ where: { caseId }, select: { type: true } });
  const docTypes = documents.map((d) => d.type.toUpperCase());
  const presentItems: string[] = [];
  const missingRequired: MissingInfoItem[] = [];
  const missingOptional: MissingInfoItem[] = [];
  let scoreDeducted = 0;

  for (const req of REQUIRED_DOCS) {
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
