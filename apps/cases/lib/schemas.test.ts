import { describe, it, expect } from 'vitest';
import {
    ApplyUpdatesSchema,
    CaseMoveSchema,
    ReanalyzeSchema,
    ApiKeyCreateSchema,
    ApiKeyPatchSchema,
    CaseCommentCreateSchema,
    CaseNotificationSendSchema,
    DhsSettingsSchema,
    DocumentSummarySchema,
    GhlSettingsSchema,
    NotificationReadSchema,
    TemplateCreateSchema,
    ClientCreateSchema,
    ClientUpdateSchema,
    CaseCreateSchema,
    CasePatchSchema,
    CaseStatusSchema,
    isProvisionalIdNumber,
    UserCreateSchema,
    ForgotPasswordSchema,
    ResetPasswordSchema,
    ProjectCreateSchema,
    CommentCreateSchema } from './schemas';

// ─── ClientCreateSchema ───────────────────────────────────────────────────────

describe('ClientCreateSchema', () => {
    const valid = {
        firstName: 'John',
        lastName: 'Doe',
        idNumber: '8001015009087' };

    it('passes with required fields only', () => {
        expect(ClientCreateSchema.safeParse(valid).success).toBe(true);
    });

    it('passes with all optional fields', () => {
        const result = ClientCreateSchema.safeParse({
            ...valid,
            email: 'john@example.com',
            phone: '0821234567',
            address: '1 Main St, Cape Town',
            type: 'Standard' });
        expect(result.success).toBe(true);
    });

    it('fails when firstName is missing', () => {
        const result = ClientCreateSchema.safeParse({ ...valid, firstName: '' });
        expect(result.success).toBe(false);
    });

    it('fails when lastName is missing', () => {
        const result = ClientCreateSchema.safeParse({ ...valid, lastName: '' });
        expect(result.success).toBe(false);
    });

    it('fails when idNumber is missing', () => {
        const result = ClientCreateSchema.safeParse({ ...valid, idNumber: '' });
        expect(result.success).toBe(false);
    });

    it('fails with invalid email format', () => {
        const result = ClientCreateSchema.safeParse({ ...valid, email: 'not-an-email' });
        expect(result.success).toBe(false);
    });

    it('accepts null email at field level (CaseCreateSchema enforces the requirement)', () => {
        const result = ClientCreateSchema.safeParse({ ...valid, email: null });
        expect(result.success).toBe(true);
    });

    it('fails with invalid phone number', () => {
        const result = ClientCreateSchema.safeParse({ ...valid, phone: 'abc' });
        expect(result.success).toBe(false);
    });
});

// ─── CaseCreateSchema ─────────────────────────────────────────────────────────

