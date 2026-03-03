import { z } from 'zod';

// ─── Shared primitives ────────────────────────────────────────────────────────

export const saIdNumber = z
    .string()
    .min(1, 'ID number is required')
    .max(30, 'ID number too long');

export const saPhoneNumber = z
    .string()
    .regex(/^[0-9+\s\-()]{7,20}$/, 'Invalid phone number format')
    .optional()
    .nullable();

export const emailField = z
    .string()
    .email('Invalid email address')
    .toLowerCase()
    .optional()
    .nullable();

export const nonEmptyString = z.string().min(1, 'This field is required').max(500);
export const optionalString = z.string().max(500).optional().nullable();

// ─── Client schema (used in case create / update) ────────────────────────────

export const ClientCreateSchema = z.object({
    firstName: z.string().min(1, 'First name is required').max(100),
    lastName: z.string().min(1, 'Last name is required').max(100),
    idNumber: saIdNumber,
    email: emailField,
    phone: saPhoneNumber,
    address: optionalString,
    type: z.string().max(50).optional().nullable() });

export const ClientUpdateSchema = z.object({
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().min(1).max(100).optional(),
    idNumber: saIdNumber.optional(),
    email: emailField,
    phone: saPhoneNumber,
    whatsappNumber: saPhoneNumber,
    telegramNumber: saPhoneNumber,
    address: optionalString,
    employer: optionalString,
    employeeNo: optionalString,
    grossSalary: z.union([z.string(), z.number()]).optional().nullable(),
    netSalary: z.union([z.string(), z.number()]).optional().nullable(),
    salaryPayDate: z.union([z.string(), z.number()]).optional().nullable(),
    type: z.string().max(50).optional().nullable() });

// ─── Case schemas ─────────────────────────────────────────────────────────────

export const CaseCreateSchema = z.object({
    client: ClientCreateSchema,
    projectId: z.string().min(1, 'Project ID is required'),
    secondaryProjectIds: z.array(z.string()).optional().default([]),
    acquisitionType: z.enum(['B2C', 'B2B']).optional().default('B2C'),
    partnerName: optionalString,
    partnerBranch: optionalString,
    partnerSplitPercent: z.number().min(0).max(100).optional().default(0),
    services: z.array(z.string()).optional().nullable() });

export const CasePatchSchema = z.object({
    client: ClientUpdateSchema.optional(),
    closedAccounts: z.number().int().min(0).optional(),
    openAccounts: z.number().int().min(0).optional(),
    prescribedAccounts: z.number().int().min(0).optional(),
    ncrdcNo: optionalString,
    instalments: z.number().int().min(1).optional(),
    affordabilityStatus: optionalString,
    acquisitionType: z.enum(['B2C', 'B2B']).optional(),
    partnerName: optionalString,
    partnerBranch: optionalString,
    r350Status: optionalString,
    partnerSplitPercent: z.number().min(0).max(100).optional(),
    dhsStatus: optionalString,
    debtCounsellorName: optionalString,
    dcTradingName: optionalString,
    dcEmail: z.string().email().optional().nullable(),
    dcOperatingStatus: optionalString,
    dcMobile: saPhoneNumber,
    consumerDhsStatus: optionalString,
    requestedDhsStatus: optionalString,
    previousDebtCounsellor: optionalString,
    dhsPreviousStatus: optionalString,
    dhsStatusDate: z.string().optional().nullable(),
    dhsApplicationDate: z.string().optional().nullable(),
    cb_ncrdcNo: optionalString,
    cb_debtCounsellor: optionalString,
    cb_contactNo: optionalString,
    cb_applicationDate: z.string().optional().nullable(),
    cb_status: optionalString,
    cb_statusDate: z.string().optional().nullable(),
    totalDebtAmount: z.number().optional().nullable(),
    totalMonthlyInstallment: z.number().optional().nullable(),
    serviceFee: z.union([z.string(), z.number()]).optional().nullable(),
    todos: z.string().optional(),
    declineReason: optionalString,
    declineReasonAttended: z.boolean().optional(),
    services: z.array(z.string()).optional().nullable(),
    description: z.string().max(5000).optional().nullable(),
    forceUpdate: z.boolean().optional(),
    status: optionalString,
    workflowStatus: optionalString,
    insuranceNotes: optionalString,
    adminFee: z.number().optional().nullable(),
    distributeWaitList: z.boolean().optional() }).passthrough(); // allow remaining fields via otherCaseData spread in the route

