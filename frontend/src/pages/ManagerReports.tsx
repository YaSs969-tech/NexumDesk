import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Header, Card } from '../components';
import api from '../services/api';
import { generateNDI } from '../utils/format';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

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
  status: string;
  priority?: string;
  urgency?: string;
  severity?: string;
  calculated_priority?: string;
  calculated_severity?: string;
  initial_priority?: string;
  initial_severity?: string;
  override_reason?: string;
  overridden_by?: string;
  overridden_by_name?: string;
  overridden_at?: string;
  category?: string;
  impact?: string;
  created_at: string;
  updated_at: string;
  resolved_at?: string;
  sla_deadline?: string;
  sla_percent_consumed?: number;
  pending_reason?: string;
  estimated_resolution_time?: number;
  response_time_sla_minutes?: number;
  response_time_confirmed_at?: string;
  response_time_minutes?: number;
  assigned_to?: string;
  assigned_to_name?: string;
}

interface OverrideChangeRow {
  incidentId: string;
  title: string;
  original: string;
  next: string;
  changedBy: string;
  changeType?: 'override' | 'edit';
  changedAt?: string;
}

interface OverrideReasonRow {
  incidentId: string;
  title: string;
  reason: string;
}

interface AuditActivity {
  id: string;
  incident_id: string;
  incident_title: string;
  user_id?: string;
  user_name?: string;
  action: string;
  description: string;
  created_at: string;
}

interface ParsedAuditChangeRow extends OverrideChangeRow {
  field: 'priority' | 'severity' | 'category' | 'urgency' | 'impact';
  changeType: 'override' | 'edit';
  changedAt: string;
  reason?: string;
}

interface EngineerPerf {
  id: string;
  name: string;
  resolved: number;
  avgResolutionHours: number;
  reopenRate: number;
}

type PeriodKey = 'today' | 'month' | 'all' | 'custom';
type ReportTab = 'audit' | 'sla-compliance' | 'team-performance';

interface DateRange {
  start: Date;
  end: Date;
}

const PERIOD_OPTIONS: Array<{ key: PeriodKey; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'month', label: 'This Month' },
  { key: 'all', label: 'All' },
  { key: 'custom', label: 'Custom' },
];

const REPORT_TABS: Array<{ key: ReportTab; label: string }> = [
  { key: 'audit', label: 'Audit Changes' },
  { key: 'sla-compliance', label: 'SLA Compliance' },
  { key: 'team-performance', label: 'Team Performance' },
];

const PRIORITY_COLORS = ['#dc2626', '#ea580c', '#2563eb', '#94a3b8'];
const OVERRIDE_IMPACT_COLORS = ['#334155', '#2563eb', '#dc2626'];

const ACTIVE_STATUSES = new Set(['OPEN', 'IN_PROGRESS', 'PENDING', 'REOPENED']);
// Canceled = eroare umană, exclus din calcule de performanță; rămâne în istoric/audit
const RESOLVED_STATUSES = new Set(['RESOLVED']);
const Canceled_STATUS = 'Canceled';
const normalizeStatus = (status?: string) => String(status || '').trim().toUpperCase().replace(/\s+/g, '_');

