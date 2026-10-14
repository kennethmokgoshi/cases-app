import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        project: { findUnique: vi.fn() },
        partnerBranch: { findFirst: vi.fn() } } }));
vi.mock('../logger', () => ({ logger: { error: vi.fn() } }));

import { prisma } from '@zenowethu/database';
import { resolveReferrerEmailForProject } from './branch-contact-service';

const findProject = prisma.project.findUnique as unknown as ReturnType<typeof vi.fn>;
const findBranch = prisma.partnerBranch.findFirst as unknown as ReturnType<typeof vi.fn>;

const baseProject = {
    name: 'Klerksdorp',
    parentId: 'p1',
    billingEmail: null,
    referrer: null,
    branchProfile: null,
    parent: { billingEmail: null, name: 'Letsatsi' } };

describe('resolveReferrerEmailForProject', () => {
    beforeEach(() => vi.clearAllMocks());

    it('prefers the linked branch profile email', async () => {
        findProject.mockResolvedValue({
            ...baseProject,
            branchProfile: { name: 'Klerksdorp', email: ' klerksdorp@letsatsi.co.za ', phone: '0821112222', isActive: true } });
        const result = await resolveReferrerEmailForProject('proj');
        expect(result).toEqual({ email: 'klerksdorp@letsatsi.co.za', phone: '0821112222', source: 'branch', label: 'Klerksdorp' });
    });

    it('matches the branch by name under the partner when not linked', async () => {
        findProject.mockResolvedValue(baseProject);
        findBranch.mockResolvedValue({ name: 'Klerksdorp', email: 'k@partner.co.za', isActive: true });
        const result = await resolveReferrerEmailForProject('proj');
        expect(result.source).toBe('branch');
        expect(result.email).toBe('k@partner.co.za');
    });

    it('uses the registered referrer email for B2C referrals', async () => {
        findProject.mockResolvedValue({
            ...baseProject,
            parentId: null,
            parent: null,
            referrer: { firstName: 'Thandi', lastName: 'Nkosi', email: 'thandi@example.com', cellNumber: null, isActive: true } });
        const result = await resolveReferrerEmailForProject('proj');
        expect(result).toEqual({ email: 'thandi@example.com', phone: null, source: 'referrer', label: 'Thandi Nkosi' });
    });

    it('supplies the branch phone even when the branch has no email', async () => {
        findProject.mockResolvedValue({
            ...baseProject,
            branchProfile: { name: 'Klerksdorp', email: null, phone: ' 0821112222 ', isActive: true } });
        const result = await resolveReferrerEmailForProject('proj');
        expect(result).toEqual({ email: null, phone: '0821112222', source: 'branch', label: 'Klerksdorp' });
    });

    it('falls back to the partner billing email, then to nothing', async () => {
        findProject.mockResolvedValue({ ...baseProject, parent: { billingEmail: 'billing@letsatsi.co.za', name: 'Letsatsi' } });
        findBranch.mockResolvedValue(null);
        expect((await resolveReferrerEmailForProject('proj')).source).toBe('partner');

        findProject.mockResolvedValue(baseProject);
        expect(await resolveReferrerEmailForProject('proj')).toEqual({ email: null, phone: null, source: null, label: null });
    });

    it('returns nothing for an unknown project', async () => {
        findProject.mockResolvedValue(null);
        expect((await resolveReferrerEmailForProject('missing')).email).toBeNull();
    });
});
