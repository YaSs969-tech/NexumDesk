import { all, get, run } from './db';

export type TierKey = 'JUNIOR' | 'MID' | 'SENIOR';

type EngineerPick = {
  engineerId: string;
  tier: string;
  loadPercent: number;
};

export type AutoAssignSettings = {
  enabled: boolean;
  tierEnabled: Record<TierKey, boolean>;
  tierLimits: Record<TierKey, number>;
};

const VALID_TIERS: TierKey[] = ['JUNIOR', 'MID', 'SENIOR'];

const DEFAULT_SEV_REQUIRED_TIER: Record<string, TierKey> = {
  'SEV-1': 'SENIOR',
  'SEV-2': 'MID',
  'SEV-3': 'JUNIOR',
  'SEV-4': 'JUNIOR',
};

const SEVERITY_FALLBACK_SETTING_KEY: Record<string, string> = {
  'SEV-1': 'auto_assign.fallback_sev1',
  'SEV-2': 'auto_assign.fallback_sev2',
  'SEV-3': 'auto_assign.fallback_sev3',
  'SEV-4': 'auto_assign.fallback_sev4',
};


/** Points cost per severity */
export const SEV_POINTS: Record<string, number> = {
  'SEV-1': 60,
  'SEV-2': 35,
  'SEV-3': 20,
  'SEV-4': 10,
};

const SEVERITY_POINTS_SETTING_KEY: Record<string, string> = {
  'SEV-1': 'auto_assign.severity_points_sev1',
  'SEV-2': 'auto_assign.severity_points_sev2',
  'SEV-3': 'auto_assign.severity_points_sev3',
  'SEV-4': 'auto_assign.severity_points_sev4',
};

