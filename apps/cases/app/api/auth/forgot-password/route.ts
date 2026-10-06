// Emails a reset link (token stored hashed, never logged). Shared by every staff app —
// see packages/shared-lib/src/auth/staff-password-reset.ts
export { forgotPasswordPOST as POST } from '@zenowethu/shared-lib/src/auth/staff-password-reset-routes';
