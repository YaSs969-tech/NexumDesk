import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Header, Card, StatusBadge, SeverityBadge, PriorityBadge } from '../components';
import { generateNDI, formatDate, formatDateTime } from '../utils/format';
import { Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip, Legend, Filler);

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
  priority: string;
  urgency?: string;
  status: string;
  service_id: string;
  service_name?: string;
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
  attachment_url?: string;
}

interface KPIData {
  total: number;
  open: number;
  in_progress: number;
  resolved: number;
  average_resolution_time: number;
}

export default function UserDashboard({ user }: { user: User }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [trendData, setTrendData] = useState<{ day: string; count: number }[]>([]);
  const [periodFilter, setPeriodFilter] = useState<'week' | 'month' | 'all' | 'custom'>('week');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [viewedIncidentIds, setViewedIncidentIds] = useState<Set<string>>(new Set());
  const [kpis, setKpis] = useState<KPIData>({
    total: 0,
    open: 0,
    in_progress: 0,
    resolved: 0,
    average_resolution_time: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Load viewed incidents from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(`viewedIncidents_${user.id}`);
    if (stored) {
      setViewedIncidentIds(new Set(JSON.parse(stored)));
    }
  }, [user.id]);

  useEffect(() => {
    loadData();
  }, [periodFilter, customStartDate, customEndDate]);

  // Auto-hide notifications after 5 seconds
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
      // Handle both response formats
      const allIncidents = Array.isArray(incidentsRes.data) 
        ? incidentsRes.data 
        : (incidentsRes.data.data?.incidents || incidentsRes.data.data || []);
      
      // Filter to only user's incidents
      const userIncidents = Array.isArray(allIncidents) 
        ? allIncidents
            .filter((i: Incident) => i.created_by === user.id)
            .sort((a: Incident, b: Incident) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        : [];
      setIncidents(userIncidents);

      // Calculate KPIs
      const total = userIncidents.length;
      const open = userIncidents.filter((i: Incident) => i.status === 'OPEN').length;
      const inProgress = userIncidents.filter((i: Incident) => i.status === 'IN_PROGRESS').length;
      const resolved = userIncidents.filter((i: Incident) => i.status === 'RESOLVED').length;

      const resolutionTimes = userIncidents
        .filter((i: Incident) => i.resolution_time !== undefined && i.resolution_time !== null)
        .map((i: Incident) => i.resolution_time || 0);
      const avgTime = resolutionTimes.length > 0 
        ? Math.round(resolutionTimes.reduce((a: number, b: number) => a + b, 0) / resolutionTimes.length)
        : 0;

      setKpis({
        total,
        open,
        in_progress: inProgress,
        resolved,
        average_resolution_time: avgTime,
      });

      // Calculate trend data based on period filter
      const today = new Date();
      let dateRange: { date: string; dayName: string }[] = [];

      if (periodFilter === 'custom' && customStartDate && customEndDate) {
        const startDate = new Date(customStartDate);
        const endDate = new Date(customEndDate);
        const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24));
        
        dateRange = Array.from({ length: daysDiff + 1 }, (_, i) => {
          const date = new Date(startDate);
          date.setDate(date.getDate() + i);
          return {
            date: date.toISOString().split('T')[0],
            dayName: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          };
        });
      } else if (periodFilter === 'month') {
        const daysInMonth = 30;
        dateRange = Array.from({ length: daysInMonth }, (_, i) => {
          const date = new Date(today);
          date.setDate(date.getDate() - (daysInMonth - 1 - i));
          return {
            date: date.toISOString().split('T')[0],
            dayName: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          };
        });
      } else if (periodFilter === 'all') {
        const allDates = new Set<string>();
        userIncidents.forEach(i => {
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

      const incidentsByDay = dateRange.map(({ date, dayName }) => {
        const count = userIncidents.filter((i: Incident) => {
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

  const formatMinutes = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const handleIncidentClick = (incidentId: string) => {
    // Mark as viewed for this user
    const updated = new Set(viewedIncidentIds);
    updated.add(incidentId);
    setViewedIncidentIds(updated);
    // Save to localStorage for this user
    localStorage.setItem(`viewedIncidents_${user.id}`, JSON.stringify(Array.from(updated)));
    window.dispatchEvent(new Event('nexum-read-incidents-updated'));
    // Navigate
    navigate(`/incidents/${incidentId}`);
  };

  const recentIncidents = Array.isArray(incidents) ? incidents.slice(0, 5) : [];

  const trendChartData = {
    labels: trendData.map(d => d.day),
    datasets: [
      {
        label: 'Incidents Reported',
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
      legend: {
        display: false,
      },
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
        grid: {
          display: false,
        },
        ticks: {
          color: '#525252',
          font: { size: 11, weight: 500 as any },
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

  const StatCard = ({ title, value, color, icon, onClick }: { title: string; value: number | string; color: string; icon: React.ReactNode; onClick?: () => void }) => {
    const colorClasses: Record<string, { iconBg: string; text: string }> = {
      blue: { iconBg: 'from-blue-500 to-blue-600', text: 'text-white' },
      red: { iconBg: 'from-red-500 to-red-600', text: 'text-white' },
      yellow: { iconBg: 'from-yellow-500 to-yellow-600', text: 'text-white' },
      purple: { iconBg: 'from-purple-500 to-purple-600', text: 'text-white' },
      orange: { iconBg: 'from-orange-500 to-orange-600', text: 'text-white' },
      green: { iconBg: 'from-green-500 to-green-600', text: 'text-white' },
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

  // Card click handler for filtering
  const handleCardClick = (filter: string) => {
    navigate(`/incidents?filter=${filter}`);
  };

  return (
    <div className="bg-transparent">
      <Header 
        user={user} 
        title="My Dashboard" 
        subtitle={`Welcome back, ${user?.full_name || user?.username || 'User'}!`}
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

      {/* Compact KPI Stats Bar */}
      <div className="px-6 py-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard
            title="Total"
            value={kpis.total}
            color="blue"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
            onClick={() => handleCardClick('all')}
          />
          <StatCard
            title="Open"
            value={kpis.open}
            color="red"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            onClick={() => handleCardClick('status-open')}
          />
          <StatCard
            title="In Progress"
            value={kpis.in_progress}
            color="yellow"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
            onClick={() => handleCardClick('status-in_progress')}
          />
          <StatCard
            title="Resolved"
            value={kpis.resolved}
            color="green"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
            onClick={() => handleCardClick('status-resolved')}
          />
          <StatCard
            title="Average Time"
            value={formatMinutes(kpis.average_resolution_time)}
            color="purple"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
        </div>
      </div>

      {/* Charts and Recent Incidents - Compact Grid */}
      <div className="px-6 pb-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Weekly Trend Chart - Compact */}
        <Card className="rounded-none p-4 shadow-none hover:shadow-none transition-colors">
          <div className="flex items-start justify-between mb-3 gap-3">
            <div className="min-w-0">
              <h3 className="text-base font-bold text-neutral-900">Trend Incidents</h3>
              <p className="text-xs text-neutral-500">Evolution by selected period</p>
            </div>
            <span className="inline-flex items-center justify-center min-w-[96px] px-2.5 py-1 rounded-lg bg-neutral-100 text-neutral-700 text-xs font-semibold whitespace-nowrap">
              {selectedPeriodLabel}
            </span>
          </div>
          <div className="h-48 mb-3">
            <Line data={trendChartData} options={trendChartOptions} />
          </div>
          
          {/* Period Filter - Redesigned */}
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

        {/* Recent Incidents - Compact */}
        <Card className="overflow-hidden flex flex-col rounded-none shadow-none hover:shadow-none transition-colors" padding="none">
          <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-neutral-900">Recent Incidents</h3>
              <p className="text-xs text-neutral-500 mt-0.5">Latest reported issues</p>
            </div>
            {recentIncidents.length > 0 && (
              <button 
                onClick={() => navigate('/incidents')}
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
              </div>
              <p className="text-neutral-600 font-medium text-sm">No incidents yet</p>
            </div>
          ) : (
            <div className="divide-y divide-neutral-100 flex-1 overflow-y-auto scrollbar-sidebar max-h-96">
              {recentIncidents.map((incident) => (
                <div
                  key={incident.id}
                  className="px-6 py-3 hover:bg-neutral-50 transition-colors cursor-pointer group"
                  onClick={() => handleIncidentClick(incident.id)}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                          <p className="font-bold text-neutral-900 truncate group-hover:text-neutral-700 transition-colors text-base">{incident.title}</p>
                      </div>
                      <div className="flex flex-col text-sm text-neutral-500">
                        <span className="font-semibold">Incident ID {generateNDI(incident.id)}</span>
                        <span className="font-medium mt-1">{formatDateTime(incident.created_at)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <PriorityBadge priority={incident.urgency || incident.priority} size="sm" />
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
