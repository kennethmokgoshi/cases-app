export type ManualCaseFormData = {
  surname: string;
  names: string;
  idNumber: string;
  cellNumber?: string;
  email?: string;
  alternativeEmail?: string;
  alternativePhone?: string;
  address?: string;
  employer?: string;
  employeeNo?: string;
  grossSalary?: string;
  netSalary?: string;
  salaryPayDate?: string;
  category?: string;
  closedAccounts?: number;
  openAccounts?: number;
  prescribedAccounts?: number;
  ncrdcNo?: string;
  serviceFee?: string;
  instalments?: number;
  affordabilityStatus?: string;
  totalDebtAmount?: string;
  totalMonthlyInstallment?: string;
  isJointApplication?: boolean;
  jointSurname?: string;
  jointNames?: string;
  jointIdNumber?: string;
  jointCellNumber?: string;
  jointEmail?: string;
};

export type ManualCaseProjectData = {
  projectId: string;
  acquisitionType: 'B2B' | 'B2C';
  partnerName?: string | null;
  partnerBranch?: string | null;
  partnerSplitPercent?: number;
  referrerId?: string | null;
  services?: string[];
  allowDuplicate?: boolean;
};

export function cleanManualCaseValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed !== 'NA' ? trimmed : null;
}

export function parseOptionalMoney(value: string | null | undefined): number | null {
  const cleaned = cleanManualCaseValue(value);
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildManualCaseCreatePayload(
  formData: ManualCaseFormData,
  projectData: ManualCaseProjectData
) {
  return {
    client: {
      firstName: formData.names.trim(),
      lastName: formData.surname.trim(),
      idNumber: formData.idNumber.trim(),
      email: cleanManualCaseValue(formData.email),
      phone: cleanManualCaseValue(formData.cellNumber),
      address: cleanManualCaseValue(formData.address),
      type: formData.category || 'Standard',
    },
    jointClient: formData.isJointApplication ? {
      firstName: formData.jointNames?.trim() || '',
      lastName: formData.jointSurname?.trim() || '',
      idNumber: formData.jointIdNumber?.trim() || '',
      phone: cleanManualCaseValue(formData.jointCellNumber),
      email: cleanManualCaseValue(formData.jointEmail),
    } : null,
    projectId: projectData.projectId,
    acquisitionType: projectData.acquisitionType,
    partnerName: projectData.partnerName ?? null,
    partnerBranch: projectData.partnerBranch ?? null,
    partnerSplitPercent: projectData.partnerSplitPercent ?? 0,
    services: projectData.services ?? [],
    referrerId: projectData.referrerId ?? undefined,
    allowDuplicate: projectData.allowDuplicate ?? false,
  };
}

export function buildManualCasePatchPayload(formData: ManualCaseFormData, services: string[]) {
  return {
    client: {
      firstName: formData.names.trim(),
      lastName: formData.surname.trim(),
      idNumber: formData.idNumber.trim(),
      email: cleanManualCaseValue(formData.email),
      alternativeEmail: cleanManualCaseValue(formData.alternativeEmail),
      phone: cleanManualCaseValue(formData.cellNumber),
      alternativePhone: cleanManualCaseValue(formData.alternativePhone),
      address: cleanManualCaseValue(formData.address),
      employer: cleanManualCaseValue(formData.employer),
      employeeNo: cleanManualCaseValue(formData.employeeNo),
      grossSalary: cleanManualCaseValue(formData.grossSalary),
      netSalary: cleanManualCaseValue(formData.netSalary),
      salaryPayDate: cleanManualCaseValue(formData.salaryPayDate),
      type: formData.category || 'Standard',
    },
    jointClient: formData.isJointApplication ? {
      firstName: formData.jointNames?.trim() || '',
      lastName: formData.jointSurname?.trim() || '',
      idNumber: formData.jointIdNumber?.trim() || '',
      phone: cleanManualCaseValue(formData.jointCellNumber),
      email: cleanManualCaseValue(formData.jointEmail),
    } : null,
    closedAccounts: formData.closedAccounts || 0,
    openAccounts: formData.openAccounts || 0,
    prescribedAccounts: formData.prescribedAccounts || 0,
    ncrdcNo: cleanManualCaseValue(formData.ncrdcNo),
    services,
    serviceFee: cleanManualCaseValue(formData.serviceFee),
    instalments: formData.instalments || 1,
    affordabilityStatus: cleanManualCaseValue(formData.affordabilityStatus),
    totalDebtAmount: parseOptionalMoney(formData.totalDebtAmount),
    totalMonthlyInstallment: parseOptionalMoney(formData.totalMonthlyInstallment),
  };
}
