import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler);

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
  sla_deadline?: string;
  sla_percent_consumed?: number;
  sla_percent_at_resolve?: number;
  resolved_at?: string;
  response_time_sla_minutes?: number;
  response_deadline?: string;
  response_time_confirmed_at?: string;
  response_time_minutes?: number;
}

const getResolvedSlaPercent = (incident: Incident): number | null => {
  if (typeof incident.sla_percent_consumed === 'number' && Number.isFinite(incident.sla_percent_consumed)) {
    return incident.sla_percent_consumed;
  }

  if (typeof incident.sla_percent_at_resolve === 'number' && Number.isFinite(incident.sla_percent_at_resolve)) {
    return incident.sla_percent_at_resolve;
  }

  return null;
};

const isResolvedWithinSla = (incident: Incident): boolean => {
  const resolvedPercent = getResolvedSlaPercent(incident);
  if (resolvedPercent !== null) {
    return resolvedPercent < 100;
  }

  if (incident.resolved_at && incident.sla_deadline) {
    return new Date(incident.resolved_at) <= new Date(incident.sla_deadline);
  }

  return true;
};

const isResolvedAfterSla = (incident: Incident): boolean => {
  const resolvedPercent = getResolvedSlaPercent(incident);
  if (resolvedPercent !== null) {
    return resolvedPercent >= 100;
  }

  if (incident.resolved_at && incident.sla_deadline) {
    return new Date(incident.resolved_at) > new Date(incident.sla_deadline);
  }

  return false;
};

interface Engineer {
  id: string;
  username: string;
  full_name?: string;
  activeCount: number;
  resolvedCount: number;
}

interface EngineerLoadSnapshot {
  id: string;
  username: string;
  full_name?: string;
  tier?: string;
  auto_assign_enabled?: number;
  load_points?: number;
  points_limit?: number;
  active_incidents?: number;
}

