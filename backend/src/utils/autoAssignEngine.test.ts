import { describe, expect, it } from 'vitest';
import { resolvePointsLimit, SEV_POINTS } from './autoAssignEngine';
import type { AutoAssignSettings } from './autoAssignEngine';

const DEFAULT_SETTINGS: AutoAssignSettings = {
  enabled: true,
  tierEnabled: { JUNIOR: true, MID: true, SENIOR: true },
  tierLimits: { JUNIOR: 100, MID: 160, SENIOR: 240 },
};

describe('autoAssignEngine pure utilities', () => {
  // ------------------------------------------------------------------ //
  // SEV_POINTS constant
  // ------------------------------------------------------------------ //
  describe('SEV_POINTS', () => {
    it('defines the four expected severity keys', () => {
      expect('SEV-1' in SEV_POINTS).toBe(true);
      expect('SEV-2' in SEV_POINTS).toBe(true);
      expect('SEV-3' in SEV_POINTS).toBe(true);
      expect('SEV-4' in SEV_POINTS).toBe(true);
    });

    it('higher severity costs more points', () => {
      expect(SEV_POINTS['SEV-1']).toBeGreaterThan(SEV_POINTS['SEV-2']);
      expect(SEV_POINTS['SEV-2']).toBeGreaterThan(SEV_POINTS['SEV-3']);
      expect(SEV_POINTS['SEV-3']).toBeGreaterThan(SEV_POINTS['SEV-4']);
    });

    it('all default point values are positive integers', () => {
      for (const sev of ['SEV-1', 'SEV-2', 'SEV-3', 'SEV-4']) {
        const pts = SEV_POINTS[sev];
        expect(pts).toBeGreaterThan(0);
        expect(Number.isInteger(pts)).toBe(true);
      }
    });

    it('has correct default values', () => {
      expect(SEV_POINTS['SEV-1']).toBe(60);
      expect(SEV_POINTS['SEV-2']).toBe(35);
      expect(SEV_POINTS['SEV-3']).toBe(20);
      expect(SEV_POINTS['SEV-4']).toBe(10);
    });
  });

  // ------------------------------------------------------------------ //
  // resolvePointsLimit
  // ------------------------------------------------------------------ //
  describe('resolvePointsLimit', () => {
    it('returns the stored points_limit when it is a positive number', () => {
      expect(resolvePointsLimit({ tier: 'JUNIOR', points_limit: 120 }, DEFAULT_SETTINGS)).toBe(120);
      expect(resolvePointsLimit({ tier: 'SENIOR', points_limit: 999 }, DEFAULT_SETTINGS)).toBe(999);
    });

    it('falls back to JUNIOR tier limit when stored limit is 0', () => {
      expect(resolvePointsLimit({ tier: 'JUNIOR', points_limit: 0 }, DEFAULT_SETTINGS)).toBe(100);
    });

    it('falls back to MID tier limit when stored limit is 0', () => {
      expect(resolvePointsLimit({ tier: 'MID', points_limit: 0 }, DEFAULT_SETTINGS)).toBe(160);
    });

    it('falls back to SENIOR tier limit when stored limit is 0', () => {
      expect(resolvePointsLimit({ tier: 'SENIOR', points_limit: 0 }, DEFAULT_SETTINGS)).toBe(240);
    });

    it('falls back to tier limit when points_limit is absent', () => {
      expect(resolvePointsLimit({ tier: 'SENIOR' }, DEFAULT_SETTINGS)).toBe(240);
      expect(resolvePointsLimit({ tier: 'MID' }, DEFAULT_SETTINGS)).toBe(160);
    });

    it('falls back to 100 for an unrecognised tier with no stored limit', () => {
      expect(resolvePointsLimit({ tier: 'SPECIALIST' }, DEFAULT_SETTINGS)).toBe(100);
    });

    it('falls back to 100 when both tier and stored limit are absent', () => {
      expect(resolvePointsLimit({}, DEFAULT_SETTINGS)).toBe(100);
    });

    it('ignores negative stored limits and falls back to tier', () => {
      expect(resolvePointsLimit({ tier: 'MID', points_limit: -5 }, DEFAULT_SETTINGS)).toBe(160);
    });

    it('ignores NaN stored limits and falls back to tier', () => {
      expect(resolvePointsLimit({ tier: 'SENIOR', points_limit: NaN }, DEFAULT_SETTINGS)).toBe(240);
    });

    it('respects customised tier limits in settings', () => {
      const customSettings: AutoAssignSettings = {
        ...DEFAULT_SETTINGS,
        tierLimits: { JUNIOR: 50, MID: 80, SENIOR: 120 },
      };
      expect(resolvePointsLimit({ tier: 'SENIOR' }, customSettings)).toBe(120);
      expect(resolvePointsLimit({ tier: 'JUNIOR' }, customSettings)).toBe(50);
    });
  });
});
