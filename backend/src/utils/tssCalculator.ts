export type TechnicalSeverityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface TSSConfig {
  risk: number;
  impactAffects: boolean;
}

export interface TSSImpactBoostConfig {
  singleUser: number;
  department: number;
  organization: number;
}

export interface TSSSeverityThresholdConfig {
  sev1: number;
  sev2: number;
  sev3: number;
  sev4: number;
}

export function getImpactBoost(impact: string, boosts?: Partial<TSSImpactBoostConfig>): number {
  const impactMap: Record<string, number> = {
    SINGLE_USER: Number.isFinite(boosts?.singleUser) ? Number(boosts?.singleUser) : 0,
    DEPARTMENT: Number.isFinite(boosts?.department) ? Number(boosts?.department) : 0.5,
    ORGANIZATION: Number.isFinite(boosts?.organization) ? Number(boosts?.organization) : 1,
  };

  return impactMap[String(impact || '').toUpperCase()] ?? 0;
}

export function calculateTSS(impact: string, config: TSSConfig, boosts?: Partial<TSSImpactBoostConfig>): number {
  const risk = Math.max(1, Math.min(5, Number(config.risk || 1)));
  const boost = config.impactAffects ? getImpactBoost(impact, boosts) : 0;
  const score = config.impactAffects ? Math.min(risk + boost, 5) : risk;
  return Math.round(score * 100) / 100;
}

function normalizeTssThresholds(config?: Partial<TSSSeverityThresholdConfig>): TSSSeverityThresholdConfig {
  const clamp = (value: number, fallback: number) => {
    if (!Number.isFinite(value)) return fallback;
    return Math.max(1, Math.min(5, Number(value)));
  };

  const sev1 = clamp(Number(config?.sev1), 5);
  const sev2 = Math.min(sev1, clamp(Number(config?.sev2), 4));
  const sev3 = Math.min(sev2, clamp(Number(config?.sev3), 3));
  const sev4 = Math.min(sev3, clamp(Number(config?.sev4), 2));

  return { sev1, sev2, sev3, sev4 };
}

export function tssToSeverity(
  tss: number,
  thresholds?: Partial<TSSSeverityThresholdConfig>
): TechnicalSeverityLevel {
  const { sev1, sev2, sev3 } = normalizeTssThresholds(thresholds);

  if (tss >= sev1) return 'CRITICAL';
  if (tss >= sev2) return 'HIGH';
  if (tss >= sev3) return 'MEDIUM';
  return 'LOW';
}