export default function ManagerDashboard({ user }: { user: User | null }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [trendData, setTrendData] = useState<{ day: string; count: number }[]>([]);
  const [periodFilter, setPeriodFilter] = useState<'week' | 'month' | 'all'>('week');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [engineerLoadData, setEngineerLoadData] = useState<EngineerLoadSnapshot[]>([]);
  const [engineerView, setEngineerView] = useState<'by-engineers' | 'load-balance'>('by-engineers');
  const { markAsRead, isUnreadIncident } = useReadIncidents(user?.id);

  // KPIs
  const [kpis, setKpis] = useState({
    totalActive: 0,
    criticalIncidents: 0,
    slaAtRisk: 0,
    slaBreached: 0,
    resolvedThisMonth: 0,
    slaComplianceRate: 0,
    slaBreachRate: 0,
    avgResolutionTime: 0,
    avgResponseTime: 0,
    responseExpiringToday: 0,
    reopenRate: 0,
    CanceledCount: 0,
  });

  // Priority distribution
  const [priorityData, setPriorityData] = useState({ pry1: 0, pry2: 0, pry3: 0, pry4: 0 });
  
  // Status distribution
  const [statusData, setStatusData] = useState({ open: 0, inProgress: 0, resolved: 0, Canceled: 0, reopened: 0, pending: 0 });

  useEffect(() => {
    loadData();
  }, [periodFilter]);

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

      const [incidentsResult, engineersResult] = await Promise.allSettled([
        api.get('/incidents?limit=5000&page=1'),
        api.get('/incidents/engineers/list'),
      ]);

      if (incidentsResult.status === 'rejected') {
        throw incidentsResult.reason;
      }

      const incidentsRes = incidentsResult.value;
      const allIncidents: Incident[] = incidentsRes.data.data?.incidents || incidentsRes.data.data || [];
      const incidentsNewestFirst = [...allIncidents].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setIncidents(incidentsNewestFirst);

      if (engineersResult.status === 'fulfilled') {
        setEngineerLoadData(engineersResult.value.data.data?.engineers || []);
      } else {
        setEngineerLoadData([]);
      }

      // Calculate KPIs
      const now = new Date();
      const thisMonth = now.getMonth();
      const thisYear = now.getFullYear();

      // 4.1 Total Active = COUNT(status IN ('Open', 'In Progress', 'Pending', 'Reopened'))
      const totalActive = allIncidents.filter(i => isActiveStatus(i.status)).length;

      // 4.2 Critical Active = COUNT(priority = 'Critical' AND status is active)
      const criticalIncidents = allIncidents.filter(i => 
        isActiveStatus(i.status) && 
        normalizePriorityLevel(getPrioritySource(i)) === 1
      ).length;

      // 4.7 SLA At Risk = (Elapsed_Time / Total_SLA_Time) >= 0.75 AND < 1.0
      const slaAtRisk = allIncidents.filter(i => {
        if (!i.sla_deadline || !isActiveStatus(i.status)) return false;
        const deadline = new Date(i.sla_deadline);
        const created = new Date(i.created_at);
        const total = deadline.getTime() - created.getTime();
        if (total <= 0) return false;
        const elapsed = now.getTime() - created.getTime();
        const ratio = elapsed / total;
        return ratio >= 0.75 && ratio < 1.0;
      }).length;

      // SLA Breached (active incidents past deadline)
      const slaBreached = allIncidents.filter(i => {
        if (!i.sla_deadline || !isActiveStatus(i.status)) return false;
        return new Date(i.sla_deadline) < now;
      }).length;

      // Resolved This Month
      const resolvedThisMonth = allIncidents.filter(i => {
        if (!isResolvedStatus(i.status)) return false;
        const resolvedDate = new Date(i.resolved_at || i.updated_at);
        return resolvedDate.getMonth() === thisMonth && resolvedDate.getFullYear() === thisYear;
      }).length;

      // 4.3 SLA Compliance % = (Resolved Within SLA / Total Resolved) × 100
      const resolvedIncidents = allIncidents.filter(i => isResolvedStatus(i.status));
      const CanceledCount = allIncidents.filter(i => normalizeStatus(i.status) === 'Canceled').length;
      const resolvedWithinSla = resolvedIncidents.filter(isResolvedWithinSla).length;
      const slaComplianceRate = resolvedIncidents.length > 0 
        ? Math.round((resolvedWithinSla / resolvedIncidents.length) * 100)
        : 100;

      // 4.4 SLA Breach Rate % = (Resolved After SLA / Total Resolved) × 100
      const resolvedAfterSla = resolvedIncidents.filter(isResolvedAfterSla).length;
      const slaBreachRate = resolvedIncidents.length > 0
        ? Math.round((resolvedAfterSla / resolvedIncidents.length) * 100)
        : 0;

      // 4.5 Average Resolution Time (ART) in hours = SUM(resolved_at - created_at) / Total Resolved
      let totalResolutionTimeMs = 0;
      const incidentsWithResolutionTime = resolvedIncidents.filter(i => {
        if (i.resolved_at) {
          const resolvedMs = new Date(i.resolved_at).getTime();
          const createdMs = new Date(i.created_at).getTime();
          if (!isNaN(resolvedMs) && !isNaN(createdMs) && resolvedMs > createdMs) {
            totalResolutionTimeMs += resolvedMs - createdMs;
            return true;
          }
        }
        return false;
      });
      const avgResolutionTime = incidentsWithResolutionTime.length > 0
        ? Math.round((totalResolutionTimeMs / incidentsWithResolutionTime.length) / (1000 * 60 * 60)) // to hours
        : 0;

      // 4.6 Reopen Rate % = (Total Reopened / Total Resolved) × 100
      const totalReopened = allIncidents.filter(i => i.status === 'REOPENED').length;
      const reopenRate = resolvedIncidents.length > 0
        ? Math.round((totalReopened / resolvedIncidents.length) * 100)
        : 0;

      // Average Response Time (minutes) = mean(first response timestamp - created_at)
      const respondedIncidents = allIncidents.filter(i => i.response_time_confirmed_at || i.response_time_minutes !== undefined);
      let totalResponseMinutes = 0;
      const incidentsWithResponse = respondedIncidents.filter(i => {
        if (typeof i.response_time_minutes === 'number' && Number.isFinite(i.response_time_minutes) && i.response_time_minutes >= 0) {
          totalResponseMinutes += i.response_time_minutes;
          return true;
        }
        if (!i.response_time_confirmed_at) return false;
        const confirmedMs = new Date(i.response_time_confirmed_at).getTime();
        const createdMs = new Date(i.created_at).getTime();
        if (!Number.isNaN(confirmedMs) && !Number.isNaN(createdMs) && confirmedMs >= createdMs) {
          totalResponseMinutes += Math.round((confirmedMs - createdMs) / 60000);
          return true;
        }
        return false;
      });
      const avgResponseTime = incidentsWithResponse.length > 0
        ? Math.round(totalResponseMinutes / incidentsWithResponse.length)
        : 0;

      // Response Time Expiring Today = active incidents with unconfirmed response and deadline today (future only)
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const responseExpiringToday = allIncidents.filter(i => {
        if (!isActiveStatus(i.status)) return false;
        if (i.response_time_confirmed_at) return false;
        if (!i.response_deadline) return false;
        const deadline = new Date(i.response_deadline);
        if (Number.isNaN(deadline.getTime())) return false;
        return deadline >= now && deadline >= dayStart && deadline < dayEnd;
      }).length;

      setKpis({
        totalActive,
        criticalIncidents,
        slaAtRisk,
        slaBreached,
        resolvedThisMonth,
        slaComplianceRate,
        slaBreachRate,
        avgResolutionTime,
        avgResponseTime,
        responseExpiringToday,
        reopenRate,
        CanceledCount,
      });

      // Priority Distribution (only active incidents)
      const pry1 = allIncidents.filter(i => isActiveStatus(i.status) && normalizePriorityLevel(getPrioritySource(i)) === 1).length;
      const pry2 = allIncidents.filter(i => isActiveStatus(i.status) && normalizePriorityLevel(getPrioritySource(i)) === 2).length;
      const pry3 = allIncidents.filter(i => isActiveStatus(i.status) && normalizePriorityLevel(getPrioritySource(i)) === 3).length;
      const pry4 = allIncidents.filter(i => isActiveStatus(i.status) && normalizePriorityLevel(getPrioritySource(i)) === 4).length;
      setPriorityData({ pry1, pry2, pry3, pry4 });

      // Status Distribution
      const statusCounts = {
        open: allIncidents.filter(i => normalizeStatus(i.status) === 'OPEN').length,
        inProgress: allIncidents.filter(i => normalizeStatus(i.status) === 'IN_PROGRESS').length,
        resolved: allIncidents.filter(i => normalizeStatus(i.status) === 'RESOLVED').length,
        Canceled: allIncidents.filter(i => normalizeStatus(i.status) === 'Canceled').length,
        reopened: allIncidents.filter(i => normalizeStatus(i.status) === 'REOPENED').length,
        pending: allIncidents.filter(i => normalizeStatus(i.status) === 'PENDING').length,
      };
      setStatusData(statusCounts);

      // Engineer workload
      const engineerMap = new Map<string, Engineer>();
      allIncidents.forEach(i => {
        if (i.assigned_to && i.assigned_to_name) {
          const existing = engineerMap.get(i.assigned_to) || {
            id: i.assigned_to,
            username: i.assigned_to_name,
            full_name: i.assigned_to_name,
            activeCount: 0,
            resolvedCount: 0,
          };
          if (isActiveStatus(i.status)) {
            existing.activeCount++;
          } else if (normalizeStatus(i.status) === 'RESOLVED') {
            existing.resolvedCount++;
          }
          engineerMap.set(i.assigned_to, existing);
        }
      });
      setEngineers(Array.from(engineerMap.values()).sort((a, b) => b.activeCount - a.activeCount));

      // Trend Data
      const dateRange = calculateDateRange(periodFilter, allIncidents);
      const incidentsByDay = dateRange.map(({ date, dayName }) => {
        const count = allIncidents.filter(i => {
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
      const sortedDates = Array.from(allDates).sort().slice(-30); // Last 30 dates
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

  const handleIncidentClick = (incidentId: string) => {
    markAsRead(incidentId);
    navigate(`/incidents/${incidentId}`);
  };

  const handleCardClick = (filter: string) => {
    navigate(`/incidents?filter=${filter}`);
  };

  // Risk calculations
  const now = new Date();

  const oldestIncidents = incidents
    .filter(i => isActiveStatus(i.status))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .slice(0, 5);

  const slaRiskIncidents = incidents
    .filter(i => {
      if (!i.sla_deadline || !isActiveStatus(i.status)) return false;
      const deadline = new Date(i.sla_deadline);
      return deadline > now; // Not yet breached
    })
    .sort((a, b) => new Date(a.sla_deadline!).getTime() - new Date(b.sla_deadline!).getTime())
    .slice(0, 5);

  // Chart configurations
  const trendChartData = {
    labels: trendData.map(d => d.day),
    datasets: [{
      label: 'Incidents',
      data: trendData.map(d => d.count),
      borderColor: 'rgb(14, 165, 233)',
      backgroundColor: 'rgba(14, 165, 233, 0.1)',
      fill: true,
      tension: 0.4,
      pointRadius: 4,
      pointHoverRadius: 6,
      pointBackgroundColor: 'rgb(14, 165, 233)',
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
    }],
  };

  const priorityChartData = {
    labels: ['PRY1', 'PRY2', 'PRY3', 'PRY4'],
    datasets: [{
      label: 'Incidents',
      data: [priorityData.pry1, priorityData.pry2, priorityData.pry3, priorityData.pry4],
      backgroundColor: [
        'rgba(239, 68, 68, 0.85)',
        'rgba(249, 115, 22, 0.85)',
        'rgba(59, 130, 246, 0.85)',
        'rgba(107, 114, 128, 0.85)',
      ],
      borderRadius: 6,
    }],
  };

  const statusChartData = {
    labels: ['Open', 'In Progress', 'Pending', 'Resolved', 'Canceled', 'Reopened'],
    datasets: [{
      data: [statusData.open, statusData.inProgress, statusData.pending, statusData.resolved, statusData.Canceled, statusData.reopened],
      backgroundColor: [
        'rgba(239, 68, 68, 0.85)',
        'rgba(59, 130, 246, 0.85)',
        'rgba(249, 115, 22, 0.85)',
        'rgba(34, 197, 94, 0.85)',
        'rgba(107, 114, 128, 0.85)',
        'rgba(168, 85, 247, 0.85)',
      ],
      borderWidth: 0,
    }],
  };

  const engineerChartData = {
    labels: engineers.slice(0, 6).map(e => e.full_name || e.username),
    datasets: [
      {
        label: 'Active',
        data: engineers.slice(0, 6).map(e => e.activeCount),
        backgroundColor: 'rgba(59, 130, 246, 0.85)',
        borderRadius: 4,
      },
      {
        label: 'Resolved',
        data: engineers.slice(0, 6).map(e => e.resolvedCount),
        backgroundColor: 'rgba(34, 197, 94, 0.85)',
        borderRadius: 4,
      },
    ],
  };

  const engineerLoadBalanceRows = engineerLoadData
    .slice()
    .sort((a, b) => {
      const aLimit = Number(a.points_limit || 0);
      const bLimit = Number(b.points_limit || 0);
      const aLoad = aLimit > 0 ? Number(a.load_points || 0) / aLimit : 0;
      const bLoad = bLimit > 0 ? Number(b.load_points || 0) / bLimit : 0;
      return bLoad - aLoad;
    });

  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        callbacks: {
          label: (context: any) => `${context.parsed.y} incident${context.parsed.y !== 1 ? 's' : ''}`,
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#525252', font: { size: 10 } } },
      y: { grid: { color: 'rgba(148, 163, 184, 0.1)' }, beginAtZero: true, ticks: { color: '#94a3b8', stepSize: 1 } },
    },
  };

  const barChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#525252', font: { size: 11 } } },
      y: { grid: { color: 'rgba(148, 163, 184, 0.1)' }, beginAtZero: true, ticks: { color: '#94a3b8', stepSize: 1 } },
    },
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '60%',
    plugins: {
      legend: {
        position: 'right' as const,
        labels: { padding: 12, usePointStyle: true, pointStyle: 'circle', font: { size: 11 } },
      },
    },
  };

  const stackedBarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' as const, labels: { usePointStyle: true, padding: 16 } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#525252', font: { size: 10 } } },
      y: { grid: { color: 'rgba(148, 163, 184, 0.1)' }, beginAtZero: true, ticks: { color: '#94a3b8' } },
    },
  };

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
        className={`p-4 border border-white/20 rounded-[4px] hover:-translate-y-0.5 hover:shadow-md transition-all duration-300 min-h-[88px] ${onClick ? 'cursor-pointer' : ''}`}
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

  const getDaysOld = (dateStr: string) => {
    const created = new Date(dateStr);
    const diff = now.getTime() - created.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  const getSlaTimeLeft = (deadline: string) => {
    const slaDate = new Date(deadline);
    const diff = slaDate.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours < 0) return { text: 'Breached', status: 'breached' };
    if (hours < 2) return { text: `${hours}h ${mins}m`, status: 'critical' };
    if (hours < 8) return { text: `${hours}h ${mins}m`, status: 'warning' };
    return { text: `${hours}h ${mins}m`, status: 'ok' };
  };

  const getResponseTimeLeft = (incident: Incident) => {
    if (incident.response_time_confirmed_at || !incident.response_deadline) return null;
    const deadline = new Date(incident.response_deadline);
    const diff = deadline.getTime() - now.getTime();
    if (Number.isNaN(diff)) return null;
    const hours = Math.floor(Math.abs(diff) / (1000 * 60 * 60));
    const mins = Math.floor((Math.abs(diff) % (1000 * 60 * 60)) / (1000 * 60));
    if (diff < 0) return { text: `+${hours}h ${mins}m`, status: 'breached' as const };
    if (hours < 1) return { text: `${hours}h ${mins}m`, status: 'critical' as const };
    if (hours < 3) return { text: `${hours}h ${mins}m`, status: 'warning' as const };
    return { text: `${hours}h ${mins}m`, status: 'ok' as const };
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
        title="Dashboard" 
        subtitle={`Welcome back, ${user?.full_name || user?.username || 'Manager'}!`}
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
        <div className="mx-6 mt-4 bg-gradient-to-r from-danger-50 to-danger-100/80 border border-danger-300/70 text-danger-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="mx-6 mt-4 bg-gradient-to-r from-success-50 to-success-100/80 border border-success-300/70 text-success-700 px-4 py-3 rounded-xl text-sm">
          {successMsg}
        </div>
      )}

      {/* KPI Metric Cards */}
      <div className="px-6 py-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard
            title="Total Active"
            value={kpis.totalActive}
            color="blue"
            onClick={() => handleCardClick('active')}
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
          />
          <StatCard
            title="Critical"
            value={kpis.criticalIncidents}
            color="red"
            onClick={() => handleCardClick('critical')}
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
          />
          <StatCard
            title="SLA At Risk"
            value={kpis.slaAtRisk}
            color="yellow"
            onClick={() => handleCardClick('sla-risk')}
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
          <StatCard
            title="Overdue"
            value={kpis.slaBreached}
            color="orange"
            onClick={() => handleCardClick('overdue')}
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
          <StatCard
            title="Resolved (Month)"
            value={kpis.resolvedThisMonth}
            color="green"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
          />
          <StatCard
            title="SLA Compliance"
            value={kpis.slaComplianceRate}
            color="purple"
            suffix="%"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>}
          />
          <StatCard
            title="SLA Breach Rate"
            value={kpis.slaBreachRate}
            color="orange"
            suffix="%"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>}
          />
          <StatCard
            title="Avg Resolution"
            value={kpis.avgResolutionTime}
            color="blue"
            suffix="h"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
          <StatCard
            title="Avg Response"
            value={kpis.avgResponseTime}
            color="yellow"
            suffix="m"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l2.5 2.5M12 3a9 9 0 100 18 9 9 0 000-18z" /></svg>}
          />
          <StatCard
            title="Response Today"
            value={kpis.responseExpiringToday}
            color="orange"
            onClick={() => handleCardClick('response-today')}
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
          />
          <StatCard
            title="Reopen Rate"
            value={kpis.reopenRate}
            color="red"
            suffix="%"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>}
          />
          <StatCard
            title="Canceled"
            value={kpis.CanceledCount}
            color="purple"
            onClick={() => handleCardClick('status-Canceled')}
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>}
          />
        </div>
      </div>

      {/* Charts Row 1: Incidents Trend | By Status */}
      <div className="px-6 pb-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Incidents Trend */}
        <Card className="rounded-none p-4 shadow-none">
          <div className="flex items-start justify-between mb-3 gap-3">
            <div className="min-w-0">
              <h3 className="text-base font-bold text-neutral-900">Incidents Trend</h3>
              <p className="text-xs text-neutral-500">Volume over time</p>
            </div>
            <div className="grid grid-cols-3 gap-1 bg-neutral-100 p-1 rounded-lg">
              {(['week', 'month', 'all'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriodFilter(p)}
                  className={`px-2 py-1 rounded-md text-xs font-semibold transition-colors ${periodFilter === p ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'}`}
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

        {/* By Status & Priority - Combined Card */}
        <Card className="rounded-none p-4 shadow-none">
          <div className="flex gap-4">
            {/* Status Section */}
            <div className="flex-1">
              <div className="mb-3">
                <h3 className="text-sm font-bold text-neutral-900">By Status</h3>
                <p className="text-xs text-neutral-500">Click to filter</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => handleCardClick('status-open')}
                  className="p-2.5 rounded-none bg-gradient-to-br from-red-50 to-red-100 border border-red-200 hover:shadow-md hover:-translate-y-0.5 transition-all group text-center"
                >
                  <p className="text-lg font-bold text-red-700">{statusData.open}</p>
                  <p className="text-[10px] text-red-600 font-medium">Open</p>
                </button>
                <button
                  onClick={() => handleCardClick('status-in_progress')}
                  className="p-2.5 rounded-none bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 hover:shadow-md hover:-translate-y-0.5 transition-all group text-center"
                >
                  <p className="text-lg font-bold text-blue-700">{statusData.inProgress}</p>
                  <p className="text-[10px] text-blue-600 font-medium">In Progress</p>
                </button>
                <button
                  onClick={() => handleCardClick('status-pending')}
                  className="p-2.5 rounded-none bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 hover:shadow-md hover:-translate-y-0.5 transition-all group text-center"
                >
                  <p className="text-lg font-bold text-orange-700">{statusData.pending}</p>
                  <p className="text-[10px] text-orange-600 font-medium">Pending</p>
                </button>
                <button
                  onClick={() => handleCardClick('status-resolved')}
                  className="p-2.5 rounded-none bg-gradient-to-br from-green-50 to-green-100 border border-green-200 hover:shadow-md hover:-translate-y-0.5 transition-all group text-center"
                >
                  <p className="text-lg font-bold text-green-700">{statusData.resolved}</p>
                  <p className="text-[10px] text-green-600 font-medium">Resolved</p>
                </button>
                <button
                  onClick={() => handleCardClick('status-Canceled')}
                  className="p-2.5 rounded-none bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 hover:shadow-md hover:-translate-y-0.5 transition-all group text-center"
                >
                  <p className="text-lg font-bold text-gray-700">{statusData.Canceled}</p>
                  <p className="text-[10px] text-gray-600 font-medium">Canceled</p>
                </button>
                <button
                  onClick={() => handleCardClick('status-reopened')}
                  className="p-2.5 rounded-none bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 hover:shadow-md hover:-translate-y-0.5 transition-all group text-center"
                >
                  <p className="text-lg font-bold text-purple-700">{statusData.reopened}</p>
                  <p className="text-[10px] text-purple-600 font-medium">Reopened</p>
                </button>
              </div>
            </div>

            {/* Vertical Divider */}
            <div className="w-px bg-neutral-200 self-stretch"></div>

            {/* Priority Section */}
            <div className="w-36">
              <div className="mb-3">
                <h3 className="text-sm font-bold text-neutral-900">By Priority</h3>
                <p className="text-xs text-neutral-500">All active incidents</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleCardClick('critical')}
                  className="p-2.5 rounded-none bg-gradient-to-br from-red-50 to-red-100 border border-red-200 hover:shadow-md hover:-translate-y-0.5 transition-all group text-center"
                >
                  <p className="text-lg font-bold text-red-700">{priorityData.pry1}</p>
                  <p className="text-[10px] text-red-600 font-medium">PRY1</p>
                </button>
                <button
                  onClick={() => handleCardClick('priority-2')}
                  className="p-2.5 rounded-none bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 hover:shadow-md hover:-translate-y-0.5 transition-all group text-center"
                >
                  <p className="text-lg font-bold text-orange-700">{priorityData.pry2}</p>
                  <p className="text-[10px] text-orange-600 font-medium">PRY2</p>
                </button>
                <button
                  onClick={() => handleCardClick('priority-3')}
                  className="p-2.5 rounded-none bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 hover:shadow-md hover:-translate-y-0.5 transition-all group text-center"
                >
                  <p className="text-lg font-bold text-blue-700">{priorityData.pry3}</p>
                  <p className="text-[10px] text-blue-600 font-medium">PRY3</p>
                </button>
                <button
                  onClick={() => handleCardClick('priority-4')}
                  className="p-2.5 rounded-none bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 hover:shadow-md hover:-translate-y-0.5 transition-all group text-center"
                >
                  <p className="text-lg font-bold text-gray-700">{priorityData.pry4}</p>
                  <p className="text-[10px] text-gray-600 font-medium">PRY4</p>
                </button>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Charts Row 2: By Engineer | SLA Risk */}
      <div className="px-6 pb-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* By Engineer */}
        <Card className="rounded-none p-4 shadow-none">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-neutral-900">By Engineer</h3>
              <p className="text-xs text-neutral-500">
                {engineerView === 'by-engineers' ? 'Workload distribution' : 'Live load balance from auto-assign'}
              </p>
            </div>
            <div className="inline-flex rounded-none border border-neutral-200 bg-neutral-100 p-1">
              <button
                type="button"
                onClick={() => setEngineerView('by-engineers')}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${engineerView === 'by-engineers' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
              >
                By Engineers
              </button>
              <button
                type="button"
                onClick={() => setEngineerView('load-balance')}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${engineerView === 'load-balance' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
              >
                Load Balance
              </button>
            </div>
          </div>
          {engineerView === 'by-engineers' ? (
            <div className="h-48">
              <Bar data={engineerChartData} options={stackedBarOptions} />
            </div>
          ) : engineerLoadBalanceRows.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-sm text-neutral-500">
              No backend load data available.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2 max-h-[17.5rem] overflow-y-auto pr-1">
                {engineerLoadBalanceRows.slice(0, 6).map((engineer) => {
                  const limit = Number(engineer.points_limit || 0);
                  const used = Number(engineer.load_points || 0);
                  const loadPercent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
                  const tierLabel = engineer.tier
                    ? `${engineer.tier.charAt(0)}${engineer.tier.slice(1).toLowerCase()}`
                    : '—';

                  return (
                    <div key={engineer.id} className="rounded-none border border-neutral-200 bg-neutral-50 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-neutral-900">{engineer.full_name || engineer.username}</p>
                          <p className="text-xs text-neutral-500">
                            {tierLabel} • {Number(engineer.active_incidents || 0)} active • {engineer.auto_assign_enabled === 0 ? 'Manual only' : 'Auto-assign enabled'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-neutral-900">{used}/{limit}</p>
                          <p className="text-xs text-neutral-500">{loadPercent}% load</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>

        {/* SLA Risk Incidents */}
        <Card className="overflow-hidden flex flex-col shadow-none rounded-none" padding="none">
          <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-neutral-900">SLA Risk</h3>
              <p className="text-xs text-neutral-500 mt-0.5">Approaching deadline</p>
            </div>
          </div>
          {slaRiskIncidents.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-neutral-500 text-sm">No SLA risks</p>
            </div>
          ) : (
            <div className="divide-y divide-neutral-100 max-h-72 overflow-y-auto scrollbar-sidebar">
              {slaRiskIncidents.map((incident) => {
                const slaInfo = getSlaTimeLeft(incident.sla_deadline!);
                const responseInfo = getResponseTimeLeft(incident);
                return (
                  <div
                    key={incident.id}
                    className="px-6 py-3 hover:bg-neutral-50 transition-colors cursor-pointer group"
                    onClick={() => handleIncidentClick(incident.id)}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="font-semibold text-neutral-900 truncate text-sm">{incident.title}</p>
                          {isUnreadIncident(incident) && (
                            <span className="shrink-0 inline-flex items-center" title="Unread incident">
                              <span className="w-2 h-2 bg-red-600 rounded-full animate-pulse border border-white"></span>
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col text-xs text-neutral-500 mt-1">
                          <span className="font-extrabold flex items-center gap-2">Incident ID {generateNDI(incident.id)}<span className={`font-semibold ${
                            slaInfo.status === 'critical' ? 'text-red-600' :
                            slaInfo.status === 'warning' ? 'text-orange-600' :
                            'text-green-600'
                          }`}>{slaInfo.text} left</span></span>
                          <span className="font-medium mt-1">{formatDateTime(incident.created_at)}</span>
                          {responseInfo && (
                            <span className={`font-semibold mt-1 ${
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
                      <div className="flex items-center gap-2">
                        <PriorityBadge priority={incident.priority} size="sm" format="numbered" />
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
