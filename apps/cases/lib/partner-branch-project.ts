import type { Prisma } from '@zenowethu/database';

/**
 * Find or create the Project folder that represents a partner branch.
 *
 * The case form's "Branch/Subproject" dropdown is built from the partner's
 * child projects, so a branch only appears there once it has one. An existing
 * BRANCH/FOLDER child with the same name (case-insensitive) that no other branch
 * record owns is adopted rather than duplicated. New folders inherit the
 * partner's members so B2B users can file cases into them.
 */
export async function ensureBranchProject(
    tx: Prisma.TransactionClient,
    partnerProjectId: string,
    name: string
): Promise<string> {
    const trimmed = name.trim();

    const existing = await tx.project.findFirst({
        where: {
            parentId: partnerProjectId,
            type: { in: ['BRANCH', 'FOLDER'] },
            name: { equals: trimmed, mode: 'insensitive' },
            branchProfile: { is: null } },
        select: { id: true } });
    if (existing) return existing.id;

    const project = await tx.project.create({
        data: { name: trimmed, type: 'BRANCH', parentId: partnerProjectId },
        select: { id: true } });

    const members = await tx.projectMember.findMany({ where: { projectId: partnerProjectId } });
    if (members.length > 0) {
        await tx.projectMember.createMany({
            data: members.map((m) => ({ projectId: project.id, userId: m.userId, role: m.role })),
            skipDuplicates: true });
    }
    return project.id;
}
