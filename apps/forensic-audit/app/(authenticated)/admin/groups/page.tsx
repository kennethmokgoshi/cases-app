'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
};

type UserGroup = {
    id: string;
    name: string;
    members: { userId: string; role: string; user: { firstName: string; lastName: string; email: string } }[];
    _count?: { members: number };
};

type User = {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
};

export default function AdminGroupsPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [groups, setGroups] = useState<UserGroup[]>([]);
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [newGroupName, setNewGroupName] = useState('');
    const [creating, setCreating] = useState(false);

    // Modal State for Managing Members
    const [selectedGroup, setSelectedGroup] = useState<UserGroup | null>(null);
    const [managingMembers, setManagingMembers] = useState(false);

    // Fetch Groups and Users
    const fetchData = async () => {
        setLoading(true);
        try {
            const [groupsRes, usersRes] = await Promise.all([
                fetch('/api/groups'),
                fetch('/api/users')
            ]);
            const groupsData = await groupsRes.json();
            const usersData = await usersRes.json();

            if (Array.isArray(groupsData)) {
                setGroups(groupsData);
            } else {
                logger.error('Failed to load groups:', groupsData);
                setGroups([]);
            }

            if (Array.isArray(usersData)) {
                setAllUsers(usersData);
            }
        } catch (error) {
            logger.error('Failed to fetch data', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (status === 'authenticated' && !session?.user?.isAdmin) {
            router.push('/');
        } else if (status === 'authenticated') {
            fetchData();
        }
    }, [session, status, router]);

    const handleCreateGroup = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newGroupName.trim()) return;

        setCreating(true);
        try {
            const res = await fetch('/api/groups', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newGroupName })
            });

            if (!res.ok) {
                const err = await res.json();
                alert(err.error || 'Failed to create group');
                return;
            }

            setNewGroupName('');
            fetchData(); // Refresh list
        } catch (error) {
            logger.error(error);
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteGroup = async (id: string) => {
        if (!confirm('Are you sure you want to delete this group?')) return;
        try {
            const res = await fetch(`/api/groups/${id}`, { method: 'DELETE' });
            if (res.ok) fetchData();
        } catch (error) { logger.error(error); }
    };

    // Open Modal and Fetch specific group details (which includes members)
    const openManageModal = async (groupId: string) => {
        try {
            const res = await fetch(`/api/groups/${groupId}`);
            if (res.ok) {
                const groupData = await res.json();
                setSelectedGroup(groupData);
                setManagingMembers(true);
            }
        } catch (error) { logger.error(error); }
    };

    const handleAddMember = async (userId: string) => {
        if (!selectedGroup) return;
        try {
            const res = await fetch(`/api/groups/${selectedGroup.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ addMemberIds: [userId] })
            });

            if (res.ok) {
                // Refresh local specific group data
                const updated = await res.json();
                setSelectedGroup(updated);
                // Also refresh main list to update counts
                fetchData();
            }
        } catch (error) { logger.error(error); }
    };

    const handleRemoveMember = async (userId: string) => {
        if (!selectedGroup) return;
        try {
            const res = await fetch(`/api/groups/${selectedGroup.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ removeMemberIds: [userId] })
            });

            if (res.ok) {
                const updated = await res.json();
                setSelectedGroup(updated);
                fetchData();
            }
        } catch (error) { logger.error(error); }
    };

    if (status === 'loading' || loading && groups.length === 0) return <div className="p-8 text-center text-gray-400">Loading...</div>;

    if (!session?.user?.isAdmin) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
                    <p className="text-gray-400">You do not have permission to access the Groups Management admin page.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-8">
            <div className="flex items-center gap-3">
                <Link href="/admin" className="text-gray-400 hover:text-white transition-colors">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                </Link>
                <h1 className="text-3xl font-bold text-white">User Groups</h1>
            </div>

            {/* Create Group Form */}
            <div className="bg-zeno-blue/20 border border-white/5 rounded-xl p-6">
                <h2 className="text-lg font-semibold text-white mb-4">Create New Group</h2>
                <form onSubmit={handleCreateGroup} className="flex gap-4">
                    <input
                        type="text"
                        placeholder="Group Name (e.g. Zenowethu Team)"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        className="flex-1 bg-zeno-navy border border-zeno-blue rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-zeno-cyan"
                    />
                    <button
                        type="submit"
                        disabled={creating || !newGroupName.trim()}
                        className="px-6 py-2 bg-zeno-cyan text-zeno-navy font-bold rounded-lg hover:bg-cyan-400 transition-colors disabled:opacity-50"
                    >
                        {creating ? 'Creating...' : 'Create Group'}
                    </button>
                </form>
            </div>

            {/* Groups Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {groups.map(group => (
                    <div key={group.id} className="bg-zeno-blue/10 border border-white/5 rounded-xl p-6 hover:bg-zeno-blue/20 transition-colors">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-xl font-bold text-white">{group.name}</h3>
                                <p className="text-sm text-gray-400">{group._count?.members || 0} members</p>
                            </div>
                            <button
                                onClick={() => handleDeleteGroup(group.id)}
                                className="text-gray-500 hover:text-red-400 transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                        </div>
                        <button
                            onClick={() => openManageModal(group.id)}
                            className="w-full py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
                        >
                            Manage Members
                        </button>
                    </div>
                ))}
            </div>

            {/* Manage Members Modal */}
            {managingMembers && selectedGroup && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-zeno-navy border border-zeno-blue rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                        <div className="p-6 border-b border-zeno-blue flex justify-between items-center bg-zeno-blue/10">
                            <h2 className="text-xl font-semibold text-white">Manage Members: {selectedGroup.name}</h2>
                            <button onClick={() => setManagingMembers(false)} className="text-gray-400 hover:text-white">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-full">
                                {/* Available Users */}
                                <div>
                                    <h3 className="text-sm font-bold text-gray-400 uppercase mb-3">Available Users</h3>
                                    <div className="space-y-2 h-[400px] overflow-y-auto pr-2 custom-scrollbar border border-white/5 rounded-lg p-2">
                                        {allUsers
                                            .filter(u => !selectedGroup.members.some(m => m.userId === u.id))
                                            .map(user => (
                                                <div key={user.id} className="flex items-center justify-between p-2 hover:bg-white/5 rounded transition-colors group">
                                                    <div>
                                                        <div className="text-sm text-white">{user.firstName} {user.lastName}</div>
                                                        <div className="text-xs text-gray-500">{user.email}</div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleAddMember(user.id)}
                                                        className="px-2 py-1 text-xs bg-green-500/20 text-green-300 rounded border border-green-500/30 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-green-500/30"
                                                    >
                                                        Add
                                                    </button>
                                                </div>
                                            ))}
                                    </div>
                                </div>

                                {/* Current Members */}
                                <div>
                                    <h3 className="text-sm font-bold text-gray-400 uppercase mb-3">Current Members ({selectedGroup.members.length})</h3>
                                    <div className="space-y-2 h-[400px] overflow-y-auto pr-2 custom-scrollbar border border-white/5 rounded-lg p-2">
                                        {selectedGroup.members.map(member => (
                                            <div key={member.userId} className="flex items-center justify-between p-2 bg-zeno-blue/20 rounded border border-white/5">
                                                <div>
                                                    <div className="text-sm text-white">{member.user.firstName} {member.user.lastName}</div>
                                                    <div className="text-xs text-gray-500">{member.user.email}</div>
                                                </div>
                                                <button
                                                    onClick={() => handleRemoveMember(member.userId)}
                                                    className="p-1 text-gray-500 hover:text-red-400 transition-colors"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t border-zeno-blue bg-zeno-blue/5 text-right">
                            <button onClick={() => setManagingMembers(false)} className="px-4 py-2 text-sm text-white bg-zeno-blue/50 rounded hover:bg-zeno-blue/70">Done</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
