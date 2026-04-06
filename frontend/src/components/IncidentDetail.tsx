import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { Card, Modal, StatusBadge, PriorityBadge } from '../components';
import { ConfirmModal } from './Modal';
import { formatDate, formatDateTime, generateNDI, formatDurationMinutes } from '../utils/format';

interface IncidentDetailProps {
  incidentId: string;
  user: {
    id: string;
    username: string;
    email: string;
    full_name?: string;
    role: string;
  } | null;
  onBack: () => void;
  onUpdate: () => void;
}

interface Incident {
  id: string;
  title: string;
  description: string;
  severity: string;
  priority: string;
  urgency?: string;
  status: string;
  category: string;
  impact: string;
  department: string;
  room: string;
  workstation_id: string;
  detected_at: string;
  created_at: string;
  updated_at: string;
  resolved_at: string;
  assigned_to: string | null;
  assigned_to_name: string;
  assigned_to_email: string;
  assigned_to_phone: string;
  assigned_to_department?: string;
  assigned_to_job_title?: string;
  assigned_to_tier?: string;
  created_by: string;
  created_by_name: string;
  created_by_email: string;
  created_by_phone: string;
  created_by_department: string;
  created_by_job_title: string;
  created_by_role?: string;
  created_by_tier?: string;
  resolution_notes: string;
  resolution_time: number;
  estimated_resolution_time: number;
  attachment_url: string;
  attachment_urls?: string[] | string;
  attachments?: string[] | string;
  // ISS Calculation fields
  affected_system?: string;
  iss_score?: number;
  calculated_severity?: string;
  calculated_priority?: string;
  sla_deadline?: string;
  office_location?: string;
  floor?: string;
  cabin?: string;
  tsi?: string;
  initial_severity?: string;
  initial_priority?: string;
  override_reason?: string;
  overridden_by?: string;
  overridden_at?: string;
  // Auto-assign fields
  assignment_status?: string; // 'AUTO' | 'PENDING_APPROVAL' | 'APPROVED' | 'MANUAL'
  pending_assigned_to?: string | null;
  required_tier_primary?: string | null;
  // Subcategory
  subcategory_id?: string | null;
  subcategory_name?: string;
  // TSS Score
  tss_score?: number | null;
}

interface Activity {
  id: string;
  user_id: string;
  user_name: string;
  action: string;
  description: string;
  created_at: string;
}

type SubcategoryOption = {
  id: string;
  name: string;
  category_name: string;
};

type Engineer = {
  id: string;
  full_name?: string;
  username: string;
  email?: string;
  phone?: string;
  job_title?: string;
  department?: string;
  tier?: string;
  load_points?: number;
  points_limit?: number;
  status?: string;
  active_incidents?: number;
};

const hasFieldChangeActivity = (activities: Activity[], field: 'category' | 'urgency' | 'impact' | 'subcategory'): boolean => {
  if (field === 'subcategory') {
    return activities.some((a) => a.description.toLowerCase().startsWith('subcategory changed'));
  }
  const prefix = `${field} changed from`;
  return activities.some((activity) => activity.description.toLowerCase().includes(prefix));
};

const normalizeCalculatedSeverityToSev = (severity?: string | null): string | null => {
  const raw = String(severity || '').trim().toUpperCase();
  if (!raw) return null;
  if (raw === 'SEV-1' || raw === 'CRITICAL') return 'SEV-1';
  if (raw === 'SEV-2' || raw === 'HIGH') return 'SEV-2';
  if (raw === 'SEV-3' || raw === 'MEDIUM') return 'SEV-3';
  if (raw === 'SEV-4' || raw === 'LOW') return 'SEV-4';
  return null;
};

function ChangeIndicator({ title }: { title: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-[4px] border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700"
    >
      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.232-6.232a2.5 2.5 0 113.536 3.536L12.536 16.536a4 4 0 01-1.414.95L7 19l1.514-4.122A4 4 0 019 13z" />
      </svg>
      updated
    </span>
  );
}

function OverrideIndicator() {
  return (
    <span className="inline-flex items-center gap-1 rounded-[4px] border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" aria-hidden="true" />
      Overridden!
    </span>
  );
}

function formatActivityDescription(description?: string | null): string {
  const raw = String(description || '');
  return raw
    .replace(/\bCLOSED\b/g, 'Canceled')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, (match) => `Incident ID ${generateNDI(match)}`);
}

