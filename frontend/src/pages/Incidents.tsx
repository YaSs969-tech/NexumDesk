import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { Header, Card, PriorityBadge, StatusBadge, SeverityBadge } from '../components';
import { formatDate, formatTime, generateNDI, getPrioritySource, normalizePriorityLevel, normalizeSeverityLevel } from '../utils/format';
import { useReadIncidents } from '../hooks/useReadIncidents';

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
  priority: string;
  urgency?: string;
  status: string;
  service_id: string;
  department_id: string;
  category?: string;
  impact?: string;
  iss_score?: number;
  assigned_to: string | null;
  assigned_to_name?: string;
  pending_assigned_to_name?: string;
  created_by: string;
  created_by_name?: string;
  detected_at: string;
  created_at: string;
  updated_at: string;
  estimated_resolution_time?: number;
  resolution_time?: number;
  resolution_notes?: string;
  attachment_url?: string;
  attachment_urls?: string[] | string;
  attachments?: string[] | string;
  sla_deadline?: string;
  sla_percent_at_resolve?: number;
  resolved_at?: string;
  reopened_at?: string;
  response_time_sla_minutes?: number;
  response_deadline?: string;
  response_time_confirmed_at?: string;
  response_time_minutes?: number;
  sla_percent_consumed?: number;
  response_percent_consumed?: number;
  assignment_status?: string;
}

interface IncidentsProps {
  user: User | null;
  onIncidentUpdate?: () => void;
}