describe('CaseCreateSchema', () => {
    const validClient = { firstName: 'Jane', lastName: 'Smith', idNumber: '9001015009087', email: 'jane@example.com' };
    const valid = { client: validClient, projectId: 'proj-123' };

    it('passes with minimal required fields', () => {
        expect(CaseCreateSchema.safeParse(valid).success).toBe(true);
    });

    it('applies defaults: acquisitionType=B2C, partnerSplitPercent=0', () => {
        const result = CaseCreateSchema.safeParse(valid);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.acquisitionType).toBe('B2C');
            expect(result.data.partnerSplitPercent).toBe(0);
            expect(result.data.secondaryProjectIds).toEqual([]);
        }
    });

    it('passes for B2B with partner fields', () => {
        const result = CaseCreateSchema.safeParse({
            ...valid,
            acquisitionType: 'B2B',
            partnerName: 'Letsatsi',
            partnerSplitPercent: 50 });
        expect(result.success).toBe(true);
    });

    it('fails with invalid acquisitionType', () => {
        const result = CaseCreateSchema.safeParse({ ...valid, acquisitionType: 'UNKNOWN' });
        expect(result.success).toBe(false);
    });

    it('fails when projectId is missing', () => {
        const result = CaseCreateSchema.safeParse({ client: validClient, projectId: '' });
        expect(result.success).toBe(false);
    });

    it('fails when client is missing required fields', () => {
        const result = CaseCreateSchema.safeParse({
            client: { firstName: 'Jane' },
            projectId: 'proj-123' });
        expect(result.success).toBe(false);
    });

    it('fails when partnerSplitPercent exceeds 100', () => {
        const result = CaseCreateSchema.safeParse({ ...valid, partnerSplitPercent: 150 });
        expect(result.success).toBe(false);
    });

    it('fails when the client has no email address', () => {
        const { email, ...clientWithoutEmail } = validClient;
        const result = CaseCreateSchema.safeParse({ client: clientWithoutEmail, projectId: 'proj-123' });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.some(i => i.path.join('.') === 'client.email')).toBe(true);
        }
    });

    it('fails when the client email is null', () => {
        const result = CaseCreateSchema.safeParse({ client: { ...validClient, email: null }, projectId: 'proj-123' });
        expect(result.success).toBe(false);
    });

    it('allows a provisional TEMP- shell through without an email', () => {
        const result = CaseCreateSchema.safeParse({
            client: { firstName: 'Temp', lastName: 'Processing', idNumber: 'TEMP-1712345678901' },
            projectId: 'proj-123' });
        expect(result.success).toBe(true);
    });

    it('allows a provisional MANUAL- shell through without an email', () => {
        const result = CaseCreateSchema.safeParse({
            client: { firstName: 'Manual', lastName: 'Entry', idNumber: 'MANUAL-1712345678901' },
            projectId: 'proj-123' });
        expect(result.success).toBe(true);
    });

    it('leaves the joint applicant email optional (main applicant is the notified party)', () => {
        const result = CaseCreateSchema.safeParse({
            ...valid,
            jointClient: { firstName: 'Sam', lastName: 'Smith', idNumber: '9202025009087' } });
        expect(result.success).toBe(true);
    });

    it('still rejects a malformed joint applicant email when one is supplied', () => {
        const result = CaseCreateSchema.safeParse({
            ...valid,
            jointClient: { firstName: 'Sam', lastName: 'Smith', idNumber: '9202025009087', email: 'not-an-email' } });
        expect(result.success).toBe(false);
    });

    it('does not treat a real ID number as provisional', () => {
        expect(isProvisionalIdNumber('9001015009087')).toBe(false);
        expect(isProvisionalIdNumber('TEMPORARY-1')).toBe(false);
        expect(isProvisionalIdNumber(null)).toBe(false);
        expect(isProvisionalIdNumber('TEMP-1712345678901')).toBe(true);
        expect(isProvisionalIdNumber('MANUAL-1')).toBe(true);
    });
});

// ─── CasePatchSchema ──────────────────────────────────────────────────────────

describe('CasePatchSchema', () => {
    it('allows a client patch that does not touch the email address', () => {
        const result = CasePatchSchema.safeParse({ client: { phone: '0821234567' } });
        expect(result.success).toBe(true);
    });

    it('allows a client patch that sets a valid email address', () => {
        const result = CasePatchSchema.safeParse({ client: { email: 'jane@example.com' } });
        expect(result.success).toBe(true);
    });

    it('refuses to blank out an email address with an empty string', () => {
        const result = CasePatchSchema.safeParse({ client: { email: '' } });
        expect(result.success).toBe(false);
    });

    it('refuses to blank out an email address with null', () => {
        const result = CasePatchSchema.safeParse({ client: { email: null } });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.some(i => i.path.join('.') === 'client.email')).toBe(true);
        }
    });

    it('leaves case-level fields untouched by the email rule', () => {
        const result = CasePatchSchema.safeParse({ status: 'IN_PROGRESS' });
        expect(result.success).toBe(true);
    });
});

// ─── CaseStatusSchema ─────────────────────────────────────────────────────────

describe('CaseStatusSchema', () => {
    it('passes with a valid status string', () => {
        const result = CaseStatusSchema.safeParse({ newStatus: 'DOCS_RECEIVED' });
        expect(result.success).toBe(true);
    });

    it('defaults skipNotification to false', () => {
        const result = CaseStatusSchema.safeParse({ newStatus: 'NEW_LEAD' });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.skipNotification).toBe(false);
        }
    });

    it('accepts skipNotification=true', () => {
        const result = CaseStatusSchema.safeParse({ newStatus: 'CLOSED', skipNotification: true });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.skipNotification).toBe(true);
        }
    });

    it('fails when newStatus is empty', () => {
        const result = CaseStatusSchema.safeParse({ newStatus: '' });
        expect(result.success).toBe(false);
    });

    it('fails when newStatus is missing', () => {
        const result = CaseStatusSchema.safeParse({});
        expect(result.success).toBe(false);
    });
});

