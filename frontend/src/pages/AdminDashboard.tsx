import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Header, Card, StatusBadge, PriorityBadge } from '../components';
import {
  formatDateTime,
  generateNDI,
  getPrioritySource,
  isActiveStatus,
  isResolvedStatus,
  normalizePriorityLevel,
  normalizeStatus,
} from '../utils/format';
import { useReadIncidents } from '../hooks/useReadIncidents';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler,
} from 'chart.js';
import { Doughnut, Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler
);

interface User {
  id: string;
  username: string;
  email: string;
  full_name?: string;
  role: string;
  status?: string;
}

interface Incident {
  id: string;
  title: string;
  description: string;
  severity: string;
  priority: string;
  calculated_priority?: string;
  urgency?: string;
  status: string;
  created_at: string;
  resolved_at?: string;
  sla_deadline?: string;
  sla_percent_consumed?: number;
  sla_percent_at_resolve?: number;
}

interface DashboardProps {
  user: User | null;
}

interface KPIs {
  totalUsers: number;
  activeUsers: number;
  totalIncidents: number;
  slaCompliance: number;
  openIncidents: number;
  criticalIncidents: number;
}

interface SlaPolicy {
  id: string;
  priority: number;
  name: string;
  resolution_hours: number;
  business_hours_only: number;
  business_hours_config_id: string | null;
  business_hours_config_name?: string;
  is_active: number;
}

interface BusinessHour {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_working_day: number;
}

interface BusinessHoursConfig {
  id: string;
  name: string;
  hours: BusinessHour[];
}

type PeriodFilter = 'week' | 'month' | 'all';
const ROUND_THE_CLOCK_CONFIG_ID = 'bhcfg-24x7';

