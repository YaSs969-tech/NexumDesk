import { useEffect, useState } from 'react';

const READ_INCIDENTS_PREFIX = 'nexum_read_incidents_';

function emitReadIncidentsUpdated() {
  window.dispatchEvent(new Event('nexum-read-incidents-updated'));
}

function buildStorageKey(userId?: string | null): string {
  return `${READ_INCIDENTS_PREFIX}${userId || 'anonymous'}`;
}

function loadReadIncidents(storageKey: string): Set<string> {
  try {
    const stored = localStorage.getItem(storageKey);
    return new Set<string>(stored ? JSON.parse(stored) : []);
  } catch {
    return new Set<string>();
  }
}

function persistReadIncidents(storageKey: string, incidents: Set<string>) {
  localStorage.setItem(storageKey, JSON.stringify(Array.from(incidents)));
  emitReadIncidentsUpdated();
}

export function markIncidentAsRead(userId: string | null | undefined, incidentId: string): Set<string> {
  const storageKey = buildStorageKey(userId);
  const incidents = loadReadIncidents(storageKey);
  incidents.add(incidentId);
  persistReadIncidents(storageKey, incidents);
  return incidents;
}

export function useReadIncidents(userId?: string | null) {
  const storageKey = buildStorageKey(userId);
  const [readIncidents, setReadIncidents] = useState<Set<string>>(new Set());

  useEffect(() => {
    setReadIncidents(loadReadIncidents(storageKey));
  }, [storageKey]);

  const markAsRead = (incidentId: string) => {
    setReadIncidents((prev) => {
      if (prev.has(incidentId)) {
        return prev;
      }

      const updated = new Set(prev);
      updated.add(incidentId);
      persistReadIncidents(storageKey, updated);
      return updated;
    });
  };

  const isUnreadIncident = (incident: { id: string }) => !readIncidents.has(incident.id);

  return {
    readIncidents,
    markAsRead,
    isUnreadIncident,
  };
}