// Server-only mailbox helpers (kept out of lib/mailboxes.ts, which client
// components import).
import { getSMTPCredentials } from '@zenowethu/shared-lib';

// The Email (SMTP) Account login — a mailbox registered with the same address
// reuses its saved password, so it never shows as "no password" while SMTP
// sending works with those credentials.
export async function getSmtpUsernameIfConfigured(): Promise<string | null> {
    try {
        const creds = await getSMTPCredentials();
        return creds.password && creds.username ? creds.username : null;
    } catch {
        return null;
    }
}