export default function IncidentDetail({ incidentId, user, onBack, onUpdate }: IncidentDetailProps) {
  const [incident, setIncident] = useState<Incident | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [overview, setOverview] = useState({ total: 0, open: 0, inProgress: 0, resolved: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Complete modal state
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [resolutionTime, setResolutionTime] = useState(60);
  const [submitting, setSubmitting] = useState(false);
  
  // Status change controls
  const [showResolveConfirm, setShowResolveConfirm] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  
  // Engineer assignment state
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  // ISS Override modal state
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideField, setOverrideField] = useState<'severity' | 'priority' | null>(null);
  const [overrideValue, setOverrideValue] = useState('');
  const [overrideCurrentValue, setOverrideCurrentValue] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [overriding, setOverriding] = useState(false);
  const [reassigning, setReassigning] = useState(false);
  
  // Activity notification state
  const [newActivity, setNewActivity] = useState('');
  const [addingActivity, setAddingActivity] = useState(false);
  
  // Attachment preview state
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<'image' | 'pdf' | null>(null);
  
  // Reopen confirmation state
  const [showReopenConfirm, setShowReopenConfirm] = useState(false);

  // Assignment approval state
  const [approvingAssignment, setApprovingAssignment] = useState(false);
  const [approvalEngineerOverride, setApprovalEngineerOverride] = useState('');

  // SLA Status state
  const [slaStatus, setSlaStatus] = useState<any>(null);
  const [loadingSLA, setLoadingSLA] = useState(false);
  const [confirmingResponse, setConfirmingResponse] = useState(false);
  const [confirmingAutoAssign, setConfirmingAutoAssign] = useState(false);
  const [activeHeaderCard, setActiveHeaderCard] = useState<'reporter' | 'assigned' | null>(null);
  const [detailsTab, setDetailsTab] = useState<'details' | 'timeline' | 'engineers' | 'activity'>('details');
  const [activityTab, setActivityTab] = useState<'logs' | 'comments'>(user?.role === 'USER' ? 'comments' : 'logs');
  const reporterCardRef = useRef<HTMLDivElement | null>(null);
  const assignedCardRef = useRef<HTMLDivElement | null>(null);
  const [subcategories, setSubcategories] = useState<SubcategoryOption[]>([]);

  const canComplete = user?.role === 'ADMIN' || user?.role === 'MANAGER' || user?.role === 'ENGINEER';
  const canReopen = !!user;
  const canAssign = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const canManage = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const canViewEngineersOverview = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const canConfirmResponse =
    user?.role === 'ADMIN' ||
    user?.role === 'MANAGER' ||
    (user?.role === 'ENGINEER' && incident?.assigned_to === user?.id);
  // Can change status only if: Admin/Manager OR (Engineer AND assigned to them)
  const canChangeStatus = (user?.role === 'ADMIN' || user?.role === 'MANAGER') || 
    (user?.role === 'ENGINEER' && incident?.assigned_to === user?.id);
  const categoryWasChanged = hasFieldChangeActivity(activities, 'category');
  const urgencyWasChanged = hasFieldChangeActivity(activities, 'urgency');
  const impactWasChanged = hasFieldChangeActivity(activities, 'impact');
  const subcategoryWasChanged = hasFieldChangeActivity(activities, 'subcategory');

  useEffect(() => {
    if (user?.role === 'USER' && activityTab !== 'comments') {
      setActivityTab('comments');
    }
  }, [user?.role, activityTab]);

  useEffect(() => {
    if (!canViewEngineersOverview && detailsTab === 'engineers') {
      setDetailsTab('details');
    }
  }, [canViewEngineersOverview, detailsTab]);

  const getAttachmentUrls = (data: Incident | null): string[] => {
    if (!data) return [];

    const raw = (data.attachment_urls || data.attachments || data.attachment_url) as any;
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

  const toAttachmentFileUrl = (url: string): string => {
    const apiBaseUrl = api.defaults.baseURL || 'http://localhost:3001/api/v1';
    const baseUrl = apiBaseUrl.replace('/api/v1', '');
    return url.startsWith('http') ? url : `${baseUrl}${url}`;
  };

  const isPreviewableAttachment = (url: string): boolean => {
    const cleanUrl = url.split('?')[0].toLowerCase();
    return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.pdf'].some((ext) => cleanUrl.endsWith(ext));
  };

  const openOrDownloadAttachment = (url: string) => {
    const fileUrl = toAttachmentFileUrl(url);

    if (isPreviewableAttachment(url)) {
      window.open(fileUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    const downloadLink = document.createElement('a');
    downloadLink.href = fileUrl;
    downloadLink.target = '_blank';
    downloadLink.rel = 'noopener noreferrer';
    downloadLink.download = '';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  };

  const loadSubcategories = async (category: string) => {
    if (!category) { setSubcategories([]); return; }
    try {
      const res = await api.get('/incidents/subcategories', { params: { category } });
      setSubcategories(res.data.data || []);
    } catch {
      setSubcategories([]);
    }
  };

  const loadIncident = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/incidents/${incidentId}`);
      setIncident(res.data.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load incident');
    } finally {
      setLoading(false);
    }
  };

  const loadActivities = async () => {
    try {
      const res = await api.get(`/incidents/${incidentId}/activities`);
      setActivities(res.data.data || []);
    } catch (err: any) {
      console.error('Failed to load activities:', err);
    }
  };

  const loadSLAStatus = async () => {
    try {
      setLoadingSLA(true);
      const res = await api.get(`/incidents/${incidentId}/sla-status`);
      setSlaStatus(res.data.data);
    } catch (err: any) {
      console.error('Failed to load SLA status:', err);
      setSlaStatus(null);
    } finally {
      setLoadingSLA(false);
    }
  };

  const loadEngineers = async () => {
    try {
      const res = await api.get('/incidents/engineers/list');
      setEngineers(res.data.data.engineers || []);
    } catch (err: any) {
      console.error('Failed to load engineers:', err);
    }
  };

  const loadOverview = async () => {
    try {
      const res = await api.get('/incidents?limit=500&offset=0');
      const incidents = res.data?.data?.incidents || [];
      const scopedIncidents = user?.role === 'USER' ? incidents.filter((i: any) => i.created_by === user?.id) : incidents;
      setOverview({
        total: scopedIncidents.length,
        open: scopedIncidents.filter((i: any) => i.status === 'OPEN').length,
        inProgress: scopedIncidents.filter((i: any) => i.status === 'IN_PROGRESS').length,
        resolved: scopedIncidents.filter((i: any) => i.status === 'RESOLVED').length,
      });
    } catch {
      setOverview({ total: 0, open: 0, inProgress: 0, resolved: 0 });
    }
  };

  useEffect(() => {
    loadIncident();
    loadActivities();
    loadOverview();
    loadSLAStatus();
  }, [incidentId, user?.id, user?.role]);

  // Load subcategories once incident category is known (for MANAGER/ADMIN)
  useEffect(() => {
    const canManageLocal = user?.role === 'ADMIN' || user?.role === 'MANAGER';
    if (incident?.category && canManageLocal) {
      loadSubcategories(incident.category);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incident?.category]);

  // Real-time SLA monitoring - refresh every 10 seconds for active incidents (faster for breach detection)
  useEffect(() => {
    if (!incident || incident.status === 'RESOLVED' || incident.status === 'Canceled') return;
    
    // Faster refresh for breached incidents (every 10 seconds), normal refresh every 30 seconds
    const refreshInterval = slaStatus?.isExpired ? 10000 : 30000;
    
    const interval = setInterval(() => {
      loadSLAStatus();
    }, refreshInterval);
    
    return () => clearInterval(interval);
  }, [incident?.status, incidentId, slaStatus?.isExpired]);

  useEffect(() => {
    if (canAssign) {
      loadEngineers();
    }
  }, [canAssign, incidentId]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideReporter = reporterCardRef.current?.contains(target);
      const insideAssigned = assignedCardRef.current?.contains(target);
      if (!insideReporter && !insideAssigned) {
        setActiveHeaderCard(null);
      }
    };

    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveHeaderCard(null);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onEsc);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, []);

  const handleComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!incident || !canConfirmResponse) return;
    
    try {
      setSubmitting(true);
      await api.post(`/incidents/${incident.id}/complete`, {
        resolution_notes: resolutionNotes,
        resolution_time: resolutionTime,
      });
      
      setShowCompleteModal(false);
      setResolutionNotes('');
      setResolutionTime(60);
      await loadIncident();
      await loadActivities();
      onUpdate();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to complete incident');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddActivity = async () => {
    if (!incident || !newActivity.trim()) return;
    
    try {
      setAddingActivity(true);
      await api.post(`/incidents/${incident.id}/activities`, {
        action: 'NOTE',
        description: newActivity,
      });
      
      setNewActivity('');
      await loadActivities();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to add note');
    } finally {
      setAddingActivity(false);
    }
  };

  const handleStatusChange = async (nextStatus: string) => {
    if (!incident || !nextStatus) return;
    
    try {
      await api.put(`/incidents/${incident.id}`, { status: nextStatus });

      setNewStatus('');
      await loadIncident();
      await loadActivities();
      onUpdate();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update status');
    }
  };

  const handleImpactChange = async (nextImpact: string) => {
    if (!incident || !nextImpact) return;
    
    try {
      await api.put(`/incidents/${incident.id}`, { impact: nextImpact });
      await loadIncident();
      await loadActivities();
      await loadSLAStatus();
      onUpdate();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update impact');
    }
  };

  const handleUrgencyChange = async (nextUrgency: string) => {
    if (!incident || !nextUrgency) return;

    try {
      await api.put(`/incidents/${incident.id}`, { urgency: nextUrgency });
      await loadIncident();
      await loadActivities();
      onUpdate();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update urgency');
    }
  };

  const handleCategoryChange = async (nextCategory: string) => {
    if (!incident || !nextCategory) return;

    try {
      // When category changes, reset subcategory together in one update
      await api.put(`/incidents/${incident.id}`, { category: nextCategory, subcategory_id: null });
      setSubcategories([]);
      await loadIncident();
      await loadActivities();
      // Load subcategories for new category
      const res = await api.get('/incidents/subcategories', { params: { category: nextCategory } });
      setSubcategories(res.data.data || []);
      onUpdate();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update category');
    }
  };

  const handleSubcategoryChange = async (nextSubcategoryId: string) => {
    if (!incident) return;
    try {
      await api.put(`/incidents/${incident.id}`, { subcategory_id: nextSubcategoryId || null });
      await loadIncident();
      await loadActivities();
      onUpdate();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update subcategory');
    }
  };

  // ISS Metrics: Accept calculated values
  const handleAcceptMetrics = async () => {
    if (!incident) return;
    
    try {
      await api.post(`/incidents/${incident.id}/accept`);
      await Promise.all([
        loadIncident(),
        loadActivities(),
        loadOverview(),
        loadSLAStatus()
      ]);
      onUpdate();
      alert('ISS-calculated metrics accepted successfully!');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to accept metrics');
    }
  };

  // ISS Metrics: Override calculated values
  const handleOverrideMetrics = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!incident || !overrideReason.trim() || overrideReason.trim().length < 10) {
      setError('Override reason must be at least 10 characters');
      return;
    }

    if (!overrideValue || overrideValue === overrideCurrentValue) {
      setError('Select a different value to override');
      return;
    }
    
    try {
      setOverriding(true);
      const payload: any = { overrideReason };
      if (overrideField === 'severity' && overrideValue) {
        payload.newSeverity = overrideValue;
      }
      if (overrideField === 'priority' && overrideValue) {
        payload.newPriority = overrideValue;
      }
      await api.post(`/incidents/${incident.id}/override`, payload);
      setShowOverrideModal(false);
      setOverrideField(null);
      setOverrideValue('');
      setOverrideReason('');
      await Promise.all([
        loadIncident(),
        loadActivities(),
        loadOverview(),
        loadSLAStatus()
      ]);
      onUpdate();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to override metrics');
    } finally {
      setOverriding(false);
    }
  };

  const openOverrideModal = (field: 'severity' | 'priority', currentValue: string) => {
    setOverrideField(field);
    setOverrideCurrentValue(currentValue);
    setOverrideValue('');
    setOverrideReason('');
    setShowOverrideModal(true);
  };

  const handleMarkResolved = async () => {
    if (!incident) return;
    
    try {
      await api.put(`/incidents/${incident.id}`, { status: 'RESOLVED' });
      
      setShowResolveConfirm(false);
      await loadIncident();
      await loadActivities();
      onUpdate();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to resolve incident');
    }
  };

  const handleReassign = async (engineerId?: string) => {
    if (!incident) return;
    const targetEngineerId = engineerId;
    if (!targetEngineerId) return;
    
    try {
      setReassigning(true);
      await api.put(`/incidents/${incident.id}/assign`, {
        assigned_to: targetEngineerId,
      });
      
      setActiveHeaderCard(null);
      await Promise.all([loadIncident(), loadActivities(), loadEngineers()]);
      onUpdate();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to reassign incident');
    } finally {
      setReassigning(false);
    }
  };

  const handleReopen = async () => {
    if (!incident) return;
    
    try {
      setSubmitting(true);
      await api.post(`/incidents/${incident.id}/reopen`);
      
      setShowReopenConfirm(false);
      await loadIncident();
      await loadActivities();
      onUpdate();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to reopen incident');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmResponse = async () => {
    if (!incident) return;

    try {
      setConfirmingResponse(true);
      await api.post(`/incidents/${incident.id}/confirm-response`);
      await Promise.all([loadIncident(), loadSLAStatus(), loadActivities()]);
      onUpdate();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to confirm response time');
    } finally {
      setConfirmingResponse(false);
    }
  };

  // Activity icon component with modern styling - matches StatusBadge icons
  const ActivityIcon = ({ action, description }: { action: string; description?: string }) => {
    const config: Record<string, { bg: string; icon: React.ReactNode }> = {
      CREATED: {
        bg: 'bg-blue-100/80',
        icon: <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
      },
      ASSIGNED: {
        bg: 'bg-sky-100/80',
        icon: <svg className="w-4 h-4 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>,
      },
      REASSIGNED: {
        bg: 'bg-orange-100/80',
        icon: <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>,
      },
      // Status changes - use same icons as StatusBadge based on NEW status
      OPEN: {
        bg: 'bg-amber-100/80',
        icon: <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
      },
      IN_PROGRESS: {
        bg: 'bg-blue-100/80',
        icon: <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
      },
      PENDING: {
        bg: 'bg-amber-100/80',
        icon: <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
      },
      RESOLVED: {
        bg: 'bg-emerald-100/80',
        icon: <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>,
      },
      Canceled: {
        bg: 'bg-slate-100/80',
        icon: <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>,
      },
      REOPENED: {
        bg: 'bg-rose-100/80',
        icon: <svg className="w-4 h-4 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>,
      },
      // User-added note - simple chat icon only
      NOTE: {
        bg: 'bg-neutral-500/80',
        icon: <svg className="w-4 h-4 text-neutral-100" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>,
      },
      COMPLETED: {
        bg: 'bg-green-100/80',
        icon: <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
      },
      UPDATED: {
        bg: 'bg-cyan-100/80',
        icon: <svg className="w-4 h-4 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>,
      },
      OVERRIDE: {
        bg: 'bg-amber-100/80',
        icon: <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
      },
      RECALCULATED: {
        bg: 'bg-purple-100/80',
        icon: <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>,
      },
    };

    // For STATUS_CHANGED, extract the new status from description
    let activeAction = action;
    if (action === 'STATUS_CHANGED' && description) {
      // Extract new status: "Status changed from X to RESOLVED" -> "RESOLVED"
      const match = description.match(/to\s(\w+)/);
      if (match && match[1]) {
        activeAction = match[1];
      }
    }

    const c = config[activeAction] || {
      bg: 'bg-neutral-100/80',
      icon: <svg className="w-4 h-4 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
    };

    return (
      <div className={`w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center flex-shrink-0`}>
        {c.icon}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-transparent flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-neutral-600 font-medium">Loading incident...</span>
        </div>
      </div>
    );
  }

  if (!incident) {
    return (
      <div className="min-h-screen bg-transparent p-6">
        <div className="max-w-xl mx-auto">
          <div className="bg-gradient-to-r from-danger-50 to-danger-50 border border-danger-200 text-danger-700 px-5 py-4 rounded-xl mb-6 flex items-center gap-3 shadow-md">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error || 'Incident not found'}
          </div>
          <button onClick={onBack} className="btn-primary">
            Back to Incidents
          </button>
        </div>
      </div>
    );
  }

  const attachmentUrls = getAttachmentUrls(incident);
  const responseInfo = slaStatus?.responseTime;
  const responseConfirmed = Boolean(responseInfo?.confirmedAt);
  const responseRemainingMinutes = typeof responseInfo?.remainingMinutes === 'number'
    ? responseInfo.remainingMinutes
    : null;
  const responseBreached = Boolean(responseInfo?.isBreached);
  const formattedResponseRemaining = responseRemainingMinutes === null
    ? '—'
    : responseBreached && !responseConfirmed
    ? `+${formatDurationMinutes(Math.abs(responseRemainingMinutes))}`
    : formatDurationMinutes(Math.max(0, responseRemainingMinutes));
  const formatSlaTargetHours = (hours?: number): string => {
    if (!hours || hours <= 0) return '—';
    if (hours % 24 === 0) {
      const days = hours / 24;
      const dayLabel = days === 1 ? 'day' : 'days';
      return `${days} ${dayLabel} / ${hours}h`;
    }
    return `${hours}h`;
  };

  const formatResponseTargetMinutes = (minutes?: number): string => {
    if (!minutes || minutes <= 0) return '—';
    const hours = minutes / 60;
    if (Number.isInteger(hours)) {
      if (hours % 24 === 0) {
        const days = hours / 24;
        const dayLabel = days === 1 ? 'day' : 'days';
        return `${days} ${dayLabel} / ${hours}h`;
      }
      return `${hours}h`;
    }
    return formatDurationMinutes(minutes);
  };

  const handleApproveAssignment = async (engineerOverrideId?: string) => {
    if (!incident) return;
    setApprovingAssignment(true);
    try {
      await api.post(`/incidents/${incident.id}/approve-assignment`, {
        engineer_id: engineerOverrideId || approvalEngineerOverride || undefined,
      });
      setApprovalEngineerOverride('');
      const updated = await api.get(`/incidents/${incident.id}`);
      if (updated.data?.success) setIncident(updated.data.data);
      onUpdate();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Approval failed');
    } finally {
      setApprovingAssignment(false);
    }
  };

  const handleConfirmAutoAssign = async () => {
    if (!incident || !canManage) return;
    try {
      setConfirmingAutoAssign(true);
      await api.post(`/incidents/${incident.id}/approve-assignment`);
      await Promise.all([loadIncident(), loadActivities(), loadSLAStatus(), loadEngineers()]);
      onUpdate();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to trigger auto-assign');
    } finally {
      setConfirmingAutoAssign(false);
    }
  };

  const formattedSlaTarget = formatSlaTargetHours(slaStatus?.slaHours);
  const formattedResponseTargetValue = formatResponseTargetMinutes(responseInfo?.targetMinutes);
  const slaConsumedPercent = Math.min(100, Math.max(0, Number(slaStatus?.percentConsumed || 0)));
  const actualWorkMinutes = Number(slaStatus?.actualWorkMinutes);
  const formattedActualWorkTime = Number.isFinite(actualWorkMinutes) && actualWorkMinutes >= 0
    ? formatDurationMinutes(actualWorkMinutes)
    : '—';
  const responsePercent = responseConfirmed
    ? Number(responseInfo?.percentConsumed || 0)
    : responseInfo?.targetMinutes && responseInfo.targetMinutes > 0 && responseRemainingMinutes !== null
    ? ((responseInfo.targetMinutes - responseRemainingMinutes) / responseInfo.targetMinutes) * 100
    : 0;
  const responseConsumedPercent = Math.min(100, Math.max(0, responsePercent));
  const requiredTierBySeverity: Record<string, string> = {
    'SEV-1': 'Senior',
    'SEV-2': 'Mid',
    'SEV-3': 'Junior',
    'SEV-4': 'Junior',
  };
  const normalizedCalculatedSeverity = normalizeCalculatedSeverityToSev(incident.calculated_severity);
  const hasPriorityOverrideActivity = activities.some((activity) =>
    activity.action === 'OVERRIDE' && /priority overridden/i.test(activity.description)
  );
  const hasSeverityOverrideActivity = activities.some((activity) =>
    activity.action === 'OVERRIDE' && /severity overridden/i.test(activity.description)
  );
  const isPriorityOverridden = hasPriorityOverrideActivity
    && Boolean(incident.priority)
    && Boolean(incident.calculated_priority)
    && incident.priority !== incident.calculated_priority;
  const isSeverityOverridden = hasSeverityOverrideActivity
    && Boolean(incident.severity)
    && Boolean(normalizedCalculatedSeverity)
    && incident.severity !== normalizedCalculatedSeverity;
  const requiredTierLabel = incident.required_tier_primary
    ? `${incident.required_tier_primary.charAt(0)}${incident.required_tier_primary.slice(1).toLowerCase()}`
    : (requiredTierBySeverity[incident.severity] || '—');
  const canConfirmAutoAssign = canManage && incident.assignment_status === 'PENDING_APPROVAL';
  const assignedAtActivity = activities.find((activity) => ['ASSIGNED', 'AUTO_ASSIGNED', 'APPROVED', 'REASSIGNED'].includes(activity.action));
  const assignedAt = assignedAtActivity?.created_at;
  const logActivities = activities.filter((activity) => activity.action !== 'NOTE');
  const commentActivities = activities.filter((activity) => activity.action === 'NOTE');
  const commentsCountLabel = commentActivities.length > 10 ? '10+' : String(commentActivities.length);
  const getEngineerLoadPercent = (engineer: { load_points?: number; points_limit?: number }) => {
    const points = Number(engineer.load_points || 0);
    const limit = Number(engineer.points_limit || 0);
    if (limit <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((points / limit) * 100)));
  };
  return (
    <div className="bg-transparent">
      {/* Custom Header with Back, Title and Status Actions */}
      <header className="-mx-6 -mt-6 mb-6 bg-white/95 backdrop-blur-md border-b border-neutral-200/70 px-8 py-4 sticky top-0 z-30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="ml-4 px-3.5 py-2.5 flex items-center gap-2 bg-white border border-neutral-200 rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-50 hover:border-neutral-300 hover:text-neutral-700 transition-all duration-200 shadow-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-neutral-800 tracking-tight">{incident.title}</h1>
                <div className="ml-1">
                  <StatusBadge status={incident.status} />
                </div>
              </div>
              <div className="text-sm text-neutral-500 flex items-center gap-2">
                <span className="text-sm font-semibold text-neutral-600">Incident ID {generateNDI(incident.id)}</span>
                {attachmentUrls.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-sky-600">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                    {attachmentUrls.length}
                  </span>
                )}
              </div>
            </div>
          </div>
          
          {user?.role !== 'USER' && (
          <div className="flex items-center gap-3">
            {/* Status Dropdown */}
            {canChangeStatus && incident.status !== 'RESOLVED' && incident.status !== 'Canceled' && (
              <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl">
                <select
                  value={newStatus}
                  onChange={(e) => {
                    const nextStatus = e.target.value;
                    setNewStatus(nextStatus);
                    if (nextStatus) {
                      void handleStatusChange(nextStatus);
                    }
                  }}
                  className="text-sm border border-neutral-200 rounded-md px-2 py-1.5 bg-white text-neutral-700"
                >
                  <option value="">Change status...</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="PENDING">Pending</option>
                  <option value="Canceled">Cancel Incident</option>
                </select>
              </div>
            )}
            
            {canChangeStatus && incident.status !== 'RESOLVED' && incident.status !== 'Canceled' && (
              <button 
                onClick={() => setShowResolveConfirm(true)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-xl hover:from-emerald-600 hover:to-emerald-700 shadow-lg shadow-emerald-500/25 transition-all duration-200"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Mark Resolved
              </button>
            )}
            
            {canReopen && (incident.status === 'RESOLVED' || incident.status === 'Canceled') && (
              <button 
                onClick={() => setShowReopenConfirm(true)}
                className="btn-action-reopen text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2m-4-1v4m0 0v4m0-4h4m-4 0H8" />
                </svg>
                Reopen
              </button>
            )}
          </div>
          )}
        </div>

      </header>


      {error && (
        <div className="mx-6 mb-4 bg-danger-50 border border-danger-200 text-danger-700 px-4 py-3 rounded-lg flex items-start justify-between gap-3">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError('')}
            className="text-danger-600 hover:text-danger-800 text-sm font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}



      <div className="p-6 space-y-6">
        {/* Main Content Grid - Left + SLA */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,60%)_minmax(0,22%)] gap-2">
          {/* Left Column - Tabbed Incident Window */}
          <div className="space-y-6 w-full min-w-0">
            <Card padding="none" className="rounded-none">
              <div className="p-3 flex flex-wrap items-center gap-2 border-b border-neutral-200/80">
                <button
                  type="button"
                  onClick={() => setDetailsTab('details')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors focus:outline-none focus:ring-0 focus:ring-offset-0 ${detailsTab === 'details' ? 'bg-gradient-to-r from-sky-500 to-sky-600 text-white shadow-sm shadow-sky-500/30' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
                >
                  Details
                </button>
                <button
                  type="button"
                  onClick={() => setDetailsTab('timeline')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors focus:outline-none focus:ring-0 focus:ring-offset-0 ${detailsTab === 'timeline' ? 'bg-gradient-to-r from-sky-500 to-sky-600 text-white shadow-sm shadow-sky-500/30' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
                >
                  Timeline
                </button>
                {canViewEngineersOverview && (
                  <button
                    type="button"
                    onClick={() => setDetailsTab('engineers')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors focus:outline-none focus:ring-0 focus:ring-offset-0 ${detailsTab === 'engineers' ? 'bg-gradient-to-r from-sky-500 to-sky-600 text-white shadow-sm shadow-sky-500/30' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
                  >
                    Engineers Overview
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDetailsTab('activity')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors focus:outline-none focus:ring-0 focus:ring-offset-0 ${detailsTab === 'activity' ? 'bg-gradient-to-r from-sky-500 to-sky-600 text-white shadow-sm shadow-sky-500/30' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
                >
                  Activity Log
                </button>
              </div>
            </Card>

            {/* Incident Info */}
            {detailsTab === 'details' && (
            <Card padding="none" className="rounded-none">
              <div className="p-6 space-y-3">
                <div className="pb-3 mb-1 border-b border-neutral-200/80 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-neutral-800">Incident Details</h3>
                    <p className="text-xs text-neutral-500 font-medium mt-1">Incident info and type.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative" ref={reporterCardRef}>
                      <button
                        type="button"
                        onClick={() => setActiveHeaderCard(activeHeaderCard === 'reporter' ? null : 'reporter')}
                        className="flex items-center gap-2 px-2 py-1 bg-white rounded-lg"
                      >
                        <div className="w-7 h-7 rounded-md bg-gradient-to-br from-sky-500 to-sky-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                          {(incident.created_by_name || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div className="text-left max-w-[140px] min-w-0">
                          <p className="text-[10px] text-neutral-500 font-medium uppercase tracking-wide">Reporter</p>
                          <p className="text-xs font-semibold text-neutral-800 truncate">{incident.created_by_name || 'N/A'}</p>
                        </div>
                      </button>

                      {activeHeaderCard === 'reporter' && (
                        <div className="absolute right-0 mt-2 w-80 bg-white border border-neutral-200 rounded-[4px] shadow-xl p-3 z-50">
                          <p className="text-xs font-semibold text-sky-700 uppercase tracking-wide mb-2">Reporter Details</p>
                          <div className="space-y-1.5 text-xs">
                            <p><span className="text-neutral-500">Name:</span> <span className="font-semibold text-neutral-800">{incident.created_by_name || 'N/A'}</span></p>
                            <p><span className="text-neutral-500">Email:</span> <span className="font-semibold text-neutral-800">{incident.created_by_email || 'N/A'}</span></p>
                            <p><span className="text-neutral-500">Phone:</span> <span className="font-semibold text-neutral-800">{incident.created_by_phone || 'N/A'}</span></p>
                            <p><span className="text-neutral-500">Department:</span> <span className="font-semibold text-neutral-800">{incident.created_by_department || 'N/A'}</span></p>
                            <p><span className="text-neutral-500">Job Title:</span> <span className="font-semibold text-neutral-800">{incident.created_by_job_title || 'N/A'}</span></p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="relative" ref={assignedCardRef}>
                      <button
                        type="button"
                        onClick={() => setActiveHeaderCard(activeHeaderCard === 'assigned' ? null : 'assigned')}
                        className="flex items-center gap-2 px-2 py-1 bg-white rounded-lg"
                      >
                        <div className="w-7 h-7 rounded-md bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                          {(incident.assigned_to_name || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div className="text-left max-w-[140px] min-w-0">
                          <p className="text-[10px] text-neutral-500 font-medium uppercase tracking-wide">Assigned</p>
                          <p className="text-xs font-semibold text-neutral-800 truncate">{incident.assigned_to_name || 'Unassigned'}</p>
                        </div>
                      </button>

                      {activeHeaderCard === 'assigned' && (
                        <div className="absolute right-0 mt-2 w-80 bg-white border border-neutral-200 rounded-[4px] shadow-xl p-3 z-50">
                          <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-2">Assigned Details</p>
                          <div className="space-y-1.5 text-xs">
                            <p><span className="text-neutral-500">Name:</span> <span className="font-semibold text-neutral-800">{incident.assigned_to_name || 'Unassigned'}</span></p>
                            {incident.assigned_to_tier && (
                              <p><span className="text-neutral-500">Tier:</span> <span className="font-semibold text-neutral-800">{incident.assigned_to_tier.charAt(0).toUpperCase() + incident.assigned_to_tier.slice(1).toLowerCase()}</span></p>
                            )}
                            <p><span className="text-neutral-500">Email:</span> <span className="font-semibold text-neutral-800 break-all">{incident.assigned_to_email || 'N/A'}</span></p>
                            <p><span className="text-neutral-500">Phone:</span> <span className="font-semibold text-neutral-800">{incident.assigned_to_phone || 'N/A'}</span></p>
                            <p><span className="text-neutral-500">Department:</span> <span className="font-semibold text-neutral-800">{incident.assigned_to_department || 'N/A'}</span></p>
                            <p><span className="text-neutral-500">Job Title:</span> <span className="font-semibold text-neutral-800">{incident.assigned_to_job_title || 'N/A'}</span></p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Description</label>
                    {attachmentUrls.length > 0 && (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 hover:text-sky-800"
                        onClick={() => openOrDownloadAttachment(attachmentUrls[0])}
                        title="Open or download attachment"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                        </svg>
                        {attachmentUrls.length} attachment{attachmentUrls.length > 1 ? 's' : ''}
                      </button>
                    )}
                  </div>
                  <p className="text-neutral-800 whitespace-pre-wrap leading-relaxed break-words">{incident.description}</p>
                </div>
                
                {/* Classification Section - Compact Inline */}
                <div className="flex flex-wrap gap-2">
                  {/* Category */}
                  <div className="flex-1 min-w-[150px] pl-2.5 py-1.5 border-l-3 border-l-blue-500 bg-blue-50/30 rounded-md">
                    <div className="mb-0.5 flex items-center gap-2">
                      <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide">Category</p>
                      {categoryWasChanged && <ChangeIndicator title="Category was changed. See Activity Log for details." />}
                    </div>
                    {user && ['MANAGER', 'ADMIN'].includes(user.role) ? (
                      <select
                        value={incident.category || 'OTHER'}
                        onChange={(e) => handleCategoryChange(e.target.value)}
                        className="mt-1 w-full text-xs font-semibold text-neutral-800 bg-white/70 border border-blue-200 rounded px-2 py-1"
                      >
                        <option value="HARDWARE">HARDWARE</option>
                        <option value="SOFTWARE">SOFTWARE</option>
                        <option value="NETWORK">NETWORK</option>
                        <option value="SECURITY">SECURITY</option>
                        <option value="OTHER">OTHER</option>
                      </select>
                    ) : (
                      <p className="text-xs font-semibold text-neutral-800">{incident.category || '—'}</p>
                    )}
                  </div>

                  {/* Subcategory */}
                  <div className="flex-1 min-w-[150px] pl-2.5 py-1.5 border-l-3 border-l-indigo-500 bg-indigo-50/30 rounded-md">
                    <div className="mb-0.5 flex items-center gap-2">
                      <p className="text-xs text-indigo-600 font-semibold uppercase tracking-wide">Subcategory</p>
                      {subcategoryWasChanged && <ChangeIndicator title="Subcategory was changed. See Activity Log for details." />}
                    </div>
                    {user && ['MANAGER', 'ADMIN'].includes(user.role) ? (
                      <select
                        value={incident.subcategory_id || ''}
                        onChange={(e) => handleSubcategoryChange(e.target.value)}
                        className="mt-1 w-full text-xs font-semibold text-neutral-800 bg-white/70 border border-indigo-200 rounded px-2 py-1"
                      >
                        <option value="">— None —</option>
                        {subcategories.map((sc) => (
                          <option key={sc.id} value={sc.id}>{sc.name}</option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-xs font-semibold text-neutral-800">{incident.subcategory_name || '—'}</p>
                    )}
                  </div>
                  
                  {/* Impact — editable */}
                  <div className="flex-1 min-w-[150px] pl-2.5 py-1.5 border-l-3 border-l-cyan-500 bg-cyan-50/30 rounded-md">
                    <div className="mb-0.5 flex items-center gap-2">
                      <p className="text-xs text-cyan-600 font-semibold uppercase tracking-wide">Impact</p>
                      {impactWasChanged && <ChangeIndicator title="Impact was changed. See Activity Log for details." />}
                    </div>
                    {user && ['MANAGER', 'ADMIN'].includes(user.role) ? (
                      <select
                        value={incident.impact || 'SINGLE_USER'}
                        onChange={(e) => handleImpactChange(e.target.value)}
                        className="mt-1 w-full text-xs font-semibold text-neutral-800 bg-white/70 border border-cyan-200 rounded px-2 py-1"
                      >
                        <option value="SINGLE_USER">SINGLE_USER</option>
                        <option value="DEPARTMENT">DEPARTMENT</option>
                        <option value="ORGANIZATION">ORGANIZATION</option>
                      </select>
                    ) : (
                      <p className="text-xs font-semibold text-neutral-800">{incident.impact?.replace(/_/g, ' ') || '—'}</p>
                    )}
                  </div>

                  {/* Urgency — read-only */}
                  <div className="flex-1 min-w-[150px] pl-2.5 py-1.5 border-l-3 border-l-orange-500 bg-orange-50/30 rounded-md">
                    <div className="mb-0.5 flex items-center gap-2">
                      <p className="text-xs text-orange-600 font-semibold uppercase tracking-wide">Urgency</p>
                      {urgencyWasChanged && <ChangeIndicator title="Urgency was changed. See Activity Log for details." />}
                    </div>
                    <p className="text-xs font-semibold text-neutral-800">{incident.urgency || 'MEDIUM'}</p>
                  </div>
                </div>

                {/* Location Section - Inline (borderless) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="px-1 py-1">
                    <p className="text-xs text-neutral-500 font-medium mb-0.5">Department</p>
                    <p className="text-xs font-semibold text-neutral-800">{incident.department || '—'}</p>
                  </div>
                  <div className="px-1 py-1">
                    <p className="text-xs text-neutral-500 font-medium mb-0.5">Desk/Room</p>
                    <p className="text-xs font-semibold text-neutral-800">{incident.room || incident.cabin || '—'}</p>
                  </div>
                  <div className="px-1 py-1">
                    <p className="text-xs text-neutral-500 font-medium mb-0.5">Workstation</p>
                    <p className="text-xs font-semibold text-neutral-800">{incident.workstation_id || '—'}</p>
                  </div>
                  <div className="px-1 py-1">
                    <p className="text-xs text-neutral-500 font-medium mb-0.5">Affected System</p>
                    <p className="text-xs font-semibold text-neutral-800">{incident.affected_system || '—'}</p>
                  </div>
                </div>

                {/* ISS + TSS compact side by side */}
                {user?.role !== 'USER' && (
                  <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-2">
                    {incident.iss_score !== undefined && incident.iss_score !== null && (
                      <div className="pl-2.5 py-1.5 border-l-4 border-l-purple-500 bg-gradient-to-r from-purple-50/60 to-transparent rounded-md">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                            <p className="text-xs text-purple-600 font-bold uppercase tracking-wide">ISS Auto-Calculation</p>
                          </div>
                          {isPriorityOverridden && <OverrideIndicator />}
                        </div>

                        <div className="grid grid-cols-2 gap-1">
                          <div className="bg-white/60 rounded px-1.5 py-1 border border-purple-200 min-w-0">
                            <p className="text-xs text-neutral-500 font-medium mb-0.5 text-center">ISS Score</p>
                            <p className="text-sm font-bold text-purple-700 text-center">{incident.iss_score.toFixed(2)}</p>
                          </div>
                          <div className="bg-white/60 rounded px-1.5 py-1 border border-purple-200 min-w-0">
                            <p className="text-xs text-neutral-500 font-medium mb-0.5 text-center">Calculated Priority</p>
                            <p className="text-xs font-semibold text-neutral-800 text-center">{
                              incident.calculated_priority === 'P1' ? 'CRITICAL' :
                              incident.calculated_priority === 'P2' ? 'HIGH' :
                              incident.calculated_priority === 'P3' ? 'MEDIUM' :
                              incident.calculated_priority === 'P4' ? 'LOW' :
                              incident.calculated_priority || '—'
                            }</p>
                          </div>
                          {user && ['MANAGER', 'ADMIN'].includes(user.role) && (
                            <div className="col-span-2 flex justify-center mt-1">
                              <button
                                onClick={() => openOverrideModal('priority', incident.priority)}
                                className="btn-sm bg-orange-600 hover:bg-orange-700 text-white text-xs px-3 py-1 rounded whitespace-nowrap"
                              >
                                Override Priority
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="pl-3 py-2 border-l-4 border-l-rose-500 bg-gradient-to-r from-rose-50/60 to-transparent rounded-md">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <p className="text-xs text-rose-600 font-bold uppercase tracking-wide">TSS Auto-Calculation and Auto Assign</p>
                        </div>
                        {isSeverityOverridden && <OverrideIndicator />}
                      </div>

                      <div className="grid grid-cols-3 gap-1">
                        <div className="bg-white/60 rounded px-2 py-1.5 border border-rose-200">
                          <p className="text-xs text-neutral-500 font-medium mb-0.5 text-center">TSS Score</p>
                          <p className="text-xs font-semibold text-neutral-800 text-center">
                            {incident.tss_score != null ? incident.tss_score.toFixed(2) : '—'}
                          </p>
                        </div>
                        <div className="bg-white/60 rounded px-2 py-1.5 border border-rose-200">
                          <p className="text-xs text-neutral-500 font-medium mb-0.5 text-center">Severity</p>
                          <p className="text-xs font-semibold text-neutral-800 text-center">{incident.severity || '—'}</p>
                        </div>
                        <div className="bg-white/60 rounded px-2 py-1.5 border border-rose-200">
                          <p className="text-xs text-neutral-500 font-medium mb-0.5 text-center">Required Tier</p>
                          <p className="text-xs font-semibold text-neutral-800 text-center">{requiredTierLabel}</p>
                        </div>
                        {user && ['MANAGER', 'ADMIN'].includes(user.role) && (
                          <>
                            <div></div>
                            <div className="flex items-center justify-center gap-1 mt-1">
                              <button
                                onClick={() => openOverrideModal('severity', incident.severity)}
                                className="btn-sm bg-orange-600 hover:bg-orange-700 text-white text-xs px-2.5 py-1 rounded whitespace-nowrap"
                              >
                                Override Severity
                              </button>
                              <button
                                type="button"
                                onClick={handleConfirmAutoAssign}
                                disabled={!canConfirmAutoAssign || confirmingAutoAssign || approvingAssignment}
                                className={`btn-success px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition-opacity ${
                                  !canConfirmAutoAssign ? 'opacity-35 cursor-default pointer-events-none' : ''
                                }`}
                                title={canConfirmAutoAssign ? 'Confirm pending auto-assignment' : 'Auto-assign confirmation is available only for pending approval incidents'}
                              >
                                {confirmingAutoAssign ? 'Confirming...' : 'Confirm Auto-Assign'}
                              </button>
                            </div>
                            <div></div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Resolution Notes */}
                {incident.resolution_notes && (
                  <div className="bg-success-50 border border-success-200 rounded-xl p-4">
                    <label className="block text-xs font-semibold text-success-700 uppercase tracking-wider mb-2">Resolution Notes</label>
                    <p className="text-neutral-800 whitespace-pre-wrap">{incident.resolution_notes}</p>
                  </div>
                )}
              </div>
            </Card>
            )}

            {detailsTab === 'timeline' && (
              <Card padding="none" className="rounded-none">
                <div className="p-6">
                  <div className="pb-3 mb-4 border-b border-neutral-200/80">
                    <h3 className="text-base font-bold text-neutral-800">Timeline</h3>
                    <p className="text-xs text-neutral-500 font-medium mt-1">Detected, created, assigned, resolved.</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="bg-neutral-50 border border-neutral-200 rounded px-3 py-2">
                      <p className="text-xs text-neutral-500 font-medium mb-0.5">Detected</p>
                      <p className="text-sm font-semibold text-neutral-800">{incident.detected_at ? formatDateTime(incident.detected_at) : '—'}</p>
                    </div>
                    <div className="bg-neutral-50 border border-neutral-200 rounded px-3 py-2">
                      <p className="text-xs text-neutral-500 font-medium mb-0.5">Created</p>
                      <p className="text-sm font-semibold text-neutral-800">{incident.created_at ? formatDateTime(incident.created_at) : '—'}</p>
                    </div>
                    <div className="bg-neutral-50 border border-neutral-200 rounded px-3 py-2">
                      <p className="text-xs text-neutral-500 font-medium mb-0.5">Assigned</p>
                      <p className="text-sm font-semibold text-neutral-800">{assignedAt ? formatDateTime(assignedAt) : '—'}</p>
                    </div>
                    <div className="bg-neutral-50 border border-neutral-200 rounded px-3 py-2">
                      <p className="text-xs text-neutral-500 font-medium mb-0.5">Resolved</p>
                      <p className="text-sm font-semibold text-neutral-800">{incident.resolved_at ? formatDateTime(incident.resolved_at) : '—'}</p>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {canViewEngineersOverview && detailsTab === 'engineers' && (
              <Card padding="none" className="rounded-none overflow-hidden">
                <div className="p-4">
                  <div className="flex items-center justify-between gap-3 pb-2 mb-3 border-b border-neutral-200/80">
                    <h3 className="text-base font-bold text-neutral-800">Recommended Engineers</h3>
                    <p className="text-xs text-neutral-500">Sorted by load</p>
                  </div>

                  {!canAssign ? (
                    <p className="text-sm text-neutral-500">Only Manager/Admin can assign engineers.</p>
                  ) : (
                    <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                      {engineers
                        .slice()
                        .sort((a, b) => getEngineerLoadPercent(a) - getEngineerLoadPercent(b))
                        .map((engineer) => {
                          const name = engineer.full_name || engineer.username;
                          const tierLabel = (engineer.tier || 'Senior').charAt(0).toUpperCase() + (engineer.tier || 'Senior').slice(1).toLowerCase();
                          const limit = Number(engineer.points_limit || 200);
                          const points = Number(engineer.load_points || 0);
                          const isAtLimit = limit > 0 && points >= limit;
                          const percent = getEngineerLoadPercent(engineer);
                          const isSelected = incident.assigned_to === engineer.id;
                          const isApproveAction = !isSelected && !isAtLimit && incident.assignment_status === 'PENDING_APPROVAL';
                          const isReassignAction = !isSelected && !isAtLimit && incident.assignment_status !== 'PENDING_APPROVAL' && Boolean(incident.assigned_to);
                          const loadBarClass = percent >= 90 ? 'bg-red-500' : percent >= 70 ? 'bg-amber-500' : 'bg-emerald-500';
                          const initials = (name || 'U').split(' ').map((part) => part.charAt(0).toUpperCase()).join('').slice(0, 2);

                          return (
                            <div
                              key={engineer.id}
                              className={`relative rounded-md border px-3 py-2 transition-colors ${isSelected ? 'border-emerald-300 bg-emerald-50/40' : 'border-neutral-200 bg-neutral-50/60 hover:border-neutral-300'}`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div
                                      className="w-7 h-7 rounded-full bg-sky-100 text-sky-700 text-[10px] font-bold flex items-center justify-center shrink-0"
                                      title={isAtLimit ? 'Engineer is full' : 'Engineer'}
                                    >
                                      {initials}
                                    </div>
                                    <p className="text-sm font-semibold text-neutral-800 truncate">{name}</p>
                                    <PriorityBadge
                                      priority={engineer.tier === 'SENIOR' ? '1' : engineer.tier === 'MID' ? '2' : '3'}
                                      customLabel={tierLabel}
                                      size="sm"
                                    />
                                  </div>
                                  <div className="mt-0.5 text-xs text-neutral-500">{points}/{limit} pts • {percent}%</div>
                                  <div className="mt-1 flex items-center gap-2">
                                    <span className="flex-1 h-1.5 rounded-full bg-neutral-200 overflow-hidden block">
                                      <span className={`h-1.5 rounded-full block ${loadBarClass}`} style={{ width: `${percent}%` }} />
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        if (isAtLimit) {
                                          return;
                                        }
                                        if (incident.assignment_status === 'PENDING_APPROVAL') {
                                          void handleApproveAssignment(engineer.id);
                                          return;
                                        }
                                        void handleReassign(engineer.id);
                                      }}
                                      disabled={isAtLimit}
                                      className={`text-xs font-semibold px-3 py-1 rounded border transition-colors shrink-0 ${isSelected ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : isAtLimit ? 'bg-transparent text-neutral-400 border-neutral-300 cursor-not-allowed' : isApproveAction || isReassignAction ? 'text-white bg-gradient-to-r from-emerald-500 to-emerald-600 border-emerald-500 hover:from-emerald-600 hover:to-emerald-700 shadow-lg shadow-emerald-500/25' : 'btn-action-reopen text-white'} disabled:opacity-70`}
                                    >
                                      {isSelected ? 'Assigned' : isAtLimit ? 'Full' : incident.assignment_status === 'PENDING_APPROVAL' ? 'Approve' : incident.assigned_to ? 'Reassign' : 'Assign'}
                                    </button>
                                  </div>
                                  <div className="mt-1 text-xs text-neutral-500">{Number(engineer.active_incidents || 0)} active incidents</div>
                                </div>
                              </div>

                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              </Card>
            )}

            {detailsTab === 'activity' && user?.role !== 'USER' && (
            <Card padding="none" className="flex flex-col overflow-hidden rounded-none">
              <div className="p-6 flex flex-col flex-1 min-h-0 overflow-hidden">
                <div className="pb-3 mb-4 border-b border-neutral-200/80 shrink-0">
                  <h3 className="text-base font-bold text-neutral-800">Activity Log</h3>
                  <p className="text-xs text-neutral-500 font-medium mt-1">History and notes.</p>
                </div>
                <div className="flex items-center gap-2 mb-4 shrink-0 border-b border-neutral-200/80 pb-3">
                  <button
                    type="button"
                    onClick={() => setActivityTab('logs')}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors focus:outline-none focus:ring-0 focus:ring-offset-0 ${activityTab === 'logs' ? 'bg-gradient-to-r from-sky-500 to-sky-600 text-white shadow-sm shadow-sky-500/30' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
                  >
                    Logs
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivityTab('comments')}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors focus:outline-none focus:ring-0 focus:ring-offset-0 ${activityTab === 'comments' ? 'bg-gradient-to-r from-sky-500 to-sky-600 text-white shadow-sm shadow-sky-500/30' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
                  >
                    Comments ({commentsCountLabel})
                  </button>
                </div>

                {activityTab === 'comments' && (
                  <div className="flex gap-2 mb-3 shrink-0">
                    <input
                      type="text"
                      value={newActivity}
                      onChange={(e) => setNewActivity(e.target.value)}
                      placeholder="Add a comment..."
                      className="input flex-1"
                      onKeyPress={(e) => e.key === 'Enter' && handleAddActivity()}
                    />
                    <button
                      onClick={handleAddActivity}
                      disabled={addingActivity || !newActivity.trim()}
                      className="btn-action-reopen px-4 py-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {addingActivity ? (
                        <span className="spinner w-4 h-4 border-2"></span>
                      ) : (
                        'Add Comment'
                      )}
                    </button>
                  </div>
                )}

                <div className="space-y-2 flex-1 min-h-0 overflow-y-scroll scrollbar-sidebar pr-1 max-h-[420px]">
                  {(activityTab === 'logs' ? logActivities : commentActivities).length === 0 ? (
                    <p className="text-neutral-500 text-sm text-center py-4">{activityTab === 'logs' ? 'No logs yet.' : 'No comments yet.'}</p>
                  ) : (
                    (activityTab === 'logs' ? logActivities : commentActivities).map((activity) => (
                      <div key={activity.id} className="flex gap-3 p-3 bg-neutral-50/50 hover:bg-neutral-100/50 rounded-lg transition-colors">
                        {activityTab === 'logs' ? (
                          <ActivityIcon action={activity.action} description={activity.description} />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center flex-shrink-0 text-sky-700 font-bold text-xs">
                            {(activity.user_name || 'U').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-neutral-800 text-sm">{activity.user_name || 'System'}</span>
                            <span className="text-xs text-neutral-400">{formatDateTime(activity.created_at)}</span>
                          </div>
                          <p className="text-sm text-neutral-600 mt-0.5">{formatActivityDescription(activity.description)}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </Card>
            )}

            {detailsTab === 'activity' && user?.role === 'USER' && (
              <Card padding="none" className="rounded-none overflow-hidden">
                <div className="p-4">
                  <div className="pb-2 mb-3 border-b border-neutral-200/80">
                    <h3 className="text-base font-bold text-neutral-800">Activity Log</h3>
                    <p className="text-xs text-neutral-500 font-medium mt-1">Comments and updates.</p>
                  </div>

                  <div className="flex gap-2 mb-3 shrink-0">
                    <input
                      type="text"
                      value={newActivity}
                      onChange={(e) => setNewActivity(e.target.value)}
                      placeholder="Add a comment..."
                      className="input flex-1"
                      onKeyPress={(e) => e.key === 'Enter' && handleAddActivity()}
                    />
                    <button
                      onClick={handleAddActivity}
                      disabled={addingActivity || !newActivity.trim()}
                      className="btn-action-reopen px-4 py-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {addingActivity ? <span className="spinner w-4 h-4 border-2"></span> : 'Add Comment'}
                    </button>
                  </div>

                  <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                    {commentActivities.length === 0 ? (
                      <p className="text-neutral-500 text-sm text-center py-4">No comments yet.</p>
                    ) : (
                      commentActivities.map((activity) => (
                        <div key={activity.id} className="flex gap-3 p-3 bg-neutral-50/50 hover:bg-neutral-100/50 rounded-lg transition-colors">
                          <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center flex-shrink-0 text-sky-700 font-bold text-xs">
                            {(activity.user_name || 'U').charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-neutral-800 text-sm">{activity.user_name || 'System'}</span>
                              <span className="text-xs text-neutral-400">{formatDateTime(activity.created_at)}</span>
                            </div>
                            <p className="text-sm text-neutral-600 mt-0.5">{String(activity.description || '')}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </Card>
            )}
          </div>

          <div className="self-start space-y-3 w-full min-w-0">
            {user?.role !== 'USER' && (
            <Card padding="none" className="rounded-none overflow-hidden">
              <div className="p-4">
                <div className="pb-2 mb-3 border-b border-neutral-200/80">
                  <h3 className="text-base font-bold text-neutral-800">SLA Status</h3>
                  <p className="text-xs text-neutral-500 font-medium mt-1">Current SLA consumption and deadline.</p>
                </div>
                {user?.role !== 'USER' && slaStatus && slaStatus.hasDeadline ? (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <p className={`text-xs font-bold uppercase tracking-wide ${slaStatus.isExpired ? 'text-red-600' : slaStatus.isNearExpiry ? 'text-amber-600' : 'text-green-600'}`}>
                        SLA Status {slaStatus.isResolved && '(Final)'}
                      </p>
                      <span className={`text-xs px-2 py-0.5 rounded font-semibold ${slaStatus.isExpired ? 'bg-red-100 text-red-800' : slaStatus.isNearExpiry ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
                        {slaStatus.isExpired ? 'BREACHED' : slaStatus.isNearExpiry ? 'AT RISK' : 'ON TIME'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-white/60 rounded px-3 py-2 border border-neutral-200">
                        <p className="text-xs text-neutral-500 font-medium mb-0.5">{slaStatus.isResolved ? 'Resolution Time' : slaStatus.isExpired ? 'Overtime' : 'Time Remaining'}</p>
                        <p className="text-sm font-bold text-neutral-800">{slaStatus.isResolved ? `${slaStatus.actualResolutionHours}h ${slaStatus.actualResolutionMinutes}m` : slaStatus.isExpired ? `+${slaStatus.overtimeHours || 0}h ${slaStatus.overtimeMinutes || 0}m` : `${Math.abs(slaStatus.hoursRemaining)}h ${slaStatus.minutesRemaining}m`}</p>
                      </div>
                      <div className="bg-white/60 rounded px-3 py-2 border border-neutral-200">
                        <p className="text-xs text-neutral-500 font-medium mb-0.5">SLA Target</p>
                        <p className="text-sm font-bold text-neutral-800">{formattedSlaTarget}</p>
                      </div>
                    </div>
                    <div className="px-1 pt-1">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="text-xs text-neutral-500 font-medium">SLA Consumed</p>
                        <p className="text-xs font-bold text-neutral-700">{Math.round(slaConsumedPercent)}%</p>
                      </div>
                      <div className="flex-1 bg-neutral-200 rounded-[4px] h-2 relative overflow-hidden">
                        <div
                          className={`h-2 transition-all absolute left-0 rounded-[4px] ${slaStatus.percentConsumed >= 100 ? 'bg-red-600' : slaStatus.percentConsumed >= 75 ? 'bg-amber-500' : 'bg-green-500'}`}
                          style={{ width: `${slaConsumedPercent}%` }}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-white/60 rounded px-3 py-2 border border-neutral-200">
                        <p className="text-xs text-neutral-500 font-medium mb-0.5">SLA Deadline</p>
                        <p className="text-xs font-semibold text-neutral-800">{slaStatus.slaDeadline ? formatDateTime(slaStatus.slaDeadline) : '—'}</p>
                      </div>
                      <div className="bg-white/60 rounded px-3 py-2 border border-neutral-200">
                        <p className="text-xs text-neutral-500 font-medium mb-0.5">Act. Work Time</p>
                        <p className="text-xs font-semibold text-neutral-800">{formattedActualWorkTime}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-neutral-500">No SLA data available.</p>
                )}
              </div>
            </Card>
            )}

            {user?.role !== 'USER' && (
            <Card padding="none" className="rounded-none overflow-hidden">
              <div className="p-4">
                <div className="pb-2 mb-3 border-b border-neutral-200/80">
                  <h3 className="text-base font-bold text-neutral-800">Response Time</h3>
                  <p className="text-xs text-neutral-500 font-medium mt-1">First response timing and confirmation.</p>
                </div>
                {user?.role !== 'USER' && responseInfo?.hasTarget ? (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <p className={`text-xs font-bold uppercase tracking-wide ${responseBreached ? 'text-red-600' : 'text-green-600'}`}>Response Time</p>
                      <span className={`text-xs px-2 py-0.5 rounded font-semibold ${responseBreached ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>{responseConfirmed ? (responseBreached ? 'CONFIRMED LATE' : 'CONFIRMED') : (responseBreached ? 'BREACHED' : 'RUNNING')}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-white/60 rounded px-3 py-2 border border-neutral-200">
                        <p className="text-xs text-neutral-500 font-medium mb-0.5">{responseBreached && !responseConfirmed ? 'Overtime' : 'Time Remaining'}</p>
                        <p className="text-sm font-bold text-neutral-800">{formattedResponseRemaining}</p>
                      </div>
                      <div className="bg-white/60 rounded px-3 py-2 border border-neutral-200">
                        <p className="text-xs text-neutral-500 font-medium mb-0.5">Response Target</p>
                        <p className="text-sm font-bold text-neutral-800">{formattedResponseTargetValue}</p>
                      </div>
                    </div>
                    <div className="px-1 pt-1">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="text-xs text-neutral-500 font-medium">Time Consumed</p>
                        <p className="text-xs font-bold text-neutral-700">{Math.round(responseConsumedPercent)}%</p>
                      </div>
                      <div className="flex-1 bg-neutral-200 rounded-[4px] h-1.5 relative overflow-hidden">
                        <div
                          className={`h-1.5 transition-all absolute left-0 rounded-[4px] ${responseBreached ? 'bg-red-600' : responsePercent >= 75 ? 'bg-amber-500' : 'bg-green-500'}`}
                          style={{ width: `${responseConsumedPercent}%` }}
                        />
                      </div>
                    </div>
                    <div className="bg-white/60 rounded px-3 py-2 border border-neutral-200">
                      <p className="text-xs text-neutral-500 font-medium mb-0.5">Response Deadline</p>
                      <p className="text-xs font-semibold text-neutral-800">{responseInfo.deadline ? formatDateTime(responseInfo.deadline) : '—'}</p>
                    </div>
                    {responseConfirmed ? (
                      <div className="bg-blue-50 border border-blue-200 rounded px-2 py-1 text-[11px] text-blue-800">
                        Confirmed at: <span className="font-semibold">{formatDateTime(responseInfo.confirmedAt)}</span>
                        {typeof responseInfo.actualMinutes === 'number' && <span className="ml-2">({formatDurationMinutes(responseInfo.actualMinutes)} from creation)</span>}
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={`text-[11px] flex-1 ${responseBreached ? 'text-red-700 font-semibold' : 'text-neutral-600'}`}>{responseBreached ? 'SLA breached. Confirm first response.' : 'Timer starts from incident creation.'}</p>
                        <button
                          type="button"
                          onClick={handleConfirmResponse}
                          disabled={confirmingResponse || !canConfirmResponse}
                          className="btn-action-reopen px-3 py-1 text-xs font-semibold disabled:opacity-60 ml-auto shrink-0"
                          title={!canConfirmResponse ? 'Only assigned engineer can confirm response' : undefined}
                        >
                          {confirmingResponse ? 'Confirming...' : 'Confirm Response'}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-neutral-500">No response-time data available.</p>
                )}
              </div>
            </Card>
            )}



          </div>
        </div>
      </div>

      {/* Complete Modal */}
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
              form="complete-form"
              disabled={submitting}
              className="btn-success"
            >
              {submitting ? 'Completing...' : 'Complete Incident'}
            </button>
          </div>
        }
      >
        <div className="bg-neutral-50 -m-6 p-6">
        <form id="complete-form" onSubmit={handleComplete} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Resolution Time (minutes)</label>
            <input 
              type="number" 
              value={resolutionTime} 
              onChange={(e) => setResolutionTime(parseInt(e.target.value) || 60)}
              min="1"
              className="input"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Resolution Notes</label>
            <textarea 
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              placeholder="Describe how the issue was resolved..."
              rows={4}
              className="input resize-none"
            />
          </div>
        </form>
        </div>
      </Modal>

      {/* Resolve Confirmation Modal */}
      <ConfirmModal
        isOpen={showResolveConfirm}
        onClose={() => setShowResolveConfirm(false)}
        onConfirm={handleMarkResolved}
        title="Mark as Resolved"
        message="This action will mark the incident as resolved. The status will change and resolution metrics will be recorded."
        confirmText="Yes, Mark Resolved"
        variant="success"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        }
      />

      {/* ISS Override Modal */}
      <Modal 
        isOpen={showOverrideModal} 
        onClose={() => {
          setShowOverrideModal(false);
          setOverrideField(null);
          setOverrideValue('');
          setOverrideCurrentValue('');
          setOverrideReason('');
        }}
        title={`Override ${overrideField === 'severity' ? 'Severity' : 'Priority'}`}
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
      >
        <form onSubmit={handleOverrideMetrics}>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-neutral-900 mb-1">Manager Override</p>
              <p className="text-xs text-neutral-700">
                You are about to override the auto-calculated {overrideField}. 
                ISS/TSS will be recalculated automatically and this action will be logged with your reason.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                New {overrideField === 'severity' ? 'Severity' : 'Priority'} <span className="text-red-500">*</span>
              </label>
              {overrideCurrentValue && (
                <p className="text-xs text-neutral-500 mb-1">Current: {overrideCurrentValue}</p>
              )}
              {overrideField === 'severity' ? (
                <select 
                  value={overrideValue} 
                  onChange={(e) => setOverrideValue(e.target.value)} 
                  className="input"
                  required
                >
                  <option value="">Select severity</option>
                  <option value="SEV-1">SEV-1 (Critical)</option>
                  <option value="SEV-2">SEV-2 (High)</option>
                  <option value="SEV-3">SEV-3 (Medium)</option>
                  <option value="SEV-4">SEV-4 (Low)</option>
                </select>
              ) : (
                <select 
                  value={overrideValue} 
                  onChange={(e) => setOverrideValue(e.target.value)} 
                  className="input"
                  required
                >
                  <option value="">Select priority</option>
                  <option value="P1">P1 (4h SLA)</option>
                  <option value="P2">P2 (8h SLA)</option>
                  <option value="P3">P3 (24h SLA)</option>
                  <option value="P4">P4 (72h SLA)</option>
                </select>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                Override Reason <span className="text-red-500">*</span>
              </label>
              <textarea 
                value={overrideReason} 
                onChange={(e) => setOverrideReason(e.target.value)} 
                placeholder="Explain why you are overriding the calculated value (minimum 10 characters)..."
                className="input min-h-[100px]"
                required
                minLength={10}
              />
              <p className="text-xs text-neutral-500 mt-1">
                {overrideReason.length}/10 characters minimum
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={overriding || overrideReason.trim().length < 10}
                className="btn-action-reopen flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {overriding ? 'Overriding...' : 'Confirm Override'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowOverrideModal(false);
                  setOverrideField(null);
                  setOverrideValue('');
                  setOverrideCurrentValue('');
                  setOverrideReason('');
                }}
                className="btn-cancel"
                disabled={overriding}
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Reopen Confirmation Modal */}
      <ConfirmModal
        isOpen={showReopenConfirm}
        onClose={() => setShowReopenConfirm(false)}
        onConfirm={handleReopen}
        title="Reopen Incident"
        message="This will reopen the incident and notify the original creator. The incident will need to be processed again."
        confirmText="Yes, Reopen"
        variant="primary"
        loading={submitting}
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        }
      />

      {/* Attachment Preview Modal */}
      {previewUrl && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/80 backdrop-blur-sm"
          onClick={() => { setPreviewUrl(null); setPreviewType(null); }}
        >
          <div className="relative max-w-4xl max-h-[90vh] m-4 animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => { setPreviewUrl(null); setPreviewType(null); }}
              className="absolute -top-3 -right-3 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-neutral-100 z-10 transition-colors"
            >
              <svg className="w-5 h-5 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            {previewType === 'image' && (
              <img 
                src={previewUrl} 
                alt="Preview" 
                className="max-w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl"
              />
            )}
            {previewType === 'pdf' && (
              <iframe 
                src={previewUrl} 
                className="w-[80vw] h-[80vh] rounded-2xl shadow-2xl"
                title="PDF Preview"
              />
            )}
            <div className="mt-4 flex justify-center gap-3">
              <a 
                href={previewUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="btn-secondary text-sm"
              >
                Open in New Tab
              </a>
              <a 
                href={previewUrl} 
                download
                className="btn-primary text-sm"
              >
                Download
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
