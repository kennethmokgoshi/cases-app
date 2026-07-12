import { describe, it, expect } from 'vitest';
import { generateForm172A, type Form172AData } from './form17-2a-pdf';
import { generateAffordabilityAssessment, type AffordabilityAssessmentData } from './affordability-assessment-pdf';
import { generateConsumerInfoRecord, type ConsumerInfoRecordData } from './consumer-info-record-pdf';

const dc = {
    dcName:    'Aaron Nzotho',
    dcNcrdcNo: 'NCRDC3693',
    dcAddress: 'Suite 2, Second Floor, Central House, 17 Central Road, Mabopane, 0190',
    dcPhone:   '+27 81 747 7616',
    dcEmail:   'info@zenowethu.co.za',
};

const consumer = {
    firstName: 'Thabo',
    lastName:  'Mokoena',
    idNumber:  '8001015009087',
    email:     'thabo@example.com',
    phone:     '0821234567',
    address:   '12 Example Street, Mabopane, 0190',
};

function isPdf(bytes: Uint8Array): boolean {
    return String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-';
}

describe('generateForm172A', () => {
    const base: Form172AData = {
        fileNumber:              'ZW-0001',
        rejectionDate:           new Date('2026-07-09'),
        applicationDate:         new Date('2026-06-01'),
        ...consumer,
        openAccounts:            4,
        closedAccounts:          2,
        totalOutstandingBalance: 185000,
        totalMonthlyInstalment:  6400,
        netIncome:               18000,
        monthlySurplus:          11600,
        bankConfirmed:           true,
        ...dc,
    };

    it('renders a valid PDF', async () => {
        const bytes = await generateForm172A(base);
        expect(isPdf(bytes)).toBe(true);
        expect(bytes.length).toBeGreaterThan(1000);
    });

    it('renders when income figures are unknown', async () => {
        const bytes = await generateForm172A({ ...base, netIncome: null, monthlySurplus: null, bankConfirmed: false });
        expect(isPdf(bytes)).toBe(true);
    });
});

describe('generateAffordabilityAssessment', () => {
    const base: AffordabilityAssessmentData = {
        fileNumber:              'ZW-0001',
        assessmentDate:          new Date('2026-07-09'),
        firstName:               consumer.firstName,
        lastName:                consumer.lastName,
        idNumber:                consumer.idNumber,
        employer:                'Dept of Education',
        grossSalary:             28000,
        netIncome:               18000,
        netIncomeSource:         'Payslip (analysed document)',
        bankStatementDeposit:    17950,
        bankStatementDate:       '2026-06-25',
        bankConfirmed:           true,
        incomeNotes:             ['Bank statement salary deposit confirms the payslip net income (variance R50.00).'],
        openAccounts:            2,
        closedAccounts:          1,
        totalOutstandingBalance: 80000,
        totalMonthlyInstalment:  4000,
        monthlySurplus:          14000,
        isAffordable:            true,
        accounts: [
            { creditorName: 'ABSA Bank', accountNumber: '123456', accountType: 'PERSONAL_LOAN', status: 'ACTIVE', outstandingBalance: 50000, monthlyInstalment: 2500 },
            { creditorName: 'Truworths', accountNumber: '654321', accountType: 'RETAIL',        status: 'ACTIVE', outstandingBalance: 30000, monthlyInstalment: 1500 },
            { creditorName: 'Old Store', accountNumber: null,     accountType: 'RETAIL',        status: 'CLOSED', outstandingBalance: 0,     monthlyInstalment: null },
        ],
        ...dc,
    };

    it('renders a valid PDF for an affordable consumer', async () => {
        const bytes = await generateAffordabilityAssessment(base);
        expect(isPdf(bytes)).toBe(true);
    });

    it('renders for over-indebted and unknown-income consumers', async () => {
        const over = await generateAffordabilityAssessment({ ...base, isAffordable: false, monthlySurplus: -3000 });
        expect(isPdf(over)).toBe(true);
        const unknown = await generateAffordabilityAssessment({ ...base, isAffordable: null, netIncome: null, monthlySurplus: null, accounts: [] });
        expect(isPdf(unknown)).toBe(true);
    });

    it('paginates with many accounts', async () => {
        const accounts = Array.from({ length: 45 }, (_, i) => ({
            creditorName: `Creditor ${i + 1}`, accountNumber: `AC${i}`, accountType: 'RETAIL',
            status: 'ACTIVE', outstandingBalance: 1000, monthlyInstalment: 100,
        }));
        const bytes = await generateAffordabilityAssessment({ ...base, accounts });
        expect(isPdf(bytes)).toBe(true);
    });
});

describe('generateConsumerInfoRecord', () => {
    const base: ConsumerInfoRecordData = {
        fileNumber:              'ZW-0001',
        recordDate:              new Date('2026-07-09'),
        applicationDate:         new Date('2026-06-01'),
        ...consumer,
        employer:                'Dept of Education',
        employeeNo:              'P123456',
        grossSalary:             28000,
        netSalary:               18000,
        creditAccountCount:      3,
        totalOutstandingBalance: 80000,
        totalMonthlyInstalment:  4000,
        documents: [
            { type: 'ID',             fileName: 'id.pdf',            uploadedAt: new Date('2026-06-01') },
            { type: 'PAYSLIP',        fileName: 'payslip-june.pdf',  uploadedAt: new Date('2026-06-02') },
            { type: 'BANK_STATEMENT', fileName: 'fnb-june.pdf',      uploadedAt: new Date('2026-06-02') },
            { type: 'CREDIT_REPORT',  fileName: 'xds-report.pdf',    uploadedAt: new Date('2026-06-03') },
        ],
        ...dc,
    };

    it('renders a valid PDF', async () => {
        const bytes = await generateConsumerInfoRecord(base);
        expect(isPdf(bytes)).toBe(true);
    });

    it('renders with no documents on record', async () => {
        const bytes = await generateConsumerInfoRecord({ ...base, documents: [] });
        expect(isPdf(bytes)).toBe(true);
    });
});