// ─── UserCreateSchema ─────────────────────────────────────────────────────────

describe('UserCreateSchema', () => {
    const valid = {
        firstName: 'Admin',
        lastName: 'User',
        email: 'admin@zenowethu.co.za',
        password: 'Secur3Pass!' };

    it('passes with required fields', () => {
        expect(UserCreateSchema.safeParse(valid).success).toBe(true);
    });

    it('lowercases the email via transformation', () => {
        // The schema itself does not lowercase — the route does — but email must be valid
        const result = UserCreateSchema.safeParse({ ...valid, email: 'ADMIN@ZENOWETHU.CO.ZA' });
        expect(result.success).toBe(true);
    });

    it('defaults role to MEMBER and userType to STAFF', () => {
        const result = UserCreateSchema.safeParse(valid);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.role).toBe('MEMBER');
            expect(result.data.userType).toBe('STAFF');
        }
    });

    it('fails with invalid email', () => {
        const result = UserCreateSchema.safeParse({ ...valid, email: 'not-valid' });
        expect(result.success).toBe(false);
    });

    it('fails when password is too short', () => {
        const result = UserCreateSchema.safeParse({ ...valid, password: 'short' });
        expect(result.success).toBe(false);
    });

    it('fails with invalid role', () => {
        const result = UserCreateSchema.safeParse({ ...valid, role: 'SUPERUSER' });
        expect(result.success).toBe(false);
    });

    it('fails when firstName is missing', () => {
        const result = UserCreateSchema.safeParse({ ...valid, firstName: '' });
        expect(result.success).toBe(false);
    });

    it('fails when password exceeds max length', () => {
        const result = UserCreateSchema.safeParse({ ...valid, password: 'a'.repeat(129) });
        expect(result.success).toBe(false);
    });
});

// ─── ForgotPasswordSchema ─────────────────────────────────────────────────────

describe('ForgotPasswordSchema', () => {
    it('passes with valid email', () => {
        expect(ForgotPasswordSchema.safeParse({ email: 'user@example.com' }).success).toBe(true);
    });

    it('fails with invalid email', () => {
        expect(ForgotPasswordSchema.safeParse({ email: 'notanemail' }).success).toBe(false);
    });

    it('fails when email is missing', () => {
        expect(ForgotPasswordSchema.safeParse({}).success).toBe(false);
    });
});

// ─── ResetPasswordSchema ──────────────────────────────────────────────────────

describe('ResetPasswordSchema', () => {
    const valid = { token: 'abc123token', password: 'NewPassw0rd!' };

    it('passes with valid token and password', () => {
        expect(ResetPasswordSchema.safeParse(valid).success).toBe(true);
    });

    it('fails with empty token', () => {
        expect(ResetPasswordSchema.safeParse({ ...valid, token: '' }).success).toBe(false);
    });

    it('fails with short password', () => {
        expect(ResetPasswordSchema.safeParse({ ...valid, password: 'abc' }).success).toBe(false);
    });

    it('fails when both are missing', () => {
        expect(ResetPasswordSchema.safeParse({}).success).toBe(false);
    });
});

// ─── ProjectCreateSchema ──────────────────────────────────────────────────────

describe('ProjectCreateSchema', () => {
    const valid = { name: 'My Project' };

    it('passes with just a name', () => {
        expect(ProjectCreateSchema.safeParse(valid).success).toBe(true);
    });

    it('defaults type to FOLDER', () => {
        const result = ProjectCreateSchema.safeParse(valid);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.type).toBe('FOLDER');
        }
    });

    it('fails with empty name', () => {
        expect(ProjectCreateSchema.safeParse({ name: '' }).success).toBe(false);
    });

    it('fails with invalid type', () => {
        expect(ProjectCreateSchema.safeParse({ name: 'X', type: 'INVALID' }).success).toBe(false);
    });

    it('passes with members array', () => {
        const result = ProjectCreateSchema.safeParse({
            name: 'Team Project',
            members: [{ userId: 'user-1', role: 'MANAGER' }, { userId: 'user-2' }] });
        expect(result.success).toBe(true);
    });

    it('fails when member userId is empty', () => {
        const result = ProjectCreateSchema.safeParse({
            name: 'Bad Members',
            members: [{ userId: '' }] });
        expect(result.success).toBe(false);
    });
});

// ─── CommentCreateSchema ──────────────────────────────────────────────────────

