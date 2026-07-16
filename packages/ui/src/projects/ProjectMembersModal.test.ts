import { describe, it, expect } from 'vitest';
import {
    filterUsersToAdd,
    filterGroupsToAdd,
    filterCurrentMembers,
    User,
    Group
} from './ProjectMembersModal';

const mockUsers: User[] = [
    { id: 'u1', firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
    { id: 'u2', firstName: 'Jane', lastName: 'Smith', email: 'jane.smith@gmail.com' },
    { id: 'u3', firstName: 'Alice', lastName: 'Johnson', email: 'alice.j@yahoo.com' }
];

const mockGroups: Group[] = [
    { id: 'g1', name: 'Managers', _count: { members: 3 } },
    { id: 'g2', name: 'Staff members', _count: { members: 5 } }
];

describe('filterUsersToAdd', () => {
    it('returns all users except those already in members when search query is empty', () => {
        const members = [{ userId: 'u1' }];
        const result = filterUsersToAdd(mockUsers, members, '');
        expect(result).toHaveLength(2);
        expect(result.map(u => u.id)).toEqual(['u2', 'u3']);
    });

    it('filters users by first name case-insensitively', () => {
        const members: { userId: string }[] = [];
        const result = filterUsersToAdd(mockUsers, members, 'ja');
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('u2'); // Jane
    });

    it('filters users by last name case-insensitively', () => {
        const members: { userId: string }[] = [];
        const result = filterUsersToAdd(mockUsers, members, 'DOE');
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('u1'); // John Doe
    });

    it('filters users by email case-insensitively', () => {
        const members: { userId: string }[] = [];
        const result = filterUsersToAdd(mockUsers, members, 'example.com');
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('u1'); // john@example.com
    });

    it('returns empty array if no match is found', () => {
        const members: { userId: string }[] = [];
        const result = filterUsersToAdd(mockUsers, members, 'nonexistent');
        expect(result).toEqual([]);
    });

    it('excludes users of type REFERRER or B2B_PARTNER', () => {
        const usersWithMixedTypes: User[] = [
            { id: 'u1', firstName: 'John', lastName: 'Doe', email: 'john@example.com', userType: 'STAFF' },
            { id: 'u2', firstName: 'Ralph', lastName: 'Minyuku', email: 'ralph@example.com', userType: 'REFERRER' },
            { id: 'u3', firstName: 'William', lastName: 'Maesela', email: 'william@example.com', userType: 'B2B_PARTNER' },
            { id: 'u4', firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' } // Empty/undefined defaults to STAFF
        ];
        const result = filterUsersToAdd(usersWithMixedTypes, [], '');
        expect(result).toHaveLength(2);
        expect(result.map(u => u.id)).toEqual(['u1', 'u4']);
    });
});

describe('filterGroupsToAdd', () => {
    it('returns all groups when search query is empty', () => {
        const result = filterGroupsToAdd(mockGroups, '');
        expect(result).toHaveLength(2);
        expect(result.map(g => g.id)).toEqual(['g1', 'g2']);
    });

    it('filters groups by name case-insensitively', () => {
        const result = filterGroupsToAdd(mockGroups, 'staff');
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('g2');
    });

    it('returns empty array if no match is found', () => {
        const result = filterGroupsToAdd(mockGroups, 'nonexistent');
        expect(result).toEqual([]);
    });
});

describe('filterCurrentMembers', () => {
    const members = [
        { userId: 'u1', role: 'MANAGER' },
        { userId: 'u2', role: 'MEMBER' },
        { userId: 'u99', role: 'MEMBER' } // Unknown user (not in mockUsers)
    ];

    it('returns all members when search query is empty', () => {
        const result = filterCurrentMembers(members, mockUsers, '');
        expect(result).toEqual(members);
    });

    it('filters current members by first/last name case-insensitively', () => {
        const result = filterCurrentMembers(members, mockUsers, 'jane');
        expect(result).toHaveLength(1);
        expect(result[0].userId).toBe('u2');
    });

    it('filters current members by email case-insensitively', () => {
        const result = filterCurrentMembers(members, mockUsers, 'john@');
        expect(result).toHaveLength(1);
        expect(result[0].userId).toBe('u1');
    });

    it('falls back to matching userId for unknown users', () => {
        const result = filterCurrentMembers(members, mockUsers, 'u99');
        expect(result).toHaveLength(1);
        expect(result[0].userId).toBe('u99');
    });

    it('returns empty array if no match is found', () => {
        const result = filterCurrentMembers(members, mockUsers, 'nonexistent');
        expect(result).toEqual([]);
    });
});