export const CaseStatusSchema = z.object({
    newStatus: z.string().min(1, 'New status is required'),
    skipNotification: z.boolean().optional().default(false) });

// ─── User schemas ─────────────────────────────────────────────────────────────

export const UserCreateSchema = z.object({
    firstName: z.string().min(1, 'First name is required').max(100),
    lastName: z.string().min(1, 'Last name is required').max(100),
    email: z.string().email('Valid email is required'),
    password: z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .max(128, 'Password too long'),
    organization: optionalString,
    role: z.enum(['ADMIN', 'MANAGER', 'MEMBER']).optional().default('MEMBER'),
    userType: z.enum(['STAFF', 'B2B_PARTNER']).optional().default('STAFF'),
    b2bPartnerId: z.string().optional().nullable() });

export const UserPatchSchema = z.object({
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().min(1).max(100).optional(),
    email: z.string().email().optional(),
    password: z.string().min(8).max(128).optional(),
    organization: optionalString,
    role: z.enum(['ADMIN', 'MANAGER', 'MEMBER']).optional(),
    userType: z.enum(['STAFF', 'B2B_PARTNER']).optional(),
    isAdmin: z.boolean().optional(),
    isLocked: z.boolean().optional(),
    b2bPartnerId: z.string().optional().nullable() });

// ─── Auth schemas ─────────────────────────────────────────────────────────────

export const ForgotPasswordSchema = z.object({
    email: z.string().email('Valid email is required') });

export const ResetPasswordSchema = z.object({
    token: z.string().min(1, 'Token is required'),
    password: z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .max(128, 'Password too long') });

// ─── Project schemas ──────────────────────────────────────────────────────────

export const ProjectCreateSchema = z.object({
    name: z.string().min(1, 'Project name is required').max(200),
    description: optionalString,
    type: z
        .enum(['ROOT', 'FOLDER', 'YEAR', 'MONTH', 'BRANCH', 'ACQUISITION_SOURCE'])
        .optional()
        .default('FOLDER'),
    clientType: optionalString,
    parentId: z.string().optional().nullable(),
    members: z
        .array(
            z.object({
                userId: z.string().min(1),
                role: z.enum(['MANAGER', 'MEMBER']).optional().default('MEMBER') })
        )
        .optional()
        .default([]) });

export const ProjectPatchSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    description: optionalString,
    clientType: optionalString,
    members: z
        .array(
            z.object({
                userId: z.string().min(1),
                role: z.enum(['MANAGER', 'MEMBER']).optional().default('MEMBER') })
        )
        .optional() });

// ─── Comment schema ───────────────────────────────────────────────────────────

export const CommentCreateSchema = z.object({
    content: z.string().min(1, 'Comment content is required').max(10000),
    type: z.enum(['NOTE', 'COMMENT', 'SYSTEM']).optional().default('COMMENT'),
    isInternal: z.boolean().optional().default(false),
    mentions: z.array(z.string()).optional().default([]) });

// ─── API Key schemas ──────────────────────────────────────────────────────────

export const ApiKeyCreateSchema = z.object({
    name: z.string().min(1, 'Name is required').max(100),
    description: optionalString,
    projectId: z.string().optional().nullable(),
    permissions: z.string().optional().default('read'),
    rateLimit: z.number().int().min(1).max(100000).optional().default(1000),
    expiresAt: z.string().datetime().optional().nullable() });

export const ApiKeyPatchSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: optionalString,
    isActive: z.boolean().optional(),
    permissions: z.string().optional(),
    rateLimit: z.number().int().min(1).max(100000).optional(),
    expiresAt: z.string().datetime().optional().nullable() });

// ─── DHS settings schema ──────────────────────────────────────────────────────

export const DhsSettingsSchema = z.object({
    username: z.string().min(1, 'DHS username is required').max(50),
    password: optionalString });

// ─── GHL settings schema ──────────────────────────────────────────────────────

