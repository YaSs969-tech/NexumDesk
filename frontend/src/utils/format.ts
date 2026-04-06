// Format date with dots (DD.MM.YYYY)
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

// Format date with time (DD.MM.YYYY HH:MM)
export function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Format time only (HH:MM)
export function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('ro-RO', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Format duration in minutes to m / h m / d h m
export function formatDurationMinutes(minutes: number | undefined | null): string {
  if (minutes === undefined || minutes === null) return '-';

  const totalMinutes = Math.max(0, Math.floor(minutes));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const mins = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${mins}m`;
  }

  if (totalMinutes >= 60) {
    return `${hours}h ${mins}m`;
  }

  return `${totalMinutes}m`;
}

// Generate incident ID from UUID (just numbers starting from 1)
let incidentCounter = 1;
const incidentMap = new Map<string, number>();

export function generateNDI(uuid: string): string {
  if (incidentMap.has(uuid)) {
    return incidentMap.get(uuid)!.toString();
  }
  const ndi = incidentCounter++;
  incidentMap.set(uuid, ndi);
  return ndi.toString();
}

// Check if incident is new (within last 24 hours)
export function isNewIncident(dateStr: string): boolean {
  const date = new Date(dateStr);
  const now = new Date();
  const diffHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
  return diffHours < 24;
}

function extractMappedLevel(value?: string | null): number | null {
  if (!value) return null;

  const normalized = value.trim().toUpperCase();
  const digitMatch = normalized.match(/(1|2|3|4)/);
  if (digitMatch) {
    return Number(digitMatch[1]);
  }

  const semanticMap: Record<string, number> = {
    CRITICAL: 1,
    HIGH: 2,
    MEDIUM: 3,
    LOW: 4,
  };

  return semanticMap[normalized] ?? null;
}

export function normalizeSeverityLevel(severity?: string | null): number {
  return extractMappedLevel(severity) ?? 3;
}

export function normalizePriorityLevel(priority?: string | null): number {
  return extractMappedLevel(priority) ?? 3;
}

export function formatSeverityLabel(severity?: string | null): string {
  return `SEV${normalizeSeverityLevel(severity)}`;
}

export function formatPriorityLabel(priority?: string | null): string {
  const level = normalizePriorityLevel(priority);
  const labels: Record<number, string> = {
    1: 'CRITICAL',
    2: 'HIGH',
    3: 'MEDIUM',
    4: 'LOW'
  };
  return labels[level] || 'MEDIUM';
}

export function normalizeStatus(status?: string | null): string {
  return String(status || '').trim().toUpperCase().replace(/\s+/g, '_');
}

export function isActiveStatus(status?: string | null): boolean {
  return ['OPEN', 'IN_PROGRESS', 'PENDING', 'REOPENED'].includes(normalizeStatus(status));
}

export function isResolvedStatus(status?: string | null): boolean {
  return normalizeStatus(status) === 'RESOLVED';
}

export function getPrioritySource<T extends {
  priority?: string | null;
  calculated_priority?: string | null;
  urgency?: string | null;
}>(incident: T): string {
  return incident.priority || incident.calculated_priority || incident.urgency || 'MEDIUM';
}

export function getSeveritySource<T extends {
  severity?: string | null;
  calculated_severity?: string | null;
}>(incident: T): string {
  return incident.severity || incident.calculated_severity || 'SEV-3';
}
