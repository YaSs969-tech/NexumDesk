import { describe, expect, it } from 'vitest';
import { calculateTSS, getImpactBoost, tssToSeverity } from './tssCalculator';

describe('tssCalculator utilities', () => {
  // ------------------------------------------------------------------ //
  // getImpactBoost
  // ------------------------------------------------------------------ //
  describe('getImpactBoost', () => {
    it('returns 0 for SINGLE_USER by default', () => {
      expect(getImpactBoost('SINGLE_USER')).toBe(0);
    });

    it('returns 0.5 for DEPARTMENT by default', () => {
      expect(getImpactBoost('DEPARTMENT')).toBe(0.5);
    });

    it('returns 1 for ORGANIZATION by default', () => {
      expect(getImpactBoost('ORGANIZATION')).toBe(1);
    });

    it('returns 0 for unknown / empty impact', () => {
      expect(getImpactBoost('UNKNOWN')).toBe(0);
      expect(getImpactBoost('')).toBe(0);
    });

    it('respects custom boost values for each scope', () => {
      expect(getImpactBoost('SINGLE_USER', { singleUser: 0.25 })).toBe(0.25);
      expect(getImpactBoost('DEPARTMENT', { department: 0.8 })).toBe(0.8);
      expect(getImpactBoost('ORGANIZATION', { organization: 1.5 })).toBe(1.5);
    });

    it('is case-insensitive', () => {
      expect(getImpactBoost('organization')).toBe(1);
      expect(getImpactBoost('Department')).toBe(0.5);
      expect(getImpactBoost('single_user')).toBe(0);
    });

    it('uses default when partial custom boosts are provided', () => {
      // Only department overridden; organization should still be default 1
      expect(getImpactBoost('ORGANIZATION', { department: 0.8 })).toBe(1);
    });
  });

  // ------------------------------------------------------------------ //
  // calculateTSS
  // ------------------------------------------------------------------ //
  describe('calculateTSS', () => {
    it('returns raw risk when impactAffects is false', () => {
      expect(calculateTSS('ORGANIZATION', { risk: 3, impactAffects: false })).toBe(3);
      expect(calculateTSS('SINGLE_USER', { risk: 5, impactAffects: false })).toBe(5);
    });

    it('adds ORGANIZATION boost (+1) when impactAffects is true', () => {
      expect(calculateTSS('ORGANIZATION', { risk: 3, impactAffects: true })).toBe(4);
    });

    it('adds DEPARTMENT boost (+0.5) when impactAffects is true', () => {
      expect(calculateTSS('DEPARTMENT', { risk: 3, impactAffects: true })).toBe(3.5);
    });

    it('adds no boost for SINGLE_USER', () => {
      expect(calculateTSS('SINGLE_USER', { risk: 3, impactAffects: true })).toBe(3);
    });

    it('caps score at 5 when boost would exceed it', () => {
      expect(calculateTSS('ORGANIZATION', { risk: 5, impactAffects: true })).toBe(5);
      expect(calculateTSS('DEPARTMENT', { risk: 5, impactAffects: true })).toBe(5);
    });

    it('clamps risk to minimum of 1 when zero is supplied', () => {
      expect(calculateTSS('SINGLE_USER', { risk: 0, impactAffects: false })).toBe(1);
    });

    it('clamps risk to minimum of 1 when negative is supplied', () => {
      expect(calculateTSS('SINGLE_USER', { risk: -10, impactAffects: false })).toBe(1);
    });

    it('clamps risk to maximum of 5 when excessive value is supplied', () => {
      expect(calculateTSS('SINGLE_USER', { risk: 99, impactAffects: false })).toBe(5);
    });

    it('rounds result to at most 2 decimal places', () => {
      const result = calculateTSS('DEPARTMENT', { risk: 2, impactAffects: true });
      const decimals = result.toString().split('.')[1]?.length ?? 0;
      expect(decimals).toBeLessThanOrEqual(2);
    });

    it('accepts custom impact boosts', () => {
      // risk=2, impactAffects=true, ORGANIZATION with custom boost 0.3 -> 2.3
      expect(
        calculateTSS('ORGANIZATION', { risk: 2, impactAffects: true }, { organization: 0.3 })
      ).toBe(2.3);
    });
  });

  // ------------------------------------------------------------------ //
  // tssToSeverity
  // ------------------------------------------------------------------ //
  describe('tssToSeverity', () => {
    it('maps max score 5 to CRITICAL with defaults', () => {
      expect(tssToSeverity(5)).toBe('CRITICAL');
    });

    it('maps score 4 to HIGH with defaults', () => {
      expect(tssToSeverity(4)).toBe('HIGH');
    });

    it('maps score 3 to MEDIUM with defaults', () => {
      expect(tssToSeverity(3)).toBe('MEDIUM');
    });

    it('maps score below 3 to LOW with defaults', () => {
      expect(tssToSeverity(1)).toBe('LOW');
      expect(tssToSeverity(2.9)).toBe('LOW');
    });

    it('respects custom sev1 threshold', () => {
      expect(tssToSeverity(4.5, { sev1: 4.5 })).toBe('CRITICAL');
      expect(tssToSeverity(4.4, { sev1: 4.5 })).toBe('HIGH');
    });

    it('respects full custom threshold set', () => {
      const thresholds = { sev1: 4, sev2: 3, sev3: 2 };
      expect(tssToSeverity(4, thresholds)).toBe('CRITICAL');
      expect(tssToSeverity(3, thresholds)).toBe('HIGH');
      expect(tssToSeverity(2, thresholds)).toBe('MEDIUM');
      expect(tssToSeverity(1.5, thresholds)).toBe('LOW');
    });

    it('does not throw for NaN or out-of-range threshold values', () => {
      expect(() => tssToSeverity(3, { sev1: NaN })).not.toThrow();
      expect(() => tssToSeverity(3, { sev2: 0 })).not.toThrow();
    });

    it('threshold sev2 is clamped to not exceed sev1', () => {
      // Providing sev2 > sev1; normalizeTssThresholds enforces sev2 <= sev1
      // So tss=4.5 should still be CRITICAL
      expect(tssToSeverity(4.5, { sev1: 5, sev2: 10 })).toBe('CRITICAL');
    });
  });
});
