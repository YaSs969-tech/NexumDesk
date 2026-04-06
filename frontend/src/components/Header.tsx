import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import Modal from './Modal';
import { authApi } from '../services/api';

interface HeaderProps {
  user: {
    id: string;
    username: string;
    email: string;
    full_name?: string;
    role: string;
    status?: string;
  } | null;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

interface Notification {
  id: string;
  incident_id?: string;
  incident_title?: string;
  subject?: string;
  type: string;
  message: string;
  created_at: string;
  read?: boolean;
  status?: 'READ' | 'UNREAD';
}

export default function Header({ user, title, subtitle, actions }: HeaderProps) {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);

  const displayName = user?.username || (user?.email ? user.email.split('@')[0] : 'User');

  useEffect(() => {
    if (user) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 30000);
      return () => clearInterval(interval);
    }
  }, [user]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isRead = (n: Notification) => n.read === true || n.status === 'READ';

  const fetchNotifications = async () => {
    try {
      const res = await api.get('/incidents/notifications');
      const notifs: Notification[] = (res.data.data || []).map((n: any) => ({
        ...n,
        read: n.read ?? n.status === 'READ',
      }));
      setNotifications(notifs);
      setUnreadCount(notifs.filter((n: Notification) => !isRead(n)).length);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  };

  const markAsRead = async (id: string) => {
    const notif = notifications.find((n) => n.id === id);
    if (!notif || isRead(notif)) return;
    try {
      await api.put(`/incidents/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true, status: 'READ' } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const clearAll = async () => {
    try {
      await api.delete('/incidents/notifications');
      setNotifications([]);
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to clear notifications:', err);
    }
  };

  const handleNotificationClick = async (notif: Notification) => {
    await markAsRead(notif.id);
    setShowNotifications(false);
    if (notif.incident_id) {
      navigate(`/incidents/${notif.incident_id}`);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('ro-RO', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const resetPasswordForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setPasswordError('');
    setPasswordSuccess('');
  };

  const handleOpenPasswordModal = () => {
    resetPasswordForm();
    setShowPasswordModal(true);
  };

  const handleChangePassword = async () => {
    setPasswordError('');
    setPasswordSuccess('');

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      setPasswordError('All password fields are required.');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }

    try {
      setChangingPassword(true);
      await authApi.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_new_password: confirmNewPassword,
      });
      setPasswordSuccess('Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setTimeout(() => {
        setShowPasswordModal(false);
      }, 800);
    } catch (err: any) {
      setPasswordError(err.message || 'Failed to change password.');
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <>
    <header className="-mx-6 -mt-6 mb-6 bg-white/95 backdrop-blur-md border-b border-neutral-200/70 px-8 py-5 sticky top-0 z-30">
      <div className="flex items-center justify-between">
        <div className="animate-slide-down ml-4 lg:ml-6">
          <h1 className="text-2xl font-bold text-neutral-800 tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-neutral-500 mt-1">{subtitle}</p>}
        </div>
        
        <div className="flex items-center gap-3">
          {/* Quick actions */}
          {actions}

          {/* Notifications */}
          <div className="relative" ref={notificationRef}>
            <button 
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-xl transition-all duration-200 group"
            >
              <svg className="w-5 h-5 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-gradient-to-r from-danger-500 to-danger-600 text-white text-xs font-bold rounded-full flex items-center justify-center shadow-lg shadow-danger-500/30">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Notifications Dropdown */}
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 rounded-[4px] shadow-xl border border-neutral-200 overflow-hidden animate-slide-down">
                <div className="px-4 py-3 border-b border-neutral-200/30 flex items-center justify-between" style={{ background: 'radial-gradient(circle, rgba(19, 29, 48, 0.91) 0%, rgba(41, 46, 59, 0.95) 51%)' }}>
                  <h3 className="font-semibold text-white">Notifications</h3>
                  {notifications.length > 0 && (
                    <button onClick={clearAll} className="text-xs text-neutral-300 hover:text-white font-medium">
                      Clear all
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto scrollbar-sidebar bg-neutral-50">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center">
                      <div className="w-12 h-12 mx-auto rounded-full flex items-center justify-center mb-3 bg-neutral-200">
                        <svg className="w-6 h-6 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                        </svg>
                      </div>
                      <p className="text-neutral-600 text-sm">No notifications</p>
                    </div>
                  ) : (
                    notifications.map((notif) => (
                      <div 
                        key={notif.id} 
                        onClick={() => handleNotificationClick(notif)}
                        className={`px-4 py-3 hover:bg-neutral-100 cursor-pointer transition-colors border-b border-neutral-200 last:border-0 ${!isRead(notif) ? 'bg-white' : ''}`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${!isRead(notif) ? 'bg-danger-500' : 'bg-neutral-400'}`}></div>
                          <div className="flex-1 min-w-0">
                            {notif.incident_title && (
                              <p className="text-xs font-semibold text-blue-700 hover:text-blue-800 underline underline-offset-2 mb-1">
                                {notif.incident_title}
                              </p>
                            )}
                            <p className="text-sm text-neutral-800">{notif.message}</p>
                            <p className="text-xs text-neutral-500 mt-1">{formatTime(notif.created_at)}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {user && (
            <div
              className="hidden lg:flex items-center gap-3 pl-3 ml-1 border-l border-neutral-200 cursor-pointer"
              onClick={handleOpenPasswordModal}
              title="Profile settings"
            >
              <span
                className="w-11 h-11 rounded flex items-center justify-center shadow-xl border border-white/30 transition-transform duration-200 hover:scale-110 hover:-translate-y-1"
                style={{
                  background: 'linear-gradient(135deg, #6a5af9 0%, #38bdf8 100%)', // mov-albastru modern
                  boxShadow: '0 8px 24px 0 rgba(106,90,249,0.30), 0 2px 8px 0 rgba(56,189,248,0.20)'
                }}
                aria-hidden="true"
              >
                <svg className="w-6 h-6 text-white" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="8" r="3" />
                  <path d="M7 18c0-2.5 3-4 5-4s5 1.5 5 4" />
                </svg>
              </span>
              <div>
                <p className="text-sm font-semibold text-neutral-800 capitalize">{displayName}</p>
                <p className="text-xs text-neutral-500">{user.email}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>

      <Modal
        isOpen={showPasswordModal}
        onClose={() => {
          setShowPasswordModal(false);
          resetPasswordForm();
        }}
        title="Change Password"
        size="md"
        icon={
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        }
        footer={
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setShowPasswordModal(false);
                resetPasswordForm();
              }}
              className="btn-cancel px-4 py-2 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleChangePassword}
              disabled={changingPassword}
              className="btn-action-reopen px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {changingPassword ? 'Saving...' : 'Save Password'}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          {passwordError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {passwordError}
            </div>
          )}
          {passwordSuccess && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
              {passwordSuccess}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Current password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="input"
              autoComplete="current-password"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="input"
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Confirm new password</label>
            <input
              type="password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              className="input"
              autoComplete="new-password"
            />
          </div>
        </div>
      </Modal>
    </>
  );
}
