'use client';

import { useSession } from '@zenowethu/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';

const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
};

type User = {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    organization: string;
    role: string;
    isAdmin: boolean;
    isLocked: boolean;
    userType: string;
    b2bPartnerId: string | null;
    b2bPartner: { id: string; name: string } | null;
    lastLogin: string | null;
    createdAt: string;
};

type Partner = {
    id: string;
    name: string;
};

export default function UsersManagement() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [users, setUsers] = useState<User[]>([]);
    const [partners, setPartners] = useState<Partner[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState('');
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [sortColumn, setSortColumn] = useState<string>('firstName');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        confirmPassword: '',
        organization: '',
        role: 'MEMBER' as 'MEMBER' | 'MANAGER' | 'ADMIN',
        isLocked: false,
        userType: 'STAFF' as 'STAFF' | 'B2B_PARTNER',
        b2bPartnerId: '' });

    useEffect(() => {
        if (status === 'authenticated' && !session?.user?.isAdmin) {
            router.push('/');
        } else if (status === 'authenticated') {
            fetchUsers();
            fetchPartners();
        }
    }, [session, status, router]);

    const fetchUsers = async () => {
        try {
            const res = await fetch('/api/users');
            const data = await res.json();
            if (Array.isArray(data)) {
                setUsers(data);
            }
        } catch (error) {
            logger.error('Failed to fetch users:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchPartners = async () => {
        try {
            const res = await fetch('/api/b2b/partners');
            const data = await res.json();
            if (Array.isArray(data)) {
                setPartners(data);
            }
        } catch (error) {
            logger.error('Failed to fetch partners:', error);
        }
    };

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreating(true);
        setError('');

        // Validate password match
        if (formData.password !== formData.confirmPassword) {
            setError('Passwords do not match');
            setCreating(false);
            return;
        }

        try {
            const res = await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    b2bPartnerId: formData.userType === 'B2B_PARTNER' ? formData.b2bPartnerId : null }) });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to create user');
            }

            // Refresh users list
            await fetchUsers();
            setShowModal(false);
            resetForm();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create user');
        } finally {
            setCreating(false);
        }
    };

    const handleEditUser = (user: User) => {
        setEditingUser(user);
        setFormData({
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            password: '', // Don't populate password
            confirmPassword: '', // Don't populate confirm password
            organization: user.organization,
            role: user.role as 'MEMBER' | 'MANAGER' | 'ADMIN',
            isLocked: user.isLocked,
            userType: user.userType as 'STAFF' | 'B2B_PARTNER',
            b2bPartnerId: user.b2bPartnerId || '' });
        setShowModal(true);
    };

    const handleSaveUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreating(true);
        setError('');

        // Validate password match if password is being changed
        if (formData.password && formData.password !== formData.confirmPassword) {
            setError('Passwords do not match');
            setCreating(false);
            return;
        }

        try {
            const res = await fetch(`/api/users/${editingUser?.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    b2bPartnerId: formData.userType === 'B2B_PARTNER' ? formData.b2bPartnerId : null }) });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to update user');
            }

            // Refresh users list
            await fetchUsers();
            setShowModal(false);
            setEditingUser(null);
            resetForm();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update user');
        } finally {
            setCreating(false);
        }
    };

    const resetForm = () => {
        setFormData({
            firstName: '',
            lastName: '',
            email: '',
            password: '',
            confirmPassword: '',
            organization: '',
            role: 'MEMBER',
            isLocked: false,
            userType: 'STAFF',
            b2bPartnerId: '' });
        setShowPassword(false);
        setShowConfirmPassword(false);
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setEditingUser(null);
        resetForm();
        setError('');
    };

    const handleDeleteUser = async (userId: string, userName: string) => {
        if (!confirm(`Are you sure you want to delete user "${userName}"? This action cannot be undone.`)) {
            return;
        }

        try {
            const res = await fetch(`/api/admin/users/${userId}`, {
                method: 'DELETE' });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to delete user');
            }

            alert(data.message || 'User deleted successfully');
            await fetchUsers();
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to delete user');
        }
    };

    const handleSort = (column: string) => {
        if (sortColumn === column) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(column);
            setSortDirection('asc');
        }
    };

    const sortedUsers = [...users].sort((a, b) => {
        let aVal: any;
        let bVal: any;

        switch (sortColumn) {
            case 'firstName':
                aVal = `${a.firstName} ${a.lastName}`.toLowerCase();
                bVal = `${b.firstName} ${b.lastName}`.toLowerCase();
                break;
            case 'userType':
                aVal = a.userType;
                bVal = b.userType;
                break;
            case 'organization':
                aVal = a.organization.toLowerCase();
                bVal = b.organization.toLowerCase();
                break;
            case 'role':
                aVal = a.role;
                bVal = b.role;
                break;
            case 'isLocked':
                aVal = a.isLocked ? 1 : 0;
                bVal = b.isLocked ? 1 : 0;
                break;
            case 'lastLogin':
                aVal = a.lastLogin ? new Date(a.lastLogin).getTime() : 0;
                bVal = b.lastLogin ? new Date(b.lastLogin).getTime() : 0;
                break;
            default:
                return 0;
        }

        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    if (status === 'loading' || loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-zeno-cyan"></div>
            </div>
        );
    }

    if (!session?.user?.isAdmin) {
        return null;
    }

    return (
        <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <Link href="/admin" className="text-gray-400 hover:text-white">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <h1 className="text-3xl font-bold text-white">Users</h1>
                    </div>
                    <p className="text-gray-400">Manage system users and access</p>
                </div>
                <div className="flex gap-3">
                    <Link
                        href="/admin/groups"
                        className="px-4 py-2 bg-zeno-blue/30 text-white border border-zeno-blue/50 font-semibold rounded-lg hover:bg-zeno-blue/50 transition-colors flex items-center gap-2"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        Manage Groups
                    </Link>
                    <button
                        onClick={() => setShowModal(true)}
                        className="px-4 py-2 bg-zeno-cyan text-zeno-navy font-semibold rounded-lg hover:bg-cyan-400 transition-colors flex items-center gap-2"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        New User
                    </button>
                </div>
            </div>

            {/* Users Table */}
            <div className="bg-zeno-blue/30 border border-zeno-blue/50 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-zeno-blue/50 border-b border-zeno-blue/50 text-gray-300 text-sm">
                                <th className="px-6 py-4 font-medium">
                                    <button onClick={() => handleSort('firstName')} className="flex items-center gap-2 hover:text-white transition-colors">
                                        User
                                        {sortColumn === 'firstName' && (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                {sortDirection === 'asc' ? (
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                                ) : (
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                )}
                                            </svg>
                                        )}
                                    </button>
                                </th>
                                <th className="px-6 py-4 font-medium">
                                    <button onClick={() => handleSort('userType')} className="flex items-center gap-2 hover:text-white transition-colors">
                                        Type
                                        {sortColumn === 'userType' && (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                {sortDirection === 'asc' ? (
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                                ) : (
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                )}
                                            </svg>
                                        )}
                                    </button>
                                </th>
                                <th className="px-6 py-4 font-medium">
                                    <button onClick={() => handleSort('organization')} className="flex items-center gap-2 hover:text-white transition-colors">
                                        Organization
                                        {sortColumn === 'organization' && (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                {sortDirection === 'asc' ? (
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                                ) : (
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                )}
                                            </svg>
                                        )}
                                    </button>
                                </th>
                                <th className="px-6 py-4 font-medium">
                                    <button onClick={() => handleSort('role')} className="flex items-center gap-2 hover:text-white transition-colors">
                                        Role
                                        {sortColumn === 'role' && (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                {sortDirection === 'asc' ? (
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                                ) : (
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                )}
                                            </svg>
                                        )}
                                    </button>
                                </th>
                                <th className="px-6 py-4 font-medium">
                                    <button onClick={() => handleSort('isLocked')} className="flex items-center gap-2 hover:text-white transition-colors">
                                        Status
                                        {sortColumn === 'isLocked' && (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                {sortDirection === 'asc' ? (
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                                ) : (
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                )}
                                            </svg>
                                        )}
                                    </button>
                                </th>
                                <th className="px-6 py-4 font-medium">
                                    <button onClick={() => handleSort('lastLogin')} className="flex items-center gap-2 hover:text-white transition-colors">
                                        Last Login
                                        {sortColumn === 'lastLogin' && (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                {sortDirection === 'asc' ? (
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                                ) : (
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                )}
                                            </svg>
                                        )}
                                    </button>
                                </th>
                                <th className="px-6 py-4 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zeno-blue/20">
                            {sortedUsers.map((user) => (
                                <tr key={user.id} className="hover:bg-white/5 transition-colors">
                                    <td className="px-6 py-4">
                                        <div>
                                            <div className="text-white font-medium">{user.firstName} {user.lastName}</div>
                                            <div className="text-sm text-gray-500">{user.email}</div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        {user.userType === 'B2B_PARTNER' ? (
                                            <div>
                                                <span className="px-2 py-1 text-xs font-medium rounded bg-orange-500/20 text-orange-300 border border-orange-500/30">
                                                    B2B Partner
                                                </span>
                                                {user.b2bPartner && (
                                                    <div className="text-xs text-gray-400 mt-1">{user.b2bPartner.name}</div>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="px-2 py-1 text-xs font-medium rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                                Staff
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-gray-300">
                                        {user.organization}
                                    </td>
                                    <td className="px-6 py-4">
                                        {user.role === 'ADMIN' ? (
                                            <span className="px-2 py-1 text-xs font-medium rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                                Admin
                                            </span>
                                        ) : user.role === 'MANAGER' ? (
                                            <span className="px-2 py-1 text-xs font-medium rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                                Manager
                                            </span>
                                        ) : (
                                            <span className="px-2 py-1 text-xs font-medium rounded bg-gray-500/20 text-gray-400 border border-gray-500/30">
                                                Member
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        {user.isLocked ? (
                                            <span className="px-2 py-1 text-xs font-medium rounded bg-red-500/20 text-red-300 border border-red-500/30">
                                                Locked
                                            </span>
                                        ) : (
                                            <span className="px-2 py-1 text-xs font-medium rounded bg-teal-500/20 text-teal-300 border border-teal-500/30">
                                                Active
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-400">
                                        {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <Link
                                                href={`/cases?createdBy=${user.id}`}
                                                className="text-gray-400 hover:text-white p-2 rounded hover:bg-white/10"
                                                title="View User's Cases"
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                                </svg>
                                            </Link>
                                            <button
                                                onClick={() => handleEditUser(user)}
                                                className="text-gray-400 hover:text-white p-2 rounded hover:bg-white/10"
                                                title="Edit User"
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={() => handleDeleteUser(user.id, `${user.firstName} ${user.lastName}`)}
                                                className="text-red-400 hover:text-red-300 p-2 rounded hover:bg-red-500/10"
                                                title="Delete User"
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {users.length === 0 && !loading && (
                    <div className="p-8 text-center text-gray-400">
                        No users found.
                    </div>
                )}
            </div>

            {/* Create User Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div className="bg-zeno-gray rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto border border-white/10">
                        <div className="p-6 border-b border-white/10">
                            <div className="flex justify-between items-center">
                                <h2 className="text-xl font-bold text-white">
                                    {editingUser ? 'Edit User' : 'Create New User'}
                                </h2>
                                <button
                                    onClick={handleCloseModal}
                                    className="text-gray-400 hover:text-white"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        <form onSubmit={editingUser ? handleSaveUser : handleCreateUser} className="p-6 space-y-4">
                            {error && (
                                <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-300 text-sm">
                                    {error}
                                </div>
                            )}

                            {/* User Type Toggle */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">User Type</label>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, userType: 'STAFF', b2bPartnerId: '' })}
                                        className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${formData.userType === 'STAFF'
                                            ? 'bg-blue-500 text-white'
                                            : 'bg-zeno-blue/30 text-gray-300 hover:bg-zeno-blue/50'
                                            }`}
                                    >
                                        Staff / Employee
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, userType: 'B2B_PARTNER' })}
                                        className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${formData.userType === 'B2B_PARTNER'
                                            ? 'bg-orange-500 text-white'
                                            : 'bg-zeno-blue/30 text-gray-300 hover:bg-zeno-blue/50'
                                            }`}
                                    >
                                        B2B Partner
                                    </button>
                                </div>
                            </div>

                            {/* B2B Partner Selection */}
                            {formData.userType === 'B2B_PARTNER' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Partner Organization</label>
                                    <select
                                        value={formData.b2bPartnerId}
                                        onChange={(e) => setFormData({ ...formData, b2bPartnerId: e.target.value })}
                                        className="w-full px-4 py-2 bg-zeno-navy border border-white/10 rounded-lg text-white focus:border-zeno-cyan focus:ring-1 focus:ring-zeno-cyan"
                                        required={formData.userType === 'B2B_PARTNER'}
                                    >
                                        <option value="">Select a partner...</option>
                                        {partners.map((partner) => (
                                            <option key={partner.id} value={partner.id}>
                                                {partner.name}
                                            </option>
                                        ))}
                                    </select>
                                    {partners.length === 0 && (
                                        <p className="text-xs text-gray-400 mt-1">
                                            No B2B partners found. Create them in Admin → Projects first.
                                        </p>
                                    )}
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">First Name</label>
                                    <input
                                        type="text"
                                        value={formData.firstName}
                                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                                        className="w-full px-4 py-2 bg-zeno-navy border border-white/10 rounded-lg text-white focus:border-zeno-cyan focus:ring-1 focus:ring-zeno-cyan"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Last Name</label>
                                    <input
                                        type="text"
                                        value={formData.lastName}
                                        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                                        className="w-full px-4 py-2 bg-zeno-navy border border-white/10 rounded-lg text-white focus:border-zeno-cyan focus:ring-1 focus:ring-zeno-cyan"
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="w-full px-4 py-2 bg-zeno-navy border border-white/10 rounded-lg text-white focus:border-zeno-cyan focus:ring-1 focus:ring-zeno-cyan"
                                    required
                                />
                            </div>


                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Password {editingUser && <span className="text-gray-500">(leave blank to keep current)</span>}
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        className="w-full px-4 py-2 pr-12 bg-zeno-navy border border-white/10 rounded-lg text-white focus:border-zeno-cyan focus:ring-1 focus:ring-zeno-cyan"
                                        required={!editingUser}
                                        minLength={6}
                                        placeholder={editingUser ? '••••••••' : 'Enter password'}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                                    >
                                        {showPassword ? (
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                            </svg>
                                        ) : (
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                            </svg>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* Confirm Password (only when creating or changing password) */}
                            {(!editingUser || formData.password) && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        Confirm Password
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={showConfirmPassword ? "text" : "password"}
                                            value={formData.confirmPassword}
                                            onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                                            className={`w-full px-4 py-2 pr-12 bg-zeno-navy border rounded-lg text-white focus:ring-1 ${formData.password && formData.confirmPassword && formData.password !== formData.confirmPassword
                                                ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                                                : 'border-white/10 focus:border-zeno-cyan focus:ring-zeno-cyan'
                                                }`}
                                            required={!editingUser || !!formData.password}
                                            minLength={6}
                                            placeholder="Re-enter password"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                                        >
                                            {showConfirmPassword ? (
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                                </svg>
                                            ) : (
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                </svg>
                                            )}
                                        </button>
                                    </div>
                                    {formData.password && formData.confirmPassword && formData.password !== formData.confirmPassword && (
                                        <p className="text-red-400 text-sm mt-1">Passwords do not match</p>
                                    )}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">Organization</label>
                                <input
                                    type="text"
                                    value={formData.organization}
                                    onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
                                    placeholder={formData.userType === 'STAFF' ? 'Zenowethu' : 'Partner company name'}
                                    className="w-full px-4 py-2 bg-zeno-navy border border-white/10 rounded-lg text-white focus:border-zeno-cyan focus:ring-1 focus:ring-zeno-cyan"
                                />
                            </div>


                            {/* Role Selection */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">Role</label>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, role: 'MEMBER' })}
                                        className={`flex-1 py-2 px-3 rounded-lg font-medium transition-colors text-sm ${formData.role === 'MEMBER'
                                            ? 'bg-blue-500 text-white'
                                            : 'bg-zeno-blue/30 text-gray-300 hover:bg-zeno-blue/50'
                                            }`}
                                    >
                                        Member
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, role: 'MANAGER' })}
                                        className={`flex-1 py-2 px-3 rounded-lg font-medium transition-colors text-sm ${formData.role === 'MANAGER'
                                            ? 'bg-blue-500 text-white'
                                            : 'bg-zeno-blue/30 text-gray-300 hover:bg-zeno-blue/50'
                                            }`}
                                    >
                                        Manager
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, role: 'ADMIN' })}
                                        className={`flex-1 py-2 px-3 rounded-lg font-medium transition-colors text-sm ${formData.role === 'ADMIN'
                                            ? 'bg-purple-500 text-white'
                                            : 'bg-zeno-blue/30 text-gray-300 hover:bg-zeno-blue/50'
                                            }`}
                                    >
                                        Admin
                                    </button>
                                </div>
                            </div>

                            {/* Lock/Unlock Toggle (only when editing) */}
                            {editingUser && (
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id="isLocked"
                                        checked={formData.isLocked}
                                        onChange={(e) => setFormData({ ...formData, isLocked: e.target.checked })}
                                        className="w-4 h-4 rounded border-gray-600 bg-zeno-navy text-red-500 focus:ring-red-500"
                                    />
                                    <label htmlFor="isLocked" className="text-sm text-gray-300">
                                        Lock account (prevent login)
                                    </label>
                                </div>
                            )}

                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={handleCloseModal}
                                    className="flex-1 py-2 px-4 bg-zeno-blue/30 text-white rounded-lg hover:bg-zeno-blue/50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={creating || (formData.userType === 'B2B_PARTNER' && !formData.b2bPartnerId)}
                                    className="flex-1 py-2 px-4 bg-zeno-cyan text-zeno-navy font-semibold rounded-lg hover:bg-cyan-400 transition-colors disabled:opacity-50"
                                >
                                    {creating ? (editingUser ? 'Saving...' : 'Creating...') : (editingUser ? 'Save Changes' : 'Create User')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
