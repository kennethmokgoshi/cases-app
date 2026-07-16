'use client';
import { toast } from '../ui/Toaster';


import { useState, useEffect, useRef } from 'react';

// Client-side logger (avoid importing server-only modules from shared-lib)
const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    debug: (...args: any[]) => console.debug('[DEBUG]', ...args)
};

export type User = {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    userType?: string;
};

export type Group = {
    id: string;
    name: string;
    _count: { members: number };
};

type Project = {
    id: string;
    name: string;
    type?: string;
    members?: { userId: string; role: string }[];
};

export function filterUsersToAdd(allUsers: User[], modalMembers: { userId: string }[], searchQuery: string): User[] {
    const query = searchQuery.toLowerCase().trim();
    return allUsers
        .filter(u => u.userType === 'STAFF' || !u.userType)
        .filter(u => !modalMembers.some(m => m.userId === u.id))
        .filter(u => {
            if (!query) return true;
            return (
                `${u.firstName} ${u.lastName}`.toLowerCase().includes(query) ||
                u.email.toLowerCase().includes(query)
            );
        });
}

export function filterGroupsToAdd(groups: Group[], searchQuery: string): Group[] {
    const query = searchQuery.toLowerCase().trim();
    return groups.filter(g => {
        if (!query) return true;
        return g.name.toLowerCase().includes(query);
    });
}

export function filterCurrentMembers<T extends { userId: string }>(
    modalMembers: T[],
    allUsers: User[],
    searchQuery: string
): T[] {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return modalMembers;
    return modalMembers.filter(member => {
        const user = allUsers.find(u => u.id === member.userId);
        if (!user) {
            return member.userId.toLowerCase().includes(query);
        }
        return (
            `${user.firstName} ${user.lastName}`.toLowerCase().includes(query) ||
            user.email.toLowerCase().includes(query)
        );
    });
}

type ProjectMembersModalProps = {
    project: Project;
    isOpen: boolean;
    onClose: () => void;
    onUpdate: () => Promise<void>;
    currentUserId?: string;
    isAdmin?: boolean;
};

