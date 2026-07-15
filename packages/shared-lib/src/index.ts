/// <reference path="./types/next-auth.d.ts" />

export * from './logger';
export * from './auth';
export * from './integrations';
export * from './statuses';
// export * from './dhs'; // Removed from main index (Node-only)

// Note: The following modules are NOT exported from the main index 
// because they use Node.js-only APIs (fs, path, etc.) which break 
// browser/edge runtimes. Import them directly when needed:
// import { ... } from '@zenowethu/shared-lib/src/openai'
// import { ... } from '@zenowethu/shared-lib/src/xds'

export * from './notifications';
// NOTE: './dc' (DC priority emails + outcome events) is NOT exported here — it
// imports @zenowethu/database (Prisma), which must never reach client bundles.
// Deep-import it instead: import { ... } from '@zenowethu/shared-lib/src/dc'

// Payment arrangements + per-app next-update (pure helpers only; Prisma-backed
// services are Node-only and imported directly from their files)
export * from './payments';

export * from './schemas';
export * from './security/rbac';
export * from './security/audit';
export * from './disputes/dispute-pdf';

// AI Strategy Engine
export * from './ai/strategy-engine';
export * from './ai/legal-secretary';
export * from './ai/autonomy-engine';
export * from './ai/savings-engine';

// AI Provider Management
export * from './ai/provider-client';

export * from './metrics';

// Finance — shared invoice/quotation number allocation (atomic, cross-app)
export * from './finance/document-number';

// Finance — Debt Counsellor fee invoice catalogue/schema/maths (browser-safe).
// The Prisma-backed persistence lives in './finance/dc-fee-invoice-service' and is
// imported directly by server routes — it is intentionally NOT re-exported here.
export * from './finance/dc-fee-invoice';

// Demo Data
export * from './demo-data';

// Referrer Commission
export * from './referrer-commission';

// Automation
// Note: Node-only (uses prisma) — import directly when needed in server contexts
// export * from './automation/overdue-scan';
export * from './automation/automation-user';
export * from './automation/run-logger';
export * from './automation/workflow-engine';
export * from './debt-review-removal/removal-paths';

// Crediva consumer provisioning & password reset
export * from './crediva';

// Utils
export * from './utils/extract-id-number';

// Court Documents (Node-only — pdf-lib; import directly in server routes)
// import { generateCourtDoc } from '@zenowethu/shared-lib/src/court-docs'
