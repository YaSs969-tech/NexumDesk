import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Header, Card, StatusBadge, SeverityBadge, PriorityBadge, Modal } from '../components';
import {
  formatDurationMinutes,
  generateNDI,
  getPrioritySource,
  isActiveStatus,
  normalizePriorityLevel,
  normalizeSeverityLevel,
} from '../utils/format';
import { useReadIncidents } from '../hooks/useReadIncidents';

interface Incident {
  id: string;
  title: string;
  description: string;
  category?: string;
  severity: string;
  calculated_severity?: string;
  priority: string;
  calculated_priority?: string;
  urgency?: string;
  status: string;
  service_id: string;
  service_name?: string;
  assigned_to: string | null;
  assigned_to_name?: string;
  created_by: string;
  created_by_name?: string;
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
}

interface User {
  id: string;
  username: string;
  email: string;
  full_name?: string;
  role: string;
}

interface EngineerDashboardProps {
  user: User | null;
  notifications?: any;
}

export default function EngineerDashboard({ user, notifications }: EngineerDashboardProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [resolutionTime, setResolutionTime] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  
  // Filter state
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [slaRiskFilter, setSlaRiskFilter] = useState<string>('ALL');
  const [responseRiskFilter, setResponseRiskFilter] = useState<string>('ALL');
  const [datePreset, setDatePreset] = useState<'all' | 'day' | 'month'>('all');
  const [urlFilter, setUrlFilter] = useState<string | null>(null);
  const { markAsRead, isUnreadIncident } = useReadIncidents(user?.id);
  type TaskFiltersState = {
    searchFilter: string;
    statusFilter: string;
    priorityFilter: string;
    severityFilter: string;
    slaRiskFilter: string;
    responseRiskFilter: string;
    datePreset: 'all' | 'day' | 'month';
  };

  // Read URL filter param and apply appropriate filters
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const filter = params.get('filter');
    setUrlFilter(filter);
    
    // Reset all filters first
    setStatusFilter('ALL');
    setPriorityFilter('ALL');
    setSeverityFilter('ALL');
    setSlaRiskFilter('ALL');
    setResponseRiskFilter('ALL');
    setDatePreset('all');
    
    // Apply specific filter based on URL param
    if (filter === 'critical') {
      // Critical card in dashboard includes PRY1 OR SEV1.
      setPriorityFilter('ALL');
      setSeverityFilter('ALL');
    } else if (filter === 'overdue') {
      setSlaRiskFilter('BREACHED');
    } else if (filter === 'response-today') {
      setResponseRiskFilter('AT_RISK');
    }
    // 'assigned', 'sla-today' and 'response-today' are handled in filteredIncidents
  }, [location.search]);


  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get('/incidents?limit=5000&page=1');
      const allIncidents = res.data.data.incidents || [];
      // Filter to only show incidents assigned to this engineer
      const myIncidents = allIncidents
        .filter((i: Incident) => i.assigned_to === user?.id)
        .sort((a: Incident, b: Incident) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setIncidents(myIncidents);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load incidents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [user]);

  useEffect(() => {
    const restoreScrollY = (location.state as { restoreScrollY?: number } | null)?.restoreScrollY;
    const createSuccess = (location.state as { createSuccess?: string } | null)?.createSuccess;
    const restoreFilters = (location.state as { restoreFilters?: TaskFiltersState } | null)?.restoreFilters;

    if (restoreFilters) {
      setSearchFilter(restoreFilters.searchFilter || '');
      setStatusFilter(restoreFilters.statusFilter || 'ALL');
      setPriorityFilter(restoreFilters.priorityFilter || 'ALL');
      setSeverityFilter(restoreFilters.severityFilter || 'ALL');
      setSlaRiskFilter(restoreFilters.slaRiskFilter || 'ALL');
      setResponseRiskFilter(restoreFilters.responseRiskFilter || 'ALL');
      setDatePreset(restoreFilters.datePreset || 'all');
    }

    if (createSuccess) {
      setError('');
      load();
    }

    if (typeof restoreScrollY === 'number') {
      requestAnimationFrame(() => {
        window.scrollTo({ top: restoreScrollY, behavior: 'auto' });
      });
    }

    if (typeof restoreScrollY === 'number' || createSuccess || restoreFilters) {
      navigate(`${location.pathname}${location.search}`, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, location.search, navigate]);

  const updateStatus = async (incidentId: string, newStatus: string) => {
    try {
      markAsRead(incidentId);
      await api.put(`/incidents/${incidentId}`, { status: newStatus });
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update incident');
    }
  };

  const openCompleteModal = (incident: Incident) => {
    markAsRead(incident.id);
    setSelectedIncident(incident);
    setResolutionNotes(incident.resolution_notes || '');
    
    // Calculate actual resolution time if incident was assigned
    const startTime = new Date(incident.created_at).getTime();
    const now = Date.now();
    const elapsedMinutes = Math.round((now - startTime) / 60000);
    setResolutionTime(incident.resolution_time || elapsedMinutes);
    
    setShowCompleteModal(true);
  };

  const completeIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIncident) return;

    try {
      setSubmitting(true);
      await api.post(`/incidents/${selectedIncident.id}/complete`, {
        resolution_notes: resolutionNotes,
        resolution_time: resolutionTime,
      });
      setShowCompleteModal(false);
      setSelectedIncident(null);
      setResolutionNotes('');
      setResolutionTime(0);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to complete incident');
    } finally {
      setSubmitting(false);
    }
  };

  const getPrioritySource = (incident: Incident) => incident.priority || incident.calculated_priority || incident.urgency || 'MEDIUM';
  const getSeveritySource = (incident: Incident) => incident.severity || incident.calculated_severity || 'SEV-3';

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

  const getSlaDeadlineMs = (incident: Incident): number | null => {
    if (incident.sla_deadline) {
      const deadlineMs = new Date(incident.sla_deadline).getTime();
      if (!Number.isNaN(deadlineMs)) return deadlineMs;
    }

    if (!incident.estimated_resolution_time) return null;
    const createdMs = new Date(incident.created_at).getTime();
    if (Number.isNaN(createdMs)) return null;

    return createdMs + incident.estimated_resolution_time * 60 * 1000;
  };

  const getSlaUsagePercent = (incident: Incident): number | null => {
    if (typeof incident.sla_percent_consumed === 'number' && Number.isFinite(incident.sla_percent_consumed)) {
      return incident.sla_percent_consumed;
    }

    // If RESOLVED, return saved percentage (timer stopped)
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
    
    // For REOPENED incidents, start from saved percentage
    if (incident.status === 'REOPENED' && incident.sla_percent_at_resolve) {
      // Calculate additional time from reopen
      if (incident.reopened_at) {
        const reopenedMs = new Date(incident.reopened_at).getTime();
        const elapsedSinceReopen = Math.max(0, nowMs - reopenedMs);
        return incident.sla_percent_at_resolve + (elapsedSinceReopen / totalSlaMs) * 100;
      }
    }

    return Math.max(0, percentConsumed);
  };

  const isRiskySla = (incident: Incident): boolean => {
    const usage = getSlaUsagePercent(incident);
    return usage !== null && usage >= 75;
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

  const formatSlaDeadline = (incident: Incident) => {
    const deadlineMs = getSlaDeadlineMs(incident);
    if (!deadlineMs) {
      return { date: '-', time: '' };
    }

    const date = new Date(deadlineMs);
    return {
      date: date.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      time: date.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' }),
    };
  };

  // Filtered incidents
  const filteredIncidents = incidents.filter(incident => {
    if (urlFilter === 'assigned' && !isActiveStatus(incident.status)) return false;

    if (urlFilter === 'critical') {
      const incidentPriorityLevel = normalizePriorityLevel(getPrioritySource(incident));
      const incidentSeverityLevel = normalizeSeverityLevel(getSeveritySource(incident));
      if (incidentPriorityLevel !== 1 && incidentSeverityLevel !== 1) return false;
    }

    // Special filter for SLA expiring today (from dashboard card)
    if (urlFilter === 'sla-today') {
      if (!incident.sla_deadline) return false;
      const now = new Date();
      const deadline = new Date(incident.sla_deadline);
      const today = now.toISOString().split('T')[0];
      const todayEnd = new Date(today + 'T23:59:59');
      if (!isActiveStatus(incident.status)) return false;
      if (deadline < now || deadline > todayEnd) return false;
    }

    if (urlFilter === 'response-today') {
      if (incident.response_time_confirmed_at) return false;
      if (!incident.response_deadline) return false;
      const now = new Date();
      const deadline = new Date(incident.response_deadline);
      const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      if (!isActiveStatus(incident.status)) return false;
      if (Number.isNaN(deadline.getTime())) return false;
      if (deadline < now || deadline >= dayEnd) return false;
    }

    const normalizedSearch = searchFilter.trim().toLowerCase();
    if (
      normalizedSearch
      && !incident.title.toLowerCase().includes(normalizedSearch)
      && !incident.description?.toLowerCase().includes(normalizedSearch)
      && !incident.id.toLowerCase().includes(normalizedSearch)
      && !generateNDI(incident.id).toLowerCase().includes(normalizedSearch)
      && !`id ${generateNDI(incident.id)}`.toLowerCase().includes(normalizedSearch)
    ) return false;

    if (statusFilter !== 'ALL' && incident.status !== statusFilter) return false;

    if (priorityFilter !== 'ALL') {
      const incidentPriorityLevel = normalizePriorityLevel(getPrioritySource(incident));
      if (incidentPriorityLevel !== Number(priorityFilter)) return false;
    }

    if (severityFilter !== 'ALL') {
      const incidentSeverityLevel = normalizeSeverityLevel(getSeveritySource(incident));
      if (incidentSeverityLevel !== Number(severityFilter)) return false;
    }

    // SLA filter with On time, At risk, Breached
    if (slaRiskFilter !== 'ALL') {
      const usage = getSlaUsagePercent(incident);
      if (usage === null) return false;
      if (slaRiskFilter === 'ON_TIME' && usage >= 75) return false;
      if (slaRiskFilter === 'AT_RISK' && (usage < 75 || usage >= 100)) return false;
      if (slaRiskFilter === 'BREACHED' && usage < 100) return false;
    }

    if (responseRiskFilter !== 'ALL') {
      const usage = getResponseUsagePercent(incident);
      if (usage === null) return false;
      if (responseRiskFilter === 'ON_TIME' && usage >= 75) return false;
      if (responseRiskFilter === 'AT_RISK' && (usage < 75 || usage >= 100)) return false;
      if (responseRiskFilter === 'BREACHED' && usage < 100) return false;
    }

    const createdAt = new Date(incident.created_at);
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
      (datePreset === 'month' && isThisMonth);

    if (!matchesDatePreset) return false;

    return true;
  }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      time: date.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' }),
    };
  };

  return (
    <div className="bg-transparent">
      <Header 
        user={user} 
        title="My Tasks" 
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
        <div className="mx-6 mt-4 bg-danger-50 border border-danger-200 text-danger-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="px-6 pt-6 pb-4 flex gap-2 flex-wrap md:flex-nowrap md:overflow-x-auto md:pb-2 items-center">
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
          className="select max-w-[170px]"
        >
          <option value="ALL">All Severity</option>
          <option value="1">SEV1</option>
          <option value="2">SEV2</option>
          <option value="3">SEV3</option>
          <option value="4">SEV4</option>
        </select>
        <select
          value={slaRiskFilter}
          onChange={(e) => setSlaRiskFilter(e.target.value)}
          className="select max-w-[150px]"
        >
          <option value="ALL">All SLA</option>
          <option value="ON_TIME">On time</option>
          <option value="AT_RISK">At risk</option>
          <option value="BREACHED">Breached</option>
        </select>
        <select
          value={responseRiskFilter}
          onChange={(e) => setResponseRiskFilter(e.target.value)}
          className="select max-w-[170px]"
        >
          <option value="ALL">All Resp. Time</option>
          <option value="ON_TIME">On time</option>
          <option value="AT_RISK">At risk</option>
          <option value="BREACHED">Breached</option>
        </select>
        <div className="flex items-center gap-2 px-2 py-1 border border-neutral-200 bg-gradient-to-r from-neutral-50 to-white rounded-none shadow-sm">
          <div className="w-8 h-8 rounded-none bg-primary-50 flex items-center justify-center border border-primary-100">
            <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="grid grid-cols-3 gap-1 bg-neutral-100 p-1 rounded-none">
            <button
              type="button"
              onClick={() => setDatePreset('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-none transition-colors whitespace-nowrap ${datePreset === 'all' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'}`}
            >
              All Dates
            </button>
            <button
              type="button"
              onClick={() => setDatePreset('day')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-none transition-colors whitespace-nowrap ${datePreset === 'day' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'}`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setDatePreset('month')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-none transition-colors whitespace-nowrap ${datePreset === 'month' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'}`}
            >
              This Month
            </button>
          </div>
        </div>
        {urlFilter && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-primary-50 border border-primary-200 rounded-lg">
            <span className="text-sm font-medium text-primary-700">
              {urlFilter === 'assigned' && 'Active Assigned'}
              {urlFilter === 'critical' && 'Critical Only'}
              {urlFilter === 'sla-today' && 'SLA Expiring Today'}
              {urlFilter === 'overdue' && 'Overdue Tasks'}
              {urlFilter === 'response-today' && 'Response Expiring Today'}
            </span>
            <button
              onClick={() => {
                navigate('/tasks', { replace: true });
              }}
              className="text-primary-600 hover:text-primary-800"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        {(searchFilter || statusFilter !== 'ALL' || priorityFilter !== 'ALL' || severityFilter !== 'ALL' || slaRiskFilter !== 'ALL' || responseRiskFilter !== 'ALL' || datePreset !== 'all') && !urlFilter && (
          <button
            onClick={() => {
              setSearchFilter('');
              setStatusFilter('ALL');
              setPriorityFilter('ALL');
              setSeverityFilter('ALL');
              setSlaRiskFilter('ALL');
              setResponseRiskFilter('ALL');
              setDatePreset('all');
            }}
            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            Reset
          </button>
        )}
        {/* eliminat textul cu numărul de incidente din zona filtrelor */}
      </div>

      {/* Incidents Table */}
      <div className="px-6 pb-6">
        <Card padding="none" className="bg-white border border-gray-200 shadow-sm rounded-none">
          <div className="px-5 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">My Assigned Incidents</h3>
            <span className="text-sm text-gray-500 ml-2">{filteredIncidents.length} incident{filteredIncidents.length !== 1 ? 's' : ''} found</span>
          </div>
          
          {loading ? (
            <div className="p-12 text-center">
              <div className="inline-block w-8 h-8 border-4 border-gray-200 border-t-neutral-900 rounded-full animate-spin"></div>
              <p className="mt-4 text-gray-500">Loading incidents...</p>
            </div>
          ) : filteredIncidents.length === 0 ? (
            <div className="p-12 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="mt-4 text-gray-500">No incidents assigned to you.</p>
            </div>
          ) : (
            <div className="overflow-x-auto overflow-y-auto max-h-[580px] scrollbar-sidebar">
              <table className="w-full min-w-[1100px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Incident</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Severity</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Response Time</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">SLA Deadline</th>
                    <th className="px-5 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredIncidents.map((incident) => {
                    const { date, time } = formatDateTime(incident.created_at);
                    const sla = formatSlaDeadline(incident);
                    const slaUsage = getSlaUsagePercent(incident);
                    const responseUsage = getResponseUsagePercent(incident);
                    const isSlaRisk = slaUsage !== null && slaUsage >= 75;
                    return (
                      <tr
                        key={incident.id}
                        className="hover:bg-gray-50 transition-colors group cursor-pointer"
                        onClick={() => {
                          markAsRead(incident.id);
                          navigate(`/incidents/${incident.id}`, {
                            state: {
                              from: `${location.pathname}${location.search}`,
                              scrollY: window.scrollY,
                              restoreFilters: {
                                searchFilter,
                                statusFilter,
                                priorityFilter,
                                severityFilter,
                                slaRiskFilter,
                                responseRiskFilter,
                                datePreset,
                              },
                            },
                          });
                        }}
                      >
                        <td className="px-3 py-2 align-middle">
                          <span className="text-sm font-semibold text-neutral-600">ID {generateNDI(incident.id)}</span>
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-medium text-gray-900 group-hover:text-primary-600 text-left transition-colors truncate">
                              {incident.title}
                            </span>
                            {isUnreadIncident(incident) && (
                              <span className="shrink-0 flex items-center" title="Unread incident">
                                <span className="w-2 h-2 bg-red-600 rounded-full animate-pulse border border-white"></span>
                              </span>
                            )}
                            {getAttachmentUrls(incident).length > 0 && (
                              <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                              </svg>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 truncate max-w-xs">{incident.description}</p>
                        </td>
                        <td className="px-3 py-2 text-center align-middle">
                          <span className="text-sm text-gray-700">{incident.category ? incident.category.replace(/_/g, ' ').toLowerCase().replace(/^(\w)/, c => c.toUpperCase()) : '-'}</span>
                        </td>
                        <td className="px-3 py-2 text-center align-middle">
                          <PriorityBadge priority={getPrioritySource(incident)} format="numbered" />
                        </td>
                        <td className="px-3 py-2 text-center align-middle">
                          <SeverityBadge severity={incident.severity} />
                        </td>
                        <td className="px-3 py-2 text-center align-middle">
                          {responseUsage === null ? (
                            <span className="text-sm text-gray-400">-</span>
                          ) : (
                            <div className="inline-flex flex-col items-center leading-tight">
                              <span className={`text-sm font-semibold ${
                                responseUsage >= 100 ? 'text-red-600' :
                                responseUsage >= 75 ? 'text-orange-600' :
                                'text-green-600'
                              }`}>
                                {responseUsage >= 100 ? 'Breached' : responseUsage >= 75 ? 'At risk' : 'On time'}
                              </span>
                              {responseUsage < 100 && (
                                <span className={`mt-0.5 text-[11px] font-bold ${
                                  responseUsage >= 75 ? 'text-orange-600' : 'text-green-600'
                                }`}>
                                  {Math.round(responseUsage)}%
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center align-middle">
                          {slaUsage === null ? (
                            <span className="text-sm text-gray-400">-</span>
                          ) : (
                            <div className="inline-flex flex-col items-center leading-tight">
                              <span className={`text-sm font-semibold ${
                                slaUsage >= 100 ? 'text-red-600' : 
                                slaUsage >= 75 ? 'text-orange-600' : 
                                'text-green-600'
                              }`}>
                                {slaUsage >= 100 ? 'Breached' : slaUsage >= 75 ? 'At risk' : 'On time'}
                              </span>
                              {slaUsage < 100 && (
                                <span className={`mt-0.5 text-[11px] font-bold ${
                                  slaUsage >= 75 ? 'text-orange-600' : 'text-green-600'
                                }`}>
                                  {Math.round(slaUsage)}%
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-4 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                          <StatusBadge status={incident.status} />
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-500 text-center align-middle">
                          <div>{date}</div>
                          <div className="text-xs">{time}</div>
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

      {/* Complete Incident Modal */}
      <Modal
        isOpen={showCompleteModal}
        onClose={() => setShowCompleteModal(false)}
        title="Complete Incident"
        size="md"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        }
        footer={
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setShowCompleteModal(false)}
              className="btn-cancel px-5 py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={(e) => completeIncident(e)}
              disabled={submitting}
              className="btn-action-reopen px-6 py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
            >
              {submitting && <span className="spinner w-4 h-4 border-2"></span>}
              {submitting ? 'Completing...' : 'Mark as Resolved'}
            </button>
          </div>
        }
      >
        {selectedIncident && (
          <div className="bg-sky-50/40 -m-6 p-6">
          <div className="space-y-4">
            <div className="bg-neutral-50 rounded-lg p-3">
              <p className="text-sm font-medium text-neutral-700">Incident:</p>
              <p className="text-neutral-900 font-medium">{selectedIncident.title}</p>
              <p className="text-sm text-neutral-600 mt-1">{selectedIncident.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-neutral-500">Estimated Time</p>
                <p className="font-medium">{formatDurationMinutes(selectedIncident.estimated_resolution_time)}</p>
              </div>
              <div>
                <p className="text-sm text-neutral-500">Actual Time</p>
                <input
                  type="number"
                  value={resolutionTime}
                  onChange={(e) => setResolutionTime(parseInt(e.target.value) || 0)}
                  min="1"
                  className="input mt-1"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Resolution Notes
              </label>
              <textarea
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Describe how the incident was resolved..."
                rows={4}
                className="input"
              />
            </div>
          </div>
          </div>
        )}
      </Modal>

    </div>
  );
}
