import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatDurationMinutes,
  formatPriorityLabel,
  formatSeverityLabel,
  getPrioritySource,
  getSeveritySource,
  isActiveStatus,
  isResolvedStatus,
  normalizeStatus,
  formatTime,
  generateNDI,
  isNewIncident,
  normalizePriorityLevel,
  normalizeSeverityLevel,
} from './format';

describe('format utilities', () => {
  it('formats duration correctly across minute/hour/day ranges', () => {
    expect(formatDurationMinutes(undefined)).toBe('-');
    expect(formatDurationMinutes(30)).toBe('30m');
    expect(formatDurationMinutes(90)).toBe('1h 30m');
    expect(formatDurationMinutes(24 * 60 + 61)).toBe('1d 1h 1m');
    expect(formatDurationMinutes(-5)).toBe('0m');
  });

  it('formats date and time strings for RO locale', () => {
    const iso = '2026-03-06T10:15:00.000Z';

    expect(formatDate(iso)).toMatch(/\d{2}\.\d{2}\.\d{4}/);
    expect(formatDateTime(iso)).toContain('06.03.2026');
    expect(formatTime(iso)).toMatch(/\d{2}:\d{2}/);
  });

  it('generates stable NDI for the same uuid', () => {
    const first = generateNDI('a-uuid');
    const second = generateNDI('a-uuid');
    const third = generateNDI('b-uuid');

    expect(first).toBe(second);
    expect(Number(third)).toBeGreaterThanOrEqual(Number(first));
  });

  it('detects newly created incidents within 24 hours', () => {
    const recent = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    expect(isNewIncident(recent)).toBe(true);
    expect(isNewIncident(old)).toBe(false);
  });

  it('normalizes severity and priority from textual or numeric-like inputs', () => {
    expect(normalizeSeverityLevel('SEV-1')).toBe(1);
    expect(normalizeSeverityLevel('high')).toBe(2);
    expect(normalizeSeverityLevel(null)).toBe(3);

    expect(normalizePriorityLevel('P4')).toBe(4);
    expect(normalizePriorityLevel('critical')).toBe(1);
    expect(normalizePriorityLevel(undefined)).toBe(3);
  });

  it('formats labels from normalized levels', () => {
    expect(formatSeverityLabel('LOW')).toBe('SEV4');
    expect(formatPriorityLabel('P2')).toBe('HIGH');
    expect(formatPriorityLabel('unknown')).toBe('MEDIUM');
  });

  it('normalizes and classifies incident statuses', () => {
    expect(normalizeStatus(' in progress ')).toBe('IN_PROGRESS');
    expect(isActiveStatus('pending')).toBe(true);
    expect(isActiveStatus('resolved')).toBe(false);
    expect(isResolvedStatus(' resolved ')).toBe(true);
  });

  it('derives priority and severity from incident fallbacks', () => {
    expect(
      getPrioritySource({
        priority: null,
        calculated_priority: 'P2',
        urgency: 'HIGH',
      })
    ).toBe('P2');

    expect(
      getPrioritySource({
        priority: undefined,
        calculated_priority: undefined,
        urgency: 'CRITICAL',
      })
    ).toBe('CRITICAL');

    expect(
      getSeveritySource({
        severity: null,
        calculated_severity: 'HIGH',
      })
    ).toBe('HIGH');

    expect(
      getSeveritySource({
        severity: undefined,
        calculated_severity: undefined,
      })
    ).toBe('SEV-3');
  });
});