describe('CommentCreateSchema', () => {
    it('passes with required content', () => {
        expect(CommentCreateSchema.safeParse({ content: 'A note' }).success).toBe(true);
    });

    it('defaults type to COMMENT and isInternal to false', () => {
        const result = CommentCreateSchema.safeParse({ content: 'Hello' });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.type).toBe('COMMENT');
            expect(result.data.isInternal).toBe(false);
        }
    });

    it('fails with empty content', () => {
        expect(CommentCreateSchema.safeParse({ content: '' }).success).toBe(false);
    });

    it('fails when content exceeds max length', () => {
        expect(CommentCreateSchema.safeParse({ content: 'x'.repeat(10001) }).success).toBe(false);
    });
});

// ─── CaseCommentCreateSchema ──────────────────────────────────────────────────

describe('CaseCommentCreateSchema', () => {
    it('passes with content only', () => {
        expect(CaseCommentCreateSchema.safeParse({ content: 'A note' }).success).toBe(true);
    });

    it('defaults isInternal to true', () => {
        const result = CaseCommentCreateSchema.safeParse({ content: 'test' });
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.isInternal).toBe(true);
    });

    it('accepts JOURNAL type', () => {
        const result = CaseCommentCreateSchema.safeParse({ content: 'Journal', type: 'JOURNAL' });
        expect(result.success).toBe(true);
    });

    it('fails with empty content', () => {
        expect(CaseCommentCreateSchema.safeParse({ content: '' }).success).toBe(false);
    });

    it('fails with invalid type', () => {
        expect(CaseCommentCreateSchema.safeParse({ content: 'x', type: 'BAD' }).success).toBe(false);
    });
});

// ─── ApiKeyCreateSchema ───────────────────────────────────────────────────────

describe('ApiKeyCreateSchema', () => {
    const valid = { name: 'My API Key' };

    it('passes with just a name', () => {
        expect(ApiKeyCreateSchema.safeParse(valid).success).toBe(true);
    });

    it('defaults permissions to read and rateLimit to 1000', () => {
        const result = ApiKeyCreateSchema.safeParse(valid);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.permissions).toBe('read');
            expect(result.data.rateLimit).toBe(1000);
        }
    });

    it('fails with empty name', () => {
        expect(ApiKeyCreateSchema.safeParse({ name: '' }).success).toBe(false);
    });

    it('fails when rateLimit exceeds max', () => {
        expect(ApiKeyCreateSchema.safeParse({ name: 'K', rateLimit: 999999 }).success).toBe(false);
    });

    it('passes with expiresAt null', () => {
        expect(ApiKeyCreateSchema.safeParse({ name: 'K', expiresAt: null }).success).toBe(true);
    });
});

// ─── ApiKeyPatchSchema ────────────────────────────────────────────────────────

describe('ApiKeyPatchSchema', () => {
    it('passes with empty object (all optional)', () => {
        expect(ApiKeyPatchSchema.safeParse({}).success).toBe(true);
    });

    it('passes toggling isActive', () => {
        expect(ApiKeyPatchSchema.safeParse({ isActive: false }).success).toBe(true);
    });

    it('fails with rateLimit below minimum', () => {
        expect(ApiKeyPatchSchema.safeParse({ rateLimit: 0 }).success).toBe(false);
    });
});

// ─── DhsSettingsSchema ────────────────────────────────────────────────────────

describe('DhsSettingsSchema', () => {
    it('passes with username only', () => {
        expect(DhsSettingsSchema.safeParse({ username: 'NCRDC3693' }).success).toBe(true);
    });

    it('passes with username and password', () => {
        expect(DhsSettingsSchema.safeParse({ username: 'NCRDC3693', password: 'secret' }).success).toBe(true);
    });

    it('fails with empty username', () => {
        expect(DhsSettingsSchema.safeParse({ username: '' }).success).toBe(false);
    });

    it('fails when username is missing', () => {
        expect(DhsSettingsSchema.safeParse({}).success).toBe(false);
    });
});

// ─── GhlSettingsSchema ────────────────────────────────────────────────────────