export default function Incidents({ user, onIncidentUpdate }: IncidentsProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentSearchString = location.search.startsWith('?') ? location.search.slice(1) : location.search;
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchFilter, setSearchFilter] = useState(searchParams.get('q') || '');
  const [severityFilter, setSeverityFilter] = useState(searchParams.get('sev') || 'ALL');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('st') || 'ALL');
  const [priorityFilter, setPriorityFilter] = useState(searchParams.get('prio') || 'ALL');
  const [slaFilter, setSlaFilter] = useState(searchParams.get('sla') || 'ALL');
  const initialDatePresetParam = searchParams.get('dp');
  const initialDatePreset: 'all' | 'day' | 'month' | 'custom' =
    initialDatePresetParam === 'day' || initialDatePresetParam === 'month' || initialDatePresetParam === 'custom'
      ? initialDatePresetParam
      : 'all';

  const [datePreset, setDatePreset] = useState<'all' | 'day' | 'month' | 'custom'>(initialDatePreset);
  const [dateFrom, setDateFrom] = useState(searchParams.get('ds') || '');
  const [dateTo, setDateTo] = useState(searchParams.get('de') || '');
  const [urlFilter, setUrlFilter] = useState<string | null>(() => searchParams.get('filter'));
  const { markAsRead, isUnreadIncident } = useReadIncidents(user?.id);
  
  // New filters
  const [assignedToFilter, setAssignedToFilter] = useState(searchParams.get('asg') || 'ALL');
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get('cat') || 'ALL');
  const [impactFilter, setImpactFilter] = useState(searchParams.get('imp') || 'ALL');
  const [issMinFilter, setIssMinFilter] = useState(searchParams.get('issMin') || '');
  const [issMaxFilter, setIssMaxFilter] = useState(searchParams.get('issMax') || '');
  const appliedUrlFilterRef = useRef<string | null>(null);

  // Read URL filter param and apply appropriate filters
  useEffect(() => {
    const paramsFromUrl = new URLSearchParams(currentSearchString);
    const filter = paramsFromUrl.get('filter');
    if (filter !== urlFilter) {
      setUrlFilter(filter);
    }

    if (!filter) {
      appliedUrlFilterRef.current = null;
      return;
    }

    // Apply URL preset only once per distinct filter value.
    if (appliedUrlFilterRef.current === filter) {
      return;
    }
    appliedUrlFilterRef.current = filter;

    if (filter) {
      // Reset all filters first
      setSearchFilter('');
      setSeverityFilter('ALL');
      setStatusFilter('ALL');
      setPriorityFilter('ALL');
      setSlaFilter('ALL');
      setAssignedToFilter('ALL');
      setCategoryFilter('ALL');
      setImpactFilter('ALL');
      setIssMinFilter('');
      setIssMaxFilter('');
      setDatePreset('all');
      setDateFrom('');
      setDateTo('');
      
      // Apply specific filter based on URL param
      if (filter === 'active') {
        // Active = Open, In Progress, Pending, Reopened (handled in filteredIncidents)
        setStatusFilter('ALL');
      } else if (filter === 'critical') {
        setPriorityFilter('1'); // PRY1
        setStatusFilter('ALL');
      } else if (filter === 'priority-2') {
        setPriorityFilter('2'); // PRY2
        setStatusFilter('ALL');
      } else if (filter === 'priority-3') {
        setPriorityFilter('3'); // PRY3
        setStatusFilter('ALL');
      } else if (filter === 'priority-4') {
        setPriorityFilter('4'); // PRY4
        setStatusFilter('ALL');
      } else if (filter === 'sla-risk') {
        setSlaFilter('AT_RISK');
        setStatusFilter('ALL');
      } else if (filter === 'overdue') {
        setSlaFilter('BREACHED');
        setStatusFilter('ALL');
      } else if (filter.startsWith('status-')) {
        const status = filter.replace('status-', '').toUpperCase();
        const normalizedStatus = status === 'CLOSED' ? 'Canceled' : status;
        setStatusFilter(normalizedStatus);
      }
    }
  }, [currentSearchString, urlFilter]);

  // SLA helper functions
  const getSlaDeadlineMs = (incident: Incident): number | null => {
    // Prefer actual sla_deadline from database (respects business hours)
    if (incident.sla_deadline) {
      const deadlineMs = new Date(incident.sla_deadline).getTime();
      if (!Number.isNaN(deadlineMs)) return deadlineMs;
    }
    // Fallback to calculated deadline if sla_deadline not set
    if (!incident.estimated_resolution_time || !incident.created_at) return null;
    const createdMs = new Date(incident.created_at).getTime();
    if (Number.isNaN(createdMs)) return null;
    return createdMs + incident.estimated_resolution_time * 60 * 1000;
  };

  const getSlaUsagePercent = (incident: Incident): number | null => {
    if (typeof incident.sla_percent_consumed === 'number' && Number.isFinite(incident.sla_percent_consumed)) {
      return incident.sla_percent_consumed;
    }

    if (incident.status === 'RESOLVED' && incident.sla_percent_at_resolve !== undefined) {
      return incident.sla_percent_at_resolve;
    }
    const deadlineMs = getSlaDeadlineMs(incident);
    if (!deadlineMs) return null;
    
    // Calculate total SLA time using estimated_resolution_time (in minutes)
    const totalSlaMs = incident.estimated_resolution_time ? incident.estimated_resolution_time * 60 * 1000 : null;
    if (!totalSlaMs) return null;
    
    const nowMs = Date.now();
    const msRemaining = deadlineMs - nowMs;
    
    // Calculate percent consumed based on SLA duration, not elapsed time from creation
    const msConsumed = totalSlaMs - msRemaining;
    const percentConsumed = (msConsumed / totalSlaMs) * 100;
    
    // Handle REOPENED incidents with accumulated SLA
    if (incident.status === 'REOPENED' && incident.sla_percent_at_resolve && incident.reopened_at) {
      const basePercent = incident.sla_percent_at_resolve;
      const reopenedMs = new Date(incident.reopened_at).getTime();
      const elapsedSinceReopen = Math.max(0, nowMs - reopenedMs);
      return basePercent + (elapsedSinceReopen / totalSlaMs) * 100;
    }
    
    return Math.max(0, percentConsumed);
  };

  const getResponseUsagePercent = (incident: Incident): number | null => {
    if (typeof incident.response_percent_consumed === 'number' && Number.isFinite(incident.response_percent_consumed)) {
      return incident.response_percent_consumed;
    }

    const targetMinutes = Number(incident.response_time_sla_minutes);
    if (!Number.isFinite(targetMinutes) || targetMinutes <= 0) return null;

    const createdMs = new Date(incident.created_at).getTime();
    if (Number.isNaN(createdMs)) return null;

    if (incident.response_time_confirmed_at) {
      if (typeof incident.response_time_minutes === 'number' && Number.isFinite(incident.response_time_minutes)) {
        return Math.min(100, Math.max(0, (incident.response_time_minutes / targetMinutes) * 100));
      }
      const confirmedMs = new Date(incident.response_time_confirmed_at).getTime();
      if (Number.isNaN(confirmedMs)) return null;
      const elapsedMinutes = Math.max(0, Math.round((confirmedMs - createdMs) / 60000));
      return Math.min(100, Math.max(0, (elapsedMinutes / targetMinutes) * 100));
    }

    if (incident.response_deadline) {
      const deadlineMs = new Date(incident.response_deadline).getTime();
      if (!Number.isNaN(deadlineMs)) {
        const remainingMinutes = Math.ceil((deadlineMs - Date.now()) / 60000);
        return Math.min(100, Math.max(0, ((targetMinutes - remainingMinutes) / targetMinutes) * 100));
      }
    }

    const elapsedMinutes = Math.max(0, Math.round((Date.now() - createdMs) / 60000));
    return Math.min(100, Math.max(0, (elapsedMinutes / targetMinutes) * 100));
  };

  const getAttachmentUrls = (incident: Incident): string[] => {
    const raw = (incident.attachment_urls || incident.attachments || incident.attachment_url) as any;
    if (!raw) return [];

    if (Array.isArray(raw)) {
      return raw.map((v) => String(v).trim()).filter(Boolean);
    }

    const asString = String(raw).trim();
    if (!asString) return [];

    if (asString.startsWith('[') && asString.endsWith(']')) {
      try {
        const parsed = JSON.parse(asString);
        if (Array.isArray(parsed)) {
          return parsed.map((v) => String(v).trim()).filter(Boolean);
        }
      } catch {
      }
    }

    if (asString.includes(',')) {
      return asString.split(',').map((v) => v.trim()).filter(Boolean);
    }

    return [asString];
  };

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get('/incidents?limit=100&offset=0');
      const loadedIncidents = res.data.data.incidents || [];
      loadedIncidents.sort((a: Incident, b: Incident) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setIncidents(loadedIncidents);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load incidents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Auto-refresh every 1 minute
    const interval = setInterval(() => {
      load();
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (urlFilter) params.set('filter', urlFilter);
    if (searchFilter) params.set('q', searchFilter);
    if (severityFilter !== 'ALL') params.set('sev', severityFilter);
    if (statusFilter !== 'ALL') params.set('st', statusFilter);
    if (priorityFilter !== 'ALL') params.set('prio', priorityFilter);
    if (slaFilter !== 'ALL') params.set('sla', slaFilter);
    if (assignedToFilter !== 'ALL') params.set('asg', assignedToFilter);
    if (categoryFilter !== 'ALL') params.set('cat', categoryFilter);
    if (impactFilter !== 'ALL') params.set('imp', impactFilter);
    if (issMinFilter !== '') params.set('issMin', issMinFilter);
    if (issMaxFilter !== '') params.set('issMax', issMaxFilter);
    if (datePreset !== 'all') params.set('dp', datePreset);
    if (datePreset === 'custom') {
      if (dateFrom) params.set('ds', dateFrom);
      if (dateTo) params.set('de', dateTo);
    }

    const nextSearchString = params.toString();
    if (nextSearchString !== currentSearchString) {
      setSearchParams(params, { replace: true });
    }
  }, [
    urlFilter,
    searchFilter,
    severityFilter,
    statusFilter,
    priorityFilter,
    slaFilter,
    assignedToFilter,
    categoryFilter,
    impactFilter,
    issMinFilter,
    issMaxFilter,
    datePreset,
    dateFrom,
    dateTo,
    currentSearchString,
    setSearchParams,
  ]);

  useEffect(() => {
    const restoreScrollY = (location.state as { restoreScrollY?: number } | null)?.restoreScrollY;
    const createSuccess = (location.state as { createSuccess?: string } | null)?.createSuccess;

    if (createSuccess) {
      setError('');
      load();
      onIncidentUpdate?.();
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

  // Derive unique assignees and categories for filter dropdowns
  const uniqueAssignees = useMemo(() =>
    Array.from(new Set(
      incidents.filter(i => i.assigned_to_name).map(i => i.assigned_to_name!)
    )).sort(),
  [incidents]);

  const uniqueCategories = useMemo(() =>
    Array.from(new Set(
      incidents.filter(i => i.category).map(i => i.category!)
    )).sort(),
  [incidents]);

  const filteredIncidents = incidents.filter(i => {
    // Special filter for active incidents — applies to 'active' and all priority/critical dashboard cards
    // (dashboard "By Priority" counts only active incidents, so clicking them should show only active)
    if (urlFilter === 'active' || urlFilter === 'critical' || urlFilter?.startsWith('priority-')) {
      const activeStatuses = ['OPEN', 'IN_PROGRESS', 'PENDING', 'REOPENED'];
      if (!activeStatuses.includes(i.status)) return false;
    }

    const normalizedSearch = searchFilter.trim().toLowerCase();
    if (
      normalizedSearch
      && !i.title.toLowerCase().includes(normalizedSearch)
      && !i.description?.toLowerCase().includes(normalizedSearch)
      && !i.id.toLowerCase().includes(normalizedSearch)
      && !generateNDI(i.id).toLowerCase().includes(normalizedSearch)
      && !`id ${generateNDI(i.id)}`.toLowerCase().includes(normalizedSearch)
    ) return false;

    if (statusFilter !== 'ALL' && i.status !== statusFilter) return false;

    if (priorityFilter !== 'ALL') {
      const incidentPriorityLevel = normalizePriorityLevel(getPrioritySource(i));
      if (incidentPriorityLevel !== Number(priorityFilter)) return false;
    }

    if (severityFilter !== 'ALL') {
      const incidentSeverityLevel = normalizeSeverityLevel(i.severity);
      if (incidentSeverityLevel !== Number(severityFilter)) return false;
    }

    // Assigned To filter
    if (assignedToFilter !== 'ALL') {
      if (assignedToFilter === 'UNASSIGNED') {
        if (i.assigned_to_name) return false;
      } else {
        if (i.assigned_to_name !== assignedToFilter) return false;
      }
    }

    // Category filter
    if (categoryFilter !== 'ALL' && i.category !== categoryFilter) return false;

    // Impact filter
    if (impactFilter !== 'ALL' && i.impact !== impactFilter) return false;

    // ISS Score range filter
    if (issMinFilter !== '' && i.iss_score !== undefined && i.iss_score < Number(issMinFilter)) return false;
    if (issMaxFilter !== '' && i.iss_score !== undefined && i.iss_score > Number(issMaxFilter)) return false;

    // SLA filter
    if (slaFilter !== 'ALL') {
      const usage = getSlaUsagePercent(i);
      if (usage === null) return false;
      if (slaFilter === 'ON_TIME' && usage >= 75) return false;
      if (slaFilter === 'AT_RISK' && (usage < 75 || usage >= 100)) return false;
      if (slaFilter === 'BREACHED' && usage < 100) return false;
    }

    if (urlFilter === 'response-today') {
      if (i.response_time_confirmed_at) return false;
      if (!i.response_deadline) return false;
      const activeStatuses = ['OPEN', 'IN_PROGRESS', 'PENDING', 'REOPENED'];
      if (!activeStatuses.includes(i.status)) return false;
      const now = new Date();
      const deadline = new Date(i.response_deadline);
      const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      if (Number.isNaN(deadline.getTime())) return false;
      if (deadline < now || deadline >= dayEnd) return false;
    }

    // Date preset filter
    const createdAt = new Date(i.created_at);
    const now = new Date();
    const isToday =
      createdAt.getDate() === now.getDate() &&
      createdAt.getMonth() === now.getMonth() &&
      createdAt.getFullYear() === now.getFullYear();
    const isThisMonth =
      createdAt.getMonth() === now.getMonth() &&
      createdAt.getFullYear() === now.getFullYear();
    const matchesDatePreset =
      datePreset === 'all' ||
      (datePreset === 'day' && isToday) ||
      (datePreset === 'month' && isThisMonth) ||
      (() => {
        if (datePreset !== 'custom') return false;
        if (!dateFrom && !dateTo) return true;
        const createdDateOnly = new Date(createdAt.getFullYear(), createdAt.getMonth(), createdAt.getDate()).getTime();
        if (dateFrom) {
          const fromTime = new Date(`${dateFrom}T00:00:00`).getTime();
          if (!Number.isNaN(fromTime) && createdDateOnly < fromTime) return false;
        }
        if (dateTo) {
          const toTime = new Date(`${dateTo}T23:59:59`).getTime();
          if (!Number.isNaN(toTime) && createdDateOnly > toTime) return false;
        }
        return true;
      })();

    if (!matchesDatePreset) return false;

    return true;
  }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <div className="bg-transparent">
      <Header user={user} title="Incidents" subtitle="System incident management" actions={
        <button
          onClick={() => navigate('/incidents/new', { state: { from: `${location.pathname}${location.search}`, scrollY: window.scrollY } })}
          className="btn-pry1 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          New Incident
        </button>
      } />

      <div className="px-6 pt-6 pb-4 space-y-2">
        <div className="flex gap-2 flex-wrap md:flex-nowrap md:overflow-x-auto md:pb-2 items-center">
          <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search incidents..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="input pl-10 max-w-xs"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="select max-w-[170px]"
        >
          <option value="ALL">All Statuses</option>
          <option value="OPEN">Open</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="PENDING">Pending</option>
          <option value="RESOLVED">Resolved</option>
          <option value="Canceled">Canceled</option>
          <option value="REOPENED">Reopened</option>
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="select max-w-[170px]"
        >
          <option value="ALL">All Priority</option>
          <option value="1">PRY1</option>
          <option value="2">PRY2</option>
          <option value="3">PRY3</option>
          <option value="4">PRY4</option>
        </select>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="select max-w-[150px]"
        >
          <option value="ALL">All Severity</option>
          <option value="1">SEV1</option>
          <option value="2">SEV2</option>
          <option value="3">SEV3</option>
          <option value="4">SEV4</option>
        </select>
        <select
          value={slaFilter}
          onChange={(e) => setSlaFilter(e.target.value)}
          className="select max-w-[140px]"
        >
          <option value="ALL">All SLA</option>
          <option value="ON_TIME">On time</option>
          <option value="AT_RISK">At risk</option>
          <option value="BREACHED">Breached</option>
        </select>
        <select
          value={assignedToFilter}
          onChange={(e) => setAssignedToFilter(e.target.value)}
          className="select max-w-[160px]"
        >
          <option value="ALL">All Assignees</option>
          <option value="UNASSIGNED">Unassigned</option>
          {uniqueAssignees.map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="select max-w-[160px]"
        >
          <option value="ALL">All Categories</option>
          {uniqueCategories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        <select
          value={impactFilter}
          onChange={(e) => setImpactFilter(e.target.value)}
          className="select max-w-[160px]"
        >
          <option value="ALL">All Impact</option>
          <option value="SINGLE_USER">Single User</option>
          <option value="DEPARTMENT">Department</option>
          <option value="ORGANIZATION">Organization</option>
        </select>
          {(searchFilter || statusFilter !== 'ALL' || priorityFilter !== 'ALL' || severityFilter !== 'ALL' || slaFilter !== 'ALL' || assignedToFilter !== 'ALL' || categoryFilter !== 'ALL' || impactFilter !== 'ALL' || issMinFilter !== '' || issMaxFilter !== '' || datePreset !== 'all' || dateFrom || dateTo) && (
            <button
              onClick={() => {
                setSearchFilter('');
                setStatusFilter('ALL');
                setPriorityFilter('ALL');
                setSeverityFilter('ALL');
                setSlaFilter('ALL');
                setAssignedToFilter('ALL');
                setCategoryFilter('ALL');
                setImpactFilter('ALL');
                setIssMinFilter('');
                setIssMaxFilter('');
                setDatePreset('all');
                setDateFrom('');
                setDateTo('');
              }}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Reset
            </button>
          )}
        </div>

        <div className="flex gap-2 flex-wrap items-center">
          <div className="flex items-center gap-2 px-2.5 py-2.5 border border-neutral-200 bg-gradient-to-r from-neutral-50 to-white rounded-none shadow-sm">
          <span className="text-xs text-neutral-500 font-medium">ISS:</span>
          <input
            type="number"
            placeholder="Min"
            value={issMinFilter}
            onChange={(e) => setIssMinFilter(e.target.value)}
            className="input w-14 text-xs px-2 py-1"
            min="0"
            max="5"
            step="0.1"
          />
          <span className="text-neutral-400">-</span>
          <input
            type="number"
            placeholder="Max"
            value={issMaxFilter}
            onChange={(e) => setIssMaxFilter(e.target.value)}
            className="input w-14 text-xs px-2 py-1"
            min="0"
            max="5"
            step="0.1"
          />
          </div>

          <div className="flex items-center gap-2 px-2 py-2 border border-neutral-200 bg-gradient-to-r from-neutral-50 to-white rounded-none shadow-sm">
            <div className="w-7 h-7 rounded-none bg-primary-50 flex items-center justify-center border border-primary-100">
              <svg className="w-3.5 h-3.5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="grid grid-cols-4 gap-1 bg-neutral-100 p-1 rounded-none">
            <button
              type="button"
              onClick={() => setDatePreset('all')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-none transition-colors whitespace-nowrap ${datePreset === 'all' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'}`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setDatePreset('day')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-none transition-colors whitespace-nowrap ${datePreset === 'day' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'}`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setDatePreset('month')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-none transition-colors whitespace-nowrap ${datePreset === 'month' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'}`}
            >
              Month
            </button>
            <button
              type="button"
              onClick={() => setDatePreset('custom')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-none transition-colors whitespace-nowrap ${datePreset === 'custom' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'}`}
            >
              Range
            </button>
            </div>
          </div>

          {datePreset === 'custom' && (
            <div className="flex items-center gap-2 px-2.5 py-2 border border-neutral-200 bg-gradient-to-r from-neutral-50 to-white rounded-none shadow-sm">
              <span className="text-xs font-medium text-neutral-500">From</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="input text-xs px-2 py-1 w-[150px]"
              />
              <span className="text-xs font-medium text-neutral-500">To</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="input text-xs px-2 py-1 w-[150px]"
              />
            </div>
          )}
        </div>
      </div>

      <div className="px-6 pb-6">
        <Card padding="none" className="bg-white border border-gray-200 shadow-sm rounded-none">
          <div className="px-5 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Incident List</h3>
                <p className="text-sm text-gray-500 mt-0.5">{filteredIncidents.length} incidents found</p>
              </div>
              {urlFilter && (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-primary-100 text-primary-800 border border-primary-200">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                    </svg>
                    {urlFilter === 'active' ? 'Active Incidents' :
                     urlFilter === 'critical' ? 'Critical (PRY1)' :
                     urlFilter === 'priority-2' ? 'High (PRY2)' :
                     urlFilter === 'priority-3' ? 'Medium (PRY3)' :
                     urlFilter === 'priority-4' ? 'Low (PRY4)' :
                     urlFilter === 'sla-risk' ? 'SLA At Risk' :
                     urlFilter === 'overdue' ? 'SLA Breached' :
                     urlFilter === 'response-today' ? 'Response Expiring Today' :
                     urlFilter.startsWith('status-') ? urlFilter.replace('status-', '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) :
                     urlFilter}
                  </span>
                  <button
                    onClick={() => {
                      setUrlFilter(null);
                      appliedUrlFilterRef.current = null;
                      setSearchParams(new URLSearchParams(), { replace: true });
                      setStatusFilter('ALL');
                      setPriorityFilter('ALL');
                      setSlaFilter('ALL');
                    }}
                    className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition"
                    title="Clear filter"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </div>
          {loading ? (
            <div className="p-12 text-center">
              <div className="spinner mx-auto mb-3"></div>
              <p className="text-neutral-500">Loading incidents...</p>
            </div>
          ) : filteredIncidents.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 mx-auto bg-neutral-100 rounded-2xl flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
              </div>
              <p className="text-neutral-500 font-medium">No incidents found</p>
              <button
                onClick={() => navigate('/incidents/new', { state: { from: `${location.pathname}${location.search}`, scrollY: window.scrollY } })}
                className="mt-4 btn-primary"
              >
                Create first incident
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-380px)] scrollbar-sidebar">
              <table className="w-full min-w-[1480px]">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">ID</th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[150px]">Incident</th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-24">Category</th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-28">Impact</th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-14">ISS</th>
                    {user?.role === 'ENGINEER' ? (
                      <>
                        <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">Priority</th>
                        <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">Severity</th>
                      </>
                    ) : (
                      <>
                        <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">Severity</th>
                        <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">Priority</th>
                      </>
                    )}
                    <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-36">Assigned To</th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-24">Status</th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-24">Response Time</th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-24">SLA</th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-24">Created</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredIncidents.map((item) => {
                    const slaUsage = getSlaUsagePercent(item);
                    const responseUsage = getResponseUsagePercent(item);
                    const impactLabel = item.impact === 'ORGANIZATION' ? 'Organization' : item.impact === 'DEPARTMENT' ? 'Department' : item.impact === 'SINGLE_USER' ? 'Single User' : '-';
                    const impactColor = item.impact === 'ORGANIZATION' ? 'text-red-600 bg-red-50' : item.impact === 'DEPARTMENT' ? 'text-orange-600 bg-orange-50' : 'text-gray-600 bg-gray-50';
                    return (
                    <tr
                      key={item.id}
                      className="hover:bg-gray-50 transition-colors group cursor-pointer"
                      onClick={() => {
                        markAsRead(item.id);
                        navigate(`/incidents/${item.id}`, { state: { from: `${location.pathname}${location.search}`, scrollY: window.scrollY } });
                      }}
                    >
                      <td className="px-2 py-2 align-middle">
                        <span className="text-sm font-semibold text-neutral-600">ID {generateNDI(item.id)}</span>
                      </td>
                      <td className="px-2 py-2 align-middle">
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                              <span className="min-w-0 font-medium text-gray-900 group-hover:text-primary-600 text-sm truncate max-w-[130px] transition-colors" title={item.title}>
                                {item.title}
                              </span>
                            {user?.role !== 'ENGINEER' && isUnreadIncident(item) && (
                              <span className="shrink-0 flex items-center" title="Unread incident">
                                <span className="w-2 h-2 bg-red-600 rounded-full animate-pulse border border-white"></span>
                              </span>
                            )}
                            {getAttachmentUrls(item).length > 0 && (
                              <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                              </svg>
                            )}
                          </div>
                          <span className="text-xs text-gray-500 mt-0.5 truncate max-w-[130px]" title={item.description}>{item.description}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-center align-middle">
                        <span className="text-sm text-gray-700">{item.category ? item.category.replace(/_/g, ' ').toLowerCase().replace(/^(\w)/, c => c.toUpperCase()) : '-'}</span>
                      </td>
                      <td className="px-2 py-2 text-center align-middle">
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${impactColor.replace(/bg-[^ ]+/g, '')}`}>
                          {impactLabel}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-center align-middle">
                        {item.iss_score != null ? (
                          <span className={`text-xs font-bold ${
                            item.iss_score >= 4 ? 'text-red-600' :
                            item.iss_score >= 3 ? 'text-orange-600' :
                            item.iss_score >= 2 ? 'text-yellow-600' :
                            'text-green-600'
                          }`}>
                            {item.iss_score.toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                      {user?.role === 'ENGINEER' ? (
                        <>
                          <td className="px-2 py-2 text-center align-middle">
                            <PriorityBadge priority={getPrioritySource(item)} format="numbered" size="sm" />
                          </td>
                          <td className="px-2 py-2 text-center align-middle">
                            <SeverityBadge severity={item.severity} size="sm" />
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-2 py-2 text-center align-middle">
                            <SeverityBadge severity={item.severity} size="sm" />
                          </td>
                          <td className="px-2 py-2 text-center align-middle">
                            <PriorityBadge priority={getPrioritySource(item)} format="numbered" size="sm" />
                          </td>
                        </>
                      )}
                      <td className="px-2 py-2 text-center align-middle">
                        {item.assignment_status === 'PENDING_APPROVAL' ? (
                          <span className="text-sm text-gray-400 italic inline-block leading-5 max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap" title={item.pending_assigned_to_name ? `Pending: ${item.pending_assigned_to_name}` : 'Pending'}>
                            {item.pending_assigned_to_name ? `Pending: ${item.pending_assigned_to_name}` : 'Pending'}
                          </span>
                        ) : !item.assigned_to_name ? (
                          <span className="text-sm text-gray-400 italic">Unassigned</span>
                        ) : (
                          <span className="text-sm text-gray-700 truncate max-w-[100px] inline-block">{item.assigned_to_name}</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-center align-middle">
                        <StatusBadge status={item.status} size="sm" />
                      </td>
                      <td className="px-2 py-2 text-center align-middle">
                        {responseUsage === null ? (
                          <span className="text-xs text-gray-400">-</span>
                        ) : responseUsage >= 100 ? (
                          <span className="text-xs font-semibold text-red-600">Breached</span>
                        ) : (
                          <div className="inline-flex flex-col items-center leading-tight">
                            <span className={`text-xs font-semibold ${
                              responseUsage >= 75 ? 'text-orange-600' : 'text-green-600'
                            }`}>
                              {responseUsage >= 75 ? 'At risk' : 'On time'}
                            </span>
                            <span className={`text-[10px] font-bold ${
                              responseUsage >= 75 ? 'text-orange-600' : 'text-green-600'
                            }`}>
                              {Math.round(responseUsage)}%
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 text-center align-middle">
                        {slaUsage === null ? (
                          <span className="text-xs text-gray-400">-</span>
                        ) : slaUsage >= 100 ? (
                          <span className="text-xs font-semibold text-red-600">Breached</span>
                        ) : (
                          <div className="inline-flex flex-col items-center leading-tight">
                            <span className={`text-xs font-semibold ${
                              slaUsage >= 75 ? 'text-orange-600' : 'text-green-600'
                            }`}>
                              {slaUsage >= 75 ? 'At risk' : 'On time'}
                            </span>
                            <span className={`text-[10px] font-bold ${
                              slaUsage >= 75 ? 'text-orange-600' : 'text-green-600'
                            }`}>
                              {Math.round(slaUsage)}%
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 text-sm text-gray-500 text-center align-middle whitespace-nowrap">
                        <div className="flex flex-col items-center justify-center">
                          <span>{formatDate(item.created_at)}</span>
                          <span className="text-xs text-gray-400">{formatTime(item.created_at)}</span>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

    </div>
  );
}