export default function AdminDashboard({ user }: DashboardProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [kpis, setKpis] = useState<KPIs>({
    totalUsers: 0,
    activeUsers: 0,
    totalIncidents: 0,
    slaCompliance: 100,
    openIncidents: 0,
    criticalIncidents: 0,
  });

  const [recentIncidents, setRecentIncidents] = useState<Incident[]>([]);
  const [trendData, setTrendData] = useState<{ day: string; count: number }[]>([]);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('week');
  const [usersByRole, setUsersByRole] = useState<{ admins: number; managers: number; engineers: number; users: number }>({
    admins: 0, managers: 0, engineers: 0, users: 0,
  });
  const [incidentsByStatus, setIncidentsByStatus] = useState<{ open: number; inProgress: number; pending: number; resolved: number; Canceled: number; reopened: number }>({
    open: 0, inProgress: 0, pending: 0, resolved: 0, Canceled: 0, reopened: 0,
  });

  const { markAsRead, isUnreadIncident } = useReadIncidents(user?.id);

  const [slaPolicies, setSlaPolicies] = useState<SlaPolicy[]>([]);
  const [businessHoursByConfigId, setBusinessHoursByConfigId] = useState<Record<string, BusinessHoursConfig>>({});


  const getResolvedSlaPercent = (incident: Incident): number | null => {
    if (typeof incident.sla_percent_consumed === 'number' && Number.isFinite(incident.sla_percent_consumed)) {
      return incident.sla_percent_consumed;
    }
    if (typeof incident.sla_percent_at_resolve === 'number' && Number.isFinite(incident.sla_percent_at_resolve)) {
      return incident.sla_percent_at_resolve;
    }
    return null;
  };

  useEffect(() => {
    fetchData();
    fetchSlaPolicies();
  }, [periodFilter]);

  const fetchSlaPolicies = async () => {
    try {
      const [policiesRes, businessHoursRes] = await Promise.all([
        api.get('/admin/sla-policies'),
        api.get('/admin/business-hours'),
      ]);

      const activePolicies = (policiesRes.data.data || []).filter((p: SlaPolicy) => p.is_active);
      setSlaPolicies(activePolicies);

      const configs: BusinessHoursConfig[] = businessHoursRes.data.data || [];
      const configMap = configs.reduce((acc, config) => {
        acc[config.id] = config;
        return acc;
      }, {} as Record<string, BusinessHoursConfig>);
      setBusinessHoursByConfigId(configMap);
    } catch (err) {
      setSlaPolicies([]);
      setBusinessHoursByConfigId({});
    }
  };

  const getBusinessHoursSummary = (policy: SlaPolicy) => {
    if (!policy.business_hours_only || policy.business_hours_config_id === ROUND_THE_CLOCK_CONFIG_ID) {
      return '24/7';
    }

    if (!policy.business_hours_config_id) {
      return 'Not configured';
    }

    const config = businessHoursByConfigId[policy.business_hours_config_id];
    if (!config) {
      return policy.business_hours_config_name || 'Business hours';
    }

    const workingDays = (config.hours || []).filter(h => !!h.is_working_day);
    if (workingDays.length === 0) {
      return `${config.name}: Off`;
    }

    const uniqueRanges = Array.from(new Set(workingDays.map(h => `${h.start_time}-${h.end_time}`)));
    if (uniqueRanges.length === 1) {
      return `${config.name}: ${uniqueRanges[0]}`;
    }

    return `${config.name}: Custom`;
  };

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch users
      const usersRes = await api.get('/users');
      const allUsers = usersRes.data.data.users || [];
      const totalUsers = allUsers.length;
      const activeUsers = allUsers.filter((u: any) => u.status === 'ACTIVE').length;
      const admins = allUsers.filter((u: any) => u.role === 'ADMIN').length;
      const managers = allUsers.filter((u: any) => u.role === 'MANAGER').length;
      const engineers = allUsers.filter((u: any) => u.role === 'ENGINEER').length;
      const regularUsers = allUsers.filter((u: any) => u.role === 'USER').length;
      setUsersByRole({ admins, managers, engineers, users: regularUsers });

      // Fetch all incidents
      const incidentsRes = await api.get('/incidents?limit=10000');
      const allIncidents: Incident[] = incidentsRes.data.data.incidents || [];

      // Calculate KPIs
      const openIncidents = allIncidents.filter(i => isActiveStatus(i.status)).length;
      const criticalIncidents = allIncidents.filter(i => 
        isActiveStatus(i.status) && normalizePriorityLevel(getPrioritySource(i)) === 1
      ).length;

      // SLA Compliance
      const resolvedIncidents = allIncidents.filter(i => isResolvedStatus(i.status));
      const resolvedWithinSla = resolvedIncidents.filter(i => {
        const resolvedPercent = getResolvedSlaPercent(i);
        if (resolvedPercent !== null) {
          return resolvedPercent < 100;
        }
        if (i.resolved_at && i.sla_deadline) {
          return new Date(i.resolved_at) <= new Date(i.sla_deadline);
        }
        return true;
      }).length;
      const slaCompliance = resolvedIncidents.length > 0 
        ? Math.round((resolvedWithinSla / resolvedIncidents.length) * 100)
        : 100;

      setKpis({
        totalUsers,
        activeUsers,
        totalIncidents: allIncidents.length,
        slaCompliance,
        openIncidents,
        criticalIncidents,
      });

      // Status distribution
      setIncidentsByStatus({
        open: allIncidents.filter(i => normalizeStatus(i.status) === 'OPEN').length,
        inProgress: allIncidents.filter(i => normalizeStatus(i.status) === 'IN_PROGRESS').length,
        pending: allIncidents.filter(i => normalizeStatus(i.status) === 'PENDING').length,
        resolved: allIncidents.filter(i => normalizeStatus(i.status) === 'RESOLVED').length,
        Canceled: allIncidents.filter(i => normalizeStatus(i.status) === 'Canceled').length,
        reopened: allIncidents.filter(i => normalizeStatus(i.status) === 'REOPENED').length,
      });

      // Trend data
      const dateRange = calculateDateRange(periodFilter, allIncidents);
      const incidentsByDay = dateRange.map(({ date, dayName }) => {
        const count = allIncidents.filter(i => {
          const createdDate = new Date(i.created_at).toISOString().split('T')[0];
          return createdDate === date;
        }).length;
        return { day: dayName, count };
      });
      setTrendData(incidentsByDay);

      // Recent incidents
      const recent = [...allIncidents]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5);
      setRecentIncidents(recent);

      setError('');
    } catch (err: any) {
      console.error('Failed to load dashboard:', err);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const calculateDateRange = (period: string, incidents: Incident[]) => {
    const today = new Date();
    let dateRange: { date: string; dayName: string }[] = [];

    if (period === 'month') {
      const daysInMonth = 30;
      dateRange = Array.from({ length: daysInMonth }, (_, i) => {
        const date = new Date(today);
        date.setDate(date.getDate() - (daysInMonth - 1 - i));
        return {
          date: date.toISOString().split('T')[0],
          dayName: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        };
      });
    } else if (period === 'all') {
      const allDates = new Set<string>();
      incidents.forEach(i => {
        const d = new Date(i.created_at).toISOString().split('T')[0];
        allDates.add(d);
      });
      const sortedDates = Array.from(allDates).sort().slice(-30);
      dateRange = sortedDates.map(date => ({
        date,
        dayName: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      }));
    } else {
      // Week
      dateRange = Array.from({ length: 7 }, (_, i) => {
        const date = new Date(today);
        date.setDate(date.getDate() - (6 - i));
        return {
          date: date.toISOString().split('T')[0],
          dayName: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()],
        };
      });
    }
    return dateRange;
  };

  // Chart data
  const trendChartData = {
    labels: trendData.map(d => d.day),
    datasets: [{
      label: 'Incidents',
      data: trendData.map(d => d.count),
      borderColor: 'rgba(59, 130, 246, 1)',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      tension: 0.4,
      fill: true,
      pointBackgroundColor: 'rgba(59, 130, 246, 1)',
      pointRadius: 3,
    }],
  };

  const userRoleChartData = {
    labels: ['Admins', 'Managers', 'Engineers', 'Users'],
    datasets: [{
      data: [usersByRole.admins, usersByRole.managers, usersByRole.engineers, usersByRole.users],
      backgroundColor: [
        'rgba(239, 68, 68, 0.85)',
        'rgba(249, 115, 22, 0.85)',
        'rgba(59, 130, 246, 0.85)',
        'rgba(34, 197, 94, 0.85)',
      ],
      borderWidth: 0,
    }],
  };

  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#525252', font: { size: 10 } } },
      y: { grid: { color: 'rgba(148, 163, 184, 0.1)' }, beginAtZero: true, ticks: { color: '#94a3b8', stepSize: 1 } },
    },
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '55%',
    plugins: {
      legend: {
        position: 'right' as const,
        labels: { padding: 10, usePointStyle: true, pointStyle: 'circle', font: { size: 10 } },
      },
    },
  };

  // Compact StatCard component
  const StatCard = ({ 
    title, value, color, icon, onClick, suffix 
  }: { 
    title: string; value: number; color: string; icon: React.ReactNode; onClick?: () => void; suffix?: string;
  }) => {
    const colorClasses: Record<string, { iconBg: string }> = {
      blue: { iconBg: 'from-blue-500 to-blue-600' },
      red: { iconBg: 'from-red-500 to-red-600' },
      yellow: { iconBg: 'from-yellow-500 to-yellow-600' },
      orange: { iconBg: 'from-orange-500 to-orange-600' },
      green: { iconBg: 'from-green-500 to-green-600' },
      purple: { iconBg: 'from-purple-500 to-purple-600' },
    };
    const c = colorClasses[color] || colorClasses.blue;

    return (
      <div
        onClick={onClick}
        className={`p-4 border border-white/20 rounded-[4px] hover:-translate-y-0.5 hover:shadow-md transition-all duration-300 ${onClick ? 'cursor-pointer' : ''}`}
        style={{ background: 'radial-gradient(circle, rgba(19, 29, 48, 0.91) 0%, rgba(41, 46, 59, 0.95) 51%)' }}
      >
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-[4px] bg-gradient-to-br ${c.iconBg} flex items-center justify-center text-white shadow-md flex-shrink-0 [&>svg]:w-5 [&>svg]:h-5`}>
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-xl font-bold text-white leading-tight">{value}{suffix}</p>
            <p className="text-xs text-neutral-300 truncate">{title}</p>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-neutral-600 font-medium">Loading dashboard...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-transparent">
      <Header 
        user={user} 
        title="Admin Dashboard" 
        subtitle={`System Overview - Welcome, ${user?.full_name || user?.username || 'Admin'}!`}
        actions={
          <div className="flex gap-2">
            <Link
              to="/users"
              className="btn-pry1 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              Manage Users
            </Link>
            <button
              onClick={() => navigate('/incidents/new', { state: { from: `${location.pathname}${location.search}`, scrollY: window.scrollY } })}
              className="btn-pry1 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Incident
            </button>
          </div>
        }
      />

      {error && (
        <div className="mx-6 mt-4 bg-gradient-to-r from-danger-50 to-danger-100/80 border border-danger-300/70 text-danger-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="mx-6 mt-4 bg-gradient-to-r from-success-50 to-success-100/80 border border-success-300/70 text-success-700 px-4 py-3 rounded-xl text-sm">
          {successMsg}
        </div>
      )}

      {/* KPI Cards - 6 in one row */}
      <div className="px-6 py-4 flex-shrink-0">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard
            title="Total Users"
            value={kpis.totalUsers}
            color="blue"
            onClick={() => navigate('/users')}
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
          />
          <StatCard
            title="Active Users"
            value={kpis.activeUsers}
            color="green"
            onClick={() => navigate('/users')}
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>}
          />
          <StatCard
            title="Total Incidents"
            value={kpis.totalIncidents}
            color="purple"
            onClick={() => navigate('/incidents')}
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
          />
          <StatCard
            title="SLA Compliance"
            value={kpis.slaCompliance}
            color="blue"
            suffix="%"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>}
          />
          <StatCard
            title="Open Incidents"
            value={kpis.openIncidents}
            color="yellow"
            onClick={() => navigate('/incidents?filter=active')}
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
          <StatCard
            title="Critical"
            value={kpis.criticalIncidents}
            color="red"
            onClick={() => navigate('/incidents?filter=critical')}
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
          />
        </div>
      </div>

      {/* Charts Row 1: Incidents Trend | Users by Role */}
      <div className="px-6 pb-4 grid grid-cols-1 lg:grid-cols-2 gap-4 flex-shrink-0">
        {/* Incidents Trend */}
        <Card className="p-4 shadow-none rounded-none">
          <div className="flex items-start justify-between mb-3 gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-neutral-900">Incidents Trend</h3>
              <p className="text-xs text-neutral-500">System volume over time</p>
            </div>
            <div className="grid grid-cols-3 gap-1 bg-neutral-100 p-1 rounded-lg">
              {(['week', 'month', 'all'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriodFilter(p)}
                  className={`px-2 py-1 rounded-none text-xs font-semibold transition-colors ${periodFilter === p ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'}`}
                >
                  {p === 'week' ? 'Week' : p === 'month' ? 'Month' : 'All'}
                </button>
              ))}
            </div>
          </div>
          <div className="h-48">
            <Line data={trendChartData} options={lineChartOptions} />
          </div>
        </Card>

        {/* Users by Role */}
        <Card className="p-4 shadow-none rounded-none">
          <div className="flex items-center mb-0.5 gap-2">
            <h3 className="text-sm font-bold text-neutral-900">Users by Role</h3>
          </div>
          <div className="flex h-48">
            <div className="flex-1 flex flex-col justify-start items-start">
              <p className="text-xs text-neutral-500 mb-0.5">System user distribution</p>
              <Doughnut data={userRoleChartData} options={doughnutOptions} />
            </div>
            <div className="w-px bg-neutral-200 mx-4"></div>
            <div className="flex-1 flex flex-col justify-center items-start pl-4">
              <h4 className="text-sm font-bold text-black mb-2">SLA Policy</h4>
              <div className="space-y-2 text-xs w-full max-h-40 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                {slaPolicies && slaPolicies.length > 0 ? (
                  slaPolicies.map((policy) => (
                    <div key={policy.id} className="border-b border-neutral-100 pb-2 mb-2 last:border-b-0 last:mb-0 last:pb-0">
                      <div className="flex justify-between w-full">
                        <span
                          className={`font-semibold
                            ${String(policy.priority) === '1' ? 'text-danger-700'
                              : String(policy.priority) === '2' ? 'text-warning-600'
                              : String(policy.priority) === '3' ? 'text-primary-700'
                              : 'text-neutral-600'}
                          `}
                        >
                          {policy.name} (PRY{policy.priority})
                        </span>
                      </div>
                      <div className="flex justify-between w-full">
                        <span className="text-neutral-600">Resolution Time:</span>
                        <span className="font-semibold text-primary-700">{policy.resolution_hours}h</span>
                      </div>
                      <div className="flex justify-between w-full">
                        <span className="text-neutral-600">Business Hours:</span>
                        <span className="font-semibold text-primary-700">{getBusinessHoursSummary(policy)}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-neutral-400">No SLA policies found.</div>
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Charts Row 2: Incidents by Status | Recent Incidents */}
      <div className="px-6 pb-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Incidents by Status - Clickable Buttons */}
        <Card className="p-5 shadow-none rounded-none">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-neutral-900">By Status</h3>
            <p className="text-xs text-neutral-500">Click to filter</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => navigate('/incidents?filter=status-open')}
              className="p-4 rounded-none bg-gradient-to-br from-red-50 to-red-100 border border-red-200 hover:shadow-md hover:-translate-y-0.5 transition-all group text-center"
            >
              <p className="text-xl font-bold text-red-700">{incidentsByStatus.open}</p>
              <p className="text-xs text-red-600 font-medium">Open</p>
            </button>
            <button
              onClick={() => navigate('/incidents?filter=status-in_progress')}
              className="p-4 rounded-none bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 hover:shadow-md hover:-translate-y-0.5 transition-all group text-center"
            >
              <p className="text-xl font-bold text-blue-700">{incidentsByStatus.inProgress}</p>
              <p className="text-xs text-blue-600 font-medium">In Progress</p>
            </button>
            <button
              onClick={() => navigate('/incidents?filter=status-pending')}
              className="p-4 rounded-none bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 hover:shadow-md hover:-translate-y-0.5 transition-all group text-center"
            >
              <p className="text-xl font-bold text-orange-700">{incidentsByStatus.pending}</p>
              <p className="text-xs text-orange-600 font-medium">Pending</p>
            </button>
            <button
              onClick={() => navigate('/incidents?filter=status-resolved')}
              className="p-4 rounded-none bg-gradient-to-br from-green-50 to-green-100 border border-green-200 hover:shadow-md hover:-translate-y-0.5 transition-all group text-center"
            >
              <p className="text-xl font-bold text-green-700">{incidentsByStatus.resolved}</p>
              <p className="text-xs text-green-600 font-medium">Resolved</p>
            </button>
            <button
              onClick={() => navigate('/incidents?filter=status-Canceled')}
              className="p-4 rounded-none bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 hover:shadow-md hover:-translate-y-0.5 transition-all group text-center"
            >
              <p className="text-xl font-bold text-gray-700">{incidentsByStatus.Canceled}</p>
              <p className="text-xs text-gray-600 font-medium">Canceled</p>
            </button>
            <button
              onClick={() => navigate('/incidents?filter=status-reopened')}
              className="p-4 rounded-none bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 hover:shadow-md hover:-translate-y-0.5 transition-all group text-center"
            >
              <p className="text-xl font-bold text-purple-700">{incidentsByStatus.reopened}</p>
              <p className="text-xs text-purple-600 font-medium">Reopened</p>
            </button>
          </div>
        </Card>

        {/* Recent Incidents */}
        <Card className="shadow-none overflow-hidden flex flex-col rounded-none" padding="none">
          <div className="px-5 py-3 border-b border-neutral-200 flex items-center justify-between flex-shrink-0">
            <div>
              <h3 className="text-sm font-bold text-neutral-900">Recent Incidents</h3>
              <p className="text-xs text-neutral-500">Latest reported</p>
            </div>
            <Link to="/incidents" className="text-xs text-primary-600 hover:text-primary-700 font-semibold flex items-center gap-1 group">
              View All 
              <svg className="w-3 h-3 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
          {recentIncidents.length === 0 ? (
            <div className="p-6 text-center">
              <div className="w-10 h-10 mx-auto bg-neutral-100 rounded-lg flex items-center justify-center mb-2">
                <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
              </div>
              <p className="text-neutral-500 text-sm">No incidents yet</p>
            </div>
          ) : (
            <div className="divide-y divide-neutral-100 overflow-y-auto max-h-72">
              {recentIncidents.slice(0, 5).map((incident) => (
                <div
                  key={incident.id}
                  className="px-5 py-3 hover:bg-neutral-50 transition-colors cursor-pointer group"
                  onClick={() => {
                    markAsRead(incident.id);
                    navigate(`/incidents/${incident.id}`, { state: { from: '/', scrollY: window.scrollY } });
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="mb-0.5">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-neutral-900 truncate text-sm group-hover:text-primary-600 transition-colors mb-0">{incident.title}</p>
                          {isUnreadIncident(incident) && (
                            <span className="shrink-0 flex items-center" title="Unread incident">
                              <span className="w-2 h-2 bg-red-600 rounded-full animate-pulse border border-white"></span>
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-semibold text-neutral-500 block mt-0.5">Incident ID {generateNDI(incident.id)}</span>
                        <span className="text-xs text-neutral-400 block mt-0.5">{formatDateTime(incident.created_at)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <PriorityBadge priority={incident.priority || '4'} format="numbered" size="sm" />
                      <StatusBadge status={incident.status} size="sm" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