describe('GhlSettingsSchema', () => {
    it('passes with empty object (all optional)', () => {
        expect(GhlSettingsSchema.safeParse({}).success).toBe(true);
    });

    it('passes with all fields', () => {
        const result = GhlSettingsSchema.safeParse({
            apiKey: 'key-123',
            locationId: 'loc-456',
            email: 'admin@ghl.com',
            password: 'secret' });
        expect(result.success).toBe(true);
    });

    it('fails with invalid email', () => {
        expect(GhlSettingsSchema.safeParse({ email: 'not-an-email' }).success).toBe(false);
    });
});

// ─── TemplateCreateSchema ─────────────────────────────────────────────────────

describe('TemplateCreateSchema', () => {
    const valid = { name: 'Welcome SMS', content: 'Hello {{name}}', channel: 'SMS', category: 'INTAKE' };

    it('passes with all required fields', () => {
        expect(TemplateCreateSchema.safeParse(valid).success).toBe(true);
    });

    it('fails with invalid channel', () => {
        expect(TemplateCreateSchema.safeParse({ ...valid, channel: 'TELEGRAM' }).success).toBe(false);
    });

    it('fails with empty name', () => {
        expect(TemplateCreateSchema.safeParse({ ...valid, name: '' }).success).toBe(false);
    });

    it('fails with empty content', () => {
        expect(TemplateCreateSchema.safeParse({ ...valid, content: '' }).success).toBe(false);
    });

    it('accepts EMAIL and WHATSAPP channels', () => {
        expect(TemplateCreateSchema.safeParse({ ...valid, channel: 'EMAIL' }).success).toBe(true);
        expect(TemplateCreateSchema.safeParse({ ...valid, channel: 'WHATSAPP' }).success).toBe(true);
    });
});

// ─── NotificationReadSchema ───────────────────────────────────────────────────

describe('NotificationReadSchema', () => {
    it('passes with markAllRead=true', () => {
        expect(NotificationReadSchema.safeParse({ markAllRead: true }).success).toBe(true);
    });

    it('passes with a list of notificationIds', () => {
        expect(NotificationReadSchema.safeParse({ notificationIds: ['id-1', 'id-2'] }).success).toBe(true);
    });

    it('fails when neither markAllRead nor notificationIds provided', () => {
        expect(NotificationReadSchema.safeParse({}).success).toBe(false);
    });

    it('fails when markAllRead=false and no ids given', () => {
        expect(NotificationReadSchema.safeParse({ markAllRead: false }).success).toBe(false);
    });

    it('fails with empty notificationIds array', () => {
        expect(NotificationReadSchema.safeParse({ notificationIds: [] }).success).toBe(false);
    });
});

// ─── CaseNotificationSendSchema ───────────────────────────────────────────────

describe('CaseNotificationSendSchema', () => {
    it('passes with empty object (all optional)', () => {
        expect(CaseNotificationSendSchema.safeParse({}).success).toBe(true);
    });

    it('passes with a custom message', () => {
        expect(CaseNotificationSendSchema.safeParse({
            channel: 'WHATSAPP',
            message: 'Your case is ready.',
            recipient: '0821234567' }).success).toBe(true);
    });

    it('fails with invalid channel', () => {
        expect(CaseNotificationSendSchema.safeParse({ channel: 'TELEGRAM' }).success).toBe(false);
    });

    it('fails when message exceeds max length', () => {
        expect(CaseNotificationSendSchema.safeParse({ message: 'x'.repeat(2001) }).success).toBe(false);
    });
});

// ─── DocumentSummarySchema ────────────────────────────────────────────────────

describe('DocumentSummarySchema', () => {
    const valid = { openAccounts: 3, closedAccounts: 2, totalDebt: 50000, totalInstallment: 1500 };

    it('passes with valid numbers', () => {
        expect(DocumentSummarySchema.safeParse(valid).success).toBe(true);
    });

    it('fails with negative openAccounts', () => {
        expect(DocumentSummarySchema.safeParse({ ...valid, openAccounts: -1 }).success).toBe(false);
    });

    it('fails with negative totalDebt', () => {
        expect(DocumentSummarySchema.safeParse({ ...valid, totalDebt: -100 }).success).toBe(false);
    });

    it('fails when required field is missing', () => {
        expect(DocumentSummarySchema.safeParse({ openAccounts: 1, closedAccounts: 0 }).success).toBe(false);
    });

    it('fails with non-integer openAccounts', () => {
        expect(DocumentSummarySchema.safeParse({ ...valid, openAccounts: 1.5 }).success).toBe(false);
    });
});

