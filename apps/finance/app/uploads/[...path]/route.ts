// Serves staff-app uploads to signed-in users only, with a path-traversal guard.
// Shared across every staff app — see packages/shared-lib/src/documents/serve-uploads-route.ts
export { GET } from '@zenowethu/shared-lib/src/documents/serve-uploads-route';
