/**
 * One-time backfill: give every Crediva consumer account WITHOUT a password the
 * shared default password (Client@100New) with mustChangePassword = true, so
 * clients can log in with ID number + default password and are immediately
 * forced to choose their own password.
 *
 * Accounts that already have a password (self-registered or already activated)
 * are NOT touched — overwriting them would lock out consumers who know their
 * own password. Pass --force-unactivated to ALSO reset accounts that have a
 * password but were never activated (activatedAt IS NULL).
 *
 * Run from the repo root:
 *   npx tsx scripts/backfill-crediva-default-passwords.ts --dry-run
 *   npx tsx scripts/backfill-crediva-default-passwords.ts
 * (DATABASE_URL must be set; it is read from packages/database/.env in dev.)
 */

// Resolved via the database workspace package — @prisma/client is not hoisted
// to the repo root by pnpm.
import { PrismaClient } from '../packages/database/node_modules/@prisma/client';
import bcrypt from '../packages/shared-lib/node_modules/bcryptjs';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE_UNACTIVATED = process.argv.includes('--force-unactivated');

const DEFAULT_CONSUMER_PASSWORD = 'Client@100New';
const BCRYPT_COST = 12;

async function main() {
  console.log(`\n=== Crediva Default Password Backfill (${DRY_RUN ? 'DRY RUN' : 'LIVE'}) ===\n`);

  const where = FORCE_UNACTIVATED
    ? { OR: [{ password: null }, { activatedAt: null }] }
    : { password: null };

  const accounts = await prisma.consumerAccount.findMany({
    where,
    select: { id: true, idNumber: true, firstName: true, lastName: true, activatedAt: true, password: true },
  });

  console.log(`Found ${accounts.length} account(s) to issue the default password.\n`);
  for (const a of accounts) {
    const idMasked = a.idNumber ? `${a.idNumber.slice(0, 6)}***` : 'no-id';
    console.log(` - ${a.firstName} ${a.lastName} (${idMasked}) ${a.password ? '[had unactivated password]' : '[no password]'}`);
  }

  if (DRY_RUN) {
    console.log('\nDry run — no changes written.');
    return;
  }
  if (accounts.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  const hash = await bcrypt.hash(DEFAULT_CONSUMER_PASSWORD, BCRYPT_COST);
  const result = await prisma.consumerAccount.updateMany({
    where: { id: { in: accounts.map((a) => a.id) } },
    data: {
      password: hash,
      mustChangePassword: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });

  console.log(`\n✔ Issued default password to ${result.count} account(s). All are flagged mustChangePassword.`);
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