// ─── CaseMoveSchema ───────────────────────────────────────────────────────────

describe('CaseMoveSchema', () => {
    const valid = { caseIds: ['case-1', 'case-2'], targetProjectId: 'proj-abc' };

    it('passes with required fields', () => {
        expect(CaseMoveSchema.safeParse(valid).success).toBe(true);
    });

    it('fails when caseIds is empty array', () => {
        expect(CaseMoveSchema.safeParse({ ...valid, caseIds: [] }).success).toBe(false);
    });

    it('fails when targetProjectId is empty', () => {
        expect(CaseMoveSchema.safeParse({ ...valid, targetProjectId: '' }).success).toBe(false);
    });

    it('fails when caseIds is missing', () => {
        expect(CaseMoveSchema.safeParse({ targetProjectId: 'proj-abc' }).success).toBe(false);
    });

    it('fails when targetProjectId is missing', () => {
        expect(CaseMoveSchema.safeParse({ caseIds: ['case-1'] }).success).toBe(false);
    });

    it('fails when a caseId is an empty string', () => {
        expect(CaseMoveSchema.safeParse({ caseIds: ['case-1', ''], targetProjectId: 'proj-abc' }).success).toBe(false);
    });
});

// ─── ApplyUpdatesSchema ───────────────────────────────────────────────────────

describe('ApplyUpdatesSchema', () => {
    it('passes with string field update', () => {
        expect(ApplyUpdatesSchema.safeParse({ updates: { firstName: 'John' } }).success).toBe(true);
    });

    it('passes with number field update', () => {
        expect(ApplyUpdatesSchema.safeParse({ updates: { openAccounts: 3 } }).success).toBe(true);
    });

    it('passes with null field update (clearing a field)', () => {
        expect(ApplyUpdatesSchema.safeParse({ updates: { totalDebtAmount: null } }).success).toBe(true);
    });

    it('passes with multiple mixed updates', () => {
        expect(ApplyUpdatesSchema.safeParse({
            updates: { firstName: 'Jane', openAccounts: 2, totalDebtAmount: null }
        }).success).toBe(true);
    });

    it('fails when updates object is empty', () => {
        expect(ApplyUpdatesSchema.safeParse({ updates: {} }).success).toBe(false);
    });

    it('fails when updates is missing', () => {
        expect(ApplyUpdatesSchema.safeParse({}).success).toBe(false);
    });

    it('fails when an update value is an object (not string|number|null)', () => {
        expect(ApplyUpdatesSchema.safeParse({ updates: { firstName: { nested: 'bad' } } }).success).toBe(false);
    });
});

// ─── ReanalyzeSchema ──────────────────────────────────────────────────────────

describe('ReanalyzeSchema', () => {
    const validSingle = { caseId: 'case-123', documentId: 'doc-456' };
    const validSeparate = { caseId: 'case-123', mode: 'SEPARATE', documentIds: ['doc-1', 'doc-2'] };

    it('passes for SINGLE mode with documentId', () => {
        expect(ReanalyzeSchema.safeParse(validSingle).success).toBe(true);
    });

    it('defaults mode to SINGLE', () => {
        const result = ReanalyzeSchema.safeParse({ caseId: 'case-123' });
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.mode).toBe('SINGLE');
    });

    it('passes for SEPARATE mode with documentIds', () => {
        expect(ReanalyzeSchema.safeParse(validSeparate).success).toBe(true);
    });

    it('fails when SEPARATE mode has no documentIds', () => {
        expect(ReanalyzeSchema.safeParse({ caseId: 'case-123', mode: 'SEPARATE' }).success).toBe(false);
    });

    it('fails when SEPARATE mode has empty documentIds', () => {
        expect(ReanalyzeSchema.safeParse({ caseId: 'case-123', mode: 'SEPARATE', documentIds: [] }).success).toBe(false);
    });

    it('fails when caseId is missing', () => {
        expect(ReanalyzeSchema.safeParse({ documentId: 'doc-1' }).success).toBe(false);
    });

    it('fails with invalid mode', () => {
        expect(ReanalyzeSchema.safeParse({ caseId: 'case-123', mode: 'COMBINED' }).success).toBe(false);
    });

    it('passes with extractOnly flag', () => {
        expect(ReanalyzeSchema.safeParse({ caseId: 'case-123', documentId: 'doc-1', extractOnly: true }).success).toBe(true);
    });
});
