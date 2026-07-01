import { describe, expect, it } from 'vitest';
import {
  buildManualCaseCreatePayload,
  buildManualCasePatchPayload,
  cleanManualCaseValue,
  parseOptionalMoney,
} from './manual-case-payload';

const baseForm = {
  surname: 'Khoza',
  names: 'George',
  idNumber: '7704025569088',
  cellNumber: '0821234567',
  email: 'george@example.com',
  alternativeEmail: '',
  alternativePhone: 'NA',
  address: '1 Main Road',
  employer: 'Zenowethu',
  employeeNo: 'EMP-1',
  grossSalary: '15000',
  netSalary: '12000',
  salaryPayDate: '25',
  category: 'Payroll Single',
  closedAccounts: 2,
  openAccounts: 4,
  prescribedAccounts: 1,
  ncrdcNo: 'NCRDC123',
  serviceFee: '4950',
  instalments: 3,
  affordabilityStatus: 'Affordable',
  totalDebtAmount: '100000',
  totalMonthlyInstallment: '5000',
  isJointApplication: false,
  jointSurname: '',
  jointNames: '',
  jointIdNumber: '',
  jointCellNumber: '',
  jointEmail: '',
};

describe('manual case payload helpers', () => {
  it('builds a real case create payload without a temporary client', () => {
    const payload = buildManualCaseCreatePayload(baseForm, {
      projectId: 'project-1',
      acquisitionType: 'B2B',
      partnerName: 'Letsatsi',
      partnerBranch: 'Mbombela',
      partnerSplitPercent: 50,
      referrerId: 'referrer-1',
      services: ['DEBT_REVIEW'],
    });

    expect(payload.client).toMatchObject({
      firstName: 'George',
      lastName: 'Khoza',
      idNumber: '7704025569088',
      email: 'george@example.com',
      phone: '0821234567',
      type: 'Payroll Single',
    });
    expect(payload.client.idNumber).not.toMatch(/^MANUAL-/);
    expect(payload).toMatchObject({
      projectId: 'project-1',
      acquisitionType: 'B2B',
      partnerName: 'Letsatsi',
      partnerBranch: 'Mbombela',
      partnerSplitPercent: 50,
      services: ['DEBT_REVIEW'],
      referrerId: 'referrer-1',
      allowDuplicate: false,
    });
  });

  it('sanitizes placeholders and parses numeric case fields for the follow-up patch', () => {
    const payload = buildManualCasePatchPayload({
      ...baseForm,
      email: 'NA',
      alternativePhone: '',
      totalDebtAmount: 'bad-number',
      totalMonthlyInstallment: '1234.56',
    }, ['DEBT_REVIEW', 'LEGAL']);

    expect(payload.client.email).toBeNull();
    expect(payload.client.alternativePhone).toBeNull();
    expect(payload.totalDebtAmount).toBeNull();
    expect(payload.totalMonthlyInstallment).toBe(1234.56);
    expect(payload.services).toEqual(['DEBT_REVIEW', 'LEGAL']);
  });

  it('cleans empty values consistently', () => {
    expect(cleanManualCaseValue('  value  ')).toBe('value');
    expect(cleanManualCaseValue('NA')).toBeNull();
    expect(cleanManualCaseValue('')).toBeNull();
    expect(parseOptionalMoney('350.50')).toBe(350.5);
    expect(parseOptionalMoney('not a number')).toBeNull();
  });
});
