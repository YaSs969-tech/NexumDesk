import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Header, Card, StatusBadge, PriorityBadge } from '../components';
import {
  formatDate,
  formatDateTime,
  generateNDI,
  getPrioritySource,
  getSeveritySource,
  isActiveStatus,
  normalizePriorityLevel,
  normalizeSeverityLevel,
} from '../utils/format';
import { useReadIncidents } from '../hooks/useReadIncidents';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

interface User {
  id: string;
  username: string;
  email: string;
  full_name?: string;
  role: string;
}

interface Incident {
  id: string;
  title: string;
  description: string;
  severity: string;
  calculated_severity?: string;
  priority: string;
  calculated_priority?: string;
  urgency?: string;
  status: string;
  service_id: string;
  service_name?: string;
  category?: string;
  created_by: string;
  created_by_name?: string;
  assigned_to?: string;
  assigned_to_name?: string;
  created_at: string;
  updated_at: string;
  detected_at: string;
  estimated_resolution_time?: number;
  resolution_time?: number;
  resolution_notes?: string;
  sla_deadline?: string;
  response_deadline?: string;
  response_time_confirmed_at?: string;
}

export default function EngineerDashboardHome({ user }: { user: User }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [trendData, setTrendData] = useState<{ day: string; count: number }[]>([]);
  const [periodFilter, setPeriodFilter] = useState<'week' | 'month' | 'all' | 'custom'>('week');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const { markAsRead, isUnreadIncident } = useReadIncidents(user.id);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // KPIs for Engineer
  const [kpis, setKpis] = useState({
    assignedToMe: 0,
    criticalIncidents: 0,
    slaExpiringToday: 0,
    responseExpiringToday: 0,
    overdueTasks: 0,
  });

  useEffect(() => {
    loadData();
  }, [periodFilter, customStartDate, customEndDate]);

  // Auto-hide notifications
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  useEffect(() => {
    const restoreScrollY = (location.state as { restoreScrollY?: number } | null)?.restoreScrollY;
    const createSuccess = (location.state as { createSuccess?: string } | null)?.createSuccess;

    if (createSuccess) {
      setSuccessMsg(createSuccess);
      loadData();
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

  const loadData = async () => {
    try {
      setLoading(true);
      const incidentsRes = await api.get('/incidents?limit=5000&page=1');
      const allIncidents = Array.isArray(incidentsRes.data) 
        ? incidentsRes.data 
        : (incidentsRes.data.data?.incidents || incidentsRes.data.data || []);
      
      // Filter to incidents assigned to this engineer
      const myIncidents = Array.isArray(allIncidents) 
        ? allIncidents
            .filter((i: Incident) => i.assigned_to === user.id)
            .sort((a: Incident, b: Incident) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        : [];
      setIncidents(myIncidents);

      // Calculate KPIs
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const todayEnd = new Date(today + 'T23:59:59');

      // Assigned to Me (active, not resolved/Canceled)
      const assignedToMe = myIncidents.filter((i: Incident) => 
        isActiveStatus(i.status)
      ).length;

      // Critical Incidents (PRY1 or SEV1)
      const criticalIncidents = myIncidents.filter((i: Incident) => 
        isActiveStatus(i.status) && 
        (normalizePriorityLevel(getPrioritySource(i)) === 1 || normalizeSeverityLevel(getSeveritySource(i)) === 1)
      ).length;

      // SLA Expiring Today
      const slaExpiringToday = myIncidents.filter((i: Incident) => {
        if (!i.sla_deadline || !isActiveStatus(i.status)) return false;
        const deadline = new Date(i.sla_deadline);
        return deadline >= now && deadline <= todayEnd;
      }).length;

      // Overdue Tasks (SLA breached)
      const overdueTasks = myIncidents.filter((i: Incident) => {
        if (!i.sla_deadline || !isActiveStatus(i.status)) return false;
        return new Date(i.sla_deadline) < now;
      }).length;

      // Response Time Expiring Today (unconfirmed response deadline today)
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const responseExpiringToday = myIncidents.filter((i: Incident) => {
        if (!isActiveStatus(i.status)) return false;
        if (i.response_time_confirmed_at) return false;
        if (!i.response_deadline) return false;
        const deadline = new Date(i.response_deadline);
        if (Number.isNaN(deadline.getTime())) return false;
        return deadline >= now && deadline >= dayStart && deadline < dayEnd;
      }).length;

      setKpis({
        assignedToMe,
        criticalIncidents,
        slaExpiringToday,
        responseExpiringToday,
        overdueTasks,
      });

      // Calculate trend data based on period filter
      const dateRange = calculateDateRange(periodFilter, customStartDate, customEndDate, myIncidents);
      const incidentsByDay = dateRange.map(({ date, dayName }) => {
        const count = myIncidents.filter((i: Incident) => {
          const createdDate = new Date(i.created_at).toISOString().split('T')[0];
          return createdDate === date;
        }).length;
        return { day: dayName, count };
      });

      setTrendData(incidentsByDay);
      setError('');
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const calculateDateRange = (
    period: string, 
    startDate: string, 
    endDate: string, 
    incidents: Incident[]
  ) => {
    const today = new Date();
    let dateRange: { date: string; dayName: string }[] = [];

    if (period === 'custom' && startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24));
      
      dateRange = Array.from({ length: daysDiff + 1 }, (_, i) => {
        const date = new Date(start);
        date.setDate(date.getDate() + i);
        return {
          date: date.toISOString().split('T')[0],
          dayName: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        };
      });
    } else if (period === 'month') {
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
      const sortedDates = Array.from(allDates).sort();
      dateRange = sortedDates.map(date => ({
        date,
        dayName: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      }));
    } else {
      // Week (default)
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

  const handleIncidentClick = (incidentId: string) => {
    markAsRead(incidentId);
    navigate(`/incidents/${incidentId}`);
  };

  const handleCardClick = (filter: string) => {
    navigate(`/tasks?filter=${filter}`);
  };

  // Calculate SLA countdown
  const getSlaCountdown = (deadline: string | undefined) => {
    if (!deadline) return null;
    const now = new Date();
    const slaDate = new Date(deadline);
    const diff = slaDate.getTime() - now.getTime();
    
    if (diff < 0) {
      const hours = Math.abs(Math.floor(diff / (1000 * 60 * 60)));
      const mins = Math.abs(Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)));
      return { text: `-${hours}h ${mins}m`, status: 'breached' };
    }
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours < 2) return { text: `${hours}h ${mins}m`, status: 'critical' };
    if (hours < 8) return { text: `${hours}h ${mins}m`, status: 'warning' };
    return { text: `${hours}h ${mins}m`, status: 'ok' };
  };

  const getResponseCountdown = (incident: Incident) => {
    if (incident.response_time_confirmed_at || !incident.response_deadline) return null;

    const now = new Date();
    const deadline = new Date(incident.response_deadline);
    const diff = deadline.getTime() - now.getTime();
    if (Number.isNaN(diff)) return null;

    if (diff < 0) {
      const hours = Math.abs(Math.floor(diff / (1000 * 60 * 60)));
      const mins = Math.abs(Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)));
      return { text: `+${hours}h ${mins}m`, status: 'breached' as const };
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours < 1) return { text: `${hours}h ${mins}m`, status: 'critical' as const };
    if (hours < 3) return { text: `${hours}h ${mins}m`, status: 'warning' as const };
    return { text: `${hours}h ${mins}m`, status: 'ok' as const };
  };

  const recentIncidents = Array.isArray(incidents) 
    ? incidents
        .filter(i => ['OPEN', 'IN_PROGRESS', 'PENDING', 'REOPENED'].includes(i.status))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5)
    : [];

  const trendChartData = {
    labels: trendData.map(d => d.day),
    datasets: [
      {
        label: 'My Incidents',
        data: trendData.map(d => d.count),
        borderColor: 'rgb(14, 165, 233)',
        backgroundColor: 'rgba(14, 165, 233, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 5,
        pointHoverRadius: 7,
        pointBackgroundColor: 'rgb(14, 165, 233)',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
      },
    ],
  };

  const trendChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        titleFont: { size: 12 },
        bodyFont: { size: 11 },
        borderColor: 'rgba(255, 255, 255, 0.2)',
        borderWidth: 1,
        callbacks: {
          label: (context: any) => `${context.parsed.y} incident${context.parsed.y !== 1 ? 's' : ''}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#525252', font: { size: 11, weight: 500 as any } },
      },
      y: {
        grid: { color: 'rgba(148, 163, 184, 0.1)' },
        beginAtZero: true,
        ticks: { color: '#94a3b8', stepSize: 1 },
      },
    },
  };

  const StatCard = ({ 
    title, 
    value, 
    color, 
    icon, 
    onClick 
  }: { 
    title: string; 
    value: number; 
    color: string; 
    icon: React.ReactNode;
    onClick?: () => void;
  }) => {
    const colorClasses: Record<string, { iconBg: string }> = {
      blue: { iconBg: 'from-blue-500 to-blue-600' },
      red: { iconBg: 'from-red-500 to-red-600' },
      yellow: { iconBg: 'from-yellow-500 to-yellow-600' },
      orange: { iconBg: 'from-orange-500 to-orange-600' },
    };

    const c = colorClasses[color] || colorClasses.blue;

    return (
      <div
        onClick={onClick}
        className={`p-5 border border-white/20 rounded-[4px] hover:-translate-y-1 hover:shadow-lg transition-all duration-300 ${onClick ? 'cursor-pointer' : ''}`}
        style={{ background: 'radial-gradient(circle, rgba(19, 29, 48, 0.91) 0%, rgba(41, 46, 59, 0.95) 51%)' }}
      >
        <div className="flex items-start justify-between">
          <div className={`w-11 h-11 rounded-[4px] bg-gradient-to-br ${c.iconBg} flex items-center justify-center text-white shadow-lg`}>
            {icon}
          </div>
        </div>
        <div className="mt-4">
          <p className="text-2xl font-bold text-white">{value}</p>
          <p className="text-sm text-neutral-300 mt-1">{title}</p>
        </div>
      </div>
    );
  };

  const selectedPeriodLabel = periodFilter === 'week'
    ? 'This Week'
    : periodFilter === 'month'
      ? 'This Month'
      : periodFilter === 'all'
        ? 'All Time'
        : 'Custom';

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
        title="Dashboard" 
        subtitle={`Welcome back, ${user?.full_name || user?.username || 'Engineer'}!`}
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
        <div className="mx-6 mt-4 bg-gradient-to-r from-danger-50 to-danger-100/80 border border-danger-300/70 text-danger-700 px-4 py-3 rounded-xl text-sm shadow-lg shadow-danger-500/20 backdrop-blur-sm">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="mx-6 mt-4 bg-gradient-to-r from-success-50 to-success-100/80 border border-success-300/70 text-success-700 px-4 py-3 rounded-xl text-sm shadow-lg shadow-success-500/20 backdrop-blur-sm">
          {successMsg}
        </div>
      )}

      {/* KPI Stats - Action Oriented */}
      <div className="px-6 py-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <StatCard
            title="Assigned to Me"
            value={kpis.assignedToMe}
            color="blue"
            onClick={() => handleCardClick('assigned')}
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>}
          />
          <StatCard
            title="Critical Incidents"
            value={kpis.criticalIncidents}
            color="red"
            onClick={() => handleCardClick('critical')}
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
          />
          <StatCard
            title="SLA Expiring Today"
            value={kpis.slaExpiringToday}
            color="yellow"
            onClick={() => handleCardClick('sla-today')}
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
          <StatCard
            title="Response Expiring Today"
            value={kpis.responseExpiringToday}
            color="orange"
            onClick={() => handleCardClick('response-today')}
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
          />
          <StatCard
            title="Overdue Tasks"
            value={kpis.overdueTasks}
            color="orange"
            onClick={() => handleCardClick('overdue')}
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
        </div>
      </div>

      {/* Charts and Recent Incidents */}
      <div className="px-6 pb-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* My Incident Trend Chart */}
        <Card className="rounded-none p-4 shadow-none hover:shadow-none transition-colors">
          <div className="flex items-start justify-between mb-3 gap-3">
            <div className="min-w-0">
              <h3 className="text-base font-bold text-neutral-900">My Incident Trend</h3>
              <p className="text-xs text-neutral-500">Assigned incidents over time</p>
            </div>
            <span className="inline-flex items-center justify-center min-w-[96px] px-2.5 py-1 rounded-lg bg-neutral-100 text-neutral-700 text-xs font-semibold whitespace-nowrap">
              {selectedPeriodLabel}
            </span>
          </div>
          <div className="h-48 mb-3">
            <Line data={trendChartData} options={trendChartOptions} />
          </div>
          
          {/* Period Filter */}
          <div className="border-t border-neutral-100 pt-3 space-y-2">
            <div className="grid grid-cols-4 gap-1 rounded-xl bg-neutral-100 p-1">
              <button
                type="button"
                onClick={() => setPeriodFilter('week')}
                className={`px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors ${periodFilter === 'week' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'}`}
              >
                Week
              </button>
              <button
                type="button"
                onClick={() => setPeriodFilter('month')}
                className={`px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors ${periodFilter === 'month' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'}`}
              >
                Month
              </button>
              <button
                type="button"
                onClick={() => setPeriodFilter('all')}
                className={`px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors ${periodFilter === 'all' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'}`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setPeriodFilter('custom')}
                className={`px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors ${periodFilter === 'custom' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'}`}
              >
                Custom
              </button>
            </div>

            {periodFilter === 'custom' && (
              <div className="flex gap-2">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="input text-xs py-1.5 flex-1"
                />
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="input text-xs py-1.5 flex-1"
                />
              </div>
            )}
          </div>
        </Card>

        {/* Recent List */}
        <Card className="rounded-none overflow-hidden flex flex-col shadow-none hover:shadow-none transition-colors" padding="none">
          <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-neutral-900">Recent Tasks</h3>
              <p className="text-xs text-neutral-500 mt-0.5">Your active incidents</p>
            </div>
            {recentIncidents.length > 0 && (
              <button 
                onClick={() => navigate('/tasks')}
                className="text-xs text-neutral-600 hover:text-neutral-900 font-semibold flex items-center gap-1 group"
              >
                View All
                <svg className="w-3 h-3 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>

          {loading ? (
            <div className="p-8 text-center">
              <div className="w-8 h-8 border-4 border-neutral-300 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
              <p className="text-neutral-500 text-sm">Loading...</p>
            </div>
          ) : recentIncidents.length === 0 ? (
            <div className="p-8 text-center">
              <div className="w-12 h-12 mx-auto bg-neutral-100 rounded-xl flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <p className="text-neutral-600 font-medium text-sm">No active tasks</p>
              <p className="text-neutral-400 text-xs mt-1">All caught up!</p>
            </div>
          ) : (
            <div className="divide-y divide-neutral-100 flex-1 overflow-y-auto scrollbar-sidebar max-h-96">
              {recentIncidents.map((incident) => {
                const slaInfo = getSlaCountdown(incident.sla_deadline);
                const responseInfo = getResponseCountdown(incident);
                return (
                  <div
                    key={incident.id}
                    className="px-6 py-3 hover:bg-neutral-50 transition-colors cursor-pointer group"
                    onClick={() => handleIncidentClick(incident.id)}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-bold text-neutral-900 truncate group-hover:text-neutral-700 transition-colors text-base">{incident.title}</p>
                          {isUnreadIncident(incident) && (
                            <span className="shrink-0 inline-flex items-center" title="Unread incident">
                              <span className="w-2 h-2 bg-red-600 rounded-full animate-pulse border border-white"></span>
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col text-sm text-neutral-500">
                          <span className="font-semibold">Incident ID {generateNDI(incident.id)}</span>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="font-medium">{formatDateTime(incident.created_at)}</span>
                            {responseInfo && (
                              <span className={`font-semibold text-xs ${
                              responseInfo.status === 'breached' ? 'text-red-700' :
                              responseInfo.status === 'critical' ? 'text-orange-700' :
                              responseInfo.status === 'warning' ? 'text-amber-700' :
                              'text-emerald-700'
                            }`}>
                              Response remaining: {responseInfo.text}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <PriorityBadge priority={incident.priority} size="sm" format="numbered" />
                        {slaInfo && (
                          <span className={`text-xs font-semibold px-2 py-1 rounded-[4px] ${
                            slaInfo.status === 'breached' ? 'bg-red-100 text-red-700' :
                            slaInfo.status === 'critical' ? 'bg-orange-100 text-orange-700' :
                            slaInfo.status === 'warning' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {slaInfo.text}
                          </span>
                        )}
                        <StatusBadge status={incident.status} size="sm" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
