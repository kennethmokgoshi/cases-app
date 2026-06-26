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

// Utils
export * from './utils/extract-id-number';

// Court Documents (Node-only — pdf-lib; import directly in server routes)
// import { generateCourtDoc } from '@zenowethu/shared-lib/src/court-docs'
