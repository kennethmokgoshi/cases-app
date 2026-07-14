import { prisma } from '@zenowethu/database';
import { logger, getAiClientForTask } from '@zenowethu/shared-lib';
import type { GeneratedPlan, PlanStepDefinition } from './types';

export async function generatePlan(caseId: string, userGuidance?: string): Promise<GeneratedPlan> {
  const { client, model: modelId } = await getAiClientForTask('plan_generation');

  const caseRecord = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      client: true,
      creditAccounts: { where: { isIncluded: true } },
      documents: {
        select: {
          type: true,
          fileName: true,
          analyzedAt: true,
          extractedData: true,
          uploadedAt: true,
        },
        orderBy: { uploadedAt: 'desc' },
      },
      comments: {
        select: {
          content: true,
          type: true,
          activityType: true,
          activityData: true,
          isInternal: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
        take: 100,
      },
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

  // Parse services to determine the case intent
  let services: string[] = [];
  try {
    services = caseRecord.services ? (JSON.parse(caseRecord.services) as string[]) : [];
  } catch { /* ignore parse errors */ }

  const isDebtReviewApplication = services.includes('debt_review_application');
  const isFlagRemoval = services.includes('debt_review_flag_removal');
  const isInsuranceService = services.includes('insurance_assessment') || services.includes('credit_life_insurance');
  const isLegalService = services.includes('legal_matter') || services.includes('prescription_dispute');

  const accounts = caseRecord.creditAccounts;
  const totalDebt = accounts.reduce((s, a) => s + Number(a.outstandingBalance || 0), 0);
  const totalInstalment = accounts.reduce((s, a) => s + Number(a.monthlyInstalment || 0), 0);
  const prescribed = accounts.filter((a) => a.isPrescribed);
  const hasHighInsurance = accounts.some((a) => a.hasInsurance && Number(a.premiumAmount || 0) > 0);
  const netSalary = Number(caseRecord.client.netSalary || 0);
  const possibleReckless = netSalary > 0 && totalInstalment > netSalary * 0.5;

  // ── Timeline / Activity section ──────────────────────────────────────────
  const planActivityTypes = new Set([
    'AI_PLAN_GENERATED',
    'AI_PLAN_APPROVED',
    'AI_PLAN_STARTED',
    'PLAN_STEP_APPROVED',
    'PLAN_RESUMED',
    'PLAN_INFO_SUBMITTED',
    'PLAN_READY_FLAG',
  ]);

  const emailComments = caseRecord.comments.filter((c) => c.type === 'EMAIL');
  const activityComments = caseRecord.comments.filter(
    (c) => c.activityType && !planActivityTypes.has(c.activityType),
  );
  const noteComments = caseRecord.comments.filter(
    (c) => c.type === 'NOTE' || c.type === 'JOURNAL',
  );

  const timelineSection =
    activityComments.length > 0
      ? `TIMELINE (${activityComments.length} events):\n${activityComments
          .map(
            (c) =>
              `[${c.createdAt.toISOString().slice(0, 10)}] ${c.activityType || c.type}: ${c.content.slice(0, 200)}`,
          )
          .join('\n')}`
      : 'TIMELINE: No recorded activity';

  const emailSection =
    emailComments.length > 0
      ? `EMAILS SENT (${emailComments.length}):\n${emailComments
          .map(
            (c) =>
              `[${c.createdAt.toISOString().slice(0, 10)}] ${c.content.slice(0, 300)}`,
          )
          .join('\n')}`
      : 'EMAILS: None sent';

  const notesSection =
    noteComments.length > 0
      ? `STAFF NOTES (${noteComments.length}):\n${noteComments
          .map((c) => `[${c.createdAt.toISOString().slice(0, 10)}] ${c.content.slice(0, 300)}`)
          .join('\n')}`
      : '';

  // ── Document status — explicit present/missing summary ───────────────────
  const STANDARD_REQUIRED_DOC_TYPES = [
    { label: 'Credit Report', types: ['CREDIT_REPORT', 'CREDIT_BUREAU_REPORT', 'CREDIT_REPORT_OTHER', 'CREDIT_REPORT_EXPERIAN', 'CREDIT_REPORT_TRANSUNION', 'CREDIT_REPORT_XDS', 'CREDIT_REPORT_LIGHTSTONE', 'EXPERIAN', 'TRANSUNION', 'XDS', 'CLEAR_SCORE', 'KUDOUGH'] },
    { label: 'Identity Document', types: ['ID', 'PASSPORT', 'IDENTITY_DOCUMENT', 'SMART_CARD', 'GREEN_ID_BOOK'] },
    { label: 'Power of Attorney', types: ['POA', 'ZENOWETHU_POA', 'ZDM_POA', 'ZDM', 'POWER_OF_ATTORNEY', 'AUTHORIZATION', 'APPLICATION_FORM'] },
  ];
  
  const REMOVAL_REQUIRED_DOC_TYPES = [
    { label: 'Identity Document', types: ['ID', 'PASSPORT', 'IDENTITY_DOCUMENT', 'SMART_CARD', 'GREEN_ID_BOOK'] },
    { label: 'Form 17.W', types: ['FORM_17W', '17W'] },
    { label: 'Court Order', types: ['COURT_ORDER'] },
  ];

  const OPTIONAL_DOC_TYPES = [
    { label: 'Payslip', types: ['PAYSLIP', 'SALARY_SLIP'] },
    { label: 'Bank Statement', types: ['BANK_STATEMENT', 'BANK_CONFIRMATION', 'STATEMENT'] },
    { label: 'Clearance Certificate', types: ['CLEARANCE_CERTIFICATE'] },
    { label: 'Settlement Letter', types: ['SETTLEMENT_LETTER'] },
  ];

  const activeRequiredDocs = isFlagRemoval ? REMOVAL_REQUIRED_DOC_TYPES : STANDARD_REQUIRED_DOC_TYPES;
  const uploadedDocTypes = caseRecord.documents.map((d) => d.type.toUpperCase());

  const docStatusLines: string[] = [];
  const missingRequiredDocs: string[] = [];
  for (const req of activeRequiredDocs) {
    const present = req.types.some((t) => uploadedDocTypes.includes(t));
    docStatusLines.push(present ? `✓ ${req.label} — PRESENT` : `✗ ${req.label} — MISSING`);
    if (!present) missingRequiredDocs.push(req.label);
  }
  for (const opt of OPTIONAL_DOC_TYPES) {
    const present = opt.types.some((t) => uploadedDocTypes.includes(t));
    docStatusLines.push(present ? `✓ ${opt.label} — PRESENT` : `○ ${opt.label} — optional, not uploaded`);
  }

  const allRequiredDocsPresent = missingRequiredDocs.length === 0;

  const documentStatusSummary = allRequiredDocsPresent
    ? `ALL REQUIRED DOCUMENTS PRESENT — do NOT generate document collection or file request steps unless a specific document listed below is actually needed for a LATER action.\n${docStatusLines.join('\n')}`
    : `MISSING REQUIRED DOCUMENTS — these must be collected before proceeding:\n${docStatusLines.join('\n')}`;

  // ── Document content section ─────────────────────────────────────────────
  const documentSection = caseRecord.documents
    .map((d) => {
      const extracted = d.extractedData ? (() => {
        try {
          const parsed = JSON.parse(d.extractedData as string) as Record<string, unknown>;
          return JSON.stringify(parsed, null, 0).slice(0, 800);
        } catch {
          return (d.extractedData as string).slice(0, 800);
        }
      })() : null;
      return `• ${d.type} (${d.fileName}) uploaded ${d.uploadedAt.toISOString().slice(0, 10)}${d.analyzedAt ? ', analyzed' : ', NOT analyzed'}${extracted ? `\n  CONTENT: ${extracted}` : ''}`;
    })
    .join('\n') || 'None uploaded';

  const systemPrompt = `You are an AI orchestration engine for Zenowethu, a South African debt counselling platform. Generate a precise, context-aware action plan spanning multiple departments: Cases (DHS portal, documents), Legal (prescription letters, bureau disputes), Insurance (assessment, cancellation), Forensic (reckless lending), Finance (invoicing).

SA Law: Prescription Act — debts >3 years unpaid are prescribed (NCA Section 126B). Form 17.7 = DC notice to bureaux. DHS = NCR Debt Help System (government portal).

SERVICE TYPE CONTEXT — adapt your plan to the actual service requested:
- DEBT_REVIEW_APPLICATION: Consumer is NOT yet under debt review. They want PROTECTION (NCA Section 86). This is a NEW intake. DO NOT request files from other DCs or initiate DHS transfers. Focus on: affordability assessment, document collection from client, POA signing, counselling, Form 17.1 notification, and submitting the debt review application. No DHS lookup steps.
- DEBT_REVIEW_FLAG_REMOVAL: Consumer is ALREADY under debt review and wants to EXIT. They have a flag on their name at the bureaux. Focus on: verifying clearance certificate eligibility, DHS portal actions (auto-search, transfer), requesting Form 17.W and clearance certificate, and bureau removal. DHS steps ARE appropriate here.
- INSURANCE_ASSESSMENT: Focus on reviewing credit life insurance on accounts and replacing with cheaper cover.
- LEGAL_MATTER/PRESCRIPTION: Focus on identifying prescribed debts and sending legal letters to creditors and bureaux.

CRITICAL RULES:
- Steps with category LEGAL_LETTER must have requiresApproval: true
- DHS_ACTION steps must have requiresApproval: true
- GHL_WAIT steps follow any step expecting a response (document, reply)
- Steps must be logically ordered based on dependencies
- READ THE DOCUMENT STATUS CAREFULLY: if the prompt says "ALL REQUIRED DOCUMENTS PRESENT", do NOT generate any steps to request, collect, or obtain documents — they are already in hand
- READ THE EMAILS CAREFULLY: any email already sent means that action is DONE — do NOT generate a step to send that same email or request that same thing again
- READ THE TIMELINE CAREFULLY: any activity already logged means that action is DONE — skip it
- If documents are already analyzed, use the extracted data to inform specific step details (creditor names, amounts, account numbers)
- REQUEST_FILE_FROM_DC is ONLY valid when SERVICE REQUESTED is DEBT_REVIEW_FLAG_REMOVAL — for all other service types (new DR application, insurance, legal, etc.) NEVER use REQUEST_FILE_FROM_DC, even if DC email is missing or documents are absent`;

  const serviceLabel = [
    isDebtReviewApplication && 'DEBT_REVIEW_APPLICATION (new intake — consumer seeking DR protection for the first time)',
    isFlagRemoval && 'DEBT_REVIEW_FLAG_REMOVAL (consumer already in DR, wants flag removed from bureaux)',
    isInsuranceService && 'INSURANCE_ASSESSMENT',
    isLegalService && 'LEGAL_MATTER/PRESCRIPTION',
  ].filter(Boolean).join('; ') || `Other: ${services.join(', ') || 'unspecified'}`;

  const guidanceBlock = userGuidance?.trim()
    ? `\n⚠️ STAFF GUIDANCE FOR THIS PLAN (follow this closely — this overrides your default assumptions):\n"${userGuidance.trim()}"\n`
    : '';

  const userPrompt = `${guidanceBlock}CASE: ${caseRecord.fileNumber} | CLIENT: ${caseRecord.client.firstName} ${caseRecord.client.lastName} (ID: ${caseRecord.client.idNumber})
SERVICE REQUESTED: ${serviceLabel}
TYPE: ${caseRecord.acquisitionType} | STATUS: ${caseRecord.status} | DHS: ${caseRecord.dhsStatus || 'None'}
DC: ${caseRecord.debtCounsellorName || 'Unknown'} <${caseRecord.dcEmail || 'no email'}>
SALARY: Net R${netSalary} / Gross R${caseRecord.client.grossSalary || 'Unknown'}
DEBT: Total R${totalDebt.toFixed(0)} | Monthly R${totalInstalment.toFixed(0)} | ${accounts.length} accounts (${prescribed.length} prescribed)
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

── DOCUMENT STATUS (CHECK THIS BEFORE GENERATING ANY DOCUMENT/FILE REQUEST STEPS) ──
${documentStatusSummary}

── FULL DOCUMENT LIST ──
${documentSection}

── ACTIVITY HISTORY (ALREADY DONE — DO NOT REPEAT THESE) ──
${timelineSection}

── EMAILS ALREADY SENT (ALREADY DONE — DO NOT SEND THESE AGAIN) ──
${emailSection}

${notesSection ? `── STAFF NOTES ──\n${notesSection}` : ''}

TRIGGERS (only act on these if not already addressed above): ${
    [
      isDebtReviewApplication ? 'NEW INTAKE — consumer seeking debt review protection. Start with affordability assessment, document collection, POA signing. Do NOT request DC files or do DHS lookups.' : '',
      (isFlagRemoval && prescribed.length > 0) ? `${prescribed.length} prescribed accounts → legal letters to bureaux` : '',
      (isFlagRemoval && caseRecord.dhsStatus) ? `DHS status ${caseRecord.dhsStatus} → DHS portal action needed` : '',
      (isFlagRemoval && !caseRecord.dcEmail) ? 'Flag removal: no DC email on file — REQUEST_FILE_FROM_DC to obtain the client file from the current debt counsellor' : '',
      (isFlagRemoval && !allRequiredDocsPresent) ? `Missing removal documents: ${missingRequiredDocs.join(', ')} — request from client (DOCUMENT_REQUEST_CLIENT) or current DC (REQUEST_FILE_FROM_DC) if safe to do so` : '',
      (!isFlagRemoval && !allRequiredDocsPresent) ? `Missing documents: ${missingRequiredDocs.join(', ')} — request from client (DOCUMENT_REQUEST_CLIENT), NOT from a DC` : '',
      hasHighInsurance ? 'Insurance premiums found → assess for cheaper alternatives' : '',
      possibleReckless ? 'Instalments >50% of net salary → assess for reckless lending' : '',
    ]
      .filter(Boolean)
      .join('; ') || 'All documents present — proceed to substantive work based on service type and accounts above'
  }

INSTRUCTION: Based on ALL the above context, generate ONLY the next steps that have NOT already been done per the activity history and emails above. If a step has already been actioned (email sent, document received, activity logged), skip it entirely.

Respond ONLY with JSON:
{
  "caseType": "DEBT_REVIEW_APPLICATION|DEBT_REVIEW_FLAG_REMOVAL|PRESCRIPTION_DISPUTE|DEBT_REVIEW_TRANSFER|INSURANCE_REPLACEMENT|RECKLESS_LENDING|COMBINED|GENERAL",
  "summary": "1-2 sentence plain English summary of what still needs to be done",
  "reasoning": "why this plan, referencing specific evidence from timeline/documents/emails",
  "steps": [{
    "stepNumber": 1,
    "title": "short title",
    "description": "detailed description referencing specific context from case",
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

  const response = await client.chat.completions.create({
    model: modelId,
    max_tokens: 4096,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
  });

  const text = response.choices[0].message.content || '';
  // Extract JSON from the response (handles markdown code blocks if present)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in Claude response');

  const raw = JSON.parse(jsonMatch[0] as string) as {
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
