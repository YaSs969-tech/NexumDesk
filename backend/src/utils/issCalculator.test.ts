import { describe, expect, it } from 'vitest';
import {
  calculateISS,
  calculateIncidentMetrics,
  calculateSLADeadline,
  calculateSLARemaining,
  canOverride,
  getCategoryRisk,
  getImpactValue,
  getUrgencyValue,
  issToSeverity,
  priorityToSLAHours,
  severityToPriority,
  validateOverrideReason,
} from './issCalculator';

describe('issCalculator utilities', () => {
  it('maps urgency, impact and category values with sane defaults', () => {
    expect(getUrgencyValue('critical')).toBe(4);
    expect(getUrgencyValue('unknown')).toBe(2);

    expect(getImpactValue('organization')).toBe(5);
    expect(getImpactValue('unknown')).toBe(1);

    expect(getCategoryRisk('security')).toBe(5);
    expect(getCategoryRisk('custom', 7)).toBe(7);
    expect(getCategoryRisk('unknown')).toBe(2);
  });

  it('calculates ISS and maps severity/priority/SLA', () => {
    const iss = calculateISS('HIGH', 'DEPARTMENT', 'NETWORK');
    expect(iss).toBe(3.2);
    expect(issToSeverity(iss)).toBe('HIGH');
    expect(severityToPriority('HIGH')).toBe('P2');
    expect(priorityToSLAHours('P2')).toBe(8);
  });

  it('supports custom weights and thresholds', () => {
    const iss = calculateISS('CRITICAL', 'ORGANIZATION', 'SECURITY', undefined, {
      urgencyWeight: 0.5,
      impactWeight: 0.3,
      categoryWeight: 0.2,
    });

    expect(iss).toBe(4.5);
    expect(issToSeverity(3.2, { p1: 4.2, p2: 3.1, p3: 2.2 })).toBe('HIGH');
  });

  it('calculates SLA deadline in 24/7 mode from given date', () => {
    const base = new Date('2026-03-06T08:00:00.000Z');
    const deadline = new Date(calculateSLADeadline('P1', base, false));
    expect(deadline.toISOString()).toBe('2026-03-06T12:00:00.000Z');
  });

  it('calculates SLA remaining state and flags near-expiry', () => {
    const now = Date.now();
    const deadline = new Date(now + 2 * 60 * 60 * 1000).toISOString();
    const remaining = calculateSLARemaining(deadline, 'P1');

    expect(remaining.isExpired).toBe(false);
    expect(remaining.hoursRemaining).toBeGreaterThanOrEqual(1);
    expect(remaining.percentConsumed).toBeGreaterThan(0);
  });

  it('computes all incident metrics in one call', () => {
    const result = calculateIncidentMetrics('HIGH', 'NETWORK', 'ORGANIZATION');

    expect(result.impact).toBe('ORGANIZATION');
    expect(result.calculatedSeverity).toMatch(/LOW|MEDIUM|HIGH|CRITICAL/);
    expect(result.calculatedPriority).toMatch(/P1|P2|P3|P4/);
    expect(result.slaHours).toBeGreaterThan(0);
  });

  it('validates override permissions and reasons', () => {
    expect(canOverride('manager')).toBe(true);
    expect(canOverride('user')).toBe(false);

    expect(validateOverrideReason('too short')).toBe(false);
    expect(validateOverrideReason('Business impact requires explicit override')).toBe(true);
  });
});
