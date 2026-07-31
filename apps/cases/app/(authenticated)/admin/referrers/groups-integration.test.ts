import { describe, it, expect } from 'vitest';

/**
 * Test suite for referrer group member selection integration.
 * Verifies group expansion, deduplication, and bulk member addition.
 */

describe('Referrer Groups Integration', () => {
  describe('Group member expansion', () => {
    it('should expand single group into member IDs', () => {
      const selectedGroupIds = ['group-1'];
      const userGroups = [
        {
          id: 'group-1',
          name: 'Zenowethu Team',
          members: [
            { userId: 'user-1', user: { firstName: 'Alice', lastName: 'Smith', email: 'alice@zenowethu.co.za' } },
            { userId: 'user-2', user: { firstName: 'Bob', lastName: 'Jones', email: 'bob@zenowethu.co.za' } },
          ],
          _count: { members: 2 },
        },
      ];

      const expandedMemberIds = new Set<string>();
      userGroups
        .filter((g) => selectedGroupIds.includes(g.id))
        .forEach((group) => {
          group.members.forEach((member) => {
            expandedMemberIds.add(member.userId);
          });
        });

      expect(Array.from(expandedMemberIds)).toEqual(['user-1', 'user-2']);
    });

    it('should expand multiple groups into member IDs', () => {
      const selectedGroupIds = ['group-1', 'group-2'];
      const userGroups = [
        {
          id: 'group-1',
          name: 'Zenowethu Team',
          members: [
            { userId: 'user-1', user: { firstName: 'Alice', lastName: 'Smith', email: 'alice@zenowethu.co.za' } },
            { userId: 'user-2', user: { firstName: 'Bob', lastName: 'Jones', email: 'bob@zenowethu.co.za' } },
          ],
          _count: { members: 2 },
        },
        {
          id: 'group-2',
          name: 'Shosholoza Team',
          members: [
            { userId: 'user-3', user: { firstName: 'Charlie', lastName: 'Brown', email: 'charlie@zenowethu.co.za' } },
            { userId: 'user-4', user: { firstName: 'Diana', lastName: 'Prince', email: 'diana@zenowethu.co.za' } },
          ],
          _count: { members: 2 },
        },
      ];

      const expandedMemberIds = new Set<string>();
      userGroups
        .filter((g) => selectedGroupIds.includes(g.id))
        .forEach((group) => {
          group.members.forEach((member) => {
            expandedMemberIds.add(member.userId);
          });
        });

      expect(Array.from(expandedMemberIds).sort()).toEqual(['user-1', 'user-2', 'user-3', 'user-4'].sort());
    });

    it('should handle empty group selection', () => {
      const selectedGroupIds: string[] = [];
      const userGroups = [
        {
          id: 'group-1',
          name: 'Zenowethu Team',
          members: [
            { userId: 'user-1', user: { firstName: 'Alice', lastName: 'Smith', email: 'alice@zenowethu.co.za' } },
          ],
          _count: { members: 1 },
        },
      ];

      const expandedMemberIds = new Set<string>();
      userGroups
        .filter((g) => selectedGroupIds.includes(g.id))
        .forEach((group) => {
          group.members.forEach((member) => {
            expandedMemberIds.add(member.userId);
          });
        });

      expect(Array.from(expandedMemberIds)).toEqual([]);
    });
  });

  describe('Member deduplication', () => {
    it('should deduplicate when same member is in multiple groups', () => {
      const selectedGroupIds = ['group-1', 'group-2'];
      const userGroups = [
        {
          id: 'group-1',
          name: 'Zenowethu Team',
          members: [
            { userId: 'user-1', user: { firstName: 'Alice', lastName: 'Smith', email: 'alice@zenowethu.co.za' } },
            { userId: 'user-2', user: { firstName: 'Bob', lastName: 'Jones', email: 'bob@zenowethu.co.za' } },
          ],
          _count: { members: 2 },
        },
        {
          id: 'group-2',
          name: 'All Staff',
          members: [
            { userId: 'user-1', user: { firstName: 'Alice', lastName: 'Smith', email: 'alice@zenowethu.co.za' } },
            { userId: 'user-3', user: { firstName: 'Charlie', lastName: 'Brown', email: 'charlie@zenowethu.co.za' } },
          ],
          _count: { members: 2 },
        },
      ];

      const expandedMemberIds = new Set<string>();
      userGroups
        .filter((g) => selectedGroupIds.includes(g.id))
        .forEach((group) => {
          group.members.forEach((member) => {
            expandedMemberIds.add(member.userId);
          });
        });

      expect(Array.from(expandedMemberIds).sort()).toEqual(['user-1', 'user-2', 'user-3'].sort());
      expect(expandedMemberIds.size).toBe(3); // No duplicates
    });
  });

  describe('Combined group and individual member selection', () => {
    it('should combine group members with individually selected members', () => {
      const selectedGroupIds = ['group-1'];
      const individualMemberIds = ['user-5']; // Manually selected staff member
      const userGroups = [
        {
          id: 'group-1',
          name: 'Zenowethu Team',
          members: [
            { userId: 'user-1', user: { firstName: 'Alice', lastName: 'Smith', email: 'alice@zenowethu.co.za' } },
            { userId: 'user-2', user: { firstName: 'Bob', lastName: 'Jones', email: 'bob@zenowethu.co.za' } },
          ],
          _count: { members: 2 },
        },
      ];

      let expandedMemberIds = new Set(individualMemberIds);
      userGroups
        .filter((g) => selectedGroupIds.includes(g.id))
        .forEach((group) => {
          group.members.forEach((member) => {
            expandedMemberIds.add(member.userId);
          });
        });

      expect(Array.from(expandedMemberIds).sort()).toEqual(['user-1', 'user-2', 'user-5'].sort());
    });

    it('should deduplicate when individual member is also in a selected group', () => {
      const selectedGroupIds = ['group-1'];
      const individualMemberIds = ['user-1']; // Alice is in the group AND selected individually
      const userGroups = [
        {
          id: 'group-1',
          name: 'Zenowethu Team',
          members: [
            { userId: 'user-1', user: { firstName: 'Alice', lastName: 'Smith', email: 'alice@zenowethu.co.za' } },
            { userId: 'user-2', user: { firstName: 'Bob', lastName: 'Jones', email: 'bob@zenowethu.co.za' } },
          ],
          _count: { members: 2 },
        },
      ];

      let expandedMemberIds = new Set(individualMemberIds);
      userGroups
        .filter((g) => selectedGroupIds.includes(g.id))
        .forEach((group) => {
          group.members.forEach((member) => {
            expandedMemberIds.add(member.userId);
          });
        });

      expect(Array.from(expandedMemberIds).sort()).toEqual(['user-1', 'user-2'].sort());
      expect(expandedMemberIds.size).toBe(2); // No duplicates
    });
  });

  describe('Group count display', () => {
    it('should calculate total members from selected groups', () => {
      const selectedGroupIds = ['group-1', 'group-2'];
      const userGroups = [
        {
          id: 'group-1',
          name: 'Zenowethu Team',
          members: [
            { userId: 'user-1', user: { firstName: 'Alice', lastName: 'Smith', email: 'alice@zenowethu.co.za' } },
            { userId: 'user-2', user: { firstName: 'Bob', lastName: 'Jones', email: 'bob@zenowethu.co.za' } },
            { userId: 'user-3', user: { firstName: 'Charlie', lastName: 'Brown', email: 'charlie@zenowethu.co.za' } },
          ],
          _count: { members: 3 },
        },
        {
          id: 'group-2',
          name: 'Shosholoza Team',
          members: [
            { userId: 'user-4', user: { firstName: 'Diana', lastName: 'Prince', email: 'diana@zenowethu.co.za' } },
            { userId: 'user-5', user: { firstName: 'Eve', lastName: 'White', email: 'eve@zenowethu.co.za' } },
          ],
          _count: { members: 2 },
        },
      ];

      const totalMembers = userGroups
        .filter((g) => selectedGroupIds.includes(g.id))
        .reduce((total, g) => total + (g._count?.members || g.members.length), 0);

      expect(totalMembers).toBe(5);
    });

    it('should handle missing _count and fall back to members array length', () => {
      const selectedGroupIds = ['group-1'];
      const userGroups = [
        {
          id: 'group-1',
          name: 'Zenowethu Team',
          members: [
            { userId: 'user-1', user: { firstName: 'Alice', lastName: 'Smith', email: 'alice@zenowethu.co.za' } },
            { userId: 'user-2', user: { firstName: 'Bob', lastName: 'Jones', email: 'bob@zenowethu.co.za' } },
          ],
          // _count is undefined
        },
      ];

      const totalMembers = userGroups
        .filter((g) => selectedGroupIds.includes(g.id))
        .reduce((total, g) => total + ((g as any)._count?.members || g.members.length), 0);

      expect(totalMembers).toBe(2);
    });
  });

  describe('Staff member filtering', () => {
    it('should filter out non-staff members from groups', () => {
      const staffUserIds = ['user-1', 'user-2']; // Only these are staff
      const selectedGroupIds = ['group-1'];
      const userGroups = [
        {
          id: 'group-1',
          name: 'Mixed Group',
          members: [
            { userId: 'user-1', user: { firstName: 'Alice', lastName: 'Smith', email: 'alice@zenowethu.co.za' } }, // Staff
            { userId: 'user-2', user: { firstName: 'Bob', lastName: 'Jones', email: 'bob@zenowethu.co.za' } }, // Staff
            { userId: 'user-99', user: { firstName: 'B2B', lastName: 'Partner', email: 'b2b@partner.co.za' } }, // Not staff
            { userId: 'user-100', user: { firstName: 'Referrer', lastName: 'Name', email: 'referrer@zenowethu.co.za' } }, // Not staff
          ],
          _count: { members: 4 },
        },
      ];

      const expandedMemberIds = new Set<string>();
      userGroups
        .filter((g) => selectedGroupIds.includes(g.id))
        .forEach((group) => {
          group.members.forEach((member) => {
            // Only add if member is in the staff list
            if (staffUserIds.includes(member.userId)) {
              expandedMemberIds.add(member.userId);
            }
          });
        });

      expect(Array.from(expandedMemberIds).sort()).toEqual(['user-1', 'user-2'].sort());
      expect(expandedMemberIds.size).toBe(2); // Non-staff excluded
    });

    it('should handle groups with only non-staff members', () => {
      const staffUserIds: string[] = []; // No staff members
      const selectedGroupIds = ['group-1'];
      const userGroups = [
        {
          id: 'group-1',
          name: 'B2B Partners Only',
          members: [
            { userId: 'partner-1', user: { firstName: 'Partner', lastName: 'One', email: 'partner1@co.za' } },
            { userId: 'partner-2', user: { firstName: 'Partner', lastName: 'Two', email: 'partner2@co.za' } },
          ],
          _count: { members: 2 },
        },
      ];

      const expandedMemberIds = new Set<string>();
      userGroups
        .filter((g) => selectedGroupIds.includes(g.id))
        .forEach((group) => {
          group.members.forEach((member) => {
            if (staffUserIds.includes(member.userId)) {
              expandedMemberIds.add(member.userId);
            }
          });
        });

      expect(Array.from(expandedMemberIds)).toEqual([]);
      expect(expandedMemberIds.size).toBe(0); // All filtered out
    });

    it('should count staff vs non-staff members for display', () => {
      const staffUserIds = ['user-1', 'user-2', 'user-3'];
      const group = {
        id: 'group-1',
        name: 'Mixed Staff',
        members: [
          { userId: 'user-1', user: { firstName: 'Alice', lastName: 'Smith', email: 'alice@zenowethu.co.za' } },
          { userId: 'user-2', user: { firstName: 'Bob', lastName: 'Jones', email: 'bob@zenowethu.co.za' } },
          { userId: 'user-3', user: { firstName: 'Charlie', lastName: 'Brown', email: 'charlie@zenowethu.co.za' } },
          { userId: 'b2b-partner', user: { firstName: 'B2B', lastName: 'Partner', email: 'b2b@partner.co.za' } },
          { userId: 'referrer', user: { firstName: 'Referrer', lastName: 'Person', email: 'referrer@zenowethu.co.za' } },
        ],
        _count: { members: 5 },
      };

      const staffMembersInGroup = group.members.filter((m) => staffUserIds.includes(m.userId)).length;
      const nonStaffCount = (group._count?.members || group.members.length) - staffMembersInGroup;

      expect(staffMembersInGroup).toBe(3);
      expect(nonStaffCount).toBe(2);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty groups', () => {
      const selectedGroupIds = ['group-1'];
      const userGroups = [
        {
          id: 'group-1',
          name: 'Empty Team',
          members: [],
          _count: { members: 0 },
        },
      ];

      const expandedMemberIds = new Set<string>();
      userGroups
        .filter((g) => selectedGroupIds.includes(g.id))
        .forEach((group) => {
          group.members.forEach((member) => {
            expandedMemberIds.add(member.userId);
          });
        });

      expect(Array.from(expandedMemberIds)).toEqual([]);
      expect(expandedMemberIds.size).toBe(0);
    });

    it('should handle non-existent group IDs gracefully', () => {
      const selectedGroupIds = ['group-1', 'group-999']; // group-999 doesn't exist
      const userGroups = [
        {
          id: 'group-1',
          name: 'Zenowethu Team',
          members: [
            { userId: 'user-1', user: { firstName: 'Alice', lastName: 'Smith', email: 'alice@zenowethu.co.za' } },
          ],
          _count: { members: 1 },
        },
      ];

      const expandedMemberIds = new Set<string>();
      userGroups
        .filter((g) => selectedGroupIds.includes(g.id))
        .forEach((group) => {
          group.members.forEach((member) => {
            expandedMemberIds.add(member.userId);
          });
        });

      // Only user-1 should be included (group-999 was filtered out)
      expect(Array.from(expandedMemberIds)).toEqual(['user-1']);
    });

    it('should handle large groups with many members', () => {
      const largeGroupMembers = Array.from({ length: 100 }, (_, i) => ({
        userId: `user-${i}`,
        user: { firstName: `Staff${i}`, lastName: 'Member', email: `staff${i}@zenowethu.co.za` },
      }));

      const selectedGroupIds = ['large-group'];
      const userGroups = [
        {
          id: 'large-group',
          name: 'Large Team',
          members: largeGroupMembers,
          _count: { members: 100 },
        },
      ];

      const expandedMemberIds = new Set<string>();
      userGroups
        .filter((g) => selectedGroupIds.includes(g.id))
        .forEach((group) => {
          group.members.forEach((member) => {
            expandedMemberIds.add(member.userId);
          });
        });

      expect(expandedMemberIds.size).toBe(100);
    });
  });
});