export function ProjectMembersModal({
    project,
    isOpen,
    onClose,
    onUpdate,
    currentUserId,
    isAdmin
}: ProjectMembersModalProps) {
    const [modalMembers, setModalMembers] = useState<{ userId: string; role: string }[]>([]);
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);
    const [saving, setSaving] = useState(false);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [syncDown, setSyncDown] = useState(false);

    // Search and filter states
    const [searchQuery, setSearchQuery] = useState('');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [memberSearchQuery, setMemberSearchQuery] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Filter groups, users, and current members using helper functions
    const filteredGroups = filterGroupsToAdd(groups, searchQuery);
    const filteredUsers = filterUsersToAdd(allUsers, modalMembers, searchQuery);
    const filteredModalMembers = filterCurrentMembers(modalMembers, allUsers, memberSearchQuery);

    // Initialize members from props
    useEffect(() => {
        if (project && project.members) {
            setModalMembers(project.members.map(m => ({ userId: m.userId, role: m.role })));
        } else {
            setModalMembers([]);
        }
    }, [project]);

    // Fetch users when modal opens
    useEffect(() => {
        if (isOpen && allUsers.length === 0) {
            const fetchUsers = async () => {
                setLoadingUsers(true);
                try {
                    const [usersRes, groupsRes] = await Promise.all([
                        fetch('/api/users'),
                        fetch('/api/groups')
                    ]);
                    const usersData = await usersRes.json();
                    const groupsData = await groupsRes.json();

                    if (Array.isArray(usersData)) setAllUsers(usersData);
                    if (Array.isArray(groupsData)) setGroups(groupsData);
                } catch (e) {
                    logger.error('Failed to fetch data', e);
                } finally {
                    setLoadingUsers(false);
                }
            };
            fetchUsers();
        }
    }, [isOpen, allUsers.length]);

    if (!isOpen) return null;

    // Permissions check
    const isManager = project.members?.some(m => m.userId === currentUserId && m.role === 'MANAGER');
    const canManage = isAdmin || isManager;

    const handleSaveMembers = async () => {
        setSaving(true);
        try {
            const res = await fetch(`/api/projects/${project.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    members: modalMembers,
                    syncDown: syncDown
                })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || 'Failed to update members');
            }

            await onUpdate(); // Refresh parent data
            onClose();
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Failed to save members';
            toast.error(msg);
            logger.error(error);
        } finally {
            setSaving(false);
        }
    };

    const handleAddGroup = async (groupId: string) => {
        try {
            const res = await fetch(`/api/groups/${groupId}`);
            if (res.ok) {
                const groupData = await res.json();
                if (groupData.members) {
                    const existingIds = new Set(modalMembers.map(m => m.userId));
                    const newMembers = groupData.members
                        //@ts-ignore
                        .filter(m => !existingIds.has(m.userId))
                        //@ts-ignore
                        .map(m => ({ userId: m.userId, role: 'MEMBER' }));

                    if (newMembers.length > 0) {
                        setModalMembers([...modalMembers, ...newMembers]);
                    }
                }
            }
        } catch (error) {
            logger.error('Failed to fetch group members', error);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-zeno-navy border border-zeno-blue rounded-xl w-full max-w-md shadow-2xl">
                <div className="p-6 border-b border-zeno-blue flex justify-between items-center bg-zeno-blue/10">
                    <h2 className="text-xl font-semibold text-white">
                        Team: {project.name}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="p-6">
                    {canManage && (
                        <div className="mb-4">
                            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Add Member</label>
                            {project.type !== 'ACQUISITION_SOURCE' && (
                                <p className="text-[10px] text-gray-500 mb-3 italic">At least one Manager is required. If none are assigned, you will be made the Manager automatically.</p>
                            )}
                            {loadingUsers ? (
                                <div className="text-xs text-gray-500">Loading users...</div>
                            ) : (
                                <div className="relative" ref={dropdownRef}>
                                    <div className="relative flex items-center">
                                        <input
                                            type="text"
                                            placeholder="Search user or group to add..."
                                            value={searchQuery}
                                            onChange={(e) => {
                                                setSearchQuery(e.target.value);
                                                setIsDropdownOpen(true);
                                            }}
                                            onFocus={() => setIsDropdownOpen(true)}
                                            className="w-full px-4 py-2 bg-zeno-blue/50 border border-zeno-blue rounded-lg text-white pr-10 focus:ring-2 focus:ring-zeno-cyan focus:outline-none placeholder-gray-500 text-sm"
                                        />
                                        {searchQuery && (
                                            <button
                                                type="button"
                                                onClick={() => setSearchQuery('')}
                                                className="absolute right-8 text-gray-400 hover:text-white transition-colors text-sm"
                                            >
                                                ×
                                            </button>
                                        )}
                                        <div className="absolute right-3 text-gray-400 pointer-events-none">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                            </svg>
                                        </div>
                                    </div>

                                    {isDropdownOpen && (
                                        <div className="absolute z-50 w-full mt-1 bg-zeno-navy border border-zeno-blue rounded-lg shadow-2xl max-h-60 overflow-y-auto custom-scrollbar">
                                            {filteredGroups.length === 0 && filteredUsers.length === 0 ? (
                                                <div className="px-4 py-3 text-xs text-gray-500 text-center">
                                                    No matching users or groups found
                                                </div>
                                            ) : (
                                                <>
                                                    {filteredGroups.length > 0 && (
                                                        <div>
                                                            <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider bg-zeno-blue/15 border-b border-white/5">
                                                                Groups
                                                            </div>
                                                            {filteredGroups.map(g => (
                                                                <button
                                                                    key={g.id}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        handleAddGroup(g.id);
                                                                        setSearchQuery('');
                                                                        setIsDropdownOpen(false);
                                                                    }}
                                                                    className="w-full px-4 py-2 text-left hover:bg-zeno-blue/20 text-xs text-gray-200 transition-colors flex justify-between items-center"
                                                                >
                                                                    <span>{g.name}</span>
                                                                    <span className="text-gray-500 font-normal">({g._count?.members || 0} members)</span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {filteredUsers.length > 0 && (
                                                        <div>
                                                            <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider bg-zeno-blue/15 border-b border-white/5 mt-1">
                                                                Individual Users
                                                            </div>
                                                            {filteredUsers.map(u => (
                                                                <button
                                                                    key={u.id}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setModalMembers([...modalMembers, { userId: u.id, role: 'MEMBER' }]);
                                                                        setSearchQuery('');
                                                                        setIsDropdownOpen(false);
                                                                    }}
                                                                    className="w-full px-4 py-2.5 text-left hover:bg-zeno-blue/20 text-xs text-gray-200 transition-colors flex items-center gap-2.5"
                                                                >
                                                                    <div className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center font-bold text-[9px] uppercase">
                                                                        {u.firstName[0]}{u.lastName[0]}
                                                                    </div>
                                                                    <div className="min-w-0 flex-1">
                                                                        <div className="font-medium truncate text-white">{u.firstName} {u.lastName}</div>
                                                                        <div className="text-[10px] text-gray-400 truncate">{u.email}</div>
                                                                    </div>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="mb-3">
                        <div className="mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider flex justify-between items-center">
                            <span>Current Members ({modalMembers.length})</span>
                        </div>
                        {modalMembers.length > 0 && (
                            <div className="relative flex items-center mb-3">
                                <input
                                    type="text"
                                    placeholder="Search current members..."
                                    value={memberSearchQuery}
                                    onChange={(e) => setMemberSearchQuery(e.target.value)}
                                    className="w-full px-3 py-1.5 bg-zeno-blue/30 border border-zeno-blue/50 rounded-lg text-white placeholder-gray-500 text-xs focus:ring-1 focus:ring-zeno-cyan focus:outline-none"
                                />
                                {memberSearchQuery && (
                                    <button
                                        type="button"
                                        onClick={() => setMemberSearchQuery('')}
                                        className="absolute right-2 text-gray-400 hover:text-white text-xs transition-colors"
                                    >
                                        ×
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {canManage && project.type !== 'ACQUISITION_SOURCE' && (
                        <div className="mb-4 flex items-center gap-2 p-3 bg-zeno-blue/10 border border-white/5 rounded-lg hover:border-white/10 transition-colors">
                            <input
                                type="checkbox"
                                id="syncDownCheckbox"
                                checked={syncDown}
                                onChange={(e) => setSyncDown(e.target.checked)}
                                className="w-4 h-4 rounded border-zeno-blue bg-zeno-blue/50 text-zeno-cyan focus:ring-zeno-cyan transition-all"
                            />
                            <label htmlFor="syncDownCheckbox" className="text-xs text-gray-300 font-medium cursor-pointer select-none">
                                Apply member changes to all sub-projects
                            </label>
                        </div>
                    )}

                    {filteredModalMembers.length > 0 ? (
                        <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1 custom-scrollbar">
                            {filteredModalMembers.map((member) => {
                                const user = allUsers.find(u => u.id === member.userId);
                                // Fallback if user list not loaded yet or user not found
                                const displayName = user ? `${user.firstName} ${user.lastName}` : 'Unknown User';
                                const displayEmail = user?.email || member.userId;
                                const initials = user ? `${user.firstName[0]}${user.lastName[0]}` : '??';

                                return (
                                    <div key={member.userId} className="flex items-center justify-between p-3 bg-zeno-blue/20 border border-white/5 rounded-lg group hover:border-white/10 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${member.role === 'MANAGER' ? 'bg-amber-500/20 text-amber-300' : 'bg-purple-500/20 text-purple-300'}`}>
                                                {initials}
                                            </div>
                                            <div>
                                                <div className="text-white text-sm font-medium">{displayName}</div>
                                                <div className="text-xs text-gray-400">{displayEmail}</div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            {canManage ? (
                                                <>
                                                    <select
                                                        value={member.role}
                                                        onChange={(e) => {
                                                            const newMebs = modalMembers.map(m => m.userId === member.userId ? { ...m, role: e.target.value } : m);
                                                            setModalMembers(newMebs);
                                                        }}
                                                        className={`px-2 py-1 text-xs border rounded focus:outline-none ${member.role === 'MANAGER' ? 'bg-amber-900/30 border-amber-500/30 text-amber-300' : 'bg-zeno-navy border-zeno-blue text-gray-300'}`}
                                                    >
                                                        <option value="MEMBER">Member</option>
                                                        <option value="MANAGER">Manager</option>
                                                    </select>
                                                    <button
                                                        onClick={() => setModalMembers(modalMembers.filter(m => m.userId !== member.userId))}
                                                        className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                                                        title="Remove"
                                                    >
                                                        ×
                                                    </button>
                                                </>
                                            ) : (
                                                <span className={`px-2 py-1 text-xs font-medium rounded ${member.role === 'MANAGER'
                                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                                    : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                                    }`}>
                                                    {member.role}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : modalMembers.length > 0 ? (
                        <div className="text-center text-gray-500 py-6 bg-zeno-blue/10 rounded-lg border border-dashed border-gray-700 text-xs">
                            No current members match "{memberSearchQuery}".
                        </div>
                    ) : (
                        <div className="text-center text-gray-500 py-8 bg-zeno-blue/10 rounded-lg border border-dashed border-gray-700">
                            No members assigned.
                        </div>
                    )}

                    <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-zeno-blue/30">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors"
                        >
                            Close
                        </button>
                        {canManage && (
                            <button
                                onClick={handleSaveMembers}
                                disabled={saving}
                                className="px-6 py-2 bg-zeno-cyan text-zeno-navy text-sm font-bold rounded-lg hover:bg-cyan-400 transition-colors disabled:opacity-50 shadow-lg shadow-zeno-cyan/20"
                            >
                                {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
