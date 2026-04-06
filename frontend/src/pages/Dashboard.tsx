import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Header, Card, StatusBadge, SeverityBadge } from '../components';
import { formatDate, formatDateTime, generateNDI, isNewIncident } from '../utils/format';
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
import { Bar, Doughnut } from 'react-chartjs-2';

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
  last_login?: string | null;
  created_at?: string;
  phone?: string | null;
  department?: string | null;
  job_title?: string | null;
}

interface Incident {
  id: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  service_id: string;
  created_by: string;
  created_at: string;
}

interface DashboardProps {
  user: User | null;
  notifications?: any;
}

type PeriodFilter = 'week' | 'month' | 'all' | 'custom';

export default function Dashboard({ user, notifications }: DashboardProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [stats, setStats] = useState({
    total: 0,
    valid: 0,
    Canceled: 0,
    open: 0,
    in_progress: 0,
    critical: 0,
    resolved: 0,
    reopened: 0,
  });
  const [recentIncidents, setRecentIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  
  const [severityPeriodFilter, setSeverityPeriodFilter] = useState<PeriodFilter>('all');
  const [severityCustomStartDate, setSeverityCustomStartDate] = useState('');
  const [severityCustomEndDate, setSeverityCustomEndDate] = useState('');
  
  const [trendData, setTrendData] = useState<{ date: string; count: number }[]>([]);
  const [severityData, setSeverityData] = useState<{ CRITICAL: number; HIGH: number; MEDIUM: number; LOW: number }>({
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  });
  const { readIncidents, markAsRead } = useReadIncidents(user?.id);

  const isUnreadNew = (incident: Incident) => {
    return isNewIncident(incident.created_at) && !readIncidents.has(incident.id);
  };

  const getDateRange = () => {
    const now = new Date();
    let start: Date;
    let end = now;
    
    switch (periodFilter) {
      case 'week':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'all':
        start = new Date('2020-01-01');
        break;
      case 'custom':
        start = customStartDate ? new Date(customStartDate) : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        end = customEndDate ? new Date(customEndDate) : now;
        break;
      default:
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }
    
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
    };
  };

  const fetchStats = async () => {
    try {
      const { startDate, endDate } = getDateRange();
      const res = await api.get(`/incidents/stats/dashboard?startDate=${startDate}&endDate=${endDate}`);
      
      if (res.data.success) {
        const data = res.data.data;
        setStats({
          total: data.total || 0,
          Canceled: data.byStatus?.Canceled || 0,
          valid: (data.total || 0) - (data.byStatus?.Canceled || 0),
          open: data.byStatus?.OPEN || 0,
          in_progress: data.byStatus?.IN_PROGRESS || 0,
          critical: data.byPriority?.CRITICAL || 0,
          resolved: data.byStatus?.RESOLVED || 0,
          reopened: data.byStatus?.REOPENED || 0,
        });
        setTrendData(data.trend || []);
      }
    } catch (err: any) {
      console.error('Failed to fetch stats:', err);
    }
  };

  const fetchSeverityData = async () => {
    try {
      let startDate: string, endDate: string;
      const now = new Date();
      endDate = now.toISOString().split('T')[0];
      
      if (severityPeriodFilter === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        startDate = weekAgo.toISOString().split('T')[0];
      } else if (severityPeriodFilter === 'month') {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        startDate = monthAgo.toISOString().split('T')[0];
      } else if (severityPeriodFilter === 'custom' && severityCustomStartDate && severityCustomEndDate) {
        startDate = severityCustomStartDate;
        endDate = severityCustomEndDate;
      } else {
        startDate = '';
        endDate = '';
      }
      
      const url = startDate && endDate 
        ? `/incidents/stats/severity?startDate=${startDate}&endDate=${endDate}`
        : `/incidents/stats/severity`;
      const res = await api.get(url);
      
      if (res.data.success) {
        setSeverityData(res.data.data || { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 });
      }
    } catch (err: any) {
      console.error('Failed to fetch severity stats:', err);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await api.get('/incidents?limit=10&offset=0');
      const incidents = (res.data.data.incidents || []).sort(
        (a: Incident, b: Incident) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setRecentIncidents(incidents);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchData();
  }, [periodFilter, customStartDate, customEndDate]);

  useEffect(() => {
    fetchSeverityData();
  }, [severityPeriodFilter, severityCustomStartDate, severityCustomEndDate]);

  useEffect(() => {
    const restoreScrollY = (location.state as { restoreScrollY?: number } | null)?.restoreScrollY;
    const createSuccess = (location.state as { createSuccess?: string } | null)?.createSuccess;

    if (createSuccess) {
      setMsg(createSuccess);
      setTimeout(() => setMsg(''), 3000);
      fetchData();
      fetchStats();
    }

    if (typeof restoreScrollY === 'number') {
      requestAnimationFrame(() => {
        window.scrollTo({ top: restoreScrollY, behavior: 'auto' });
      });
    }

    if (typeof restoreScrollY === 'number' || createSuccess) {
      navigate(`${location.pathname}${location.search}`, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, location.search, navigate]);

  // Bar chart for weekly activity
  const activityChartData = {
    labels: trendData.map(t => {
      const date = new Date(t.date);
      return date.toLocaleDateString('en-GB', { weekday: 'short' });
    }),
    datasets: [
      {
        label: 'Incidents',
        data: trendData.map(t => t.count),
        backgroundColor: 'rgba(12, 142, 230, 0.8)',
        borderRadius: 8,
        borderSkipped: false,
      },
    ],
  };

  const severityChartData = {
    labels: ['Critical', 'High', 'Medium', 'Low'],
    datasets: [
      {
        data: [severityData.CRITICAL, severityData.HIGH, severityData.MEDIUM, severityData.LOW],
        backgroundColor: [
          'rgba(239, 68, 68, 0.9)',
          'rgba(249, 115, 22, 0.9)',
          'rgba(59, 130, 246, 0.9)',
          'rgba(34, 197, 94, 0.9)',
        ],
        borderWidth: 0,
        spacing: 2,
      },
    ],
  };

  const barChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          color: '#94a3b8',
        },
      },
      y: {
        grid: {
          color: 'rgba(148, 163, 184, 0.1)',
        },
        beginAtZero: true,
        ticks: {
          color: '#94a3b8',
          stepSize: 1,
        },
      },
    },
  };

  // Stats card component
  const StatCard = ({ title, value, color, icon, trend }: { title: string; value: number; color: string; icon: React.ReactNode; trend?: { value: number; direction: 'up' | 'down' } }) => {
    const colorClasses: Record<string, { bg: string; iconBg: string; text: string }> = {
      blue: { bg: 'from-neutral-800/40 to-neutral-900/70', iconBg: 'from-neutral-500 to-neutral-700', text: 'text-white' },
      red: { bg: 'from-neutral-800/40 to-neutral-900/70', iconBg: 'from-neutral-500 to-neutral-700', text: 'text-white' },
      yellow: { bg: 'from-neutral-800/40 to-neutral-900/70', iconBg: 'from-neutral-500 to-neutral-700', text: 'text-white' },
      purple: { bg: 'from-neutral-800/40 to-neutral-900/70', iconBg: 'from-neutral-500 to-neutral-700', text: 'text-white' },
      orange: { bg: 'from-neutral-800/40 to-neutral-900/70', iconBg: 'from-neutral-500 to-neutral-700', text: 'text-white' },
      green: { bg: 'from-neutral-800/40 to-neutral-900/70', iconBg: 'from-neutral-500 to-neutral-700', text: 'text-white' },
    };

    const c = colorClasses[color] || colorClasses.blue;

    return (
      <div
        className={`p-5 bg-gradient-to-br ${c.bg} border border-white/10 rounded-[4px] shadow-lg`}
        style={{ backgroundImage: 'radial-gradient(circle, rgba(19, 29, 48, 0.88) 0%, rgba(41, 46, 59, 0.92) 55%)' }}
      >
        <div className="flex items-start justify-between">
          <div className={`w-11 h-11 rounded-[4px] bg-gradient-to-br ${c.iconBg} flex items-center justify-center text-white shadow-lg`}>
            {icon}
          </div>
          {trend && (
            <span className={`text-xs font-semibold flex items-center gap-1 ${trend.direction === 'up' ? 'text-success-300' : 'text-danger-300'}`}>
              {trend.direction === 'up' ? ' ' : ' '}
              {trend.value}%
            </span>
          )}
        </div>
        <div className="mt-4">
          <p className="text-2xl font-bold text-white">{value}</p>
          <p className="text-sm text-neutral-300 mt-1">{title}</p>
        </div>
      </div>
    );
  };

  return (
    <div
      style={{
        background: 'linear-gradient(90deg, rgba(42, 123, 155, 0.08) 0%, rgba(87, 147, 199, 0.14) 50%, rgba(107, 103, 93, 0.10) 100%)',
      }}
    >
      <Header 
        user={user} 
        title="Dashboard" 
        subtitle={`Welcome back, ${user?.username || 'User'}`}
        actions={
          <button
            onClick={() => navigate('/incidents/new', { state: { from: `${location.pathname}${location.search}`, scrollY: window.scrollY } })}
            className="btn-pry1 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Incident
          </button>
        }
      />

      {error && (
        <div className="mx-6 mt-4 bg-danger-50/80 backdrop-blur border border-danger-200/50 text-danger-700 px-4 py-3 rounded-xl">
          {error}
        </div>
      )}

      {msg && (
        <div className="mx-6 mt-4 bg-success-50/80 backdrop-blur border border-success-200/50 text-success-700 px-4 py-3 rounded-xl">
          {msg}
        </div>
      )}

      {/* Stats Grid */}
      <div className="p-6 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <StatCard
          title="Total"
          value={stats.total}
          color="blue"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
        />
        <StatCard
          title="Valid"
          value={stats.valid}
          color="green"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
        <StatCard
          title="Canceled"
          value={stats.Canceled}
          color="red"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>}
        />
        <StatCard
          title="Open"
          value={stats.open}
          color="red"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
        <StatCard
          title="In Progress"
          value={stats.in_progress}
          color="yellow"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
        />
        <StatCard
          title="Reopened"
          value={stats.reopened}
          color="purple"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>}
        />
        <StatCard
          title="Critical"
          value={stats.critical}
          color="orange"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
        />
      </div>

      {/* Charts Row */}
      <div className="px-6 grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Weekly Activity Chart */}
        <Card className="lg:col-span-2" padding="none">
          <div className="px-6 py-4 border-b border-neutral-200/30 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-neutral-800">Weekly Activity</h3>
              <p className="text-xs text-neutral-500 mt-0.5">Incidents reported this period</p>
            </div>
            <select 
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value as PeriodFilter)}
              className="select text-xs py-2 w-32"
            >
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="all">All Time</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          {periodFilter === 'custom' && (
            <div className="flex items-center gap-3 px-6 py-3 bg-neutral-50/50 border-b border-neutral-200/30">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="input text-xs py-2"
              />
              <span className="text-neutral-400 text-xs">to</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="input text-xs py-2"
              />
            </div>
          )}
          <div className="p-4 h-44">
            <Bar data={activityChartData} options={barChartOptions} />
          </div>
        </Card>

        {/* Severity Distribution */}
        <Card padding="none">
          <div className="px-5 py-3 border-b border-neutral-200/30 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-neutral-800">By Urgency</h3>
              <p className="text-xs text-neutral-500">Urgency breakdown</p>
            </div>
            <select 
              value={severityPeriodFilter}
              onChange={(e) => setSeverityPeriodFilter(e.target.value as PeriodFilter)}
              className="select text-xs py-1.5 w-20"
            >
              <option value="week">Week</option>
              <option value="month">Month</option>
              <option value="all">All</option>
            </select>
          </div>
          <div className="p-4 h-44 flex items-center justify-center">
            <Doughnut 
              data={severityChartData} 
              options={{
                responsive: true,
                maintainAspectRatio: true,
                cutout: '65%',
                plugins: {
                  legend: {
                    position: 'bottom',
                    labels: {
                      padding: 8,
                      usePointStyle: true,
                      pointStyle: 'circle',
                      font: { size: 10 },
                    }
                  }
                }
              }} 
            />
          </div>
        </Card>
      </div>

      {/* Quick Actions & Recent Incidents */}
      <div className="px-6 py-4 grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Quick Actions */}
        <Card padding="none" className="bg-neutral-900/85 border-white/10">
          <div className="px-6 py-4 border-b border-white/10">
            <h3 className="text-base font-bold text-white">Quick Actions</h3>
          </div>
          <div className="p-4 space-y-2">
            <button
              onClick={() => navigate('/incidents/new', { state: { from: `${location.pathname}${location.search}`, scrollY: window.scrollY } })}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/10 transition-all duration-200 group"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neutral-500 to-neutral-700 flex items-center justify-center text-white shadow-lg shadow-neutral-700/30 group-hover:scale-110 transition-transform">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <div className="text-left">
                <p className="font-semibold text-white text-sm">Create Incident</p>
                <p className="text-xs text-neutral-300">Report a new issue</p>
              </div>
            </button>
            <Link to="/incidents" className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/10 transition-all duration-200 group">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neutral-500 to-neutral-700 flex items-center justify-center text-white shadow-lg shadow-neutral-700/30 group-hover:scale-110 transition-transform">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-white text-sm">View Incidents</p>
                <p className="text-xs text-neutral-300">Browse all tickets</p>
              </div>
            </Link>
            {user?.role === 'ADMIN' && (
              <Link to="/users" className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/10 transition-all duration-200 group">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neutral-500 to-neutral-700 flex items-center justify-center text-white shadow-lg shadow-neutral-700/30 group-hover:scale-110 transition-transform">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-white text-sm">Manage Users</p>
                  <p className="text-xs text-neutral-300">Team & roles</p>
                </div>
              </Link>
            )}
          </div>
        </Card>

        {/* Recent Incidents */}
        <Card className="lg:col-span-2 bg-neutral-900/85 border-white/10" padding="none">
          <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white">Recent Incidents</h3>
              <p className="text-xs text-neutral-300 mt-0.5">Latest reported issues</p>
            </div>
            <Link to="/incidents" className="text-xs text-neutral-200 hover:text-white font-semibold flex items-center gap-1 group">
              View All 
              <svg className="w-3 h-3 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
          {loading ? (
            <div className="p-8 text-center">
              <div className="w-8 h-8 border-4 border-neutral-300 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
              <p className="text-neutral-300 text-sm">Loading...</p>
            </div>
          ) : recentIncidents.length === 0 ? (
            <div className="p-8 text-center">
              <div className="w-12 h-12 mx-auto bg-white/10 rounded-xl flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-neutral-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
              </div>
              <p className="text-neutral-300 font-medium text-sm">No incidents yet</p>
            </div>
          ) : (
            <div className="divide-y divide-white/10">
              {recentIncidents.slice(0, 5).map((incident) => (
                <div
                  key={incident.id}
                  className="px-6 py-3 hover:bg-white/5 transition-colors cursor-pointer group"
                  onClick={() => {
                    markAsRead(incident.id);
                    navigate(`/incidents/${incident.id}`, { state: { from: '/', scrollY: window.scrollY } });
                  }}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-bold text-neutral-100 truncate group-hover:text-white transition-colors text-base">{incident.title}</p>
                        {isUnreadNew(incident) && (
                          <span className="flex items-center gap-1.5 px-2 py-0.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-[10px] font-bold uppercase tracking-wider rounded-full shadow-sm">
                            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>
                            New
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-neutral-300">
                        <span className="font-semibold">Incident ID {generateNDI(incident.id)}</span>
                        <span className="text-neutral-500">•</span>
                        <span className="font-medium">{formatDateTime(incident.created_at)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <SeverityBadge severity={incident.severity} size="sm" />
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
