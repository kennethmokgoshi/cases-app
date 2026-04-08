import { prisma } from '@zenowethu/database';
import { logger } from '@zenowethu/shared-lib';
import OpenAI from 'openai';
import type { GeneratedPlan, PlanStepDefinition } from './types';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generatePlan(caseId: string): Promise<GeneratedPlan> {
  const caseRecord = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      client: true,
      creditAccounts: { where: { isIncluded: true } },
      documents: { select: { type: true, analyzedAt: true } },
      LegalMatter: {
        select: { matterType: true, creditorName: true, isPrescribed: true, status: true },
      },
      InsuranceAssessment: {
        select: { status: true, totalCurrentPremium: true, monthlySavings: true },
      },
      ForensicAudit: { select: { status: true } },
    },
  });

  if (!caseRecord) throw new Error(`Case ${caseId} not found`);

  const accounts = caseRecord.creditAccounts;
  const totalDebt = accounts.reduce((s, a) => s + Number(a.outstandingBalance || 0), 0);
  const totalInstalment = accounts.reduce((s, a) => s + Number(a.monthlyInstalment || 0), 0);
  const prescribed = accounts.filter((a) => a.isPrescribed);
  const hasHighInsurance = accounts.some((a) => a.hasInsurance && Number(a.premiumAmount || 0) > 0);
  const netSalary = Number(caseRecord.client.netSalary || 0);
  const possibleReckless = netSalary > 0 && totalInstalment > netSalary * 0.5;

  const systemPrompt = `You are an AI orchestration engine for Zenowethu, a South African debt counselling platform. Generate a precise action plan spanning multiple departments: Cases (DHS portal, documents), Legal (prescription letters, bureau disputes), Insurance (assessment, cancellation), Forensic (reckless lending), Finance (invoicing).

SA Law: Prescription Act — debts >3 years unpaid are prescribed (NCA Section 126B). Form 17.7 = DC notice to bureaux. DHS = NCR Debt Help System.

CRITICAL: Steps with category LEGAL_LETTER must have requiresApproval: true. GHL_WAIT steps follow any step expecting a response. Steps must be logically ordered.`;

  const userPrompt = `CASE: ${caseRecord.fileNumber} | CLIENT: ${caseRecord.client.firstName} ${caseRecord.client.lastName} (ID: ${caseRecord.client.idNumber})
TYPE: ${caseRecord.acquisitionType} | STATUS: ${caseRecord.status} | DHS: ${caseRecord.dhsStatus || 'None'}
DC: ${caseRecord.debtCounsellorName || 'Unknown'} <${caseRecord.dcEmail || 'no email'}>
SALARY: Net R${netSalary} / Gross R${caseRecord.client.grossSalary || 'Unknown'}
DEBT: Total R${totalDebt.toFixed(0)} | Monthly R${totalInstalment.toFixed(0)} | ${accounts.length} accounts (${prescribed.length} prescribed)
DOCUMENTS: ${caseRecord.documents.map((d) => d.type).join(', ') || 'None'}
LEGAL MATTERS: ${caseRecord.LegalMatter.map((l) => `${l.matterType}/${l.creditorName}`).join(', ') || 'None'}
INSURANCE: ${caseRecord.InsuranceAssessment[0] ? `Assessment exists, savings R${caseRecord.InsuranceAssessment[0].monthlySavings || 0}/mo` : 'None'}
FORENSIC: ${caseRecord.ForensicAudit[0]?.status || 'None'}

ACCOUNTS:
${accounts
  .map(
    (a) =>
      `- ${a.creditorName} (${a.accountType}): R${a.outstandingBalance}, last payment ${a.lastPaymentDate || 'unknown'}, prescribed: ${a.isPrescribed}, instalment: R${a.monthlyInstalment || 0}, insurance: ${a.hasInsurance ? `R${a.premiumAmount || 0}/mo` : 'No'}`,
  )
  .join('\n')}

TRIGGERS: ${
    [
      prescribed.length > 0 ? `${prescribed.length} prescribed accounts → legal letters to bureaux` : '',
      hasHighInsurance ? 'Insurance premiums found → assess and cancel' : '',
      caseRecord.dhsStatus ? `DHS status ${caseRecord.dhsStatus} → DHS action needed` : '',
      possibleReckless ? 'Instalments >50% of net salary → possible reckless lending' : '',
      !caseRecord.dcEmail ? 'No DC email → request file from DC first' : '',
    ]
      .filter(Boolean)
      .join('; ') || 'Standard debt review workflow'
  }

Respond ONLY with JSON:
{
  "caseType": "PRESCRIPTION_DISPUTE|DEBT_REVIEW_TRANSFER|INSURANCE_REPLACEMENT|RECKLESS_LENDING|COMBINED|GENERAL",
  "summary": "1-2 sentence plain English summary",
  "reasoning": "why this plan",
  "steps": [{
    "stepNumber": 1,
    "title": "short title",
    "description": "detailed description",
    "ownerApp": "CASES|LEGAL|INSURANCE|FORENSIC|FINANCE|GHL",
    "category": "DOCUMENT_REQUEST|DHS_ACTION|LEGAL_LETTER|INSURANCE|FORENSIC|NOTIFICATION|INTERNAL|CREDIT_BUREAU|GHL_WAIT|NCT_ACTION",
    "actionType": "valid action type",
    "actionParams": {},
    "requiresApproval": false,
    "waitingForEvent": null,
    "timeoutHours": null,
    "timeoutAction": null
  }]
}

Valid actionTypes: DHS_SEARCH, DHS_TRANSFER_REQUEST, REQUEST_FILE_FROM_DC, STATUS_UPDATE, DOCUMENT_REQUEST_CLIENT, PRESCRIPTION_CHECK, DRAFT_PRESCRIPTION_LETTER, SEND_PRESCRIPTION_LETTER, DRAFT_LEGAL_LETTER, SEND_LEGAL_LETTER, BUREAU_DISPUTE, INSURANCE_ASSESSMENT, DRAFT_CANCELLATION_LETTER, SEND_CANCELLATION_LETTER, OPEN_FORENSIC_AUDIT, RECKLESS_LENDING_ASSESSMENT, GENERATE_INVOICE, GHL_SEND_SMS, GHL_SEND_EMAIL, GHL_SEND_WHATSAPP, GHL_WAIT_DOCUMENT, GHL_WAIT_REPLY, NCT_STATUS_CHECK`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
  });

  const raw = JSON.parse(response.choices[0].message.content || '{}') as {
    caseType?: string;
    summary?: string;
    reasoning?: string;
    steps?: PlanStepDefinition[];
  };

  const steps: PlanStepDefinition[] = (raw.steps || []).map((s: PlanStepDefinition) => ({
    ...s,
    // DHS actions and legal letters always require explicit human approval before execution
    requiresApproval:
      s.category === 'LEGAL_LETTER' || s.category === 'DHS_ACTION'
        ? true
        : (s.requiresApproval || false),
  }));

  logger.info(`[Planner] Case ${caseId}: ${steps.length} steps, type: ${raw.caseType}`);
  return {
    caseType: raw.caseType || 'GENERAL',
    summary: raw.summary || '',
    steps,
    reasoning: raw.reasoning || '',
  };
}
