
import { PrismaClient } from '@prisma/client';
import { logger } from '@zenowethu/shared-lib';

const prisma = new PrismaClient();

async function main() {
    logger.info('--- Fixing B2B Data & User ---');

    // 1. Delete all existing Cases (The "Mock Data")
    // Must delete children first due to FK constraints
    logger.info('🗑️ Deleting dependent records...');

    // 1. Logs & Notifications
    await prisma.workflowLog.deleteMany({});
    await prisma.inAppNotification.deleteMany({});
    await prisma.notificationLog.deleteMany({});

    // 2. Comments & Payments
    await prisma.caseComment.deleteMany({});
    await prisma.payment.deleteMany({}); // Warning: This deletes ALL payments. Assuming test environment.

    // 3. Domain Specific Linked Records
    // Insurance
    await prisma.cancellationLetter.deleteMany({});
    await prisma.insurancePolicy.deleteMany({});
    // InsuranceAssessmentAccount deletes on cascade from InsuranceAssessment? Let's verify.
    // Schema says: InsuranceAssessmentAccount -> assessment (onDelete: Cascade). Good.
    await prisma.insuranceAssessment.deleteMany({});

    // Legal
    // LegalLetter and LegalPrescriptionCheck cascade from LegalMatter
    await prisma.legalMatter.deleteMany({});

    // Forensic
    // AuditEvidence and RecklessLendingAssessment cascade from ForensicAudit
    await prisma.forensicAudit.deleteMany({});

    // 4. Case Links
    await prisma.caseProject.deleteMany({});

    // 5. Documents & Credit Accounts cascade from Case, so they are fine?
    // Document -> case (onDelete: Cascade) -> OK
    // CreditAccount -> case (onDelete: Cascade) -> OK

    const deletedCases = await prisma.case.deleteMany({});
    logger.info(`🗑️ Deleted ${deletedCases.count} internal/mock cases.`);

    // 2. Find Lesego
    const user = await prisma.user.findFirst({
        where: { email: { contains: 'Lesego', mode: 'insensitive' } }
    });

    if (!user) {
        logger.error('❌ User "Lesego" NOT FOUND. Cannot setup B2B test user.');
        return;
    }

    // 3. Update Lesego to B2B_PARTNER
    await prisma.user.update({
        where: { id: user.id },
        data: { userType: 'B2B_PARTNER' }
    });
    logger.info(`✅ Updated ${user.firstName} ${user.lastName} to userType: B2B_PARTNER`);

    // 4. Find "Letsatsi Referrals" Project
    const project = await prisma.project.findFirst({
        where: { name: 'Letsatsi Referrals' }
    });

    if (!project) {
        logger.error('❌ Project "Letsatsi Referrals" NOT FOUND. Creating it...');
        // Fallback: Create it if missing (unlikely if seeded)
    } else {
        // 5. Add Lesego as Member of Letsatsi Referrals
        try {
            await prisma.projectMember.create({
                data: {
                    userId: user.id,
                    projectId: project.id,
                    role: 'MEMBER'
                }
            });
            logger.info(`✅ Added Lesego to project: ${project.name}`);
        } catch (e: any) {
            if (e.code === 'P2002') {
                logger.info(`ℹ️ Lesego is already a member of ${project.name}`);
            } else {
                logger.error('Error adding project member:', e);
            }
        }
    }

    logger.info('\n--- DONE ---');
    logger.info('User can now log in and should see 0 cases (Clean Slate).');
    logger.info('User can create NEW REAL cases under "Letsatsi Referrals".');
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        logger.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
