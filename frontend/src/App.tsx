import React, { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import AdminDashboard from './pages/AdminDashboard';
import EngineerDashboard from './pages/EngineerDashboard';
import EngineerDashboardHome from './pages/EngineerDashboardHome';
import ManagerDashboard from './pages/ManagerDashboard';
import ManagerReports from './pages/ManagerReports';
import UserDashboard from './pages/UserDashboard';
import Incidents from './pages/Incidents';
import Login from './pages/Login';
import Register from './pages/Register';
import Users from './pages/Users';
import MyIncidents from './pages/MyIncidents';
import IncidentDetailsPage from './pages/IncidentDetailsPage';
import CreateIncidentPage from './pages/CreateIncidentPage';
import SlaConfigurationPage from './pages/SlaConfigurationPage';
import CategoriesPage from './pages/CategoriesPage';
import SystemSettingsPage from './pages/SystemSettingsPage';
import api from './services/api';
import { Sidebar, Header } from './components';

interface User {
  id: string;
  username: string;
  email: string;
  full_name: string;
  first_name: string;
  last_name: string;
  role: string;
  status: string;
  last_login: string | null;
  created_at: string;
  phone: string | null;
  department: string | null;
  job_title: string | null;
  tier: 'JUNIOR' | 'MID' | 'SENIOR' | null;
}

function MainLayout() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [incidentCount, setIncidentCount] = useState(0);
  const navigate = useNavigate();

  const fetchUser = useCallback(async () => {
    const token = localStorage.getItem('nexum_token');
    if (token) {
      // First try to load from localStorage
      const savedUser = localStorage.getItem('nexum_user');
      if (savedUser) {
        try {
          setUser(JSON.parse(savedUser));
        } catch {
          // ignore parse error
        }
      }
      
      // Then refresh from API
      try {
        const r = await api.get('/auth/me');
        setUser(r.data.data);
        localStorage.setItem('nexum_user', JSON.stringify(r.data.data));
      } catch {
        // API failed, but we may have localStorage data
        if (!savedUser) {
          localStorage.removeItem('nexum_token');
          navigate('/login');
        }
      }
    }
    setLoading(false);
  }, [navigate]);

  const fetchIncidentCount = useCallback(async (currentUser: User | null = user) => {
    if (!currentUser) return;
    try {
      const r = await api.get('/incidents?limit=100&offset=0');
      const incidents = r.data.data.incidents || [];
      const role = currentUser.role === 'VIEWER' ? 'USER' : currentUser.role;
      const readKeys = role === 'USER'
        ? [`viewedIncidents_${currentUser.id}`, `nexum_read_incidents_${currentUser.id}`]
        : [`nexum_read_incidents_${currentUser.id}`];

      const readSet = new Set<string>();
      readKeys.forEach((readKey) => {
        const stored = localStorage.getItem(readKey);
        if (!stored) return;
        try {
          const parsed: string[] = JSON.parse(stored);
          parsed.forEach((id) => readSet.add(id));
        } catch {
          // ignore malformed old values
        }
      });

      const scopedIncidents = role === 'USER'
        ? incidents.filter((i: any) => i.created_by === currentUser.id)
        : role === 'ENGINEER'
        ? incidents.filter((i: any) => i.assigned_to === currentUser.id)
        : incidents;
      const unreadCount = scopedIncidents.filter((i: any) => !readSet.has(i.id)).length;
      setIncidentCount(unreadCount);
    } catch {
      // ignore
    }
  }, [user]);

  useEffect(() => {
    fetchUser();
  }, []);

  useEffect(() => {
    if (user) {
      fetchIncidentCount(user);
    }
  }, [user, fetchIncidentCount]);

  useEffect(() => {
    const handleReadUpdate = () => {
      fetchIncidentCount(user);
    };

    window.addEventListener('nexum-read-incidents-updated', handleReadUpdate);
    return () => window.removeEventListener('nexum-read-incidents-updated', handleReadUpdate);
  }, [user, fetchIncidentCount]);

  const logout = () => {
    localStorage.removeItem('nexum_token');
    localStorage.removeItem('nexum_user');
    setUser(null);
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-neutral-600 font-medium">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Normalize VIEWER to USER for backward compatibility
  const effectiveRole = user.role === 'VIEWER' ? 'USER' : user.role;

  // Always render content based on role
  return (
    <div className="h-screen flex flex-col">
      <Sidebar user={user} onLogout={logout} incidentCount={incidentCount} />
      <main className="ml-64 flex-1 overflow-y-auto scrollbar-sidebar p-6 bg-transparent">
        {effectiveRole === 'USER' ? (
          <Routes>
            <Route path="/" element={<UserDashboard user={user} />} />
            <Route path="/incidents" element={<MyIncidents user={user} />} />
            <Route path="/incidents/new" element={<CreateIncidentPage user={user} />} />
            <Route path="/incidents/:id" element={<IncidentDetailsPage user={user} onIncidentUpdate={fetchIncidentCount} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        ) : effectiveRole === 'ADMIN' || effectiveRole === 'MANAGER' ? (
          <Routes>
            <Route path="/" element={effectiveRole === 'MANAGER' ? <ManagerDashboard user={user} /> : <AdminDashboard user={user} />} />
            <Route path="/incidents" element={<Incidents user={user} onIncidentUpdate={fetchIncidentCount} />} />
            <Route path="/reports" element={effectiveRole === 'MANAGER' ? <ManagerReports user={user} /> : <Navigate to="/" replace />} />
            <Route path="/incidents/new" element={<CreateIncidentPage user={user} />} />
            <Route path="/incidents/:id" element={<IncidentDetailsPage user={user} onIncidentUpdate={fetchIncidentCount} />} />
            <Route path="/users" element={user.role === 'ADMIN' ? <Users user={user} /> : <Navigate to="/" replace />} />
            <Route path="/analytics" element={<Dashboard user={user} />} />
            {/* Admin Configuration Routes - ADMIN only */}
            <Route path="/admin/sla" element={user.role === 'ADMIN' ? <SlaConfigurationPage /> : <Navigate to="/" replace />} />
            <Route path="/admin/categories" element={user.role === 'ADMIN' ? <CategoriesPage /> : <Navigate to="/" replace />} />
            <Route path="/admin/settings" element={user.role === 'ADMIN' ? <SystemSettingsPage /> : <Navigate to="/" replace />} />
            <Route path="/settings" element={
              <div className="p-8">
                <Header user={user} title="Settings" subtitle="Manage your account settings" />
                <div className="mt-6 bg-white rounded-xl border border-neutral-200 p-6">
                  <p className="text-neutral-600">Settings page coming soon...</p>
                </div>
              </div>
            } />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        ) : effectiveRole === 'ENGINEER' ? (
          <Routes>
            <Route path="/" element={<EngineerDashboardHome user={user} />} />
            <Route path="/tasks" element={<EngineerDashboard user={user} />} />
            <Route path="/incidents" element={<Incidents user={user} onIncidentUpdate={fetchIncidentCount} />} />
            <Route path="/incidents/new" element={<CreateIncidentPage user={user} />} />
            <Route path="/incidents/:id" element={<IncidentDetailsPage user={user} onIncidentUpdate={fetchIncidentCount} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        ) : (
          <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
            <p className="text-yellow-700">Unknown role: {user.role}</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/*" element={<MainLayout />} />
      </Routes>
    </BrowserRouter>
  );
}