const getResolvedSlaPercent = (incident: Incident): number | null => {
  if (typeof incident.sla_percent_consumed === 'number' && Number.isFinite(incident.sla_percent_consumed)) {
    return incident.sla_percent_consumed;
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

const normalizePriorityLevel = (priority?: string, urgency?: string): number => {
  const source = (priority || urgency || '').toUpperCase();
  if (source.includes('PRY1') || source.includes('CRITICAL') || source === 'P1' || source === 'HIGH') return 1;
  if (source.includes('PRY2') || source.includes('MAJOR') || source === 'P2') return 2;
  if (source.includes('PRY3') || source.includes('MEDIUM') || source === 'P3') return 3;
  return 4;
};

const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'NA';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

const normalizePriorityCode = (value?: string): string => {
  const normalized = (value || '').toUpperCase().trim();
  if (!normalized) return 'P4';
  if (normalized === 'CRITICAL') return 'P1';
  if (normalized === 'HIGH') return 'P2';
  if (normalized === 'MEDIUM') return 'P3';
  if (normalized === 'LOW') return 'P4';
  if (['P1', 'P2', 'P3', 'P4'].includes(normalized)) return normalized;
  return normalized;
};

const normalizeSeverityCode = (value?: string): string => {
  const normalized = (value || '').toUpperCase().trim();
  if (!normalized) return 'SEV-4';
  if (normalized === 'CRITICAL') return 'SEV-1';
  if (normalized === 'HIGH') return 'SEV-2';
  if (normalized === 'MEDIUM') return 'SEV-3';
  if (normalized === 'LOW') return 'SEV-4';
  if (['SEV-1', 'SEV-2', 'SEV-3', 'SEV-4'].includes(normalized)) return normalized;
  return normalized;
};

const priorityToIssScore = (value?: string): number => {
  const normalized = normalizePriorityCode(value);
  if (normalized === 'P1') return 4;
  if (normalized === 'P2') return 3;
  if (normalized === 'P3') return 2;
  return 1;
};

const severityToTssScore = (value?: string): number => {
  const normalized = normalizeSeverityCode(value);
  if (normalized === 'SEV-1') return 5;
  if (normalized === 'SEV-2') return 4;
  if (normalized === 'SEV-3') return 3;
  return 2;
};

const formatImpactLabel = (impact?: string): string => {
  const normalized = (impact || 'SINGLE_USER').toUpperCase();
  if (normalized === 'SINGLE_USER') return 'Single User';
  if (normalized === 'DEPARTMENT') return 'Department';
  if (normalized === 'ORGANIZATION') return 'Organization';
  return 'Single User';
};

const formatCategoryLabel = (category?: string): string => {
  const raw = (category || 'OTHER').replace(/_/g, ' ').toLowerCase();
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

const normalizeAuditFieldValue = (field: ParsedAuditChangeRow['field'], value: string): string => {
  if (field === 'priority') return normalizePriorityCode(value);
  if (field === 'severity') return normalizeSeverityCode(value);
  if (field === 'impact') return formatImpactLabel(value);
  if (field === 'category') return formatCategoryLabel(value);
  if (field === 'urgency') return (value || '').toUpperCase().trim() || '-';
  return value;
};

const parseAuditActivity = (activity: AuditActivity): ParsedAuditChangeRow | null => {
  const overrideMatch = activity.description.match(/^(Severity|Priority) overridden from (.+?) to (.+?)(?::\s*(.+))?$/i);
  if (overrideMatch) {
    const field = overrideMatch[1].toLowerCase() as ParsedAuditChangeRow['field'];
    return {
      incidentId: activity.incident_id,
      title: activity.incident_title,
      original: normalizeAuditFieldValue(field, overrideMatch[2]),
      next: normalizeAuditFieldValue(field, overrideMatch[3]),
      changedBy: activity.user_name || 'Unknown',
      field,
      changeType: 'override',
      changedAt: activity.created_at,
      reason: overrideMatch[4]?.trim(),
    };
  }

  const changedMatch = activity.description.match(/^(Urgency|Category|Impact|Severity|Priority) changed from (.+?) to (.+)$/i);
  if (changedMatch) {
    const field = changedMatch[1].toLowerCase() as ParsedAuditChangeRow['field'];
    return {
      incidentId: activity.incident_id,
      title: activity.incident_title,
      original: normalizeAuditFieldValue(field, changedMatch[2]),
      next: normalizeAuditFieldValue(field, changedMatch[3]),
      changedBy: activity.user_name || 'Unknown',
      field,
      changeType: 'edit',
      changedAt: activity.created_at,
    };
  }

  return null;
};

const formatExportIncidentId = (incidentId: string): string => {
  if (!incidentId || incidentId === 'N/A') return incidentId || 'N/A';
  return `ID ${generateNDI(incidentId)}`;
};

const toInputDate = (value: Date): string => value.toISOString().split('T')[0];

const buildRange = (period: PeriodKey, customStart: string, customEnd: string): DateRange => {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(now);

  if (period === 'today') {
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }

  if (period === 'month') {
    start.setDate(now.getDate() - 29);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }

  if (period === 'all') {
    start.setFullYear(2000, 0, 1);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }

  const customRangeStart = customStart ? new Date(`${customStart}T00:00:00`) : new Date(now);
  const customRangeEnd = customEnd ? new Date(`${customEnd}T23:59:59`) : new Date(now);

  if (Number.isNaN(customRangeStart.getTime()) || Number.isNaN(customRangeEnd.getTime())) {
    start.setDate(now.getDate() - 29);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }

  if (customRangeStart > customRangeEnd) {
    return { start: customRangeEnd, end: customRangeStart };
  }

  return { start: customRangeStart, end: customRangeEnd };
};

export default function ManagerReports({ user }: { user: User | null }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState<PeriodKey>('month');
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [auditActivities, setAuditActivities] = useState<AuditActivity[]>([]);
  const [activeTab, setActiveTab] = useState<ReportTab>('audit');
  const [customStart, setCustomStart] = useState(() => {
    const start = new Date();
    start.setDate(start.getDate() - 29);
    return toInputDate(start);
  });
  const [customEnd, setCustomEnd] = useState(() => toInputDate(new Date()));

  useEffect(() => {
    const loadReports = async () => {
      try {
        setLoading(true);
        const res = await api.get('/incidents?limit=5000&page=1');
        const rows: Incident[] = res.data.data?.incidents || res.data.data || [];
        setIncidents(rows);
        setError('');
      } catch (err) {
        console.error('Failed to load reports:', err);
        setError('Failed to load reports data');
      } finally {
        setLoading(false);
      }
    };

    loadReports();
  }, []);

  useEffect(() => {
    const restoreScrollY = (location.state as { restoreScrollY?: number; restoreMainScrollTop?: number } | null)?.restoreScrollY;
    const restoreMainScrollTop = (location.state as { restoreScrollY?: number; restoreMainScrollTop?: number } | null)?.restoreMainScrollTop;

    if (typeof restoreScrollY === 'number' || typeof restoreMainScrollTop === 'number') {
      requestAnimationFrame(() => {
        if (typeof restoreScrollY === 'number') {
          window.scrollTo({ top: restoreScrollY, behavior: 'auto' });
        }

        if (typeof restoreMainScrollTop === 'number') {
          const main = document.querySelector('main');
          if (main) {
            main.scrollTop = restoreMainScrollTop;
          }
        }
      });
      navigate(`${location.pathname}${location.search}`, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, location.search, navigate]);

  const selectedRange = useMemo(() => buildRange(period, customStart, customEnd), [period, customStart, customEnd]);

  useEffect(() => {
    const loadAuditActivities = async () => {
      try {
        const res = await api.get('/incidents/audit/changes', {
          params: {
            start: selectedRange.start.toISOString(),
            end: selectedRange.end.toISOString(),
          },
        });
        const rows: AuditActivity[] = res.data.data || [];
        setAuditActivities(rows);
      } catch (err) {
        console.error('Failed to load audit changes:', err);
        setAuditActivities([]);
      }
    };

    loadAuditActivities();
  }, [selectedRange]);

  const filteredIncidents = useMemo(() => {
    const { start, end } = selectedRange;
    return incidents.filter((i) => {
      const created = new Date(i.created_at);
      return created >= start && created <= end;
    });
  }, [incidents, selectedRange]);

  const previousPeriodIncidents = useMemo(() => {
    const { start, end } = selectedRange;
    const duration = Math.max(1, end.getTime() - start.getTime());
    const prevEnd = new Date(start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - duration);

    return incidents.filter((i) => {
      const created = new Date(i.created_at);
      return created >= prevStart && created < prevEnd;
    });
  }, [incidents, selectedRange]);

  const summary = useMemo(() => {
    const resolved = filteredIncidents.filter((i) => RESOLVED_STATUSES.has(normalizeStatus(i.status)));
    const prevResolved = previousPeriodIncidents.filter((i) => RESOLVED_STATUSES.has(normalizeStatus(i.status)));

    const resolutionTimes = resolved
      .map((i) => {
        const end = new Date(i.resolved_at || i.updated_at).getTime();
        const start = new Date(i.created_at).getTime();
        if (!Number.isFinite(end) || !Number.isFinite(start) || end <= start) return null;
        return (end - start) / 3600000;
      })
      .filter((value): value is number => value !== null);

    const prevTimes = prevResolved
      .map((i) => {
        const end = new Date(i.resolved_at || i.updated_at).getTime();
        const start = new Date(i.created_at).getTime();
        if (!Number.isFinite(end) || !Number.isFinite(start) || end <= start) return null;
        return (end - start) / 3600000;
      })
      .filter((value): value is number => value !== null);

    const avgResolutionHours = resolutionTimes.length
      ? resolutionTimes.reduce((acc, value) => acc + value, 0) / resolutionTimes.length
      : 0;

    const prevAvgHours = prevTimes.length ? prevTimes.reduce((acc, value) => acc + value, 0) / prevTimes.length : 0;
    const resolutionDelta = prevAvgHours > 0 ? ((avgResolutionHours - prevAvgHours) / prevAvgHours) * 100 : 0;

    const totalAssigned = filteredIncidents.filter((i) => Boolean(i.assigned_to) && i.status !== Canceled_STATUS).length;
    const totalResolved = resolved.length;
    const workloadDelta = previousPeriodIncidents.length > 0
      ? ((filteredIncidents.length - previousPeriodIncidents.length) / previousPeriodIncidents.length) * 100
      : 0;

    return {
      avgResolutionHours,
      resolutionDelta,
      totalAssigned,
      totalResolved,
      workloadDelta,
    };
  }, [filteredIncidents, previousPeriodIncidents]);

  const slaAnalytics = useMemo(() => {
    const incidentsWithSla = filteredIncidents.filter((incident) => Boolean(incident.sla_deadline) && normalizeStatus(incident.status) !== Canceled_STATUS);
    const resolvedWithSla = incidentsWithSla.filter((incident) => RESOLVED_STATUSES.has(normalizeStatus(incident.status)));

    let resolvedOnTime = 0;
    let resolvedBreached = 0;
    let responseActualMinutesTotal = 0;
    let responseTargetMinutesTotal = 0;
    let responseSamples = 0;

    let resolutionActualMinutesTotal = 0;
    let resolutionTargetMinutesTotal = 0;
    let resolutionSamples = 0;

    const byPriority = new Map<string, { total: number; resolved: number; onTime: number; breached: number }>();
    const byCategory = new Map<string, { total: number; resolved: number; onTime: number; breached: number; actualResolutionMinutesTotal: number; resolutionSamples: number }>();

    incidentsWithSla.forEach((incident) => {
      const priorityKey = normalizePriorityCode(incident.priority || incident.calculated_priority || incident.urgency);
      const categoryKey = formatCategoryLabel(incident.category || 'OTHER');

      if (!byPriority.has(priorityKey)) {
        byPriority.set(priorityKey, { total: 0, resolved: 0, onTime: 0, breached: 0 });
      }
      if (!byCategory.has(categoryKey)) {
        byCategory.set(categoryKey, { total: 0, resolved: 0, onTime: 0, breached: 0, actualResolutionMinutesTotal: 0, resolutionSamples: 0 });
      }

      const priorityBucket = byPriority.get(priorityKey)!;
      const categoryBucket = byCategory.get(categoryKey)!;
      priorityBucket.total += 1;
      categoryBucket.total += 1;

      const isResolved = RESOLVED_STATUSES.has(normalizeStatus(incident.status));
      if (isResolved) {
        priorityBucket.resolved += 1;
        categoryBucket.resolved += 1;

        if (isResolvedWithinSla(incident)) {
          resolvedOnTime += 1;
          priorityBucket.onTime += 1;
          categoryBucket.onTime += 1;
        } else {
          resolvedBreached += 1;
          priorityBucket.breached += 1;
          categoryBucket.breached += 1;
        }

        const resolvedAtMs = new Date(incident.resolved_at || incident.updated_at).getTime();
        const createdAtMs = new Date(incident.created_at).getTime();
        if (!Number.isNaN(createdAtMs) && !Number.isNaN(resolvedAtMs) && resolvedAtMs > createdAtMs) {
          const actualResolutionMinutes = Math.round((resolvedAtMs - createdAtMs) / 60000);
          resolutionActualMinutesTotal += actualResolutionMinutes;
          resolutionTargetMinutesTotal += Math.max(incident.estimated_resolution_time || 0, 1);
          resolutionSamples += 1;
          categoryBucket.actualResolutionMinutesTotal += actualResolutionMinutes;
          categoryBucket.resolutionSamples += 1;
        }
      }

      const responseTarget = incident.response_time_sla_minutes || 0;
      if (responseTarget > 0) {
        let actualResponseMinutes: number | null = null;
        if (typeof incident.response_time_minutes === 'number' && Number.isFinite(incident.response_time_minutes)) {
          actualResponseMinutes = Math.max(0, Math.round(incident.response_time_minutes));
        } else if (incident.response_time_confirmed_at) {
          const createdAtMs = new Date(incident.created_at).getTime();
          const confirmedAtMs = new Date(incident.response_time_confirmed_at).getTime();
          if (!Number.isNaN(createdAtMs) && !Number.isNaN(confirmedAtMs) && confirmedAtMs > createdAtMs) {
            actualResponseMinutes = Math.round((confirmedAtMs - createdAtMs) / 60000);
          }
        }

        if (actualResponseMinutes !== null) {
          responseActualMinutesTotal += actualResponseMinutes;
          responseTargetMinutesTotal += responseTarget;
          responseSamples += 1;
        }
      }
    });

    const onTimeRate = resolvedWithSla.length > 0 ? (resolvedOnTime / resolvedWithSla.length) * 100 : 0;
    const breachedRate = resolvedWithSla.length > 0 ? (resolvedBreached / resolvedWithSla.length) * 100 : 0;

    const avgResponseActualMinutes = responseSamples > 0 ? responseActualMinutesTotal / responseSamples : 0;
    const avgResponseTargetMinutes = responseSamples > 0 ? responseTargetMinutesTotal / responseSamples : 0;
    const avgResolutionActualMinutes = resolutionSamples > 0 ? resolutionActualMinutesTotal / resolutionSamples : 0;
    const avgResolutionTargetMinutes = resolutionSamples > 0 ? resolutionTargetMinutesTotal / resolutionSamples : 0;

    return {
      incidentsWithSla: incidentsWithSla.length,
      resolvedWithSla: resolvedWithSla.length,
      resolvedOnTime,
      resolvedBreached,
      onTimeRate,
      breachedRate,
      avgResponseActualMinutes,
      avgResponseTargetMinutes,
      avgResolutionActualMinutes,
      avgResolutionTargetMinutes,
      byPriority: Array.from(byPriority.entries())
        .map(([key, value]) => ({
          label: key,
          ...value,
          onTimeRate: value.resolved > 0 ? (value.onTime / value.resolved) * 100 : 0,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      byCategory: Array.from(byCategory.entries())
        .map(([key, value]) => ({
          label: key,
          ...value,
          onTimeRate: value.resolved > 0 ? (value.onTime / value.resolved) * 100 : 0,
          avgActualResolutionMinutes: value.resolutionSamples > 0 ? value.actualResolutionMinutesTotal / value.resolutionSamples : 0,
        }))
        .sort((a, b) => b.total - a.total),
    };
  }, [filteredIncidents]);

  const priorityStats = useMemo(() => {
    const counts = [0, 0, 0, 0];
    filteredIncidents.forEach((i) => {
      if (i.status === Canceled_STATUS) return;
      const p = normalizePriorityLevel(i.priority, i.urgency);
      counts[p - 1] += 1;
    });
    const total = counts.reduce((acc, value) => acc + value, 0);
    return { counts, total };
  }, [filteredIncidents]);

  const parsedAuditChanges = useMemo(
    () => auditActivities.map(parseAuditActivity).filter((row): row is ParsedAuditChangeRow => row !== null),
    [auditActivities],
  );

  const overrideAnalysis = useMemo(() => {
    const categoryMap = new Map<string, number>();
    const impactMap = new Map<string, number>([
      ['Single User', 0],
      ['Department', 0],
      ['Organization', 0],
    ]);
    const priorityRows: OverrideChangeRow[] = [];
    const severityRows: OverrideChangeRow[] = [];
    const classificationRows: ParsedAuditChangeRow[] = [];
    const reasonRows: OverrideReasonRow[] = [];

    let priorityOverrideCount = 0;
    let severityOverrideCount = 0;
    let priorityManualChangeCount = 0;
    let severityManualChangeCount = 0;
    let categoryChangeCount = 0;
    let urgencyChangeCount = 0;
    let impactChangeCount = 0;

    parsedAuditChanges.forEach((change) => {
      if (change.field === 'priority') {
        priorityRows.push(change);
        if (change.changeType === 'override') {
          priorityOverrideCount += 1;
        } else {
          priorityManualChangeCount += 1;
        }
      }

      if (change.field === 'severity') {
        severityRows.push(change);
        if (change.changeType === 'override') {
          severityOverrideCount += 1;
        } else {
          severityManualChangeCount += 1;
        }
      }

      if (change.field === 'category' || change.field === 'urgency' || change.field === 'impact') {
        classificationRows.push(change);
      }

      if (change.field === 'category') {
        categoryChangeCount += 1;
        categoryMap.set(change.next, (categoryMap.get(change.next) || 0) + 1);
      }

      if (change.field === 'urgency') {
        urgencyChangeCount += 1;
      }

      if (change.field === 'impact') {
        impactChangeCount += 1;
        impactMap.set(change.next, (impactMap.get(change.next) || 0) + 1);
      }

      if (change.changeType === 'override' && change.reason) {
        reasonRows.push({
          incidentId: change.incidentId,
          title: change.title,
          reason: change.reason,
        });
      }
    });

    const overridesByCategory = Array.from(categoryMap.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

    const overridesByImpact = Array.from(impactMap.entries())
      .map(([impact, count]) => ({ impact, count }));

    return {
      priorityOverrideCount,
      severityOverrideCount,
      priorityManualChangeCount,
      severityManualChangeCount,
      categoryChangeCount,
      urgencyChangeCount,
      impactChangeCount,
      classificationEditCount: categoryChangeCount + urgencyChangeCount + impactChangeCount,
      totalOverrides: parsedAuditChanges.length,
      overridesByCategory,
      overridesByImpact,
      priorityRows,
      severityRows,
      classificationRows,
      reasonRows,
    };
  }, [parsedAuditChanges]);

  const engineerPerformance = useMemo(() => {
    const map = new Map<string, {
      id: string;
      name: string;
      resolved: number;
      reopened: number;
      times: number[];
      handled: number;
    }>();

    filteredIncidents.forEach((incident) => {
      if (normalizeStatus(incident.status) === Canceled_STATUS) return;
      if (!incident.assigned_to || !incident.assigned_to_name) return;
      const item = map.get(incident.assigned_to) || {
        id: incident.assigned_to,
        name: incident.assigned_to_name,
        resolved: 0,
        reopened: 0,
        times: [],
        handled: 0,
      };

      if (RESOLVED_STATUSES.has(normalizeStatus(incident.status))) {
        item.resolved += 1;
        item.handled += 1;
        const endMs = new Date(incident.resolved_at || incident.updated_at).getTime();
        const startMs = new Date(incident.created_at).getTime();
        if (!Number.isNaN(endMs) && !Number.isNaN(startMs) && endMs > startMs) {
          item.times.push((endMs - startMs) / 3600000);
        }
      } else if (normalizeStatus(incident.status) === 'REOPENED') {
        item.reopened += 1;
        item.handled += 1;
      } else if (ACTIVE_STATUSES.has(normalizeStatus(incident.status))) {
        item.handled += 1;
      }

      map.set(incident.assigned_to, item);
    });

    return Array.from(map.values())
      .map<EngineerPerf>((value) => {
        const avgTime = value.times.length
          ? value.times.reduce((acc, t) => acc + t, 0) / value.times.length
          : 0;
        const reopenRate = value.handled > 0 ? (value.reopened / value.handled) * 100 : 0;
        return {
          id: value.id,
          name: value.name,
          resolved: value.resolved,
          avgResolutionHours: avgTime,
          reopenRate,
        };
      })
      .sort((a, b) => b.resolved - a.resolved);
  }, [filteredIncidents]);

  const trend = useMemo(() => {
    const start = new Date(selectedRange.start);
    const end = new Date(selectedRange.end);
    const rangeDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
    const points = Math.min(12, rangeDays);
    const step = Math.max(1, Math.floor(rangeDays / points));

    const labels: string[] = [];
    const created: number[] = [];
    const resolved: number[] = [];

    for (let i = 0; i < points; i += 1) {
      const bucketStart = new Date(start);
      bucketStart.setDate(start.getDate() + i * step);
      bucketStart.setHours(0, 0, 0, 0);

      const bucketEnd = new Date(bucketStart);
      bucketEnd.setDate(bucketStart.getDate() + step);
      if (bucketEnd > end) bucketEnd.setTime(end.getTime());

      labels.push(bucketStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));

      created.push(
        filteredIncidents.filter((incident) => {
          if (normalizeStatus(incident.status) === Canceled_STATUS) return false;
          const createdAt = new Date(incident.created_at);
          return createdAt >= bucketStart && createdAt <= bucketEnd;
        }).length,
      );

      resolved.push(
        filteredIncidents.filter((incident) => {
          if (normalizeStatus(incident.status) === Canceled_STATUS) return false;
          const target = incident.resolved_at || (RESOLVED_STATUSES.has(normalizeStatus(incident.status)) ? incident.updated_at : null);
          if (!target) return false;
          const resolvedAt = new Date(target);
          return resolvedAt >= bucketStart && resolvedAt <= bucketEnd;
        }).length,
      );
    }

    return { labels, created, resolved };
  }, [filteredIncidents, selectedRange]);

  const maxResolvedByEngineer = useMemo(
    () => Math.max(1, ...engineerPerformance.map((item) => item.resolved)),
    [engineerPerformance],
  );

  const maxTrendValue = Math.max(1, ...trend.created, ...trend.resolved);

  const donutBackground = useMemo(() => {
    const total = priorityStats.total || 1;
    const [p1, p2, p3, p4] = priorityStats.counts;
    const segments = [p1, p2, p3, p4]
      .map((value, index) => {
        const start = index === 0
          ? 0
          : (priorityStats.counts.slice(0, index).reduce((acc, v) => acc + v, 0) / total) * 100;
        const end = (priorityStats.counts.slice(0, index + 1).reduce((acc, v) => acc + v, 0) / total) * 100;
        return `${PRIORITY_COLORS[index]} ${start}% ${end}%`;
      })
      .join(', ');

    return `conic-gradient(${segments || '#e2e8f0 0% 100%'})`;
  }, [priorityStats]);

  const overrideImpactBackground = useMemo(() => {
    const total = Math.max(1, overrideAnalysis.overridesByImpact.reduce((acc, item) => acc + item.count, 0));
    let cursor = 0;
    const segments = overrideAnalysis.overridesByImpact.map((item, index) => {
      const start = (cursor / total) * 100;
      cursor += item.count;
      const end = (cursor / total) * 100;
      return `${OVERRIDE_IMPACT_COLORS[index % OVERRIDE_IMPACT_COLORS.length]} ${start}% ${end}%`;
    });

    return `conic-gradient(${segments.join(', ') || '#e2e8f0 0% 100%'})`;
  }, [overrideAnalysis]);

  const openIncidentDetails = (incidentId: string) => {
    const main = document.querySelector('main');
    const mainScrollTop = main ? main.scrollTop : 0;

    navigate(`/incidents/${incidentId}`, {
      state: {
        from: `${location.pathname}${location.search}`,
        scrollY: window.scrollY,
        mainScrollTop,
      },
    });
  };

  const overridePriorityComparison = useMemo(() => {
    const labels = ['P1', 'P2', 'P3', 'P4'];
    const calculated = [0, 0, 0, 0];
    const overridden = [0, 0, 0, 0];

    parsedAuditChanges
      .filter((change) => change.field === 'priority' && change.changeType === 'override')
      .forEach((change) => {
      const calcIndex = labels.indexOf(change.original);
      if (calcIndex >= 0) calculated[calcIndex] += 1;

      const overrideIndex = labels.indexOf(change.next);
      if (overrideIndex >= 0) overridden[overrideIndex] += 1;
    });

    return {
      labels,
      calculated,
      overridden,
      maxValue: Math.max(1, ...calculated, ...overridden),
    };
  }, [parsedAuditChanges]);

  const exportRows = useMemo(
    () => engineerPerformance.map((engineer) => ({
      engineer: engineer.name,
      resolved: engineer.resolved,
      avgTime: `${engineer.avgResolutionHours.toFixed(1)}h`,
      reopenRate: `${engineer.reopenRate.toFixed(1)}%`,
    })),
    [engineerPerformance],
  );

  const exportPeriodLabel = useMemo(() => {
    if (period !== 'custom') {
      return PERIOD_OPTIONS.find((option) => option.key === period)?.label || period;
    }
    return `${selectedRange.start.toLocaleDateString('ro-RO')} - ${selectedRange.end.toLocaleDateString('ro-RO')}`;
  }, [period, selectedRange]);

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    let currentY = 40;
    const tabLabel = REPORT_TABS.find((t) => t.key === activeTab)?.label || activeTab;

    const addSectionTitle = (title: string) => {
      if (currentY > 720) { doc.addPage(); currentY = 40; }
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text(title, 40, currentY);
      doc.setFont('helvetica', 'normal');
      currentY += 18;
    };

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('NexumDesk Reports', 40, currentY);
    doc.setFont('helvetica', 'normal');
    currentY += 22;
    doc.setFontSize(11);
    doc.text(`Tab: ${tabLabel}`, 40, currentY);
    currentY += 14;
    doc.text(`Period: ${exportPeriodLabel}`, 40, currentY);
    currentY += 22;

    if (activeTab === 'audit') {
      doc.setFontSize(11);
      doc.text(`Total Audit Changes: ${overrideAnalysis.totalOverrides}`, 40, currentY); currentY += 14;
      doc.text(`Priority Overrides: ${overrideAnalysis.priorityOverrideCount}`, 40, currentY); currentY += 14;
      doc.text(`Severity Overrides: ${overrideAnalysis.severityOverrideCount}`, 40, currentY); currentY += 14;
      doc.text(`Classification Updates: ${overrideAnalysis.classificationEditCount}`, 40, currentY); currentY += 22;

      addSectionTitle('Changes by Category');
      autoTable(doc, {
        startY: currentY,
        head: [['Category', 'Changes']],
        body: (overrideAnalysis.overridesByCategory.length > 0
          ? overrideAnalysis.overridesByCategory
          : [{ category: 'N/A', count: 0 }]).map((row) => [row.category, String(row.count)]),
        styles: { fontSize: 10, cellPadding: 6 },
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });
      currentY = (doc as any).lastAutoTable.finalY + 18;

      addSectionTitle('Changes by Impact');
      autoTable(doc, {
        startY: currentY,
        head: [['Impact', 'Changes']],
        body: overrideAnalysis.overridesByImpact.map((row) => [row.impact, String(row.count)]),
        styles: { fontSize: 10, cellPadding: 6 },
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });
      currentY = (doc as any).lastAutoTable.finalY + 18;

      addSectionTitle('Classification Change Analysis');
      autoTable(doc, {
        startY: currentY,
        head: [['Incident', 'Field', 'Type', 'Original', 'New', 'Changed By']],
        body: (overrideAnalysis.classificationRows.length > 0
          ? overrideAnalysis.classificationRows
          : [{ incidentId: 'N/A', field: '-', changeType: '-', original: '-', next: '-', changedBy: '-' } as any]
        ).map((row: any) => [formatExportIncidentId(row.incidentId), row.field, row.changeType, row.original, row.next, row.changedBy]),
        styles: { fontSize: 9, cellPadding: 5 },
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });
      currentY = (doc as any).lastAutoTable.finalY + 18;

      addSectionTitle('Priority Change Analysis');
      autoTable(doc, {
        startY: currentY,
        head: [['Incident', 'Type', 'Original Priority', 'Original ISS Score', 'New Priority', 'New ISS Score', 'Changed By']],
        body: (overrideAnalysis.priorityRows.length > 0
          ? overrideAnalysis.priorityRows
          : [{ incidentId: 'N/A', changeType: '-', original: '-', next: '-', changedBy: '-' } as any]
        ).map((row: any) => [
          formatExportIncidentId(row.incidentId),
          row.changeType,
          row.original,
          priorityToIssScore(row.original).toFixed(1),
          row.next,
          priorityToIssScore(row.next).toFixed(1),
          row.changedBy,
        ]),
        styles: { fontSize: 10, cellPadding: 6 },
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });
      currentY = (doc as any).lastAutoTable.finalY + 18;

      addSectionTitle('Severity Change Analysis');
      autoTable(doc, {
        startY: currentY,
        head: [['Incident', 'Type', 'Original Severity', 'Original TSS Score', 'New Severity', 'New TSS Score', 'Changed By']],
        body: (overrideAnalysis.severityRows.length > 0
          ? overrideAnalysis.severityRows
          : [{ incidentId: 'N/A', changeType: '-', original: '-', next: '-', changedBy: '-' } as any]
        ).map((row: any) => [
          formatExportIncidentId(row.incidentId),
          row.changeType,
          row.original,
          severityToTssScore(row.original).toFixed(1),
          row.next,
          severityToTssScore(row.next).toFixed(1),
          row.changedBy,
        ]),
        styles: { fontSize: 10, cellPadding: 6 },
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });
      currentY = (doc as any).lastAutoTable.finalY + 18;

      addSectionTitle('Override Justification');
      autoTable(doc, {
        startY: currentY,
        head: [['Incident', 'Reason']],
        body: (overrideAnalysis.reasonRows.length > 0
          ? overrideAnalysis.reasonRows
          : [{ incidentId: 'N/A', reason: '-' } as any]
        ).map((row: any) => [formatExportIncidentId(row.incidentId), row.reason]),
        styles: { fontSize: 10, cellPadding: 6 },
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });
    }

    if (activeTab === 'sla-compliance') {
      doc.setFontSize(11);
      doc.text(`SLA Coverage: ${slaAnalytics.incidentsWithSla} incidents with deadline`, 40, currentY); currentY += 14;
      doc.text(`On-Time Resolution: ${slaAnalytics.onTimeRate.toFixed(1)}% (${slaAnalytics.resolvedOnTime} of ${slaAnalytics.resolvedWithSla})`, 40, currentY); currentY += 14;
      doc.text(`SLA Breached: ${slaAnalytics.breachedRate.toFixed(1)}% (${slaAnalytics.resolvedBreached} resolved late)`, 40, currentY); currentY += 14;
      currentY += 8;

      addSectionTitle('Response vs Resolution Averages');
      autoTable(doc, {
        startY: currentY,
        head: [['Metric', 'Actual', 'Target']],
        body: [
          ['Avg First Response', `${(slaAnalytics.avgResponseActualMinutes / 60).toFixed(1)}h`, `${(slaAnalytics.avgResponseTargetMinutes / 60).toFixed(1)}h`],
          ['Avg Resolution', `${(slaAnalytics.avgResolutionActualMinutes / 60).toFixed(1)}h`, `${(slaAnalytics.avgResolutionTargetMinutes / 60).toFixed(1)}h`],
        ],
        styles: { fontSize: 10, cellPadding: 6 },
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });
      currentY = (doc as any).lastAutoTable.finalY + 18;

      addSectionTitle('Average Actual Resolution by Category');
      autoTable(doc, {
        startY: currentY,
        head: [['Category', 'Avg Actual Resolution']],
        body: (slaAnalytics.byCategory.length > 0
          ? slaAnalytics.byCategory
          : [{ label: 'N/A', avgActualResolutionMinutes: 0 } as any]
        ).map((row: any) => [row.label, `${((row.avgActualResolutionMinutes || 0) / 60).toFixed(1)}h`]),
        styles: { fontSize: 10, cellPadding: 6 },
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });
      currentY = (doc as any).lastAutoTable.finalY + 18;

      addSectionTitle('SLA Compliance by Priority');
      autoTable(doc, {
        startY: currentY,
        head: [['Priority', 'Total', 'Resolved', 'On-Time', 'Compliance %']],
        body: (slaAnalytics.byPriority.length > 0
          ? slaAnalytics.byPriority
          : [{ label: 'N/A', total: 0, resolved: 0, onTime: 0, onTimeRate: 0 }]
        ).map((row) => [row.label, row.total, row.resolved, row.onTime, `${row.onTimeRate.toFixed(1)}%`]),
        styles: { fontSize: 10, cellPadding: 6 },
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });
      currentY = (doc as any).lastAutoTable.finalY + 18;

      addSectionTitle('SLA Compliance by Category');
      autoTable(doc, {
        startY: currentY,
        head: [['Category', 'Total', 'Resolved', 'Breached', 'Compliance %']],
        body: (slaAnalytics.byCategory.length > 0
          ? slaAnalytics.byCategory
          : [{ label: 'N/A', total: 0, resolved: 0, breached: 0, onTimeRate: 0 }]
        ).map((row) => [row.label, row.total, row.resolved, row.breached, `${row.onTimeRate.toFixed(1)}%`]),
        styles: { fontSize: 10, cellPadding: 6 },
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });
      currentY = (doc as any).lastAutoTable.finalY + 18;

      addSectionTitle('Incidents by Priority');
      autoTable(doc, {
        startY: currentY,
        head: [['Priority', 'Count', 'Share']],
        body: ['P1 Critical', 'P2 High', 'P3 Medium', 'P4 Low'].map((label, index) => [
          label,
          String(priorityStats.counts[index]),
          `${priorityStats.total ? Math.round((priorityStats.counts[index] / priorityStats.total) * 100) : 0}%`,
        ]),
        styles: { fontSize: 10, cellPadding: 6 },
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });
    }

    if (activeTab === 'team-performance') {
      doc.setFontSize(11);
      doc.text(`Avg Resolution Time: ${summary.avgResolutionHours.toFixed(1)}h`, 40, currentY); currentY += 14;
      doc.text(`Team Workload (Assigned): ${summary.totalAssigned}`, 40, currentY);
      doc.text(`Total Resolved: ${summary.totalResolved}`, 280, currentY); currentY += 22;

      addSectionTitle('Resolved Incidents per Engineer');
      autoTable(doc, {
        startY: currentY,
        head: [['Engineer', 'Resolved', 'Avg. Time', 'Reopen Rate']],
        body: (exportRows.length > 0
          ? exportRows
          : [{ engineer: 'N/A', resolved: 0, avgTime: '0.0h', reopenRate: '0.0%' }]
        ).map((row) => [row.engineer, row.resolved, row.avgTime, row.reopenRate]),
        styles: { fontSize: 10, cellPadding: 6 },
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });
      currentY = (doc as any).lastAutoTable.finalY + 18;

      addSectionTitle('Incident Trend (Created vs Resolved)');
      autoTable(doc, {
        startY: currentY,
        head: [['Bucket', 'Created', 'Resolved']],
        body: trend.labels.map((label, index) => [label, String(trend.created[index]), String(trend.resolved[index])]),
        styles: { fontSize: 10, cellPadding: 6 },
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });
    }

    doc.save(`nexumdesk-${activeTab}-${period}.pdf`);
  };

  if (loading) {
    return (
      <div className="bg-transparent">
        <Header user={user} title="Reports" subtitle="Team performance analytics" />
        <div className="mx-6 bg-white rounded-[4px] border border-neutral-200 p-6 text-neutral-600">Loading reports...</div>
      </div>
    );
  }

  return (
    <div className="bg-transparent">
      <Header user={user} title="Reports" subtitle="Team performance analytics - unique metrics vs Dashboard" />

      {error && (
        <div className="mx-6 mb-4 bg-danger-50 border border-danger-200 text-danger-700 px-4 py-3 rounded-[4px] text-sm">
          {error}
        </div>
      )}

      <div className="px-6 pb-6 pt-2 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3 bg-white border border-neutral-200 rounded-[4px] p-3">
          <div className="inline-flex p-1 bg-white border border-neutral-200 rounded-[4px] gap-1">
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option.key}
                onClick={() => setPeriod(option.key)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-[2px] transition-all focus:outline-none focus:ring-0 focus:ring-offset-0 ${
                  period === option.key
                    ? 'bg-gradient-to-r from-sky-500 to-sky-600 text-white shadow-sm shadow-sky-500/30'
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-sky-50'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {period === 'custom' && (
            <div className="flex items-end gap-2 flex-wrap">
              <label className="text-xs text-neutral-600">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  aria-label="Start date"
                  className="input-sm mt-1 min-w-[150px]"
                />
              </label>
              <label className="text-xs text-neutral-600">
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  aria-label="End date"
                  className="input-sm mt-1 min-w-[150px]"
                />
              </label>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button className="btn-action-reopen text-xs px-4 py-1.5" onClick={exportPdf}>Export PDF</button>
          </div>
        </div>

        <div className="bg-white border border-neutral-200 rounded-[4px] px-4 py-3">
          <div className="flex flex-wrap items-center gap-6">
            {REPORT_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`text-sm font-semibold transition-colors focus:outline-none focus:ring-0 focus:ring-offset-0 ${
                  activeTab === tab.key
                    ? 'text-blue-700'
                    : 'text-neutral-500 hover:text-neutral-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'sla-compliance' && (
          <>
            <div className="px-1">
              <h3 className="text-sm font-bold text-neutral-900">SLA Compliance Overview</h3>
              <p className="text-xs text-neutral-500 mt-1">All metrics below are filtered by selected range ({exportPeriodLabel}).</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <Card className="border-neutral-200">
                <p className="text-[11px] uppercase tracking-[0.08em] text-neutral-500 font-semibold">SLA Coverage</p>
                <p className="mt-2 text-3xl font-bold text-neutral-900">{slaAnalytics.incidentsWithSla}</p>
                <p className="mt-1 text-xs text-neutral-500">Incidents with SLA deadline</p>
              </Card>
              <Card className="border-neutral-200">
                <p className="text-[11px] uppercase tracking-[0.08em] text-neutral-500 font-semibold">On-Time Resolution</p>
                <p className="mt-2 text-3xl font-bold text-green-700">{slaAnalytics.onTimeRate.toFixed(1)}%</p>
                <p className="mt-1 text-xs text-neutral-500">{slaAnalytics.resolvedOnTime} of {slaAnalytics.resolvedWithSla} resolved</p>
              </Card>
              <Card className="border-neutral-200">
                <p className="text-[11px] uppercase tracking-[0.08em] text-neutral-500 font-semibold">SLA Breached</p>
                <p className="mt-2 text-3xl font-bold text-red-700">{slaAnalytics.breachedRate.toFixed(1)}%</p>
                <p className="mt-1 text-xs text-neutral-500">{slaAnalytics.resolvedBreached} resolved late</p>
              </Card>
            </div>

            <div className="px-1 pt-1">
              <h3 className="text-sm font-bold text-neutral-900">Response vs Resolution</h3>
              <p className="text-xs text-neutral-500 mt-1">Average actual performance against configured SLA targets.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="border-neutral-200">
                <p className="text-[11px] uppercase tracking-[0.08em] text-neutral-500 font-semibold">Average First Response</p>
                <p className="mt-2 text-3xl font-bold text-blue-700">{(slaAnalytics.avgResponseActualMinutes / 60).toFixed(1)}h</p>
                <p className="mt-1 text-xs text-neutral-500">Target average: {(slaAnalytics.avgResponseTargetMinutes / 60).toFixed(1)}h</p>
              </Card>
              <Card className="border-neutral-200">
                <p className="text-[11px] uppercase tracking-[0.08em] text-neutral-500 font-semibold">Average Resolution</p>
                <p className="mt-2 text-3xl font-bold text-violet-700">{(slaAnalytics.avgResolutionActualMinutes / 60).toFixed(1)}h</p>
                <p className="mt-1 text-xs text-neutral-500">Target average: {(slaAnalytics.avgResolutionTargetMinutes / 60).toFixed(1)}h</p>
              </Card>
            </div>

            <Card className="border-neutral-200">
              <h3 className="text-sm font-bold text-neutral-900">Average Actual Resolution by Category</h3>
              <p className="text-xs text-neutral-500 mt-1">Average time from creation to resolution for resolved incidents in each category.</p>
              <div className="mt-4 space-y-3">
                {slaAnalytics.byCategory.slice(0, 6).map((row) => {
                  const maxValue = Math.max(1, ...slaAnalytics.byCategory.map((item) => item.avgActualResolutionMinutes || 0));
                  const width = Math.round(((row.avgActualResolutionMinutes || 0) / maxValue) * 100);
                  return (
                    <div key={`avg-category-${row.label}`} className="flex items-center gap-3">
                      <p className="w-28 text-xs text-neutral-600 truncate">{row.label}</p>
                      <div className="flex-1 h-2.5 rounded-[2px] bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-[2px] bg-gradient-to-r from-violet-600 to-fuchsia-500" style={{ width: `${width}%` }} />
                      </div>
                      <p className="w-14 text-right text-xs font-semibold text-neutral-800">{((row.avgActualResolutionMinutes || 0) / 60).toFixed(1)}h</p>
                    </div>
                  );
                })}
                {slaAnalytics.byCategory.length === 0 && <p className="text-sm text-neutral-500">No category data available.</p>}
              </div>
            </Card>

            <div className="px-1 pt-1">
              <h3 className="text-sm font-bold text-neutral-900">Priority & Category Distribution</h3>
              <p className="text-xs text-neutral-500 mt-1">How incident volume is distributed in this range.</p>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <Card className="border-neutral-200 overflow-hidden" padding="none">
                <div className="px-5 py-4 border-b border-neutral-200">
                  <h3 className="text-sm font-bold text-neutral-900">SLA Compliance by Priority</h3>
                </div>
                <div className="overflow-x-auto overflow-y-auto max-h-[280px]">
                  <table className="w-full min-w-[540px] border-collapse">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="text-left px-5 py-3 text-[11px] uppercase tracking-[0.08em] text-neutral-400 font-semibold">Priority</th>
                        <th className="text-left px-5 py-3 text-[11px] uppercase tracking-[0.08em] text-neutral-400 font-semibold">Total</th>
                        <th className="text-left px-5 py-3 text-[11px] uppercase tracking-[0.08em] text-neutral-400 font-semibold">Resolved</th>
                        <th className="text-left px-5 py-3 text-[11px] uppercase tracking-[0.08em] text-neutral-400 font-semibold">On-Time</th>
                        <th className="text-left px-5 py-3 text-[11px] uppercase tracking-[0.08em] text-neutral-400 font-semibold">Compliance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {slaAnalytics.byPriority.map((row) => (
                        <tr key={`sla-priority-${row.label}`} className="border-t border-neutral-100">
                          <td className="px-5 py-3.5 text-sm font-semibold text-neutral-800">{row.label}</td>
                          <td className="px-5 py-3.5 text-sm text-neutral-700">{row.total}</td>
                          <td className="px-5 py-3.5 text-sm text-neutral-700">{row.resolved}</td>
                          <td className="px-5 py-3.5 text-sm text-green-700 font-semibold">{row.onTime}</td>
                          <td className="px-5 py-3.5 text-sm font-semibold text-blue-700">{row.onTimeRate.toFixed(1)}%</td>
                        </tr>
                      ))}
                      {slaAnalytics.byPriority.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-5 py-8 text-center text-sm text-neutral-500">No SLA priority data for selected period.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card className="border-neutral-200 overflow-hidden" padding="none">
                <div className="px-5 py-4 border-b border-neutral-200">
                  <h3 className="text-sm font-bold text-neutral-900">SLA Compliance by Category</h3>
                </div>
                <div className="overflow-x-auto overflow-y-auto max-h-[280px]">
                  <table className="w-full min-w-[540px] border-collapse">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="text-left px-5 py-3 text-[11px] uppercase tracking-[0.08em] text-neutral-400 font-semibold">Category</th>
                        <th className="text-left px-5 py-3 text-[11px] uppercase tracking-[0.08em] text-neutral-400 font-semibold">Total</th>
                        <th className="text-left px-5 py-3 text-[11px] uppercase tracking-[0.08em] text-neutral-400 font-semibold">Resolved</th>
                        <th className="text-left px-5 py-3 text-[11px] uppercase tracking-[0.08em] text-neutral-400 font-semibold">Breached</th>
                        <th className="text-left px-5 py-3 text-[11px] uppercase tracking-[0.08em] text-neutral-400 font-semibold">Compliance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {slaAnalytics.byCategory.map((row) => (
                        <tr key={`sla-category-${row.label}`} className="border-t border-neutral-100">
                          <td className="px-5 py-3.5 text-sm font-semibold text-neutral-800">{row.label}</td>
                          <td className="px-5 py-3.5 text-sm text-neutral-700">{row.total}</td>
                          <td className="px-5 py-3.5 text-sm text-neutral-700">{row.resolved}</td>
                          <td className="px-5 py-3.5 text-sm text-red-700 font-semibold">{row.breached}</td>
                          <td className="px-5 py-3.5 text-sm font-semibold text-blue-700">{row.onTimeRate.toFixed(1)}%</td>
                        </tr>
                      ))}
                      {slaAnalytics.byCategory.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-5 py-8 text-center text-sm text-neutral-500">No SLA category data for selected period.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </>
        )}

        {activeTab === 'team-performance' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Card className="relative overflow-hidden border-neutral-200">
            <div className="absolute inset-x-0 top-0 h-1 bg-blue-600" />
            <p className="text-[11px] uppercase tracking-[0.08em] text-neutral-500 font-semibold">Avg. Resolution Time</p>
            <p className="mt-2 text-4xl font-bold text-neutral-900">{summary.avgResolutionHours.toFixed(1)} <span className="text-base font-medium text-neutral-500">hrs</span></p>
            <p className={`mt-2 text-sm font-semibold ${summary.resolutionDelta <= 0 ? 'text-success-700' : 'text-danger-700'}`}>
              {summary.resolutionDelta <= 0 ? '↓' : '↑'} {Math.abs(summary.resolutionDelta).toFixed(1)}% vs previous period
            </p>
          </Card>

          <Card className="relative overflow-hidden border-neutral-200">
            <div className="absolute inset-x-0 top-0 h-1 bg-violet-600" />
            <p className="text-[11px] uppercase tracking-[0.08em] text-neutral-500 font-semibold">Team Workload Distribution</p>
            <p className="mt-2 text-4xl font-bold text-neutral-900">{summary.totalAssigned} <span className="text-base font-medium text-neutral-500">incidents</span></p>
            <p className={`mt-2 text-sm font-semibold ${summary.workloadDelta <= 0 ? 'text-success-700' : 'text-orange-700'}`}>
              {summary.workloadDelta <= 0 ? '↓' : '↑'} {Math.abs(summary.workloadDelta).toFixed(1)}% vs previous period
            </p>
            <div className="mt-3 pt-3 border-t border-neutral-100 text-xs text-neutral-600">
              Most active engineers: {engineerPerformance.slice(0, 2).map((e) => e.name.split(' ')[0]).join(', ') || '-'}
            </div>
          </Card>
        </div>
        )}

        {activeTab === 'team-performance' && (
        <div className="grid grid-cols-1 gap-4">
          <Card className="border-neutral-200">
            <h3 className="text-sm font-bold text-neutral-900">Resolved incidents per engineer</h3>
            <p className="text-xs text-neutral-500 mt-1">Last period - total resolved count</p>
            <div className="mt-4 space-y-3">
              {engineerPerformance.slice(0, 6).map((engineer) => {
                const width = Math.round((engineer.resolved / maxResolvedByEngineer) * 100);
                return (
                  <div key={engineer.id} className="flex items-center gap-3">
                    <p className="w-24 text-xs text-neutral-600 truncate">{engineer.name.split(' ')[0]}</p>
                    <div className="flex-1 h-2.5 rounded-[2px] bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-[2px] bg-gradient-to-r from-blue-600 to-sky-500" style={{ width: `${width}%` }} />
                    </div>
                    <p className="w-8 text-right text-xs font-semibold text-neutral-800">{engineer.resolved}</p>
                  </div>
                );
              })}
              {engineerPerformance.length === 0 && <p className="text-sm text-neutral-500">No engineer data available.</p>}
            </div>
          </Card>
        </div>
        )}

        {activeTab === 'team-performance' && (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          <Card className="xl:col-span-3 border-neutral-200">
            <h3 className="text-sm font-bold text-neutral-900">Incident trend</h3>
            <p className="text-xs text-neutral-500 mt-1">Created vs Resolved - recent daily trend</p>
            <div className="mt-4 h-40 relative">
              <svg viewBox="0 0 420 130" className="w-full h-full">
                {[20, 50, 80, 110].map((y) => (
                  <line key={y} x1="0" y1={y} x2="420" y2={y} stroke="#f1f5f9" strokeWidth="1" />
                ))}
                <polyline
                  points={trend.created.map((v, i) => `${(i * 420) / (trend.created.length - 1)},${110 - (v / maxTrendValue) * 85}`).join(' ')}
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                />
                <polyline
                  points={trend.resolved.map((v, i) => `${(i * 420) / (trend.resolved.length - 1)},${110 - (v / maxTrendValue) * 85}`).join(' ')}
                  fill="none"
                  stroke="#16a34a"
                  strokeWidth="2.5"
                  strokeDasharray="5 3"
                  strokeLinejoin="round"
                />
                {trend.labels.map((label, index) => (
                  <text
                    key={label}
                    x={(index * 420) / (trend.labels.length - 1)}
                    y="128"
                    fontSize="10"
                    fill="#94a3b8"
                    textAnchor="middle"
                  >
                    {label}
                  </text>
                ))}
              </svg>
            </div>
            <div className="mt-2 flex items-center gap-4 text-xs text-neutral-500">
              <span className="inline-flex items-center gap-2"><span className="w-4 h-0.5 bg-blue-600" /> Created</span>
              <span className="inline-flex items-center gap-2"><span className="w-4 border-t-2 border-dashed border-green-600" /> Resolved</span>
            </div>
          </Card>

          {activeTab === 'team-performance' && (
          <Card className="xl:col-span-2 border-neutral-200">
            <h3 className="text-sm font-bold text-neutral-900">Reopen rate per engineer</h3>
            <p className="text-xs text-neutral-500 mt-1">% of incidents reopened after resolved</p>
            <div className="mt-4 space-y-3">
              {engineerPerformance.slice(0, 6).map((engineer) => {
                const width = Math.min(100, Math.round(engineer.reopenRate * 5));
                const color = engineer.reopenRate <= 5 ? 'bg-green-600' : engineer.reopenRate <= 10 ? 'bg-orange-600' : 'bg-red-600';
                const textColor = engineer.reopenRate <= 5 ? 'text-green-700' : engineer.reopenRate <= 10 ? 'text-orange-700' : 'text-red-700';
                return (
                  <div key={`${engineer.id}-reopen`} className="flex items-center gap-3">
                    <p className="w-24 text-xs text-neutral-600 truncate">{engineer.name.split(' ')[0]}</p>
                    <div className="flex-1 h-2 rounded-[2px] bg-slate-100 overflow-hidden">
                      <div className={`h-full ${color}`} style={{ width: `${width}%` }} />
                    </div>
                    <p className={`w-12 text-right text-xs font-semibold ${textColor}`}>{engineer.reopenRate.toFixed(1)}%</p>
                  </div>
                );
              })}
              {engineerPerformance.length === 0 && <p className="text-sm text-neutral-500">No engineer data available.</p>}
            </div>
          </Card>
          )}
        </div>
        )}

        {activeTab === 'audit' && (
        <Card className="border-neutral-200">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-sm font-bold text-neutral-900">Reports for Manager - Override Analysis</h3>
              <p className="text-xs text-neutral-500 mt-1">Audit of manager/admin ISS edits and overrides for selected period</p>
            </div>

          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <div className="border border-neutral-200 rounded-[4px] p-4 bg-slate-50">
              <p className="text-[11px] uppercase tracking-[0.08em] text-neutral-500 font-semibold">Total Audit Changes</p>
              <p className="mt-2 text-3xl font-bold text-neutral-900">{overrideAnalysis.totalOverrides}</p>
            </div>
            <div className="border border-neutral-200 rounded-[4px] p-4 bg-slate-50">
              <p className="text-[11px] uppercase tracking-[0.08em] text-neutral-500 font-semibold">Priority Overrides</p>
              <p className="mt-2 text-3xl font-bold text-blue-700">{overrideAnalysis.priorityOverrideCount}</p>
            </div>
            <div className="border border-neutral-200 rounded-[4px] p-4 bg-slate-50">
              <p className="text-[11px] uppercase tracking-[0.08em] text-neutral-500 font-semibold">Severity Overrides</p>
              <p className="mt-2 text-3xl font-bold text-red-700">{overrideAnalysis.severityOverrideCount}</p>
            </div>
            <div className="border border-neutral-200 rounded-[4px] p-4 bg-slate-50">
              <p className="text-[11px] uppercase tracking-[0.08em] text-neutral-500 font-semibold">Classification Updates</p>
              <p className="mt-2 text-3xl font-bold text-cyan-700">{overrideAnalysis.classificationEditCount}</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="border border-neutral-200 rounded-[4px] p-4">
              <h4 className="text-sm font-bold text-neutral-900">Changes by Category</h4>
              <p className="text-xs text-neutral-500 mt-1">Category edits recorded in activity log</p>
              <div className="mt-4 max-h-[260px] overflow-y-auto space-y-3 pr-1">
                {overrideAnalysis.overridesByCategory.map((row) => {
                  const maxValue = Math.max(1, ...overrideAnalysis.overridesByCategory.map((item) => item.count));
                  const width = Math.round((row.count / maxValue) * 100);
                  return (
                    <div key={row.category} className="flex items-center gap-3">
                      <p className="w-28 text-xs text-neutral-600 truncate">{row.category}</p>
                      <div className="flex-1 h-2.5 rounded-[2px] bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-[2px] bg-gradient-to-r from-sky-600 to-blue-700" style={{ width: `${width}%` }} />
                      </div>
                      <p className="w-8 text-right text-xs font-semibold text-neutral-800">{row.count}</p>
                    </div>
                  );
                })}
                {overrideAnalysis.overridesByCategory.length === 0 && (
                  <p className="text-sm text-neutral-500">No category changes in selected period.</p>
                )}
              </div>
            </div>

            <div className="border border-neutral-200 rounded-[4px] p-4">
              <h4 className="text-sm font-bold text-neutral-900">Changes by Impact</h4>
              <p className="text-xs text-neutral-500 mt-1">Impact edits recorded in activity log</p>
              <div className="mt-4 flex items-center gap-6">
                <div className="relative w-32 h-32 rounded-full" style={{ background: overrideImpactBackground }}>
                  <div className="absolute inset-4 rounded-full bg-white border border-neutral-100 grid place-items-center text-center">
                    <p className="text-xl font-bold text-neutral-900 leading-none">
                      {overrideAnalysis.overridesByImpact.reduce((acc, item) => acc + item.count, 0)}
                    </p>
                    <p className="text-[10px] text-neutral-500 uppercase tracking-wide">total</p>
                  </div>
                </div>
                <div className="space-y-2 text-xs flex-1">
                  {overrideAnalysis.overridesByImpact.map((item, index) => {
                    const total = overrideAnalysis.overridesByImpact.reduce((acc, row) => acc + row.count, 0);
                    const pct = total ? Math.round((item.count / total) * 100) : 0;
                    return (
                      <div key={item.impact} className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-[2px]" style={{ backgroundColor: OVERRIDE_IMPACT_COLORS[index % OVERRIDE_IMPACT_COLORS.length] }} />
                        <span className="text-neutral-600 flex-1">{item.impact}</span>
                        <span className="font-semibold text-neutral-800">{item.count}</span>
                        <span className="text-neutral-400">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 border border-neutral-200 rounded-[4px] p-4">
            <h4 className="text-sm font-bold text-neutral-900">Priority Calculated vs Override</h4>
            <p className="text-xs text-neutral-500 mt-1">Trend-style comparison of priority before and after manager override</p>
            <div className="mt-4 h-40 relative">
              <svg viewBox="0 0 420 130" className="w-full h-full">
                {[20, 50, 80, 110].map((y) => (
                  <line key={y} x1="0" y1={y} x2="420" y2={y} stroke="#f1f5f9" strokeWidth="1" />
                ))}
                <polyline
                  points={overridePriorityComparison.calculated.map((v, i) => `${(i * 420) / (overridePriorityComparison.calculated.length - 1)},${110 - (v / overridePriorityComparison.maxValue) * 85}`).join(' ')}
                  fill="none"
                  stroke="#475569"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                />
                <polyline
                  points={overridePriorityComparison.overridden.map((v, i) => `${(i * 420) / (overridePriorityComparison.overridden.length - 1)},${110 - (v / overridePriorityComparison.maxValue) * 85}`).join(' ')}
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="2.5"
                  strokeDasharray="5 3"
                  strokeLinejoin="round"
                />
                {overridePriorityComparison.labels.map((label, index) => (
                  <text
                    key={label}
                    x={(index * 420) / (overridePriorityComparison.labels.length - 1)}
                    y="128"
                    fontSize="10"
                    fill="#94a3b8"
                    textAnchor="middle"
                  >
                    {label}
                  </text>
                ))}
              </svg>
            </div>
            <div className="mt-2 flex items-center gap-4 text-xs text-neutral-500">
              <span className="inline-flex items-center gap-2"><span className="w-4 h-0.5 bg-slate-600" /> Calculated</span>
              <span className="inline-flex items-center gap-2"><span className="w-4 border-t-2 border-dashed border-blue-600" /> Override</span>
            </div>
          </div>
        </Card>
        )}

        {activeTab === 'audit' && (
        <Card className="border-neutral-200 overflow-hidden" padding="none">
          <div className="px-5 py-4 border-b border-neutral-200">
            <h3 className="text-sm font-bold text-neutral-900">Classification Change Analysis</h3>
          </div>
          <div className="overflow-x-auto overflow-y-auto max-h-[360px] scrollbar-sidebar">
            <table className="w-full min-w-[860px] border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left px-5 py-3 text-[11px] uppercase tracking-[0.08em] text-neutral-400 font-semibold">Incident</th>
                  <th className="text-left px-5 py-3 text-[11px] uppercase tracking-[0.08em] text-neutral-400 font-semibold">Field</th>
                  <th className="text-left px-5 py-3 text-[11px] uppercase tracking-[0.08em] text-neutral-400 font-semibold">Type</th>
                  <th className="text-left px-5 py-3 text-[11px] uppercase tracking-[0.08em] text-neutral-400 font-semibold">Original</th>
                  <th className="text-left px-5 py-3 text-[11px] uppercase tracking-[0.08em] text-neutral-400 font-semibold">New</th>
                  <th className="text-left px-5 py-3 text-[11px] uppercase tracking-[0.08em] text-neutral-400 font-semibold">Changed By</th>
                </tr>
              </thead>
              <tbody>
                {overrideAnalysis.classificationRows.map((row) => (
                  <tr
                    key={`${row.field}-${row.incidentId}-${row.changedAt}`}
                    className="border-t border-neutral-100 hover:bg-slate-50/70 cursor-pointer"
                    onClick={() => openIncidentDetails(row.incidentId)}
                  >
                    <td className="px-5 py-3.5 text-sm font-semibold text-neutral-800 hover:text-blue-700">
                      <div>
                        <span className="font-semibold text-blue-700">ID {generateNDI(row.incidentId)}</span>
                        <p className="text-xs text-neutral-500 mt-0.5 font-normal">{row.title}</p>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-neutral-700 capitalize">{row.field}</td>
                    <td className="px-5 py-3.5 text-sm text-neutral-700 capitalize">{row.changeType}</td>
                    <td className="px-5 py-3.5 text-sm text-neutral-700">{row.original}</td>
                    <td className="px-5 py-3.5 text-sm font-semibold text-cyan-700">{row.next}</td>
                    <td className="px-5 py-3.5 text-sm text-neutral-700">{row.changedBy}</td>
                  </tr>
                ))}
                {overrideAnalysis.classificationRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-sm text-neutral-500">
                      No category, urgency, or impact changes for selected period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
        )}

        {activeTab === 'audit' && (
        <Card className="border-neutral-200 overflow-hidden" padding="none">
          <div className="px-5 py-4 border-b border-neutral-200">
            <h3 className="text-sm font-bold text-neutral-900">Priority Change Analysis</h3>
          </div>
          <div className="overflow-x-auto overflow-y-auto max-h-[360px] scrollbar-sidebar">
            <table className="w-full min-w-[980px] border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left px-5 py-3 text-[11px] uppercase tracking-[0.08em] text-neutral-400 font-semibold">Incident</th>
                  <th className="text-left px-5 py-3 text-[11px] uppercase tracking-[0.08em] text-neutral-400 font-semibold">Type</th>
                  <th className="text-left px-5 py-3 text-[11px] uppercase tracking-[0.08em] text-neutral-400 font-semibold">Original Priority</th>
                  <th className="text-left px-5 py-3 text-[11px] uppercase tracking-[0.08em] text-neutral-400 font-semibold">Original ISS Score</th>
                  <th className="text-left px-5 py-3 text-[11px] uppercase tracking-[0.08em] text-neutral-400 font-semibold">New Priority</th>
                  <th className="text-left px-5 py-3 text-[11px] uppercase tracking-[0.08em] text-neutral-400 font-semibold">New ISS Score</th>
                  <th className="text-left px-5 py-3 text-[11px] uppercase tracking-[0.08em] text-neutral-400 font-semibold">Changed By</th>
                </tr>
              </thead>
              <tbody>
                {overrideAnalysis.priorityRows.map((row) => (
                  <tr
                    key={`prio-${row.incidentId}`}
                    className="border-t border-neutral-100 hover:bg-slate-50/70 cursor-pointer"
                    onClick={() => openIncidentDetails(row.incidentId)}
                  >
                    <td className="px-5 py-3.5 text-sm font-semibold text-neutral-800 hover:text-blue-700">
                      <div>
                        <span className="font-semibold text-blue-700">ID {generateNDI(row.incidentId)}</span>
                        <p className="text-xs text-neutral-500 mt-0.5 font-normal">{row.title}</p>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-neutral-700 capitalize">{row.changeType || 'override'}</td>
                    <td className="px-5 py-3.5 text-sm text-neutral-700">{row.original}</td>
                    <td className="px-5 py-3.5 text-sm text-neutral-700">{priorityToIssScore(row.original).toFixed(1)}</td>
                    <td className="px-5 py-3.5 text-sm font-semibold text-blue-700">{row.next}</td>
                    <td className="px-5 py-3.5 text-sm font-semibold text-blue-700">{priorityToIssScore(row.next).toFixed(1)}</td>
                    <td className="px-5 py-3.5 text-sm text-neutral-700">{row.changedBy}</td>
                  </tr>
                ))}
                {overrideAnalysis.priorityRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-sm text-neutral-500">
                      No priority edits or overrides for selected period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
        )}

        {activeTab === 'audit' && (
        <Card className="border-neutral-200 overflow-hidden" padding="none">
          <div className="px-5 py-4 border-b border-neutral-200">
            <h3 className="text-sm font-bold text-neutral-900">Severity Change Analysis</h3>
          </div>
          <div className="overflow-x-auto overflow-y-auto max-h-[360px] scrollbar-sidebar">
            <table className="w-full min-w-[980px] border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left px-5 py-3 text-[11px] uppercase tracking-[0.08em] text-neutral-400 font-semibold">Incident</th>
                  <th className="text-left px-5 py-3 text-[11px] uppercase tracking-[0.08em] text-neutral-400 font-semibold">Type</th>
                  <th className="text-left px-5 py-3 text-[11px] uppercase tracking-[0.08em] text-neutral-400 font-semibold">Original Severity</th>
                  <th className="text-left px-5 py-3 text-[11px] uppercase tracking-[0.08em] text-neutral-400 font-semibold">Original TSS Score</th>
                  <th className="text-left px-5 py-3 text-[11px] uppercase tracking-[0.08em] text-neutral-400 font-semibold">New Severity</th>
                  <th className="text-left px-5 py-3 text-[11px] uppercase tracking-[0.08em] text-neutral-400 font-semibold">New TSS Score</th>
                  <th className="text-left px-5 py-3 text-[11px] uppercase tracking-[0.08em] text-neutral-400 font-semibold">Changed By</th>
                </tr>
              </thead>
              <tbody>
                {overrideAnalysis.severityRows.map((row) => (
                  <tr
                    key={`sev-${row.incidentId}`}
                    className="border-t border-neutral-100 hover:bg-slate-50/70 cursor-pointer"
                    onClick={() => openIncidentDetails(row.incidentId)}
                  >
                    <td className="px-5 py-3.5 text-sm font-semibold text-neutral-800 hover:text-blue-700">
                      <div>
                        <span className="font-semibold text-blue-700">ID {generateNDI(row.incidentId)}</span>
                        <p className="text-xs text-neutral-500 mt-0.5 font-normal">{row.title}</p>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-neutral-700 capitalize">{row.changeType || 'override'}</td>
                    <td className="px-5 py-3.5 text-sm text-neutral-700">{row.original}</td>
                    <td className="px-5 py-3.5 text-sm text-neutral-700">{severityToTssScore(row.original).toFixed(1)}</td>
                    <td className="px-5 py-3.5 text-sm font-semibold text-red-700">{row.next}</td>
                    <td className="px-5 py-3.5 text-sm font-semibold text-red-700">{severityToTssScore(row.next).toFixed(1)}</td>
                    <td className="px-5 py-3.5 text-sm text-neutral-700">{row.changedBy}</td>
                  </tr>
                ))}
                {overrideAnalysis.severityRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-sm text-neutral-500">
                      No severity edits or overrides for selected period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
        )}

        {activeTab === 'audit' && (
        <Card className="border-neutral-200 overflow-hidden" padding="none">
          <div className="px-5 py-4 border-b border-neutral-200">
            <h3 className="text-sm font-bold text-neutral-900">Override Justification</h3>
          </div>
          <div className="overflow-x-auto overflow-y-auto max-h-[360px] scrollbar-sidebar">
            <table className="w-full min-w-[680px] border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left px-5 py-3 text-[11px] uppercase tracking-[0.08em] text-neutral-400 font-semibold">Incident</th>
                  <th className="text-left px-5 py-3 text-[11px] uppercase tracking-[0.08em] text-neutral-400 font-semibold">Reason</th>
                </tr>
              </thead>
              <tbody>
                {overrideAnalysis.reasonRows.map((row) => (
                  <tr
                    key={`reason-${row.incidentId}`}
                    className="border-t border-neutral-100 hover:bg-slate-50/70 cursor-pointer"
                    onClick={() => openIncidentDetails(row.incidentId)}
                  >
                    <td className="px-5 py-3.5 text-sm font-semibold text-neutral-800 align-top hover:text-blue-700">
                      <div>
                        <span className="font-semibold text-blue-700">ID {generateNDI(row.incidentId)}</span>
                        <p className="text-xs text-neutral-500 mt-0.5 font-normal">{row.title}</p>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-neutral-700">{row.reason}</td>
                  </tr>
                ))}
                {overrideAnalysis.reasonRows.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-5 py-8 text-center text-sm text-neutral-500">
                      No override justifications recorded in selected period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
        )}

        {activeTab === 'team-performance' && (
        <Card className="border-neutral-200 overflow-hidden" padding="none">
          <div className="px-5 py-4 border-b border-neutral-200">
            <h3 className="text-sm font-bold text-neutral-900">Detailed performance per engineer</h3>
          </div>
          <div className="overflow-x-auto overflow-y-auto max-h-[360px] scrollbar-sidebar">
            <table className="w-full min-w-[680px] border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left px-5 py-3 text-[11px] uppercase tracking-[0.08em] text-neutral-400 font-semibold">Engineer</th>
                  <th className="text-left px-5 py-3 text-[11px] uppercase tracking-[0.08em] text-neutral-400 font-semibold">Resolved</th>
                  <th className="text-left px-5 py-3 text-[11px] uppercase tracking-[0.08em] text-neutral-400 font-semibold">Avg. Time</th>
                  <th className="text-left px-5 py-3 text-[11px] uppercase tracking-[0.08em] text-neutral-400 font-semibold">Reopen Rate</th>
                </tr>
              </thead>
              <tbody>
                {engineerPerformance.map((engineer) => {
                  const badgeClass = engineer.reopenRate <= 5
                    ? 'bg-green-50 text-green-700'
                    : engineer.reopenRate <= 10
                    ? 'bg-orange-50 text-orange-700'
                    : 'bg-red-50 text-red-700';
                  const avgClass = engineer.avgResolutionHours <= 3
                    ? 'text-green-700'
                    : engineer.avgResolutionHours <= 4.5
                    ? 'text-orange-700'
                    : 'text-red-700';
                  return (
                    <tr key={`${engineer.id}-row`} className="border-t border-neutral-100 hover:bg-slate-50/70">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-blue-600 text-white text-[10px] font-bold grid place-items-center">
                            {getInitials(engineer.name)}
                          </div>
                          <span className="font-semibold text-neutral-800 text-sm">{engineer.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-sm font-semibold text-neutral-800">{engineer.resolved}</td>
                      <td className={`px-5 py-3.5 text-sm font-semibold ${avgClass}`}>{engineer.avgResolutionHours.toFixed(1)}h</td>
                      <td className="px-5 py-3.5 text-sm">
                        <span className={`px-2 py-1 rounded-[2px] font-semibold text-xs ${badgeClass}`}>
                          {engineer.reopenRate.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {engineerPerformance.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-sm text-neutral-500">
                      No engineer performance data for selected period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
        )}
      </div>
    </div>
  );
}
