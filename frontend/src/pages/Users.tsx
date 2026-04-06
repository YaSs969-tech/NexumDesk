import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Header, Modal, Card, StatusBadge, RoleBadge, PriorityBadge } from '../components';
import { formatDate, formatDateTime } from '../utils/format';

interface UserData {
  id: string;
  username: string;
  email: string;
  full_name: string;
  phone: string | null;
  department: string | null;
  job_title: string | null;
  role: string;
  tier: 'JUNIOR' | 'MID' | 'SENIOR' | null;
  status: string;
  points_limit?: number;
  auto_assign_enabled?: number;
  last_login: string | null;
  created_at: string;
}

interface UsersProps {
  user: UserData | null;
}

const roles = [
  { id: 'ADMIN', name: 'Administrator', description: 'Full system access' },
  { id: 'MANAGER', name: 'Manager', description: 'Team management' },
  { id: 'ENGINEER', name: 'Engineer', description: 'Technical staff' },
  { id: 'USER', name: 'User', description: 'Standard user access' },
];

export default function Users({ user: currentUser }: UsersProps) {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    full_name: '',
    phone: '',
    department: '',
    job_title: '',
    password: '',
    role: 'ENGINEER',
    tier: 'JUNIOR',
    status: 'ACTIVE',
    points_limit: '0',
    auto_assign_enabled: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const navigate = useNavigate();
  const modalCancelButtonClass = 'btn-cancel px-5 py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center gap-2';
  const modalActionButtonClass = 'btn-action-reopen px-6 py-2.5 text-sm font-semibold flex items-center gap-2 disabled:opacity-50';

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get('/users');
      setUsers(res.data.data.users || []);
    } catch (err: any) {
      if (err.response?.status === 403) {
        navigate('/');
      } else {
        setError(err.response?.data?.message || 'Failed to load users');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [navigate]);

  const tierLabel = (tier: UserData['tier']) => {
    if (tier === 'SENIOR') return 'Senior';
    if (tier === 'MID') return 'Mid';
    if (tier === 'JUNIOR') return 'Junior';
    return 'No tier';
  };

  const tierPriority = (tier: UserData['tier']) => {
    if (tier === 'SENIOR') return '1';
    if (tier === 'MID') return '2';
    return '3';
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setError('');
      const payload = {
        ...formData,
        points_limit: formData.role === 'ENGINEER' ? Number(formData.points_limit || 0) : 0,
        auto_assign_enabled: formData.role === 'ENGINEER' ? formData.auto_assign_enabled : true,
      };
      await api.post('/users', payload);
      setFormData({ username: '', email: '', full_name: '', phone: '', department: '', job_title: '', password: '', role: 'ENGINEER', tier: 'JUNIOR', status: 'ACTIVE', points_limit: '0', auto_assign_enabled: true });
      setShowModal(false);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create user');
    } finally {
      setSubmitting(false);
    }
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    try {
      setSubmitting(true);
      setError('');
      await api.put(`/users/${editingUser.id}`, {
        username: editingUser.username?.trim(),
        email: editingUser.email?.trim(),
        full_name: editingUser.full_name || '',
        phone: editingUser.phone || '',
        department: editingUser.department || '',
        job_title: editingUser.job_title || '',
        role: editingUser.role,
        tier: editingUser.role === 'ENGINEER' ? (editingUser.tier || 'JUNIOR') : null,
        status: editingUser.status,
        points_limit: editingUser.role === 'ENGINEER' ? Number(editingUser.points_limit || 0) : 0,
        auto_assign_enabled: editingUser.role === 'ENGINEER' ? Boolean(editingUser.auto_assign_enabled) : true,
      });
      setEditingUser(null);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update user');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteUser = async (userId: string) => {
    try {
      await api.delete(`/users/${userId}`);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete user');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    
    if (resetPassword !== resetPasswordConfirm) {
      setResetError('Passwords do not match!');
      return;
    }
    
    if (resetPassword.length < 8) {
      setResetError('Password must be at least 8 characters!');
      return;
    }
    
    setResetError('');
    try {
      setSubmitting(true);
      await api.post(`/users/${editingUser.id}/reset-password`, { password: resetPassword });
      setResetSuccess(true);
      setTimeout(() => {
        setShowResetModal(false);
        setResetPassword('');
        setResetPasswordConfirm('');
        setResetError('');
        setResetSuccess(false);
      }, 2000);
    } catch (err: any) {
      setResetError(err.response?.data?.message || 'Error resetting password');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredUsers = users.filter((u) => {
    const matchSearch = 
      u.username.toLowerCase().includes(searchFilter.toLowerCase()) ||
      u.email.toLowerCase().includes(searchFilter.toLowerCase()) ||
      u.full_name.toLowerCase().includes(searchFilter.toLowerCase());
    const matchRole = !roleFilter || u.role === roleFilter;
    const normalizedTier = u.role === 'ENGINEER' ? (u.tier || '') : 'NO_TIER';
    const matchTier = !tierFilter || normalizedTier === tierFilter;
    const matchStatus = !statusFilter || u.status === statusFilter;
    return matchSearch && matchRole && matchTier && matchStatus;
  });

  return (
    <div className="min-h-screen bg-transparent">
      <Header 
        user={currentUser} 
        title="Manage Users" 
        subtitle="Add, edit, and manage user accounts"
        actions={
          <button onClick={() => setShowModal(true)} className="btn-action-reopen flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            Add User
          </button>
        }
      />

      {error && (
        <div className="mx-6 mt-4 bg-danger-50 border border-danger-200 text-danger-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="px-6 pt-6 pb-4 flex gap-3 flex-wrap items-center">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search users..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="input pl-10 max-w-xs"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="select max-w-[160px]"
        >
          <option value="">All Roles</option>
          {roles.map(r => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value)}
          className="select max-w-[150px]"
        >
          <option value="">All Tiers</option>
          <option value="SENIOR">Senior</option>
          <option value="MID">Mid</option>
          <option value="JUNIOR">Junior</option>
          <option value="NO_TIER">No tier</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="select max-w-[150px]"
        >
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
      </div>

      {/* Users Table */}
      <div className="px-6 pb-6">
        <Card padding="none" className="bg-white border border-gray-200 shadow-sm rounded-none">
          <div className="px-5 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">User List</h3>
                <p className="text-sm text-gray-500 mt-0.5">{filteredUsers.length} users found</p>
              </div>
            </div>
          </div>
          {loading ? (
            <div className="p-12 text-center">
              <div className="spinner mx-auto mb-3"></div>
              <p className="text-neutral-500">Loading users...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 mx-auto bg-neutral-100 rounded-2xl flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13.5 5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                </svg>
              </div>
              <p className="text-neutral-500 font-medium">No users found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Tier</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Last Login</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredUsers.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-[4px] flex items-center justify-center shadow-lg" style={{ background: 'linear-gradient(90deg, rgba(14, 165, 233, 0.92) 0%, rgba(2, 132, 199, 0.96) 100%)' }}>
                            <span className="text-white font-semibold">
                              {item.username.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-neutral-800">{item.full_name || item.username}</p>
                            <p className="text-xs text-neutral-500">{item.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex justify-center"><RoleBadge role={item.role} /></div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {item.role === 'ENGINEER' ? (
                          <div className="flex items-center justify-center gap-2">
                            <PriorityBadge
                              priority={tierPriority(item.tier)}
                              format="numbered"
                              size="md"
                              customLabel={tierLabel(item.tier)}
                            />
                          </div>
                        ) : (
                          <span className="text-sm text-neutral-500">No tier</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex justify-center"><StatusBadge status={item.status} /></div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm text-neutral-500">{formatDate(item.created_at)}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {item.last_login ? (
                          <div>
                            <div className="text-sm text-neutral-700">{formatDate(item.last_login)}</div>
                            <div className="text-xs text-neutral-500">{formatDateTime(item.last_login).split(' ').slice(1).join(' ')}</div>
                          </div>
                        ) : (
                          <span className="text-sm text-neutral-500">Never</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center gap-2 justify-center">
                          <button
                            onClick={() => setEditingUser(item)}
                            className="p-2 text-neutral-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          {item.id !== currentUser?.id && (
                            <button
                              onClick={() => { setDeletingUserId(item.id); setShowDeleteModal(true); }}
                              className="p-2 text-neutral-400 hover:text-danger-600 hover:bg-danger-50 rounded-lg transition-colors"
                              title="Delete"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Create User Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Add New User"
        size="xl"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        }
        footer={
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setShowModal(false)}
              className={modalCancelButtonClass}
            >
              Cancel
            </button>
            <button
              onClick={(e) => create(e)}
              disabled={submitting}
              className={modalActionButtonClass}
            >
              {submitting && <span className="spinner w-4 h-4 border-2"></span>}
              {submitting ? 'Creating...' : 'Create User'}
            </button>
          </div>
        }
      >
        <div className="bg-white -m-6 p-6">
        <form className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          {error && (
            <div className="xl:col-span-12 bg-danger-50 border border-danger-200 text-danger-700 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <div className="xl:col-span-8 space-y-4">
            <div className="p-3 bg-white rounded-md border border-neutral-200">
              <p className="text-xs text-sky-700 font-semibold uppercase tracking-wide mb-2">Identity</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Username *</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="john_doe"
                    required
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Email *</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="john@company.com"
                    required
                    className="input"
                  />
                </div>
              </div>
              <div className="mt-4">
                <label className="block text-sm font-medium text-neutral-700 mb-1">Full Name</label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder="John Doe"
                  className="input"
                />
              </div>
            </div>

            <div className="p-3 bg-white rounded-md border border-neutral-200">
              <p className="text-xs text-sky-700 font-semibold uppercase tracking-wide mb-2">Profile</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+373 123 45678"
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Department</label>
                  <input
                    type="text"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    placeholder="IT"
                    className="input"
                  />
                </div>
              </div>
              <div className="mt-4">
                <label className="block text-sm font-medium text-neutral-700 mb-1">Job Title</label>
                <input
                  type="text"
                  value={formData.job_title}
                  onChange={(e) => setFormData({ ...formData, job_title: e.target.value })}
                  placeholder="Software Engineer"
                  className="input"
                />
              </div>
            </div>
          </div>

          <div className="xl:col-span-4 xl:border-l xl:border-neutral-200 xl:pl-4">
            <div className="p-3 bg-white rounded-md border border-neutral-200 h-full">
              <p className="text-xs text-sky-700 font-semibold uppercase tracking-wide mb-2">Access</p>
              <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => {
                    const nextRole = e.target.value;
                    setFormData({
                      ...formData,
                      role: nextRole,
                      tier: nextRole === 'ENGINEER' ? (formData.tier || 'JUNIOR') : '',
                      points_limit: nextRole === 'ENGINEER' ? formData.points_limit : '0',
                      auto_assign_enabled: nextRole === 'ENGINEER' ? formData.auto_assign_enabled : true,
                    });
                  }}
                  className="input"
                >
                  {roles.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              {formData.role === 'ENGINEER' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Tier</label>
                    <select
                      value={formData.tier}
                      onChange={(e) => setFormData({ ...formData, tier: e.target.value as 'JUNIOR' | 'MID' | 'SENIOR' })}
                      className="input"
                    >
                      <option value="JUNIOR">Junior</option>
                      <option value="MID">Mid</option>
                      <option value="SENIOR">Senior</option>
                    </select>
                  </div>
                </>
              )}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="input"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Password *</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="********"
                  required
                  className="input"
                />
              </div>
            </div>
          </div>
          </div>
        </form>
        </div>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        isOpen={!!editingUser}
        onClose={() => { setEditingUser(null); setNewPassword(''); }}
        title="Edit User"
        size="xl"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        }
        footer={
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => { setEditingUser(null); setNewPassword(''); }}
              className={modalCancelButtonClass}
            >
              Cancel
            </button>
            <button
              onClick={(e) => saveEdit(e)}
              disabled={submitting}
              className={modalActionButtonClass}
            >
              {submitting && <span className="spinner w-4 h-4 border-2"></span>}
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        }
      >
        {editingUser && (
          <div className="bg-white -m-6 p-6">
          <form className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            {error && (
              <div className="xl:col-span-12 bg-danger-50 border border-danger-200 text-danger-700 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <div className="xl:col-span-8 space-y-4">
              <div className="p-3 bg-white rounded-md border border-neutral-200">
                <p className="text-xs text-sky-700 font-semibold uppercase tracking-wide mb-2">Identity</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Username</label>
                    <input
                      type="text"
                      value={editingUser.username}
                      onChange={(e) => setEditingUser({ ...editingUser, username: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={editingUser.email}
                      onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                      className="input"
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={editingUser.full_name}
                    onChange={(e) => setEditingUser({ ...editingUser, full_name: e.target.value })}
                    className="input"
                  />
                </div>
              </div>

              <div className="p-3 bg-white rounded-md border border-neutral-200">
                <p className="text-xs text-sky-700 font-semibold uppercase tracking-wide mb-2">Profile</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Phone</label>
                    <input
                      type="tel"
                      value={editingUser.phone || ''}
                      onChange={(e) => setEditingUser({ ...editingUser, phone: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Department</label>
                    <input
                      type="text"
                      value={editingUser.department || ''}
                      onChange={(e) => setEditingUser({ ...editingUser, department: e.target.value })}
                      className="input"
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Job Title</label>
                  <input
                    type="text"
                    value={editingUser.job_title || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, job_title: e.target.value })}
                    className="input"
                  />
                </div>
              </div>
            </div>

            <div className="xl:col-span-4 xl:border-l xl:border-neutral-200 xl:pl-4">
              <div className="p-3 bg-white rounded-md border border-neutral-200 h-full">
                <p className="text-xs text-sky-700 font-semibold uppercase tracking-wide mb-2">Access</p>
                <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Role</label>
                  <select
                    value={editingUser.role}
                    onChange={(e) => {
                      const nextRole = e.target.value;
                      setEditingUser({
                        ...editingUser,
                        role: nextRole,
                        tier: nextRole === 'ENGINEER' ? (editingUser.tier || 'JUNIOR') : null,
                        points_limit: nextRole === 'ENGINEER' ? (editingUser.points_limit || 0) : 0,
                        auto_assign_enabled: nextRole === 'ENGINEER' ? (editingUser.auto_assign_enabled ?? 1) : 1,
                      });
                    }}
                    className="input"
                  >
                    {roles.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
                {editingUser.role === 'ENGINEER' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">Tier</label>
                      <select
                        value={editingUser.tier || 'JUNIOR'}
                        onChange={(e) => setEditingUser({ ...editingUser, tier: e.target.value as 'JUNIOR' | 'MID' | 'SENIOR' })}
                        className="input"
                      >
                        <option value="JUNIOR">Junior</option>
                        <option value="MID">Mid</option>
                        <option value="SENIOR">Senior</option>
                      </select>
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Status</label>
                  <select
                    value={editingUser.status}
                    onChange={(e) => setEditingUser({ ...editingUser, status: e.target.value })}
                    className="input"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </div>
                <div>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); setShowResetModal(true); }}
                    className="inline-flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 font-medium"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                    Reset Password
                  </button>
                </div>
              </div>
            </div>
            </div>
          </form>
          </div>
        )}
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        isOpen={showResetModal}
        onClose={() => { setShowResetModal(false); setResetPassword(''); setResetPasswordConfirm(''); setResetError(''); setResetSuccess(false); }}
        title="Reset Password"
        size="sm"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        }
        footer={
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => { setShowResetModal(false); setResetPassword(''); setResetPasswordConfirm(''); setResetError(''); setResetSuccess(false); }}
              className={modalCancelButtonClass}
            >
              Cancel
            </button>
            <button
              onClick={(e) => handleResetPassword(e)}
              disabled={submitting || resetSuccess || !resetPassword || resetPassword.length < 8 || resetPassword !== resetPasswordConfirm}
              className={modalActionButtonClass}
            >
              {submitting && <span className="spinner w-4 h-4 border-2"></span>}
              {submitting ? 'Resetting...' : 'Reset Password'}
            </button>
          </div>
        }
      >
        <div className="bg-white -m-6 p-6">
        {resetSuccess ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-success-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-success-700 font-medium">Password has been reset successfully!</p>
          </div>
        ) : (
          <form className="space-y-4">
            {resetError && (
              <div className="bg-danger-50 border border-danger-200 text-danger-700 px-4 py-3 rounded-lg text-sm">
                {resetError}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">New Password *</label>
              <input
                type="password"
                value={resetPassword}
                onChange={(e) => {
                  setResetPassword(e.target.value);
                  setResetError('');
                }}
                placeholder="Min. 8 characters"
                required
                className={`input ${resetPassword && resetPassword.length < 8 ? 'border-danger-300 focus:border-danger-500 focus:ring-danger-500' : ''}`}
              />
              {resetPassword && resetPassword.length < 8 && (
                <p className="text-xs text-danger-600 mt-1">Password must be at least 8 characters</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Confirm Password *</label>
              <input
                type="password"
                value={resetPasswordConfirm}
                onChange={(e) => {
                  setResetPasswordConfirm(e.target.value);
                  setResetError('');
                }}
                placeholder="Confirm password"
                required
                className={`input ${resetPasswordConfirm && resetPassword !== resetPasswordConfirm ? 'border-danger-300 focus:border-danger-500 focus:ring-danger-500' : ''}`}
              />
              {resetPasswordConfirm && resetPassword !== resetPasswordConfirm && (
                <p className="text-xs text-danger-600 mt-1">Passwords do not match</p>
              )}
            </div>
          </form>
        )}
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => { setShowDeleteModal(false); setDeletingUserId(null); }}
        title="Confirm Delete"
        size="sm"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        }
      >
        <div className="bg-white -m-6 p-6">
        <div className="py-4">
          <p className="text-neutral-600">
            Are you sure you want to delete this user? This action cannot be undone.
          </p>
        </div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={() => { setShowDeleteModal(false); setDeletingUserId(null); }}
            className="btn-cancel px-5 py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              if (deletingUserId) {
                try {
                  await api.delete(`/users/${deletingUserId}`);
                  await load();
                } catch (err: any) {
                  setError(err.response?.data?.message || 'Failed to delete user');
                }
              }
              setShowDeleteModal(false);
              setDeletingUserId(null);
            }}
            className="btn-danger-solid px-6 py-2.5 text-sm font-semibold flex items-center gap-2"
          >
            Delete
          </button>
        </div>
        </div>
      </Modal>
    </div>
  );
}