export const GhlSettingsSchema = z.object({
    apiKey: optionalString,
    locationId: optionalString,
    email: z.string().email().optional().nullable(),
    password: optionalString });

// ─── Message template schema ──────────────────────────────────────────────────

export const TemplateCreateSchema = z.object({
    name: z.string().min(1, 'Template name is required').max(100),
    description: optionalString,
    content: z.string().min(1, 'Template content is required').max(5000),
    channel: z.enum(['SMS', 'EMAIL', 'WHATSAPP']),
    category: z.string().min(1, 'Category is required').max(100) });

// ─── Notification mark-read schema ───────────────────────────────────────────

export const NotificationReadSchema = z.object({
    notificationIds: z.array(z.string()).optional(),
    markAllRead: z.boolean().optional() }).refine(
    data => data.markAllRead === true || (Array.isArray(data.notificationIds) && data.notificationIds.length > 0),
    { message: 'Provide notificationIds or set markAllRead to true' }
);

// ─── Case notification send schema ───────────────────────────────────────────

export const CaseNotificationSendSchema = z.object({
    statusCode: z.string().optional(),
    channel: z.enum(['SMS', 'EMAIL', 'WHATSAPP']).optional(),
    message: z.string().max(2000).optional().nullable(),
    recipient: z.string().optional().nullable() });

// ─── Document update-summary schema ──────────────────────────────────────────

export const DocumentSummarySchema = z.object({
    openAccounts: z.number().int().min(0),
    closedAccounts: z.number().int().min(0),
    totalDebt: z.number().min(0),
    totalInstallment: z.number().min(0) });

// ─── Extended comment schema (includes activityType/activityData) ─────────────

export const CaseCommentCreateSchema = z.object({
    content: z.string().min(1, 'Comment content is required').max(10000),
    type: z.enum(['NOTE', 'COMMENT', 'SYSTEM', 'JOURNAL']).optional().default('COMMENT'),
    isInternal: z.boolean().optional().default(true),
    activityType: optionalString,
    activityData: z.record(z.string(), z.unknown()).optional().nullable() });

// ─── Case move schema ─────────────────────────────────────────────────────────

export const CaseMoveSchema = z.object({
    caseIds: z
        .array(z.string().min(1))
        .min(1, 'At least one case ID is required'),
    targetProjectId: z.string().min(1, 'Target project ID is required') });

// ─── Apply-updates schema (AI re-analysis field writes) ───────────────────────

// Allowed field names are validated at route level; here we validate the shape
export const ApplyUpdatesSchema = z.object({
    updates: z
        .record(
            z.string(),
            z.union([z.string(), z.number(), z.null()])
        )
        .refine(v => Object.keys(v).length > 0, { message: 'No updates provided' }) });

// ─── Document re-analyze schema ───────────────────────────────────────────────

export const ReanalyzeSchema = z.object({
    caseId: z.string().min(1, 'Case ID is required'),
    mode: z.enum(['SINGLE', 'SEPARATE']).optional().default('SINGLE'),
    // SINGLE / COMBINED mode
    documentId: z.string().optional(),
    extractOnly: z.boolean().optional(),
    // SEPARATE (batch) mode
    documentIds: z.array(z.string()).optional() }).superRefine((data, ctx) => {
    if (data.mode === 'SEPARATE') {
        if (!data.documentIds || data.documentIds.length === 0) {
            ctx.addIssue({
                code: 'custom',
                path: ['documentIds'],
                message: 'documentIds is required for SEPARATE mode' });
        }
    }
    // SINGLE mode: documentId validated at route level (after B2B bypass check)
});

// ─── Helper: parse and return 400 on failure ─────────────────────────────────

import { NextResponse } from 'next/server';

export function parseBody<T>(
    schema: { safeParse: (data: unknown) => any },
    data: unknown
): { success: boolean; data: T; response: NextResponse } {
    const result = schema.safeParse(data);
    if (result.success) {
        return { success: true, data: result.data, response: null as any };
    }
    const errors = result.error.flatten().fieldErrors;
    return {
        success: false,
        data: null as any,
        response: NextResponse.json(
            { error: 'Validation failed', errors },
            { status: 400 }
        )
    };
}