async function getNumericSystemSetting(key: string, fallback: number): Promise<number> {
  const row = await get('SELECT value FROM system_settings WHERE key = ? LIMIT 1', [key]);
  const parsed = Number(row?.value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function getBooleanSystemSetting(key: string, fallback: boolean): Promise<boolean> {
  const row = await get('SELECT value FROM system_settings WHERE key = ? LIMIT 1', [key]);
  const raw = String(row?.value ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on') return true;
  if (raw === 'false' || raw === '0' || raw === 'no' || raw === 'off') return false;
  return fallback;
}

function parseRequiredTierOrder(raw: any, fallback: TierKey): TierKey[] {
  const tokens = String(raw ?? '')
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter((item) => VALID_TIERS.includes(item as TierKey)) as TierKey[];

  const deduped = tokens.filter((tier, index) => tokens.indexOf(tier) === index);
  return deduped.length > 0 ? deduped : [fallback];
}

export async function getSeverityRequiredTierConfig(): Promise<Record<string, TierKey[]>> {
  const rows = await all(
    `SELECT key, value
     FROM system_settings
     WHERE key IN (?, ?, ?, ?)` ,
    [
      SEVERITY_FALLBACK_SETTING_KEY['SEV-1'],
      SEVERITY_FALLBACK_SETTING_KEY['SEV-2'],
      SEVERITY_FALLBACK_SETTING_KEY['SEV-3'],
      SEVERITY_FALLBACK_SETTING_KEY['SEV-4'],
    ]
  );

  const config: Record<string, TierKey[]> = {
    'SEV-1': [DEFAULT_SEV_REQUIRED_TIER['SEV-1']],
    'SEV-2': [DEFAULT_SEV_REQUIRED_TIER['SEV-2']],
    'SEV-3': [DEFAULT_SEV_REQUIRED_TIER['SEV-3']],
    'SEV-4': [DEFAULT_SEV_REQUIRED_TIER['SEV-4']],
  };

  for (const [severity, key] of Object.entries(SEVERITY_FALLBACK_SETTING_KEY)) {
    const row = rows.find((item: any) => item.key === key);
    config[severity] = parseRequiredTierOrder(row?.value, DEFAULT_SEV_REQUIRED_TIER[severity]);
  }

  return config;
}

export async function getAutoAssignSettings(): Promise<AutoAssignSettings> {
  const [enabled, juniorEnabled, midEnabled, seniorEnabled, juniorLimit, midLimit, seniorLimit] = await Promise.all([
    getBooleanSystemSetting('auto_assign.enabled', true),
    getBooleanSystemSetting('auto_assign.enable_junior', true),
    getBooleanSystemSetting('auto_assign.enable_mid', true),
    getBooleanSystemSetting('auto_assign.enable_senior', true),
    getNumericSystemSetting('auto_assign.limit_junior', 100),
    getNumericSystemSetting('auto_assign.limit_mid', 160),
    getNumericSystemSetting('auto_assign.limit_senior', 240),
  ]);

  return {
    enabled,
    tierEnabled: {
      JUNIOR: juniorEnabled,
      MID: midEnabled,
      SENIOR: seniorEnabled,
    },
    tierLimits: {
      JUNIOR: Math.max(1, Math.round(juniorLimit)),
      MID: Math.max(1, Math.round(midLimit)),
      SENIOR: Math.max(1, Math.round(seniorLimit)),
    },
  };
}

export async function getSeverityPointsConfig(): Promise<Record<string, number>> {
  const rows = await all(
    `SELECT key, value
     FROM system_settings
     WHERE key IN (?, ?, ?, ?)` ,
    [
      SEVERITY_POINTS_SETTING_KEY['SEV-1'],
      SEVERITY_POINTS_SETTING_KEY['SEV-2'],
      SEVERITY_POINTS_SETTING_KEY['SEV-3'],
      SEVERITY_POINTS_SETTING_KEY['SEV-4'],
    ]
  );

  const config: Record<string, number> = { ...SEV_POINTS };
  for (const [severity, key] of Object.entries(SEVERITY_POINTS_SETTING_KEY)) {
    const row = rows.find((item: any) => item.key === key);
    const parsed = Number(row?.value);
    if (Number.isFinite(parsed) && parsed > 0) {
      config[severity] = Math.round(parsed);
    }
  }

  return config;
}

function resolveIncidentCost(severity: string, pointsConfig: Record<string, number>): number {
  return pointsConfig[severity] ?? pointsConfig['SEV-4'] ?? 10;
}

export async function getIncidentCostForSeverity(severity: string): Promise<number> {
  const pointsConfig = await getSeverityPointsConfig();
  return resolveIncidentCost(severity, pointsConfig);
}

/** Resolve the effective points_limit for an engineer row */
export function resolvePointsLimit(eng: any, autoAssignSettings: AutoAssignSettings): number {
  const stored = Number(eng.points_limit);
  if (Number.isFinite(stored) && stored > 0) return stored;
  const tier = String(eng.tier ?? '').trim().toUpperCase() as TierKey;
  return autoAssignSettings.tierLimits[tier] ?? 100;
}

export async function validateEngineerAssignmentCapacity(
  engineerId: string,
  severity: string,
  options?: { enforceTier?: boolean }
): Promise<void> {
  const autoAssignSettings = await getAutoAssignSettings();
  const severityPoints = await getSeverityPointsConfig();
  const severityTierConfig = await getSeverityRequiredTierConfig();
  const enforceTier = options?.enforceTier !== false;
  const engineer = await get(
    `SELECT
       id,
       full_name,
       tier,
       COALESCE((
         SELECT SUM(
           CASE i.severity
             WHEN 'SEV-1' THEN ?
             WHEN 'SEV-2' THEN ?
             WHEN 'SEV-3' THEN ?
             WHEN 'SEV-4' THEN ?
             ELSE ?
           END
         )
         FROM incidents i
         WHERE i.assigned_to = users.id
           AND UPPER(COALESCE(i.status, '')) NOT IN ('RESOLVED', 'CANCELED', 'CANCELLED')
       ), 0) AS points_used,
       COALESCE(points_limit, 0) AS points_limit_raw
     FROM users
     WHERE id = ?
       AND UPPER(TRIM(COALESCE(role, ''))) = 'ENGINEER'
       AND UPPER(TRIM(COALESCE(status, ''))) = 'ACTIVE'`,
    [
      severityPoints['SEV-1'] ?? SEV_POINTS['SEV-1'],
      severityPoints['SEV-2'] ?? SEV_POINTS['SEV-2'],
      severityPoints['SEV-3'] ?? SEV_POINTS['SEV-3'],
      severityPoints['SEV-4'] ?? SEV_POINTS['SEV-4'],
      severityPoints['SEV-4'] ?? SEV_POINTS['SEV-4'],
      engineerId,
    ]
  );

  if (!engineer) {
    throw new Error('Selected engineer is invalid or inactive');
  }

  const tier = String(engineer.tier ?? '').trim().toUpperCase();
  const eligibleTiers = (severityTierConfig[severity] ?? severityTierConfig['SEV-4']).map((item) => item.toUpperCase());
  if (enforceTier && !eligibleTiers.includes(tier)) {
    throw new Error(`Cannot assign ${severity} incident to ${engineer.full_name || 'selected engineer'} because required tier is ${eligibleTiers.join(', ')}`);
  }

  const incidentCost = resolveIncidentCost(severity, severityPoints);
  const pointsUsed = Number(engineer.points_used || 0);
  const limit = resolvePointsLimit({ points_limit: engineer.points_limit_raw, tier: engineer.tier }, autoAssignSettings);

  if (limit - pointsUsed < incidentCost) {
    throw new Error(`Cannot assign incident to ${engineer.full_name || 'selected engineer'}: ${pointsUsed}/${limit} pts used, ${incidentCost} pts required for ${severity}`);
  }
}

/**
 * Core load-balancing algorithm with required tier and fallback chain.
 */
export async function findBestEngineer(severity: string): Promise<EngineerPick | null> {
  const autoAssignSettings = await getAutoAssignSettings();
  const severityTierConfig = await getSeverityRequiredTierConfig();
  if (!autoAssignSettings.enabled) {
    return null;
  }

  const tierOrder = (severityTierConfig[severity] ?? severityTierConfig['SEV-4'])
    .filter((tier) => autoAssignSettings.tierEnabled[tier as TierKey]);

  if (tierOrder.length === 0) {
    return null;
  }

  const severityPoints = await getSeverityPointsConfig();
  const incidentCost = resolveIncidentCost(severity, severityPoints);

  type Candidate = { id: string; tier: string; pointsUsed: number; limit: number; loadPercent: number };

  for (const tier of tierOrder) {
    const candidates: any[] = await all(
      `SELECT
         id,
         tier,
         COALESCE((
           SELECT SUM(
             CASE i.severity
               WHEN 'SEV-1' THEN ?
               WHEN 'SEV-2' THEN ?
               WHEN 'SEV-3' THEN ?
               WHEN 'SEV-4' THEN ?
               ELSE ?
             END
           )
           FROM incidents i
           WHERE i.assigned_to = users.id
             AND UPPER(COALESCE(i.status, '')) NOT IN ('RESOLVED', 'CANCELED', 'CANCELLED')
         ), 0) AS points_used,
         COALESCE(points_limit, 0) AS points_limit_raw
       FROM users
       WHERE UPPER(TRIM(COALESCE(role, ''))) = 'ENGINEER'
         AND UPPER(TRIM(COALESCE(status, ''))) = 'ACTIVE'
         AND COALESCE(auto_assign_enabled, 1) = 1
         AND UPPER(TRIM(COALESCE(tier, ''))) = ?`,
      [
        severityPoints['SEV-1'] ?? SEV_POINTS['SEV-1'],
        severityPoints['SEV-2'] ?? SEV_POINTS['SEV-2'],
        severityPoints['SEV-3'] ?? SEV_POINTS['SEV-3'],
        severityPoints['SEV-4'] ?? SEV_POINTS['SEV-4'],
        severityPoints['SEV-4'] ?? SEV_POINTS['SEV-4'],
        tier.toUpperCase(),
      ]
    );

    if (!candidates || candidates.length === 0) {
      continue;
    }

    const eligibleInTier: Candidate[] = candidates
      .map((eng) => {
        const limit = resolvePointsLimit({ points_limit: eng.points_limit_raw, tier: eng.tier }, autoAssignSettings);
        const pointsUsed = Number(eng.points_used);
        return {
          id: eng.id,
          tier: eng.tier,
          pointsUsed,
          limit,
          loadPercent: limit > 0 ? (pointsUsed / limit) * 100 : 100,
        };
      })
      .filter((eng) => eng.limit - eng.pointsUsed >= incidentCost);

    if (eligibleInTier.length === 0) {
      continue;
    }

    eligibleInTier.sort((a, b) => a.loadPercent - b.loadPercent);
    const minLoad = eligibleInTier[0].loadPercent;
    const tied = eligibleInTier.filter((e) => Math.abs(e.loadPercent - minLoad) < 0.01);
    const chosen = tied[Math.floor(Math.random() * tied.length)];
    return { engineerId: chosen.id, tier: chosen.tier, loadPercent: chosen.loadPercent };
  }

  return null;
}

export async function executeAutoAssign(
  incidentId: string,
  severity: string
): Promise<{ status: 'assigned'; engineerId: string; tier: string; loadPercent: number } | { status: 'no_capacity' }> {
  const best = await findBestEngineer(severity);

  if (!best) {
    return { status: 'no_capacity' };
  }

  const incidentCost = await getIncidentCostForSeverity(severity);

  await run(
    `UPDATE users SET load_points = COALESCE(load_points, 0) + ? WHERE id = ?`,
    [incidentCost, best.engineerId]
  );

  await run(
    `UPDATE incidents SET assigned_to = ?, assignment_status = 'AUTO', updated_at = ? WHERE id = ?`,
    [best.engineerId, new Date().toISOString(), incidentId]
  );

  return {
    status: 'assigned',
    engineerId: best.engineerId,
    tier: best.tier,
    loadPercent: best.loadPercent,
  };
}

/**
 * Release points_used when an incident is resolved, cancelled, or reassigned.
 * Works for both AUTO and APPROVED assignment statuses.
 */
export async function releaseEngineerLoad(incidentId: string): Promise<void> {
  const incident = await get(
    `SELECT id, assigned_to, severity, assignment_status
     FROM incidents
     WHERE id = ?`,
    [incidentId]
  );

  if (!incident || !incident.assigned_to) return;
  if (!['AUTO', 'APPROVED'].includes(incident.assignment_status ?? '')) return;

  const incidentCost = await getIncidentCostForSeverity(String(incident.severity || 'SEV-4'));
  await run(
    `UPDATE users SET load_points = MAX(0, COALESCE(load_points, 0) - ?) WHERE id = ?`,
    [incidentCost, incident.assigned_to]
  );
}
