/**
 * One-time migration: Mark all cases with ncrdcNo = 'NCRDC3693' as Accepted via DHS
 *
 * Run with:
 *   cd cases-app-main
 *   pnpm --filter cases tsx scripts/migrate-ncrdc3693-to-accepted.ts
 *
 * Add --dry-run to preview without writing:
 *   pnpm --filter cases tsx scripts/migrate-ncrdc3693-to-accepted.ts --dry-run
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');
const OWN_NCRDC = 'NCRDC3693';

// Statuses that are already at or past Accepted — don't downgrade/overwrite these
const SKIP_STATUSES = [
  'ACCEPTED_VIA_DHS',
  'CLOSED',
  'WITHDRAWN',
  'REJECTED',
  'COURT_ORDER_GRANTED',
  'CLEARANCE_CERTIFICATE_ISSUED',
];

async function main() {
  console.log(`\n=== DHS Accepted Migration (${DRY_RUN ? 'DRY RUN' : 'LIVE'}) ===\n`);

  // 1. Find all affected cases
  const cases = await prisma.case.findMany({
    where: {
      ncrdcNo: OWN_NCRDC,
      NOT: { status: { in: SKIP_STATUSES } },
    },
    select: {
      id: true,
      status: true,
      dhsStatus: true,
      ncrdcNo: true,
      client: { select: { firstName: true, lastName: true, idNumber: true } },
    },
  });

  if (cases.length === 0) {
    console.log('✅ No cases to update — all matching cases are already at the correct status.');
    return;
  }

  console.log(`Found ${cases.length} case(s) to update:\n`);
  cases.forEach((c, i) => {
    const name = `${c.client?.firstName || ''} ${c.client?.lastName || ''}`.trim();
    console.log(
      `  ${i + 1}. [${c.id}] ${name} (${c.client?.idNumber || 'no ID'}) — status: ${c.status} | dhsStatus: ${c.dhsStatus}`
    );
  });

  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN — no changes written. Remove --dry-run to apply.');
    return;
  }

  // 2. Apply update
  const result = await prisma.case.updateMany({
    where: {
      ncrdcNo: OWN_NCRDC,
      NOT: { status: { in: SKIP_STATUSES } },
    },
    data: {
      status: 'ACCEPTED_VIA_DHS',
      dhsStatus: 'Accepted',
      dhsStatusDate: new Date(),
    },
  });

  console.log(`\n✅ Updated ${result.count} case(s) → status: ACCEPTED_VIA_DHS, dhsStatus: Accepted\n`);
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
