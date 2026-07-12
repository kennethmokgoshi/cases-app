-- Email inboxes the app can search for DC fee invoices and proof-of-payment
-- replies. Shared org mailboxes (ownerUserId = null) are password-managed by
-- Admin only; a personal mailbox belongs to one staff user who manages their
-- own password.
CREATE TABLE "MailboxAccount" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "emailAddress" TEXT NOT NULL,
    "imapHost" TEXT NOT NULL,
    "imapPort" INTEGER NOT NULL DEFAULT 993,
    "imapSecure" BOOLEAN NOT NULL DEFAULT true,
    "password" TEXT,
    "isDcCommunication" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "ownerUserId" TEXT,
    "notes" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailboxAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MailboxAccount_emailAddress_key" ON "MailboxAccount"("emailAddress");

CREATE UNIQUE INDEX "MailboxAccount_ownerUserId_key" ON "MailboxAccount"("ownerUserId");

CREATE INDEX "MailboxAccount_isActive_idx" ON "MailboxAccount"("isActive");

ALTER TABLE "MailboxAccount"
    ADD CONSTRAINT "MailboxAccount_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the shared organisation mailboxes used to request files/invoices from
-- other debt counsellors. Passwords are intentionally NULL — Admin sets them
-- from Admin → Settings. Hosts are editable in the same screen.
INSERT INTO "MailboxAccount"
    ("id", "label", "emailAddress", "imapHost", "imapPort", "imapSecure", "isDcCommunication", "isActive", "updatedAt")
VALUES
    ('mbx_transfers_zeno',  'Transfers',           'transfers@zenowethu.co.za',     'mail.zenowethu.co.za', 993, true, true,  true, CURRENT_TIMESTAMP),
    ('mbx_trasnfer_zeno',   'Transfer (legacy)',   'trasnfer@zenowethu.co.za',      'mail.zenowethu.co.za', 993, true, true,  true, CURRENT_TIMESTAMP),
    ('mbx_notifications',   'Notifications',       'notifications@zenowethu.co.za', 'mail.zenowethu.co.za', 993, true, false, true, CURRENT_TIMESTAMP),
    ('mbx_zeno_gmail',      'Zenowethu Gmail',     'zenowethu@gmail.com',           'imap.gmail.com',       993, true, false, true, CURRENT_TIMESTAMP),
    ('mbx_transfers_gmail', 'Transfers Gmail',     'zenowethutransfers@gmail.com',  'imap.gmail.com',       993, true, true,  true, CURRENT_TIMESTAMP)
ON CONFLICT ("emailAddress") DO NOTHING;
