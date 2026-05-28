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
export * from './automation/run-logger';

// Utils
export * from './utils/extract-id-number';
