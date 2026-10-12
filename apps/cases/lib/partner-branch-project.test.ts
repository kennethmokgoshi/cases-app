import { describe, it, expect, vi } from 'vitest';
import { ensureBranchProject } from './partner-branch-project';

function makeTx(existing: { id: string } | null, members: { userId: string; role: string }[] = []) {
    return {
        project: {
            findFirst: vi.fn().mockResolvedValue(existing),
            create: vi.fn().mockResolvedValue({ id: 'new-proj' }) },
        projectMember: {
            findMany: vi.fn().mockResolvedValue(members),
            createMany: vi.fn().mockResolvedValue({ count: members.length }) } };
}

describe('ensureBranchProject', () => {
    it('creates a BRANCH folder under the partner and copies its members', async () => {
        const tx = makeTx(null, [{ userId: 'u1', role: 'MEMBER' }]);
        const id = await ensureBranchProject(tx as never, 'partner-1', '  Soweto  ');
        expect(id).toBe('new-proj');
        expect(tx.project.create).toHaveBeenCalledWith(expect.objectContaining({
            data: { name: 'Soweto', type: 'BRANCH', parentId: 'partner-1' } }));
        expect(tx.projectMember.createMany).toHaveBeenCalledTimes(1);
    });

    it('adopts an existing unclaimed folder instead of duplicating it', async () => {
        const tx = makeTx({ id: 'old-proj' });
        const id = await ensureBranchProject(tx as never, 'partner-1', 'Soweto');
        expect(id).toBe('old-proj');
        expect(tx.project.create).not.toHaveBeenCalled();
    });
});
