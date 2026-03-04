/// <reference path="./types/next-auth.d.ts" />

export * from './logger';
export * from './auth';
export * from './integrations';
export * from './statuses';
export * from './dhs';
export * from './openai';
// pdf-image removed from barrel export - import directly when needed (server-side only)
// Reason: Uses Node.js fs/path which crashes Edge Runtime compilation
// import { convertPdfToImages } from '@zenowethu/shared-lib/pdf-image' when needed
export * from './notifications';
export * from './schemas';

// AI Strategy Engine
export * from './ai/strategy-engine';
export * from './ai/legal-secretary';
export * from './ai/autonomy-engine';
export * from './metrics';
