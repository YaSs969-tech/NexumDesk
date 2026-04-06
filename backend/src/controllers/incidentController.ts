import { Request, Response } from 'express';
import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';
import { all, run, get } from '../utils/db';
import {
  calculateIncidentMetrics,
  calculateISS,
  issToSeverity,
  getCategoryRisk,
  ISSWeightsConfig,
  SeverityThresholdConfig,
} from '../utils/issCalculator';
import { calculateTSS, tssToSeverity, type TSSSeverityThresholdConfig } from '../utils/tssCalculator';

// ============================================================================
// TYPES
// ============================================================================

export type IncidentPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type IncidentImpact = 'SINGLE_USER' | 'DEPARTMENT' | 'ORGANIZATION';
export type IncidentCategory = string;

export interface IncidentPayload {
  title: string;
  description?: string;
  severity: string;
  urgency?: string;
  service_id: string;
  detected_at: string;
  assigned_to?: string | null;
  created_by?: string | null;
  status?: string;
  department?: string;
  attachment_url?: string;
  estimated_resolution_time?: number;
  resolution_notes?: string;
  resolution_time?: number;
  // New fields for comprehensive form
  category?: IncidentCategory;
  subcategory_id?: string;
  priority?: IncidentPriority;
  impact?: IncidentImpact;
  office_location?: string;
  floor?: string;
  room?: string;
  cabin?: string;
  tsi?: string;
  workstation_id?: string;
  affected_system?: string; // For auto-determining impact
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

export const incidentCreateSchema = Joi.object({
  title: Joi.string().min(5).max(200).required(),
  description: Joi.string().min(10).max(5000).required(),
  urgency: Joi.string().valid('CRITICAL', 'HIGH', 'MEDIUM', 'LOW').default('MEDIUM'),
  category: Joi.string().trim().max(100).default('OTHER'),
  subcategory_id: Joi.string().max(64).optional().allow(null, ''),
  affected_system: Joi.string().max(200).allow(null, ''),
  severity: Joi.string().valid('SEV-1', 'SEV-2', 'SEV-3', 'SEV-4').optional().allow(null, ''),
  priority: Joi.string().valid('CRITICAL', 'HIGH', 'MEDIUM', 'LOW').optional(),
  impact: Joi.string().valid('SINGLE_USER', 'DEPARTMENT', 'ORGANIZATION').optional(),
  office_location: Joi.string().max(100).allow(null, ''),
  floor: Joi.string().max(20).allow(null, ''),
  room: Joi.string().max(50).allow(null, ''),
  cabin: Joi.string().max(50).allow(null, ''),
  tsi: Joi.string().max(50).allow(null, ''),
  workstation_id: Joi.string().max(50).allow(null, ''),
  service_id: Joi.string().uuid().optional().allow(''),
  department: Joi.string().max(100).allow(null, ''),
  detected_at: Joi.string().isoDate().required(),
}).unknown(true);

export const incidentUpdateSchema = Joi.object({
  title: Joi.string().min(5).max(200),
  description: Joi.string().min(10).max(5000),
  urgency: Joi.string().valid('CRITICAL', 'HIGH', 'MEDIUM', 'LOW'),
  category: Joi.string().trim().max(100),
  subcategory_id: Joi.string().max(64).allow(null, ''),
  severity: Joi.string().valid('SEV-1', 'SEV-2', 'SEV-3', 'SEV-4').optional().allow(null, ''),
  status: Joi.string().valid('OPEN', 'IN_PROGRESS', 'PENDING', 'RESOLVED', 'CANCELLED'),
  priority: Joi.string().valid('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'P1', 'P2', 'P3', 'P4'),
  impact: Joi.string().valid('SINGLE_USER', 'DEPARTMENT', 'ORGANIZATION'),
  pending_reason: Joi.string().max(500).allow(null, ''),
  assigned_to: Joi.string().uuid().allow(null),
  estimated_resolution_time: Joi.number().integer().min(1).optional(),
  resolution_notes: Joi.string().max(5000),
}).min(1);

// ============================================================================
// CONTROLLERS
// ============================================================================

export async function listIncidents(query: any) {
  const page = Math.max(1, parseInt(String(query.page || '1')));
  const limit = Math.max(1, parseInt(String(query.limit || '50')));
  const offset = (page - 1) * limit;

  const incidents = await all(
    `SELECT 
      i.*,
      creator.full_name as created_by_name,
      override_user.full_name as overridden_by_name,
      assignee.full_name as assigned_to_name,
      pending_assignee.full_name as pending_assigned_to_name,
      s.name as service_name
    FROM incidents i
    LEFT JOIN users creator ON i.created_by = creator.id
    LEFT JOIN users override_user ON i.overridden_by = override_user.id
    LEFT JOIN users assignee ON i.assigned_to = assignee.id
    LEFT JOIN users pending_assignee ON i.pending_assigned_to = pending_assignee.id
    LEFT JOIN services s ON i.service_id = s.id
    ORDER BY i.created_at DESC
    LIMIT ? OFFSET ?`,
    [limit, offset]
  );

  const totalRows = await all(`SELECT COUNT(*) as cnt FROM incidents`);
  const total = totalRows && totalRows[0] ? totalRows[0].cnt : 0;

  const policies = await all(
    'SELECT priority, resolution_hours, response_hours, business_hours_only, business_hours_config_id FROM sla_policies WHERE is_active = 1'
  );
  const policyByPriority = new Map<number, any>();
  for (const policy of policies || []) {
    policyByPriority.set(Number(policy.priority), policy);
  }

  const incidentsWithConsumption = await Promise.all(
    incidents.map(async (incident: any) => {
      const policy = policyByPriority.get(priorityToNumber(incident.priority));
      const businessHoursConfigId = resolveBusinessHoursConfigId(policy);
      const resolutionHours = Number(policy?.resolution_hours);
      const responseHours = Number(policy?.response_hours);
      const slaTargetMinutes = Number.isFinite(resolutionHours) && resolutionHours > 0
        ? Math.round(resolutionHours * 60)
        : Number(incident.estimated_resolution_time || 0);
      const responseTargetMinutes = Number(incident.response_time_sla_minutes) > 0
        ? Number(incident.response_time_sla_minutes)
        : (Number.isFinite(responseHours) && responseHours > 0 ? Math.round(responseHours * 60) : 0);

      let slaPercentConsumed = incident.sla_percent_at_resolve ?? null;
      if (incident.sla_deadline && slaTargetMinutes > 0) {
        const referenceDate = (incident.status === 'RESOLVED' || incident.status === 'CANCELLED') && incident.resolved_at
          ? new Date(incident.resolved_at)
          : new Date();
        const consumption = await calculateConsumptionFromDeadline(
          incident.sla_deadline,
          slaTargetMinutes,
          referenceDate,
          businessHoursConfigId
        );
        slaPercentConsumed = consumption.percentConsumed;
      }

      let responsePercentConsumed: number | null = null;
      if (incident.response_deadline && responseTargetMinutes > 0) {
        const referenceDate = incident.response_time_confirmed_at
          ? new Date(incident.response_time_confirmed_at)
          : new Date();
        const consumption = await calculateConsumptionFromDeadline(
          incident.response_deadline,
          responseTargetMinutes,
          referenceDate,
          businessHoursConfigId
        );
        responsePercentConsumed = consumption.percentConsumed;
      }

      return {
        ...incident,
        sla_percent_consumed: slaPercentConsumed,
        response_percent_consumed: responsePercentConsumed,
      };
    })
  );

  return {
    incidents: incidentsWithConsumption,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  };
}

export async function getIncidentById(id: string) {
  const incidents = await all(
    `SELECT 
      i.*,
      sc.name as subcategory_name,
      creator.full_name as created_by_name,
      creator.email as created_by_email,
      creator.phone as created_by_phone,
      creator.department as created_by_department,
      creator.job_title as created_by_job_title,
      creator.role as created_by_role,
      creator.tier as created_by_tier,
      override_user.full_name as overridden_by_name,
      assignee.full_name as assigned_to_name,
      assignee.email as assigned_to_email,
      assignee.phone as assigned_to_phone,
      assignee.department as assigned_to_department,
      assignee.job_title as assigned_to_job_title,
      assignee.tier as assigned_to_tier,
      s.name as service_name
    FROM incidents i
    LEFT JOIN subcategories sc ON sc.id = i.subcategory_id
    LEFT JOIN users creator ON i.created_by = creator.id
    LEFT JOIN users override_user ON i.overridden_by = override_user.id
    LEFT JOIN users assignee ON i.assigned_to = assignee.id
    LEFT JOIN services s ON i.service_id = s.id
    WHERE i.id = ?`,
    [id]
  );
  const incident = incidents && incidents[0] ? incidents[0] : null;
  if (!incident) {
    return null;
  }

  incident.required_tier_primary = await getPrimaryRequiredTierForSeverity(incident.severity);
  return incident;
}

// Interface for business hours from DB
interface BusinessHoursConfig {
  config_id: string;
  day_of_week: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  start_time: string;  // "09:00"
  end_time: string;    // "18:00"
  is_working_day: number; // 1 = true, 0 = false
}

interface BusinessHoliday {
  holiday_date: string;
}

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper function to get business hours for a specific configuration.
async function getBusinessHoursConfig(configId?: string | null): Promise<BusinessHoursConfig[]> {
  if (!configId) return [];
  const hours = await all(
    'SELECT * FROM business_hours WHERE config_id = ? ORDER BY day_of_week ASC',
    [configId]
  );
  return (hours || []) as BusinessHoursConfig[];
}

async function getBusinessHolidays(configId?: string | null): Promise<Set<string>> {
  if (!configId) return new Set<string>();
  const holidays = await all(
    'SELECT holiday_date FROM business_hour_holidays WHERE config_id = ?',
    [configId]
  );
  return new Set((holidays as BusinessHoliday[]).map(h => h.holiday_date));
}

async function calculateBusinessMinutesBetween(
  startDate: Date,
  endDate: Date,
  businessHoursConfigId?: string | null
): Promise<number> {
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
    return 0;
  }

  if (!businessHoursConfigId) {
    return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
  }

  const [businessHoursConfig, holidaySet] = await Promise.all([
    getBusinessHoursConfig(businessHoursConfigId),
    getBusinessHolidays(businessHoursConfigId),
  ]);

  if (!businessHoursConfig.length) {
    return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
  }

  const dayConfig: Record<number, BusinessHoursConfig> = {};
  for (const config of businessHoursConfig) {
    dayConfig[config.day_of_week] = config;
  }

  let totalMinutes = 0;
  let cursor = new Date(startDate);

  while (cursor < endDate) {
    const currentDay = new Date(cursor);
    currentDay.setHours(0, 0, 0, 0);

    const nextDay = new Date(currentDay);
    nextDay.setDate(nextDay.getDate() + 1);

    const segmentEnd = endDate < nextDay ? endDate : nextDay;
    const config = dayConfig[currentDay.getDay()];
    const isHoliday = holidaySet.has(toLocalDateKey(currentDay));

    if (config && config.is_working_day && !isHoliday) {
      const startHour = parseTimeToHours(config.start_time);
      const endHour = parseTimeToHours(config.end_time);

      const workStart = new Date(currentDay);
      workStart.setHours(Math.floor(startHour), Math.round((startHour % 1) * 60), 0, 0);

      const workEnd = new Date(currentDay);
      workEnd.setHours(Math.floor(endHour), Math.round((endHour % 1) * 60), 0, 0);

      const overlapStart = cursor > workStart ? cursor : workStart;
      const overlapEnd = segmentEnd < workEnd ? segmentEnd : workEnd;

      if (overlapEnd > overlapStart) {
        totalMinutes += Math.round((overlapEnd.getTime() - overlapStart.getTime()) / 60000);
      }
    }

    cursor = nextDay;
  }

  return Math.max(0, totalMinutes);
}

async function calculateConsumptionFromDeadline(
  deadlineInput: string | Date | null | undefined,
  targetMinutes: number,
  referenceDate: Date,
  businessHoursConfigId?: string | null
): Promise<{
  percentConsumed: number;
  remainingMinutes: number;
  overtimeMinutes: number;
}> {
  const deadline = deadlineInput instanceof Date ? deadlineInput : new Date(deadlineInput || '');
  if (Number.isNaN(deadline.getTime()) || !Number.isFinite(targetMinutes) || targetMinutes <= 0) {
    return {
      percentConsumed: 0,
      remainingMinutes: 0,
      overtimeMinutes: 0,
    };
  }

  const remainingMinutes = referenceDate <= deadline
    ? await calculateBusinessMinutesBetween(referenceDate, deadline, businessHoursConfigId)
    : -await calculateBusinessMinutesBetween(deadline, referenceDate, businessHoursConfigId);

  return {
    percentConsumed: ((targetMinutes - remainingMinutes) / targetMinutes) * 100,
    remainingMinutes,
    overtimeMinutes: Math.max(0, -remainingMinutes),
  };
}

async function getCategoryRiskWeight(category?: string | null): Promise<number> {
  const normalizedCategory = (category || 'OTHER').toUpperCase();
  const row = await get(
    'SELECT risk_weight FROM categories WHERE UPPER(name) = UPPER(?) LIMIT 1',
    [normalizedCategory]
  );

  const riskWeight = Number(row?.risk_weight);
  if (Number.isFinite(riskWeight)) {
    return riskWeight;
  }

  return 2;
}

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

async function getISSSettings(): Promise<{
  weights: ISSWeightsConfig;
  thresholds: SeverityThresholdConfig;
}> {
  const [urgencyWeight, impactWeight, categoryWeight, thresholdP1, thresholdP2, thresholdP3] = await Promise.all([
    getNumericSystemSetting('iss.urgency_weight', 0.4),
    getNumericSystemSetting('iss.impact_weight', 0.4),
    getNumericSystemSetting('iss.category_weight', 0.2),
    getNumericSystemSetting('iss.threshold_p1', 4),
    getNumericSystemSetting('iss.threshold_p2', 3),
    getNumericSystemSetting('iss.threshold_p3', 2),
  ]);

  const safeP1 = thresholdP1;
  const safeP2 = Math.min(safeP1, thresholdP2);
  const safeP3 = Math.min(safeP2, thresholdP3);

  return {
    weights: {
      urgencyWeight: Math.max(0, urgencyWeight),
      impactWeight: Math.max(0, impactWeight),
      categoryWeight: Math.max(0, categoryWeight),
    },
    thresholds: {
      p1: safeP1,
      p2: safeP2,
      p3: safeP3,
    },
  };
}

async function getSLAAlertSettings(): Promise<{
  warningThreshold: number;
  responseWarningThreshold: number;
  responseRiskNotificationsEnabled: boolean;
}> {
  const [warningThreshold, responseWarningThreshold, responseRiskNotificationsEnabled] = await Promise.all([
    getNumericSystemSetting('sla.warning_threshold', 75),
    getNumericSystemSetting('sla.response_warning_threshold', 75),
    getBooleanSystemSetting('sla.response_risk_notifications_enabled', true),
  ]);

  return {
    warningThreshold: Math.min(100, Math.max(1, warningThreshold)),
    responseWarningThreshold: Math.min(100, Math.max(1, responseWarningThreshold)),
    responseRiskNotificationsEnabled,
  };
}

async function getTSSImpactBoostSettings(): Promise<{
  singleUser: number;
  department: number;
  organization: number;
}> {
  const [singleUser, department, organization] = await Promise.all([
    getNumericSystemSetting('tss.boost_single_user', 0),
    getNumericSystemSetting('tss.boost_department', 0.5),
    getNumericSystemSetting('tss.boost_organization', 1),
  ]);

  return {
    singleUser: Math.max(0, Math.min(1, singleUser)),
    department: Math.max(0, Math.min(1, department)),
    organization: Math.max(0, Math.min(1, organization)),
  };
}

async function getTSSSeverityThresholds(): Promise<Pick<TSSSeverityThresholdConfig, 'sev1' | 'sev2' | 'sev3'>> {
  const [sev1, sev2, sev3] = await Promise.all([
    getNumericSystemSetting('tss.threshold_sev1', 5),
    getNumericSystemSetting('tss.threshold_sev2', 4),
    getNumericSystemSetting('tss.threshold_sev3', 3),
  ]);

  const safeSev1 = Math.max(1, Math.min(5, sev1));
  const safeSev2 = Math.min(safeSev1, Math.max(1, Math.min(5, sev2)));
  const safeSev3 = Math.min(safeSev2, Math.max(1, Math.min(5, sev3)));

  return {
    sev1: safeSev1,
    sev2: safeSev2,
    sev3: safeSev3,
  };
}

type TierKey = 'JUNIOR' | 'MID' | 'SENIOR';

const VALID_TIERS: TierKey[] = ['JUNIOR', 'MID', 'SENIOR'];
const DEFAULT_SEV_ELIGIBLE_TIERS: Record<string, TierKey[]> = {
  'SEV-1': ['SENIOR'],
  'SEV-2': ['MID', 'SENIOR'],
  'SEV-3': ['MID', 'JUNIOR', 'SENIOR'],
  'SEV-4': ['JUNIOR', 'MID', 'SENIOR'],
};

const SEVERITY_FALLBACK_SETTING_KEY: Record<string, string> = {
  'SEV-1': 'auto_assign.fallback_sev1',
  'SEV-2': 'auto_assign.fallback_sev2',
  'SEV-3': 'auto_assign.fallback_sev3',
  'SEV-4': 'auto_assign.fallback_sev4',
};

type AutoAssignSettings = {
  enabled: boolean;
  tierEnabled: Record<TierKey, boolean>;
  tierLimits: Record<TierKey, number>;
};

function parseTierFallback(raw: any, fallback: TierKey[]): TierKey[] {
  const tokens = String(raw ?? '')
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter((item) => VALID_TIERS.includes(item as TierKey)) as TierKey[];

  const deduped = Array.from(new Set(tokens));
  return deduped.length > 0 ? deduped : fallback;
}

async function getSeverityTierFallbackConfig(): Promise<Record<string, TierKey[]>> {
  const rows = await all(
    `SELECT key, value
     FROM system_settings
     WHERE key IN (?, ?, ?, ?)`,
    [
      SEVERITY_FALLBACK_SETTING_KEY['SEV-1'],
      SEVERITY_FALLBACK_SETTING_KEY['SEV-2'],
      SEVERITY_FALLBACK_SETTING_KEY['SEV-3'],
      SEVERITY_FALLBACK_SETTING_KEY['SEV-4'],
    ]
  );

  const config: Record<string, TierKey[]> = {
    ...DEFAULT_SEV_ELIGIBLE_TIERS,
  };

  for (const [severity, key] of Object.entries(SEVERITY_FALLBACK_SETTING_KEY)) {
    const row = rows.find((item: any) => item.key === key);
    config[severity] = parseTierFallback(row?.value, DEFAULT_SEV_ELIGIBLE_TIERS[severity]);
  }

  return config;
}

async function getPrimaryRequiredTierForSeverity(severity?: string | null): Promise<TierKey> {
  const severityTierConfig = await getSeverityTierFallbackConfig();
  const normalizedSeverity = normalizeSeverityToSevLabel(severity);
  const chain = severityTierConfig[normalizedSeverity] ?? severityTierConfig['SEV-4'] ?? ['SENIOR'];
  return chain[0] ?? 'SENIOR';
}

async function getAutoAssignSettings(): Promise<AutoAssignSettings> {
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

export async function listIncidentCategories(_req: Request, res: Response) {
  try {
    const categories = await all(
      `SELECT id, name, description, risk_weight, sort_order
       FROM categories
       WHERE is_active = 1
       ORDER BY sort_order ASC, name ASC`
    );

    res.json({ success: true, data: categories });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load categories' });
  }
}

export async function listIncidentSubcategories(req: Request, res: Response) {
  try {
    const rawCategory = String(req.query.category || '').trim();

    const subcategories = await all(
      `SELECT sc.id, sc.name, sc.risk, sc.impact_affects, sc.status, c.id as category_id, c.name as category_name
       FROM subcategories sc
       INNER JOIN categories c ON c.id = sc.category_id
       WHERE sc.status = 'ACTIVE'
         AND (? = '' OR UPPER(c.name) = UPPER(?))
       ORDER BY c.sort_order ASC, sc.sort_order ASC, sc.name ASC`,
      [rawCategory, rawCategory]
    );

    res.json({ success: true, data: subcategories });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load subcategories' });
  }
}

// Parse time string "HH:MM" to hours (decimal)
function parseTimeToHours(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours + (minutes / 60);
}

function priorityToNumber(priority?: string | null): number {
  const value = (priority || '').toUpperCase();
  if (value === 'P1' || value === 'CRITICAL') return 1;
  if (value === 'P2' || value === 'HIGH') return 2;
  if (value === 'P3' || value === 'MEDIUM') return 3;
  return 4;
}

function normalizePriorityLabel(priority?: string | null): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
  const value = String(priority || '').trim().toUpperCase();
  if (value === 'P1' || value === 'CRITICAL') return 'CRITICAL';
  if (value === 'P2' || value === 'HIGH') return 'HIGH';
  if (value === 'P3' || value === 'MEDIUM') return 'MEDIUM';
  return 'LOW';
}

function normalizeSeverityToSevLabel(severity?: string | null): 'SEV-1' | 'SEV-2' | 'SEV-3' | 'SEV-4' {
  const value = String(severity || '').trim().toUpperCase();
  if (value === 'SEV-1' || value === 'CRITICAL') return 'SEV-1';
  if (value === 'SEV-2' || value === 'HIGH') return 'SEV-2';
  if (value === 'SEV-3' || value === 'MEDIUM') return 'SEV-3';
  return 'SEV-4';
}

function getDefaultResponseHours(priorityNumber: number): number {
  const defaults: Record<number, number> = {
    1: 0.5,
    2: 1,
    3: 4,
    4: 8,
  };
  return defaults[priorityNumber] || 1;
}

function resolveBusinessHoursConfigId(slaPolicy: any): string | null {
  if (!slaPolicy) return 'bhcfg-standard';
  if (slaPolicy.business_hours_config_id) return slaPolicy.business_hours_config_id;
  return slaPolicy.business_hours_only ? 'bhcfg-standard' : null;
}

// Helper function to calculate SLA deadline from hours (reads from DB)
async function calculateSLADeadlineFromHours(
  hours: number,
  fromDate: Date,
  businessHoursConfigId?: string | null
): Promise<string> {
  if (!businessHoursConfigId) {
    // Simple 24/7 calculation
    const deadline = new Date(fromDate);
    deadline.setTime(deadline.getTime() + hours * 60 * 60 * 1000);
    return deadline.toISOString();
  }
  
  // Get business hours config from database
  const [businessHoursConfig, holidaySet] = await Promise.all([
    getBusinessHoursConfig(businessHoursConfigId),
    getBusinessHolidays(businessHoursConfigId),
  ]);

  if (!businessHoursConfig.length) {
    const deadline = new Date(fromDate);
    deadline.setTime(deadline.getTime() + hours * 60 * 60 * 1000);
    return deadline.toISOString();
  }
  
  // Create a map for quick lookup by day
  const dayConfig: Record<number, BusinessHoursConfig> = {};
  for (const config of businessHoursConfig) {
    dayConfig[config.day_of_week] = config;
  }
  
  let remainingHours = hours;
  let current = new Date(fromDate);
  
  // Safety counter to prevent infinite loops
  let iterations = 0;
  const maxIterations = 365 * 24; // Max 1 year worth of iterations
  
  while (remainingHours > 0 && iterations < maxIterations) {
    iterations++;
    const dayOfWeek = current.getDay();
    const config = dayConfig[dayOfWeek];
    
    const isHoliday = holidaySet.has(toLocalDateKey(current));

    // Skip non-working days and configured holidays
    if (!config || !config.is_working_day || isHoliday) {
      current.setDate(current.getDate() + 1);
      const nextDayConfig = dayConfig[(dayOfWeek + 1) % 7];
      if (nextDayConfig && nextDayConfig.is_working_day) {
        const startHour = parseTimeToHours(nextDayConfig.start_time);
        current.setHours(Math.floor(startHour), (startHour % 1) * 60, 0, 0);
      } else {
        current.setHours(9, 0, 0, 0); // Default fallback
      }
      continue;
    }
    
    const businessStart = parseTimeToHours(config.start_time);
    const businessEnd = parseTimeToHours(config.end_time);
    const currentHour = current.getHours();
    const currentMinute = current.getMinutes();
    const currentTimeDecimal = currentHour + (currentMinute / 60);
    
    // Before business hours
    if (currentTimeDecimal < businessStart) {
      current.setHours(Math.floor(businessStart), (businessStart % 1) * 60, 0, 0);
      continue;
    }
    
    // After business hours
    if (currentTimeDecimal >= businessEnd) {
      current.setDate(current.getDate() + 1);
      // Find next working day's start time
      let nextDay = (dayOfWeek + 1) % 7;
      let daysChecked = 0;
      while (daysChecked < 7) {
        const nextConfig = dayConfig[nextDay];
        const nextIsHoliday = holidaySet.has(toLocalDateKey(current));
        if (nextConfig && nextConfig.is_working_day && !nextIsHoliday) {
          const startHour = parseTimeToHours(nextConfig.start_time);
          current.setHours(Math.floor(startHour), (startHour % 1) * 60, 0, 0);
          break;
        }
        current.setDate(current.getDate() + 1);
        nextDay = (nextDay + 1) % 7;
        daysChecked++;
      }
      continue;
    }
    
    // Within business hours - calculate time until end of day
    const hoursUntilEnd = businessEnd - currentTimeDecimal;
    
    if (remainingHours <= hoursUntilEnd) {
      // Can complete within today
      current.setTime(current.getTime() + remainingHours * 60 * 60 * 1000);
      remainingHours = 0;
    } else {
      // Use remaining hours today and continue to next day
      remainingHours -= hoursUntilEnd;
      current.setDate(current.getDate() + 1);
      // Find next working day's start time
      let nextDay = current.getDay();
      let daysChecked = 0;
      while (daysChecked < 7) {
        const nextConfig = dayConfig[nextDay];
        const nextIsHoliday = holidaySet.has(toLocalDateKey(current));
        if (nextConfig && nextConfig.is_working_day && !nextIsHoliday) {
          const startHour = parseTimeToHours(nextConfig.start_time);
          current.setHours(Math.floor(startHour), (startHour % 1) * 60, 0, 0);
          break;
        }
        current.setDate(current.getDate() + 1);
        nextDay = (nextDay + 1) % 7;
        daysChecked++;
      }
    }
  }
  
  return current.toISOString();
}

// ============================================================================
// AUTO-ASSIGN ENGINE
// ============================================================================

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

async function getSeverityPointsConfig(): Promise<Record<string, number>> {
  const rows = await all(
    `SELECT key, value
     FROM system_settings
     WHERE key IN (?, ?, ?, ?)`,
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

async function getIncidentCostForSeverity(severity: string): Promise<number> {
  const pointsConfig = await getSeverityPointsConfig();
  return resolveIncidentCost(severity, pointsConfig);
}

/** Resolve the effective points_limit for an engineer row */
function resolvePointsLimit(eng: any, autoAssignSettings: AutoAssignSettings): number {
  const stored = Number(eng.points_limit);
  if (Number.isFinite(stored) && stored > 0) return stored;
  const tier = String(eng.tier ?? '').toUpperCase() as TierKey;
  return autoAssignSettings.tierLimits[tier] ?? 100;
}

async function validateEngineerAssignmentCapacity(
  engineerId: string,
  severity: string,
  options?: { enforceTier?: boolean }
): Promise<void> {
  const autoAssignSettings = await getAutoAssignSettings();
  const severityPoints = await getSeverityPointsConfig();
  const severityTierConfig = await getSeverityTierFallbackConfig();
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
       AND role = 'ENGINEER'
       AND status = 'ACTIVE'`,
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

  const tier = String(engineer.tier ?? '').toUpperCase();
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
 * Core load-balancing algorithm with strict settings-driven tier order.
 *
 * For each severity we evaluate tiers exactly in the configured fallback order.
 *
 * Inside each tier, choose the engineer with lowest load_percent.
 * Ties on the same tier are resolved randomly.
 */
export async function findBestEngineer(
  severity: string
): Promise<{ engineerId: string; tier: string; loadPercent: number } | null> {
  const autoAssignSettings = await getAutoAssignSettings();
  const severityTierConfig = await getSeverityTierFallbackConfig();
  if (!autoAssignSettings.enabled) {
    return null;
  }

  const tierOrder = (severityTierConfig[severity] ?? severityTierConfig['SEV-4']);

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
         COALESCE(points_limit, 0)  AS points_limit_raw
       FROM users
       WHERE role = 'ENGINEER'
         AND status = 'ACTIVE'
         AND COALESCE(auto_assign_enabled, 1) = 1
         AND UPPER(tier) = ?`,
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
      .map(eng => {
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
      .filter(eng => eng.limit - eng.pointsUsed >= incidentCost);

    if (eligibleInTier.length === 0) {
      continue;
    }

    eligibleInTier.sort((a, b) => a.loadPercent - b.loadPercent);
    const minLoad = eligibleInTier[0].loadPercent;
    const tied = eligibleInTier.filter(e => Math.abs(e.loadPercent - minLoad) < 0.01);
    const chosen = tied[Math.floor(Math.random() * tied.length)];
    return { engineerId: chosen.id, tier: chosen.tier, loadPercent: chosen.loadPercent };
  }

  return null;
}

/**
 * Alert all managers/admins that no eligible engineer was found.
 */
async function alertManagersNoCapacity(incidentId: string, severity: string): Promise<void> {
  const incident = await getIncidentById(incidentId);
  const managers = await all(
    `SELECT id FROM users WHERE role IN ('ADMIN', 'MANAGER') AND status = 'ACTIVE'`
  );
  for (const mgr of managers ?? []) {
    await createNotification(
      mgr.id,
      incidentId,
      '⚠️ Auto-assign failed – No capacity',
      `No available engineer found for incident "${incident?.title ?? incidentId}" (${severity}). All eligible engineers have reached their load limit. Manual assignment required.`
    );
  }
}

/**
 * Perform full auto-assignment:
 *  1. findBestEngineer → load-balanced pick
 *  2. Increment points_used on engineer  (points_used += cost)
 *  3. Update incident (assigned_to, assignment_status = 'AUTO')
 *  4. Activity log + notifications
 *
 * Returns: 'assigned' | 'no_capacity'
 */
export async function performAutoAssign(
  incidentId: string,
  severity: string,
  actorUserId: string | null,
  actorName: string
): Promise<'assigned' | 'no_capacity'> {
  const best = await findBestEngineer(severity);

  if (!best) {
    await alertManagersNoCapacity(incidentId, severity);
    return 'no_capacity';
  }

  const incidentCost = await getIncidentCostForSeverity(severity);

  // Increment engineer load
  await run(
    `UPDATE users SET load_points = COALESCE(load_points, 0) + ? WHERE id = ?`,
    [incidentCost, best.engineerId]
  );

  const now = new Date().toISOString();
  await run(
    `UPDATE incidents SET assigned_to = ?, assignment_status = 'AUTO', updated_at = ? WHERE id = ?`,
    [best.engineerId, now, incidentId]
  );

  await addActivity(
    incidentId,
    actorUserId,
    actorName,
    'AUTO_ASSIGNED',
    `Auto-assigned to engineer (tier: ${best.tier}, load: ${best.loadPercent.toFixed(1)}%) based on severity ${severity}.`
  );

  await sendIncidentNotifications(incidentId, 'ASSIGNED', null, best.engineerId);
  return 'assigned';
}

/**
 * Release points_used when an incident is resolved, cancelled, or reassigned.
 * Works for both AUTO and APPROVED assignment statuses.
 */
export async function releaseEngineerLoad(incidentId: string): Promise<void> {
  const incident = await getIncidentById(incidentId);
  if (!incident || !incident.assigned_to) return;
  // Only release if the assignment was made by the auto-assign engine
  if (!['AUTO', 'APPROVED'].includes(incident.assignment_status ?? '')) return;

  const incidentCost = await getIncidentCostForSeverity(incident.severity as string);
  await run(
    `UPDATE users SET load_points = MAX(0, COALESCE(load_points, 0) - ?) WHERE id = ?`,
    [incidentCost, incident.assigned_to]
  );
}

export async function createIncident(payload: IncidentPayload, userId?: string, userRole?: string) {
  const { error, value } = incidentCreateSchema.validate(payload);
  if (error) {
    throw new Error(error.details[0].message);
  }

  const id = uuidv4();
  const now = new Date().toISOString();

  // ============== AUTO-CALCULATE ISS, SEVERITY, PRIORITY, SLA ==============
  const urgency = value.urgency || 'MEDIUM';
  const category = (value.category || 'OTHER').toUpperCase();
  const impact = value.impact || 'SINGLE_USER'; // Use user-provided impact or default
  const subcategoryId = value.subcategory_id || null;
  const categoryRiskWeight = await getCategoryRiskWeight(category);
  const issSettings = await getISSSettings();
  
  // Calculate all metrics automatically (affected_system is now informational only)
  const metrics = calculateIncidentMetrics(
    urgency,
    category,
    impact,
    true,
    categoryRiskWeight,
    issSettings.weights,
    issSettings.thresholds
  );

  // Use calculated values
  const finalImpact = metrics.impact;
  const issScore = metrics.issScore;
  let calculatedSeverity = metrics.calculatedSeverity;
  let tssScore: number | null = null;
  const tssSeverityThresholds = await getTSSSeverityThresholds();

  if (subcategoryId) {
    const tssBoosts = await getTSSImpactBoostSettings();
    const subcategory = await get(
      `SELECT sc.id, sc.risk, sc.impact_affects
       FROM subcategories sc
       INNER JOIN categories c ON c.id = sc.category_id
       WHERE sc.id = ?
         AND sc.status = 'ACTIVE'
         AND UPPER(c.name) = UPPER(?)
       LIMIT 1`,
      [subcategoryId, category]
    );

    if (!subcategory) {
      throw new Error('Selected subcategory is invalid or inactive for this category');
    }

    tssScore = calculateTSS(impact, {
      risk: Number(subcategory.risk || 1),
      impactAffects: Boolean(Number(subcategory.impact_affects)),
    }, tssBoosts);
    calculatedSeverity = tssToSeverity(tssScore, tssSeverityThresholds);
  }

  const calculatedPriority = metrics.calculatedPriority;
  // Informational only; not used in metric calculations.
  const affectedSystem = typeof value.affected_system === 'string'
    ? value.affected_system.trim()
    : '';
  
  // ============== READ SLA FROM DATABASE ==============
  // Map priority to numeric value for database lookup
  const priorityNum = priorityToNumber(calculatedPriority);
  
  // Get SLA policy from database
  const slaPolicy = await get(
    'SELECT * FROM sla_policies WHERE priority = ? AND is_active = 1',
    [priorityNum]
  );
  
  // Use policy values or fallback to hardcoded defaults
  let slaResolutionHours = metrics.slaHours; // fallback
  if (slaPolicy && slaPolicy.resolution_hours) {
    slaResolutionHours = slaPolicy.resolution_hours;
  }

  const responseHours = slaPolicy?.response_hours || getDefaultResponseHours(priorityNum);
  const responseTimeSlaMinutes = Math.max(1, Math.round(responseHours * 60));
  
  // Calculate estimated_resolution_time in MINUTES from policy
  const estimatedResolutionTime = value.estimated_resolution_time || (slaResolutionHours * 60);
  
  // Recalculate SLA deadline using database policy hours and business hours config
  const businessHoursConfigId = resolveBusinessHoursConfigId(slaPolicy);
  const slaDeadline = await calculateSLADeadlineFromHours(slaResolutionHours, new Date(), businessHoursConfigId);
  const responseDeadline = await calculateSLADeadlineFromHours(responseHours, new Date(now), businessHoursConfigId);

  // Map calculated severity to SEV-X format
  const severityMap: Record<string, string> = {
    'CRITICAL': 'SEV-1',
    'HIGH': 'SEV-2',
    'MEDIUM': 'SEV-3',
    'LOW': 'SEV-4'
  };
  const finalSeverity = value.severity || severityMap[calculatedSeverity] || 'SEV-3';

  // ============== AUTO-ASSIGN LOGIC ==============
  // Rules:
  //   - Manager / Admin creates  → auto-assign directly (no approval needed)
  //   - Engineer creates         → direct or PENDING_APPROVAL based on tier enable toggle
  //   - End-user / USER creates  → PENDING_APPROVAL (manager must confirm)
  //
  // In PENDING_APPROVAL mode we still find the best engineer and store them

  let engineerUser: any = null;
  if (userId) {
    engineerUser = await get(`SELECT role, tier FROM users WHERE id = ?`, [userId]);
  }
  const creatorRole: string = engineerUser?.role ?? userRole ?? 'USER';
  const creatorTier: string = (engineerUser?.tier ?? '').toUpperCase();

  const directRoles = ['ADMIN', 'MANAGER'];
  const isDirectRole = directRoles.includes(creatorRole);
  const autoAssignSettings = await getAutoAssignSettings();
  const autoAssignEnabled = autoAssignSettings.enabled;
  const creatorTierKey = creatorTier as TierKey;
  const trustedEngineerCreator = creatorRole === 'ENGINEER' && Boolean(autoAssignSettings.tierEnabled[creatorTierKey]);
  const needsApproval = autoAssignEnabled && !isDirectRole && !trustedEngineerCreator;

  // Insert the incident first (no assignment yet)
  await run(
    `INSERT INTO incidents (
      id, title, description, severity, urgency, status, service_id, 
      assigned_to, created_by, detected_at, created_at, updated_at, 
      escalated, department, attachment_url, estimated_resolution_time,
      category, priority, impact, office_location, floor, room, cabin, tsi, workstation_id,
      subcategory_id, affected_system, iss_score, tss_score, calculated_severity, calculated_priority, sla_deadline,
      initial_severity, initial_priority, response_time_sla_minutes, response_deadline,
      assignment_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      value.title,
      value.description || null,
      finalSeverity,
      urgency,
      'OPEN',
      value.service_id || null,
      null, // will be set by auto-assign below
      userId || null,
      value.detected_at,
      now,
      now,
      0,
      value.department || null,
      value.attachment_url || null,
      estimatedResolutionTime,
      category,
      calculatedPriority,
      finalImpact,
      value.office_location || null,
      value.floor || null,
      value.room || null,
      value.cabin || null,
      value.tsi || null,
      value.workstation_id || null,
      subcategoryId,
      affectedSystem || null,
      issScore,
      tssScore,
      calculatedSeverity,
      calculatedPriority,
      slaDeadline,
      calculatedSeverity, // Store initial calculated values for audit
      calculatedPriority,
      responseTimeSlaMinutes,
      responseDeadline,
      needsApproval ? 'PENDING_APPROVAL' : 'MANUAL',
    ]
  );

  // Send notification to reporter/admins
  await sendIncidentNotifications(id, 'CREATED');

  const actorName = engineerUser?.full_name || userId || 'System';

  if (!autoAssignEnabled) {
    await addActivity(id, userId ?? null, actorName, 'AUTO_ASSIGN_DISABLED', 'Auto-assign is disabled in system settings. Incident requires manual assignment.');
  } else if (!needsApproval) {
    // Direct auto-assign
    await performAutoAssign(id, finalSeverity, userId ?? null, actorName);
  } else {
    // Find suggested engineer but don't assign yet – store as pending_assigned_to
    const best = await findBestEngineer(finalSeverity);
    if (best) {
      await run(
        `UPDATE incidents SET pending_assigned_to = ? WHERE id = ?`,
        [best.engineerId, id]
      );
    }
    // Notify managers about pending approval
    const managers = await all(
      `SELECT id FROM users WHERE role IN ('ADMIN', 'MANAGER') AND status = 'ACTIVE'`
    );
    for (const mgr of managers ?? []) {
      await createNotification(
        mgr.id,
        id,
        '📋 Assignment approval needed',
        `Incident "${value.title}" (${finalSeverity}) requires assignment approval. ${best ? 'A suggested engineer is ready.' : 'No engineer found – manual assignment needed.'}`
      );
    }
  }

  return {
    id,
    title: value.title,
    description: value.description,
    priority: calculatedPriority,
    impact: finalImpact,
    status: 'OPEN',
    urgency,
    category,
    subcategory_id: subcategoryId,
    severity: finalSeverity,
    calculated_severity: calculatedSeverity,
    calculated_priority: calculatedPriority,
    iss_score: issScore,
    tss_score: tssScore,
    sla_deadline: slaDeadline,
    response_time_sla_minutes: responseTimeSlaMinutes,
    response_deadline: responseDeadline,
    assignment_status: autoAssignEnabled ? (needsApproval ? 'PENDING_APPROVAL' : 'AUTO') : 'MANUAL',
    created_at: now,
  };
}

export async function updateIncident(id: string, payload: Partial<IncidentPayload>, userId?: string, userName?: string) {
  const incident = await getIncidentById(id);
  if (!incident) {
    throw new Error('Incident not found');
  }

  const { error, value } = incidentUpdateSchema.validate(payload);
  if (error) {
    throw new Error(error.details[0].message);
  }

  const now = new Date().toISOString();
  const updates: string[] = [];
  const values: any[] = [];

  // ============== AUTO-RECALCULATE ISS if any override ==============
  let issRecalculated = false;
  const urgencyChanged = value.urgency !== undefined && value.urgency !== incident.urgency;
  const normalizedIncomingCategory = value.category ? String(value.category).toUpperCase() : undefined;
  const categoryChanged = normalizedIncomingCategory !== undefined && normalizedIncomingCategory !== incident.category;
  const subcategoryChanged = value.subcategory_id !== undefined && (value.subcategory_id || null) !== (incident.subcategory_id || null);
  const impactChanged = value.impact !== undefined && value.impact !== incident.impact;
  const priorityChanged = value.priority !== undefined && value.priority !== incident.priority;
  const severityChanged = value.severity !== undefined && value.severity !== incident.severity;

  if (urgencyChanged || categoryChanged || subcategoryChanged || impactChanged || priorityChanged || severityChanged) {
    // Recalculate ISS with new values
    const newUrgency = value.urgency || incident.urgency || 'MEDIUM';
    const newCategory = (normalizedIncomingCategory || incident.category || 'OTHER').toUpperCase();
    const newImpact = value.impact || incident.impact || 'SINGLE_USER';
    const categoryRiskWeight = await getCategoryRiskWeight(newCategory);
    const issSettings = await getISSSettings();

    // Calculate metrics (affected_system informational only)
    const metrics = calculateIncidentMetrics(
      newUrgency,
      newCategory,
      newImpact,
      true,
      categoryRiskWeight,
      issSettings.weights,
      issSettings.thresholds
    );

    const effectiveSubcategoryId = value.subcategory_id !== undefined
      ? (value.subcategory_id || null)
      : (incident.subcategory_id || null);

    let calculatedSeverityFromTss = metrics.calculatedSeverity;
    let tssScore: number | null = null;
    let newSubcatName = value.subcategory_id ? 'Unknown' : 'None';
    const tssSeverityThresholds = await getTSSSeverityThresholds();

    if (effectiveSubcategoryId) {
      const tssBoosts = await getTSSImpactBoostSettings();
      const subcategory = await get(
        `SELECT sc.id, sc.name, sc.risk, sc.impact_affects
         FROM subcategories sc
         INNER JOIN categories c ON c.id = sc.category_id
         WHERE sc.id = ?
           AND sc.status = 'ACTIVE'
           AND UPPER(c.name) = UPPER(?)
         LIMIT 1`,
        [effectiveSubcategoryId, newCategory]
      );

      if (!subcategory) {
        throw new Error('Selected subcategory is invalid or inactive for this category');
      }

      tssScore = calculateTSS(newImpact, {
        risk: Number(subcategory.risk || 1),
        impactAffects: Boolean(Number(subcategory.impact_affects)),
      }, tssBoosts);
      calculatedSeverityFromTss = tssToSeverity(tssScore, tssSeverityThresholds);
      newSubcatName = subcategory.name || effectiveSubcategoryId;
    }

    // Update calculated values
    updates.push('iss_score = ?');
    values.push(metrics.issScore);
    updates.push('tss_score = ?');
    values.push(tssScore);
    updates.push('calculated_severity = ?');
    values.push(calculatedSeverityFromTss);
    updates.push('calculated_priority = ?');
    values.push(metrics.calculatedPriority);

    // Get SLA policy from database for proper deadline calculation
    const priorityNum = priorityToNumber(metrics.calculatedPriority);
    const slaPolicy = await get(
      'SELECT * FROM sla_policies WHERE priority = ? AND is_active = 1',
      [priorityNum]
    );
    const slaResolutionHours = slaPolicy?.resolution_hours || metrics.slaHours;
    const businessHoursConfigId = resolveBusinessHoursConfigId(slaPolicy);
    const newSlaDeadline = await calculateSLADeadlineFromHours(slaResolutionHours, new Date(incident.created_at), businessHoursConfigId);
    updates.push('sla_deadline = ?');
    values.push(newSlaDeadline);
    if (slaPolicy?.resolution_hours) {
      updates.push('estimated_resolution_time = ?');
      values.push(slaPolicy.resolution_hours * 60);
    }

    // Update response SLA timer only if first response has not been confirmed yet.
    if (!incident.response_time_confirmed_at) {
      const responseHours = slaPolicy?.response_hours || getDefaultResponseHours(priorityNum);
      const responseDeadline = await calculateSLADeadlineFromHours(responseHours, new Date(incident.created_at), businessHoursConfigId);
      updates.push('response_time_sla_minutes = ?');
      values.push(Math.max(1, Math.round(responseHours * 60)));
      updates.push('response_deadline = ?');
      values.push(responseDeadline);
    }
    const severityMap: Record<string, string> = {
      'CRITICAL': 'SEV-1',
      'HIGH': 'SEV-2',
      'MEDIUM': 'SEV-3',
      'LOW': 'SEV-4'
    };
    if (!value.severity) {
      updates.push('severity = ?');
      values.push(severityMap[calculatedSeverityFromTss] || 'SEV-3');
    }
    updates.push('priority = ?');
    values.push(metrics.calculatedPriority);

    issRecalculated = true;

    // Log recalculation
    if (userId) {
      await addActivity(
        id,
        userId,
        userName || 'System',
        'RECALCULATED',
        `ISS/TSS metrics auto-recalculated: ISS=${metrics.issScore}, TSS=${tssScore ?? '-'}, Severity=${calculatedSeverityFromTss}, Priority=${metrics.calculatedPriority}`
      );
      if (urgencyChanged) {
        await addActivity(
          id,
          userId,
          userName || 'System',
          'UPDATED',
          `Urgency changed from ${incident.urgency} to ${newUrgency}`
        );
      }
      if (categoryChanged) {
        await addActivity(
          id,
          userId,
          userName || 'System',
          'UPDATED',
          `Category changed from ${incident.category} to ${newCategory}`
        );
      }
      if (subcategoryChanged) {
        const oldSubcatName = (incident as any).subcategory_name || (incident as any).subcategory_id || 'None';
        await addActivity(
          id,
          userId,
          userName || 'System',
          'UPDATED',
          `Subcategory changed from ${oldSubcatName} to ${newSubcatName}`
        );
      }
      if (impactChanged) {
        await addActivity(
          id,
          userId,
          userName || 'System',
          'UPDATED',
          `Impact changed from ${incident.impact} to ${newImpact}`
        );
      }
      if (priorityChanged) {
        await addActivity(
          id,
          userId,
          userName || 'System',
          'UPDATED',
          `Priority changed from ${incident.priority} to ${value.priority}`
        );
      }
      if (severityChanged) {
        await addActivity(
          id,
          userId,
          userName || 'System',
          'UPDATED',
          `Severity changed from ${incident.severity} to ${value.severity}`
        );
      }
    }
  }

  const fieldMap: Record<string, string> = {
    title: 'title',
    description: 'description',
    severity: 'severity',
    status: 'status',
    priority: 'priority',
    impact: 'impact',
    assigned_to: 'assigned_to',
    estimated_resolution_time: 'estimated_resolution_time',
    resolution_notes: 'resolution_notes',
    urgency: 'urgency',
    category: 'category',
    subcategory_id: 'subcategory_id',
  };

  for (const [key, dbField] of Object.entries(fieldMap)) {
    if (value[key as keyof typeof value] !== undefined) {
      updates.push(`${dbField} = ?`);
      if (key === 'category') {
        values.push(String(value[key as keyof typeof value]).toUpperCase());
      } else if (key === 'subcategory_id') {
        values.push(value[key as keyof typeof value] || null);
      } else {
        values.push(value[key as keyof typeof value]);
      }
    }
  }

  // Handle severity changes with activity log and notifications
  if (value.severity !== undefined && value.severity !== incident.severity) {
    const oldSeverity = incident.severity || 'Unassigned';
    const newSeverity = value.severity || 'Unassigned';
    
    if (userId) {
      await addActivity(id, userId, userName || 'Unknown', 'UPDATED', `Severity changed from ${oldSeverity} to ${newSeverity}`);
    }
    
    // Send notifications for severity change
    await sendIncidentNotifications(id, 'SEVERITY_CHANGED', incident.severity, value.severity, userId);

    // Re-run auto-assign engine whenever the severity changes on an auto/approved incident.
    // This covers: manager override Sev → release old load → re-assign or pend approval.
    const wasAutoAssigned = ['AUTO', 'APPROVED'].includes(incident.assignment_status ?? '');
    const autoAssignSettings = await getAutoAssignSettings();
    if (wasAutoAssigned && incident.assigned_to) {
      // Release old load immediately (old severity cost)
      const oldCost = await getIncidentCostForSeverity(incident.severity as string);
      await run(
        `UPDATE users SET load_points = MAX(0, COALESCE(load_points, 0) - ?) WHERE id = ?`,
        [oldCost, incident.assigned_to]
      );
      // Clear current assignment — auto-assign engine will set it fresh
      await run(
        `UPDATE incidents SET assigned_to = NULL, assignment_status = 'MANUAL', pending_assigned_to = NULL, updated_at = ? WHERE id = ?`,
        [now, id]
      );
      // Perform fresh load-balanced assignment with new severity only when feature is enabled.
      if (autoAssignSettings.enabled) {
        await performAutoAssign(id, newSeverity, userId ?? null, userName || 'System');
      }
    } else if (incident.assignment_status === 'PENDING_APPROVAL') {
      if (autoAssignSettings.enabled) {
        // Re-compute suggestion with updated severity
        const best = await findBestEngineer(newSeverity);
        await run(
          `UPDATE incidents SET pending_assigned_to = ?, updated_at = ? WHERE id = ?`,
          [best?.engineerId ?? null, now, id]
        );
        // Notify managers that suggestion changed
        const managers = await all(
          `SELECT id FROM users WHERE role IN ('ADMIN', 'MANAGER') AND status = 'ACTIVE'`
        );
        for (const mgr of managers ?? []) {
          await createNotification(
            mgr.id,
            id,
            '🔄 Assignment suggestion updated',
            `Severity for incident "${incident.title}" was changed to ${newSeverity}. Assignment suggestion has been recalculated.`
          );
        }
      } else {
        await run(
          `UPDATE incidents SET assignment_status = 'MANUAL', pending_assigned_to = NULL, updated_at = ? WHERE id = ?`,
          [now, id]
        );
      }
    }
  }

  // Handle assignment changes with activity log
  if (value.assigned_to !== undefined && value.assigned_to !== incident.assigned_to) {
    const targetSeverity = String(value.severity || incident.severity || 'SEV-4').toUpperCase();
    if (value.assigned_to) {
      await validateEngineerAssignmentCapacity(String(value.assigned_to), targetSeverity, { enforceTier: false });
    }

    const oldEngineer = incident.assigned_to_name || 'Unassigned';
    
    // Get new engineer name
    let newEngineerName = 'Unknown';
    if (value.assigned_to) {
      const engineers = await all(`SELECT full_name FROM users WHERE id = ?`, [value.assigned_to]);
      if (engineers.length > 0) {
        newEngineerName = engineers[0].full_name || 'Unknown';
      }
    }
    
    const formattedDate = new Date(now).toLocaleDateString('en-GB');
    const formattedTime = new Date(now).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const dateTimeStr = `${formattedDate} ${formattedTime}`;
    
    const reassignDescription = oldEngineer !== 'Unassigned' 
      ? `Reassigned from ${oldEngineer} to ${newEngineerName} by ${userName || 'Manager'} on ${dateTimeStr}`
      : `Assigned to ${newEngineerName} by ${userName || 'Manager'} on ${dateTimeStr}`;
    
    if (userId) {
      await addActivity(id, userId, userName || 'Unknown', 'REASSIGNED', reassignDescription);
    }
  }

  // Handle timer tracking for status changes
  if (value.status !== undefined && value.status !== incident.status) {
    const oldStatus = incident.status;
    const newStatus = value.status;

    // Auto-fill pending reason for quick status updates that do not send a reason.
    // NOTE: PENDING does NOT pause SLA or response time — the clock keeps ticking.
    if (newStatus === 'PENDING') {
      const reason = (value.pending_reason || 'Pending - awaiting next action').trim();
      updates.push('pending_reason = ?');
      values.push(reason);

      if (userId) {
        await addActivity(id, userId, userName || 'Unknown', 'STATUS_CHANGED', `Status changed from ${oldStatus} to ${newStatus}. Reason: ${reason}`);
      }
    }

    // Timer logic: IN_PROGRESS starts the timer
    if (newStatus === 'IN_PROGRESS' && oldStatus !== 'IN_PROGRESS') {
      // Only set work_started_at if it's not already set (preserve original start time on reopen)
      if (!incident.work_started_at) {
        updates.push('work_started_at = ?');
        values.push(now);
      }
      // Clear any paused state
      if (incident.paused_at) {
        updates.push('paused_at = ?');
        values.push(null);
      }
      // Clear work_completed_at when resuming
      updates.push('work_completed_at = ?');
      values.push(null);
    }

    // Work-timer logic: PENDING pauses the work timer (not the SLA clock — SLA keeps ticking)
    if (newStatus === 'PENDING' && oldStatus === 'IN_PROGRESS') {
      updates.push('paused_at = ?');
      values.push(now);
    }

    // Timer logic: Resume from PENDING
    if (newStatus === 'IN_PROGRESS' && oldStatus === 'PENDING' && incident.paused_at) {
      // Calculate paused duration
      const pausedTime = new Date(now).getTime() - new Date(incident.paused_at).getTime();
      const pausedMinutes = Math.round(pausedTime / 60000);
      const currentPaused = incident.total_paused_minutes || 0;
      updates.push('total_paused_minutes = ?');
      values.push(currentPaused + pausedMinutes);
      updates.push('paused_at = ?');
      values.push(null);
    }

    // Timer logic: RESOLVED or CANCELLED stops the timer
    if ((newStatus === 'RESOLVED' || newStatus === 'CANCELLED') && incident.work_started_at) {
      updates.push('work_completed_at = ?');
      values.push(now);

      // Calculate actual resolution time
      const startTime = new Date(incident.work_started_at).getTime();
      const endTime = new Date(now).getTime();
      let totalMinutes = Math.round((endTime - startTime) / 60000);

      // Subtract paused time
      const pausedMinutes = incident.total_paused_minutes || 0;
      totalMinutes = Math.max(1, totalMinutes - pausedMinutes);

      updates.push('resolution_time = ?');
      values.push(totalMinutes);
      updates.push('resolved_at = ?');
      values.push(now);
      
      // Calculate and save SLA percent at resolve using business-hours-aware deadline consumption.
      let slaPercentAtResolve = 0;
      if (incident.sla_deadline && incident.created_at) {
        const priorityNumber = priorityToNumber(incident.priority);
        const slaPolicy = await get(
          'SELECT resolution_hours, business_hours_only, business_hours_config_id FROM sla_policies WHERE priority = ? AND is_active = 1',
          [priorityNumber]
        );
        const businessHoursConfigId = resolveBusinessHoursConfigId(slaPolicy);
        const resolutionHours = Number(slaPolicy?.resolution_hours);
        const targetMinutes = Number.isFinite(resolutionHours) && resolutionHours > 0
          ? Math.round(resolutionHours * 60)
          : Number(incident.estimated_resolution_time || 0);

        if (targetMinutes > 0) {
          const consumption = await calculateConsumptionFromDeadline(
            incident.sla_deadline,
            targetMinutes,
            new Date(now),
            businessHoursConfigId
          );
          slaPercentAtResolve = consumption.percentConsumed;
        }
      }
      updates.push('sla_percent_at_resolve = ?');
      values.push(Math.round(slaPercentAtResolve * 100) / 100);

      // Add activity log for status change
      if (userId) {
        await addActivity(id, userId, userName || 'Unknown', 'STATUS_CHANGED', `Status changed from ${oldStatus} to ${newStatus}. Resolution time: ${totalMinutes} minutes.`);
      }
    } else if ((newStatus === 'RESOLVED' || newStatus === 'CANCELLED') && !incident.work_started_at) {
      // Handle direct RESOLVED/CANCELED without work timer - still save SLA percent and resolved_at
      updates.push('resolved_at = ?');
      values.push(now);
      
      let slaPercentAtResolve = 0;
      if (incident.sla_deadline && incident.created_at) {
        const priorityNumber = priorityToNumber(incident.priority);
        const slaPolicy = await get(
          'SELECT resolution_hours, business_hours_only, business_hours_config_id FROM sla_policies WHERE priority = ? AND is_active = 1',
          [priorityNumber]
        );
        const businessHoursConfigId = resolveBusinessHoursConfigId(slaPolicy);
        const resolutionHours = Number(slaPolicy?.resolution_hours);
        const targetMinutes = Number.isFinite(resolutionHours) && resolutionHours > 0
          ? Math.round(resolutionHours * 60)
          : Number(incident.estimated_resolution_time || 0);

        if (targetMinutes > 0) {
          const consumption = await calculateConsumptionFromDeadline(
            incident.sla_deadline,
            targetMinutes,
            new Date(now),
            businessHoursConfigId
          );
          slaPercentAtResolve = consumption.percentConsumed;
        }
      }
      updates.push('sla_percent_at_resolve = ?');
      values.push(Math.round(slaPercentAtResolve * 100) / 100);
      
      if (userId) {
        await addActivity(id, userId, userName || 'Unknown', 'STATUS_CHANGED', `Status changed from ${oldStatus} to ${newStatus}`);
      }
    } else if (value.status !== undefined && newStatus !== 'PENDING') {
      // Add activity log for status change (without resolution time)
      if (userId) {
        await addActivity(id, userId, userName || 'Unknown', 'STATUS_CHANGED', `Status changed from ${oldStatus} to ${newStatus}`);
      }
    }
  }

  updates.push('updated_at = ?');
  values.push(now);
  values.push(id);

  await run(`UPDATE incidents SET ${updates.join(', ')} WHERE id = ?`, values);

  // Send notifications for changes
  if (value.assigned_to !== undefined) {
    await sendIncidentNotifications(id, 'ASSIGNED', incident.assigned_to, value.assigned_to);
  }
  if (value.status !== undefined && value.status !== incident.status) {
    await sendIncidentNotifications(id, 'STATUS_CHANGED', incident.status, value.status);
  }

  return { id, ...value, updated_at: now };
}

export async function completeIncident(id: string, resolutionNotes: string, resolutionTime: number, userId?: string, userName?: string) {
  const incident = await getIncidentById(id);
  if (!incident) {
    throw new Error('Incident not found');
  }

  const now = new Date().toISOString();
  // Calculate current SLA percentage using business-hours-aware deadline consumption.
  let slaPercentAtResolve = 0;
  if (incident.sla_deadline && incident.created_at) {
    const priorityNumber = priorityToNumber(incident.priority);
    const slaPolicy = await get(
      'SELECT resolution_hours, business_hours_only, business_hours_config_id FROM sla_policies WHERE priority = ? AND is_active = 1',
      [priorityNumber]
    );
    const businessHoursConfigId = resolveBusinessHoursConfigId(slaPolicy);
    const resolutionHours = Number(slaPolicy?.resolution_hours);
    const targetMinutes = Number.isFinite(resolutionHours) && resolutionHours > 0
      ? Math.round(resolutionHours * 60)
      : Number(incident.estimated_resolution_time || 0);

    if (targetMinutes > 0) {
      const consumption = await calculateConsumptionFromDeadline(
        incident.sla_deadline,
        targetMinutes,
        new Date(now),
        businessHoursConfigId
      );
      slaPercentAtResolve = consumption.percentConsumed;
    }
  }
  
  // Ensure we don't lose precision - allow >100% for breached incidents
  slaPercentAtResolve = Math.round(slaPercentAtResolve * 100) / 100;

  // Release engineer load points for auto-assigned incidents
  await releaseEngineerLoad(id);

  await run(
    `UPDATE incidents SET status = ?, resolution_notes = ?, resolution_time = ?, resolved_at = ?, work_completed_at = ?, sla_percent_at_resolve = ?, updated_at = ? WHERE id = ?`,
    ['RESOLVED', resolutionNotes, resolutionTime, now, now, slaPercentAtResolve, now, id]
  );

  // Add activity log
  if (userId) {
    await addActivity(id, userId, userName || 'Unknown', 'COMPLETED', `Incident resolved. Resolution time: ${resolutionTime} minutes. Notes: ${resolutionNotes || 'None'}`);
  }

  // Send notification to reporter
  await sendIncidentNotifications(id, 'STATUS_CHANGED', 'OPEN', 'RESOLVED');

  return { id, status: 'RESOLVED', resolution_notes: resolutionNotes, resolution_time: resolutionTime, resolved_at: now };
}

export async function getEngineers() {
  const autoAssignSettings = await getAutoAssignSettings();
  const severityPoints = await getSeverityPointsConfig();
  
  const engineers = await all(
    `SELECT u.id,
            u.username,
            u.email,
            u.full_name,
            u.phone,
            u.job_title,
            u.department,
            u.tier,
            COALESCE(u.auto_assign_enabled, 1) as auto_assign_enabled,
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
              WHERE i.assigned_to = u.id
                AND i.status NOT IN ('RESOLVED', 'Canceled')
            ), 0) as load_points,
            COALESCE(u.points_limit, 0) as points_limit,
            COALESCE((
              SELECT COUNT(*)
              FROM incidents i
              WHERE i.assigned_to = u.id
                AND i.status NOT IN ('RESOLVED', 'Canceled')
            ), 0) as active_incidents
     FROM users u
     WHERE u.role = 'ENGINEER' AND u.status = 'ACTIVE'
     ORDER BY u.full_name ASC`,
    [
      severityPoints['SEV-1'] ?? SEV_POINTS['SEV-1'],
      severityPoints['SEV-2'] ?? SEV_POINTS['SEV-2'],
      severityPoints['SEV-3'] ?? SEV_POINTS['SEV-3'],
      severityPoints['SEV-4'] ?? SEV_POINTS['SEV-4'],
      severityPoints['SEV-4'] ?? SEV_POINTS['SEV-4'],
    ]
  );
  
  return engineers.map((eng: any) => {
    const tier = String(eng.tier ?? '').toUpperCase() as TierKey;
    const effectiveLimit = Number(eng.points_limit) > 0 
      ? Number(eng.points_limit) 
      : autoAssignSettings.tierLimits[tier] ?? 100;
    return { ...eng, points_limit: effectiveLimit };
  });
}

/**
 * Manager/Admin approves a PENDING_APPROVAL assignment.
 * Confirms the suggested engineer (or a manually chosen one), performs auto-assign, and marks incident as AUTO.
 */
export async function approveAssignment(
  incidentId: string,
  userId: string,
  userName: string,
  userRole: string,
  overrideEngineerId?: string | null
): Promise<any> {
  const autoAssignSettings = await getAutoAssignSettings();
  if (!autoAssignSettings.enabled) {
    throw new Error('Auto-assign is disabled in system settings');
  }

  if (!['ADMIN', 'MANAGER'].includes(userRole)) {
    throw new Error('Only managers and admins can approve assignments');
  }

  const incident = await getIncidentById(incidentId);
  if (!incident) throw new Error('Incident not found');

  if (incident.assignment_status !== 'PENDING_APPROVAL') {
    throw new Error('Incident is not pending assignment approval');
  }

  const severity: string = incident.severity ?? 'SEV-4';
  const incidentCost = await getIncidentCostForSeverity(severity);
  const now = new Date().toISOString();

  const assignEngineer = async (engineerId: string, label: string) => {
    await run(
      `UPDATE users SET load_points = COALESCE(load_points, 0) + ? WHERE id = ?`,
      [incidentCost, engineerId]
    );
    await run(
      `UPDATE incidents SET assigned_to = ?, assignment_status = 'APPROVED', pending_assigned_to = NULL, updated_at = ? WHERE id = ?`,
      [engineerId, now, incidentId]
    );
    await addActivity(incidentId, userId, userName, 'APPROVED',
      `Assignment approved by ${userName}. ${label}`);
    await sendIncidentNotifications(incidentId, 'ASSIGNED', null, engineerId);
  };

  if (overrideEngineerId) {
    // Manager chose a specific engineer manually — respect choice but still track load
    await validateEngineerAssignmentCapacity(overrideEngineerId, severity, { enforceTier: false });
    await assignEngineer(overrideEngineerId, 'Manually assigned to chosen engineer.');
  } else {
    const suggestedId: string | null = incident.pending_assigned_to || null;
    if (suggestedId) {
      // Check the suggestion still has capacity (situation may have changed)
      const eng = await get(
        `SELECT COALESCE(load_points, 0) AS points_used, COALESCE(points_limit, 0) AS points_limit_raw, tier
         FROM users WHERE id = ? AND status = 'ACTIVE'`,
        [suggestedId]
      );
      const limit = eng ? resolvePointsLimit({ points_limit: eng.points_limit_raw, tier: eng.tier }, autoAssignSettings) : 0;
      const stillHasCapacity = eng && (limit - Number(eng.points_used)) >= incidentCost;

      if (stillHasCapacity) {
        await assignEngineer(suggestedId, 'Engineer confirmed from suggestion.');
      } else {
        // Suggestion no longer valid — run fresh auto-assign
        const result = await performAutoAssign(incidentId, severity, userId, userName);
        if (result === 'no_capacity') {
          throw new Error('No available engineer found. Please assign manually.');
        }
        await run(
          `UPDATE incidents SET assignment_status = 'APPROVED', pending_assigned_to = NULL, updated_at = ? WHERE id = ?`,
          [now, incidentId]
        );
        await addActivity(incidentId, userId, userName, 'APPROVED',
          `Assignment approved by ${userName}. Suggestion was stale; re-assigned via load balancer.`);
      }
    } else {
      // No suggestion — run auto-assign now
      const result = await performAutoAssign(incidentId, severity, userId, userName);
      if (result === 'no_capacity') {
        throw new Error('No available engineer found. Please assign manually.');
      }
      await run(
        `UPDATE incidents SET assignment_status = 'APPROVED', pending_assigned_to = NULL, updated_at = ? WHERE id = ?`,
        [now, incidentId]
      );
      await addActivity(incidentId, userId, userName, 'APPROVED',
        `Assignment approved by ${userName}. Auto-assigned to best available engineer.`);
    }
  }

  return getIncidentById(incidentId);
}

/**
 * Trigger a fresh auto-assign for an incident (e.g. after Sev override confirmed by manager).
 * Releases old engineer's points first if the incident was previously auto/approved-assigned.
 */
export async function triggerAutoAssign(
  incidentId: string,
  userId: string,
  userName: string
): Promise<any> {
  const autoAssignSettings = await getAutoAssignSettings();
  if (!autoAssignSettings.enabled) {
    throw new Error('Auto-assign is disabled in system settings');
  }

  const incident = await getIncidentById(incidentId);
  if (!incident) throw new Error('Incident not found');

  // Release old assignment load
  await releaseEngineerLoad(incidentId);

  // Reset assignment fields
  await run(
    `UPDATE incidents SET assigned_to = NULL, assignment_status = 'MANUAL', pending_assigned_to = NULL, updated_at = ? WHERE id = ?`,
    [new Date().toISOString(), incidentId]
  );

  const result = await performAutoAssign(incidentId, incident.severity, userId, userName);
  // performAutoAssign already sets assignment_status = 'AUTO' on success
  return getIncidentById(incidentId);
}

export async function deleteIncident(id: string) {
  const incident = await getIncidentById(id);
  if (!incident) {
    throw new Error('Incident not found');
  }

  // Release engineer load if auto-assigned
  await releaseEngineerLoad(id);

  await run(`DELETE FROM incidents WHERE id = ?`, [id]);
  return { id, deleted: true };
}

// ============================================================================
// NOTIFICATIONS
// ============================================================================

export async function createNotification(
  userId: string,
  incidentId: string,
  subject: string,
  message: string,
  channel: string = 'IN_APP'
) {
  const id = uuidv4();
  const now = new Date().toISOString();
  
  await run(
    `INSERT INTO notifications (id, user_id, incident_id, channel, subject, message, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'UNREAD', ?)`,
    [id, userId, incidentId, channel, subject, message, now]
  );

  // Mirror in-app notifications to EMAIL queue when explicitly enabled.
  // Email dispatch is handled by downstream workers/integrations.
  if (channel === 'IN_APP') {
    const emailEnabled = await getBooleanSystemSetting('notifications.email_enabled', false);
    if (emailEnabled) {
      const emailId = uuidv4();
      await run(
        `INSERT INTO notifications (id, user_id, incident_id, channel, subject, message, status, created_at)
         VALUES (?, ?, ?, 'EMAIL', ?, ?, 'PENDING', ?)`,
        [emailId, userId, incidentId, subject, message, now]
      );
    }
  }
  
  return { id, user_id: userId, incident_id: incidentId, subject, message, status: 'UNREAD' };
}

export async function sendIncidentNotifications(incidentId: string, action: string, oldValue?: any, newValue?: any, actorUserId?: string) {
  const incident = await getIncidentById(incidentId);
  if (!incident) return;

  const getUserRole = async (userId?: string | null): Promise<string | null> => {
    if (!userId) return null;
    const user = await get(`SELECT role FROM users WHERE id = ?`, [userId]);
    return user?.role || null;
  };

  const isEndUserRole = (role?: string | null) => role === 'USER' || role === 'VIEWER';

  // Get engineer name if assigned
  let engineerName = '';
  if (newValue) {
    const engineers = await all(`SELECT full_name FROM users WHERE id = ?`, [newValue]);
    if (engineers.length > 0) {
      engineerName = engineers[0].full_name || '';
    }
  }

  switch (action) {
    case 'CREATED':
      // Notify only admins and managers when a new incident is created.
      const adminsAndManagers = await all(
        `SELECT id FROM users WHERE role IN ('ADMIN', 'MANAGER') AND status = 'ACTIVE'`
      );

      for (const admin of adminsAndManagers) {
        await createNotification(
          admin.id,
          incidentId,
          'New Incident Created',
          `A new incident "${incident.title}" (Priority: ${incident.priority || 'MEDIUM'}) has been created and needs assignment.`
        );
      }
      break;

    case 'ASSIGNED':
      // Notify the assigned engineer.
      const assigneeRole = await getUserRole(newValue);
      if (newValue && assigneeRole === 'ENGINEER' && newValue !== incident.created_by) {
        await createNotification(
          newValue,
          incidentId,
          'New Incident Assigned',
          `You have been assigned to incident "${incident.title}" (Priority: ${incident.priority || 'MEDIUM'}).`
        );
      }

      // End users are notified only when an engineer is assigned to their incident.
      const creatorRole = await getUserRole(incident.created_by);
      if (incident.created_by && isEndUserRole(creatorRole)) {
        await createNotification(
          incident.created_by,
          incidentId,
          'Engineer Assigned',
          `Engineer ${engineerName || 'from support'} has been assigned to your incident "${incident.title}".`
        );
      }

      // Admins should always see assignment events.
      const admins = await all(
        `SELECT id FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE'`
      );

      for (const admin of admins) {
        if (!admin?.id || admin.id === newValue) continue;
        await createNotification(
          admin.id,
          incidentId,
          'Engineer Assigned',
          `Engineer ${engineerName || 'assigned engineer'} was assigned to incident "${incident.title}".`
        );
      }
      break;

    case 'STATUS_CHANGED':
      if (newValue === 'RESOLVED') {
        const creatorRole = await getUserRole(incident.created_by);
        if (incident.created_by && isEndUserRole(creatorRole)) {
          await createNotification(
            incident.created_by,
            incidentId,
            'Incident RESOLVED',
            `Your incident "${incident.title}" has been RESOLVED.`
          );
        }

        const stakeholders = await all(
          `SELECT id, role FROM users WHERE role IN ('ADMIN', 'MANAGER') AND status = 'ACTIVE'`
        );
        for (const user of stakeholders) {
          if (!user?.id) continue;
          await createNotification(
            user.id,
            incidentId,
            `Incident ${newValue}`,
            `Incident "${incident.title}" has been RESOLVED.`
          );
        }
      }

      if (newValue === 'OPEN') {
        if (incident.assigned_to) {
          const assigneeRole = await getUserRole(incident.assigned_to);
          if (assigneeRole === 'ENGINEER') {
            await createNotification(
              incident.assigned_to,
              incidentId,
              'Incident REOPENED',
              `Incident "${incident.title}" has been re-opened and is back in your queue.`
            );
          }
        }

        const stakeholders = await all(
          `SELECT id FROM users WHERE role IN ('ADMIN', 'MANAGER') AND status = 'ACTIVE'`
        );
        for (const user of stakeholders) {
          if (!user?.id) continue;
          await createNotification(
            user.id,
            incidentId,
            'Incident REOPENED',
            `Incident "${incident.title}" has been re-opened.`
          );
        }
      }
      break;

    case 'SEVERITY_CHANGED':
      // Notify ALL relevant users (creator, assigned engineer, all ADMIN/MANAGER) except the actor
      const notifiedUserIds = new Set<string>();
      
      // Notify creator (if not the actor)
      if (incident.created_by && incident.created_by !== actorUserId) {
        notifiedUserIds.add(incident.created_by);
        await createNotification(
          incident.created_by,
          incidentId,
          'Severity Changed',
          `The severity of your incident "${incident.title}" has been changed from ${oldValue || 'Unassigned'} to ${newValue || 'Unassigned'}.`
        );
      }
      
      // Notify assigned engineer (if exists and not the actor)
      if (incident.assigned_to && incident.assigned_to !== actorUserId && !notifiedUserIds.has(incident.assigned_to)) {
        notifiedUserIds.add(incident.assigned_to);
        await createNotification(
          incident.assigned_to,
          incidentId,
          'Severity Changed',
          `The severity of incident "${incident.title}" has been changed from ${oldValue || 'Unassigned'} to ${newValue || 'Unassigned'}.`
        );
      }
      
      // Notify all ADMIN and MANAGER users (except the actor)
      const adminManagers = await all(
        `SELECT id FROM users WHERE role IN ('ADMIN', 'MANAGER') AND id != ?`,
        [actorUserId || '']
      );
      
      for (const user of adminManagers) {
        if (!notifiedUserIds.has(user.id)) {
          notifiedUserIds.add(user.id);
          await createNotification(
            user.id,
            incidentId,
            'Severity Changed',
            `The severity of incident "${incident.title}" has been changed from ${oldValue || 'Unassigned'} to ${newValue || 'Unassigned'}.`
          );
        }
      }
      break;

    case 'METRICS_OVERRIDDEN':
      const recipients = new Set<string>();

      if (incident.created_by && incident.created_by !== actorUserId) {
        const creatorRoleForOverride = await getUserRole(incident.created_by);
        if (!isEndUserRole(creatorRoleForOverride)) {
          recipients.add(incident.created_by);
        }
      }

      if (incident.assigned_to && incident.assigned_to !== actorUserId) {
        recipients.add(incident.assigned_to);
      }

      const stakeholders = await all(
        `SELECT id FROM users WHERE role IN ('ADMIN', 'MANAGER') AND status = 'ACTIVE' AND id != ?`,
        [actorUserId || '']
      );

      for (const user of stakeholders) {
        if (user?.id) {
          recipients.add(user.id);
        }
      }

      for (const recipientId of recipients) {
        await createNotification(
          recipientId,
          incidentId,
          'Incident Metrics Updated',
          `Incident "${incident.title}" had ISS-derived metrics overridden. New severity: ${newValue || incident.severity}.`
        );
      }
      break;
  }
}

// Helper function to get incident statistics
export async function getIncidentStats() {
  const stats = await all(`
    SELECT 
      status,
      priority,
      COUNT(*) as count
    FROM incidents 
    GROUP BY status, priority
  `);

  const byStatus: Record<string, number> = {};
  const byPriority: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };

  const normalizePriorityBucket = (rawPriority?: string | null): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' => {
    const normalized = String(rawPriority || '').trim().toUpperCase();
    if (normalized === 'CRITICAL' || normalized === 'P1' || normalized === 'PRY1' || normalized === '1') return 'CRITICAL';
    if (normalized === 'HIGH' || normalized === 'P2' || normalized === 'PRY2' || normalized === '2') return 'HIGH';
    if (normalized === 'MEDIUM' || normalized === 'P3' || normalized === 'PRY3' || normalized === '3') return 'MEDIUM';
    return 'LOW';
  };

  stats.forEach((s: any) => {
    byStatus[s.status] = (byStatus[s.status] || 0) + s.count;
    const bucket = normalizePriorityBucket(s.priority);
    byPriority[bucket] = (byPriority[bucket] || 0) + (s.count || 0);
  });

  return { byStatus, byPriority };
}

// ============================================================================
// NOTIFICATION FUNCTIONS
// ============================================================================

// Get notifications for a user
export async function getUserNotifications(userId: string, limit: number = 50) {
  const notifications = await all(
    `SELECT n.*, i.title as incident_title
     FROM notifications n
     LEFT JOIN incidents i ON i.id = n.incident_id
     WHERE n.user_id = ? AND n.channel = 'IN_APP'
     ORDER BY n.created_at DESC
     LIMIT ?`,
    [userId, limit]
  );
  return notifications;
}

// Get unread notification count
export async function getUnreadNotificationCount(userId: string) {
  const result = await all(
    `SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND channel = 'IN_APP' AND status = 'UNREAD'`,
    [userId]
  );
  return result[0]?.count || 0;
}

// Mark notification as read
export async function markNotificationAsRead(notificationId: string, userId: string) {
  await run(
    `UPDATE notifications SET status = 'READ' WHERE id = ? AND user_id = ?`,
    [notificationId, userId]
  );
  return { id: notificationId, status: 'READ' };
}

// Clear all notifications for a user
export async function clearAllNotifications(userId: string) {
  await run(
    `DELETE FROM notifications WHERE user_id = ? AND channel = 'IN_APP'`,
    [userId]
  );
  return { cleared: true };
}

// ============================================================================
// STATISTICS FUNCTIONS
// ============================================================================

export async function getIncidentTrend(startDate?: string, endDate?: string) {
  // Default to last 7 days if no dates provided
  const end = endDate ? new Date(endDate) : new Date();
  const start = startDate ? new Date(startDate) : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  // Get incidents grouped by date
  const incidents = await all(
    `SELECT date(created_at) as date, COUNT(*) as count 
     FROM incidents 
     WHERE created_at >= ? AND created_at <= ?
     GROUP BY date(created_at)
     ORDER BY date ASC`,
    [start.toISOString(), end.toISOString()]
  );
  
  // Fill in missing dates with 0
  const result: { date: string; count: number }[] = [];
  const incidentMap = new Map(incidents.map((i: any) => [i.date, i.count]));
  
  const current = new Date(start);
  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0];
    result.push({
      date: dateStr,
      count: incidentMap.get(dateStr) || 0
    });
    current.setDate(current.getDate() + 1);
  }
  
  return result;
}

export async function getSeverityStats(startDate?: string, endDate?: string) {
  // Default to last 7 days if no dates provided
  const end = endDate ? new Date(endDate) : new Date();
  const start = startDate ? new Date(startDate) : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  const stats = await all(
    `SELECT priority, COUNT(*) as count 
     FROM incidents 
     WHERE created_at >= ? AND created_at <= ?
     GROUP BY priority`,
    [start.toISOString(), end.toISOString()]
  );

  const normalizePriorityBucket = (rawPriority?: string | null): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' => {
    const normalized = String(rawPriority || '').trim().toUpperCase();
    if (normalized === 'CRITICAL' || normalized === 'P1' || normalized === 'PRY1' || normalized === '1') return 'CRITICAL';
    if (normalized === 'HIGH' || normalized === 'P2' || normalized === 'PRY2' || normalized === '2') return 'HIGH';
    if (normalized === 'MEDIUM' || normalized === 'P3' || normalized === 'PRY3' || normalized === '3') return 'MEDIUM';
    return 'LOW';
  };
  
  const result: Record<string, number> = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0
  };
  
  stats.forEach((s: any) => {
    const bucket = normalizePriorityBucket(s.priority);
    result[bucket] = (result[bucket] || 0) + (s.count || 0);
  });
  
  return result;
}

export async function getDashboardStats(startDate?: string, endDate?: string) {
  const end = endDate ? new Date(endDate) : new Date();
  const start = startDate ? new Date(startDate) : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  
  // Total incidents in period
  const totalResult = await all(
    `SELECT COUNT(*) as count FROM incidents WHERE created_at >= ? AND created_at <= ?`,
    [startIso, endIso]
  );
  const total = totalResult[0]?.count || 0;
  
  // By status
  const statusResult = await all(
    `SELECT status, COUNT(*) as count FROM incidents WHERE created_at >= ? AND created_at <= ? GROUP BY status`,
    [startIso, endIso]
  );
  const byStatus: Record<string, number> = {};
  statusResult.forEach((s: any) => {
    byStatus[s.status] = s.count;
  });
  
  // By priority
  const priorityResult = await all(
    `SELECT priority, COUNT(*) as count FROM incidents WHERE created_at >= ? AND created_at <= ? GROUP BY priority`,
    [startIso, endIso]
  );
  const normalizePriorityBucket = (rawPriority?: string | null): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' => {
    const normalized = String(rawPriority || '').trim().toUpperCase();
    if (normalized === 'CRITICAL' || normalized === 'P1' || normalized === 'PRY1' || normalized === '1') return 'CRITICAL';
    if (normalized === 'HIGH' || normalized === 'P2' || normalized === 'PRY2' || normalized === '2') return 'HIGH';
    if (normalized === 'MEDIUM' || normalized === 'P3' || normalized === 'PRY3' || normalized === '3') return 'MEDIUM';
    return 'LOW';
  };
  const byPriority: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  priorityResult.forEach((s: any) => {
    const bucket = normalizePriorityBucket(s.priority);
    byPriority[bucket] = (byPriority[bucket] || 0) + (s.count || 0);
  });
  
  // Trend data
  const trend = await getIncidentTrend(startDate, endDate);
  
  return {
    total,
    byStatus,
    byPriority,
    trend,
    period: {
      start: startIso,
      end: endIso
    }
  };
}

// ============================================================================
// ACTIVITY LOG FUNCTIONS
// ============================================================================

export async function addActivity(incidentId: string, userId: string | null, userName: string | null, action: string, description: string) {
  const id = uuidv4();
  const now = new Date().toISOString();
  
  await run(
    `INSERT INTO incident_activities (id, incident_id, user_id, user_name, action, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, incidentId, userId, userName, action, description, now]
  );
  
  return { id, incident_id: incidentId, user_id: userId, user_name: userName, action, description, created_at: now };
}

export async function getIncidentActivities(incidentId: string) {
  const activities = await all(
    `SELECT * FROM incident_activities WHERE incident_id = ? ORDER BY created_at DESC`,
    [incidentId]
  );
  return activities;
}

export async function getIncidentAuditChanges(start?: string, end?: string) {
  const where: string[] = [
    `(LOWER(ia.description) LIKE '% changed from % to %' OR LOWER(ia.description) LIKE '% overridden from % to %')`,
  ];
  const values: any[] = [];

  if (start) {
    where.push('ia.created_at >= ?');
    values.push(start);
  }

  if (end) {
    where.push('ia.created_at <= ?');
    values.push(end);
  }

  const activities = await all(
    `SELECT
      ia.id,
      ia.incident_id,
      ia.user_id,
      ia.user_name,
      ia.action,
      ia.description,
      ia.created_at,
      i.title AS incident_title
    FROM incident_activities ia
    INNER JOIN incidents i ON i.id = ia.incident_id
    WHERE ${where.join(' AND ')}
    ORDER BY ia.created_at DESC`,
    values
  );

  return activities;
}

// ============================================================================
// REOPEN INCIDENT FUNCTION
// ============================================================================

export async function reopenIncident(incidentId: string, userId: string, userName: string) {
  const now = new Date().toISOString();
  
  // Get current incident to check status
  const incident = await get(`SELECT * FROM incidents WHERE id = ?`, [incidentId]);
  if (!incident) {
    throw new Error('Incident not found');
  }
  
  // Only allow reopening if status is RESOLVED or CANCELLED
  if (incident.status !== 'RESOLVED' && incident.status !== 'CANCELLED') {
    throw new Error('Can only reopen resolved or cancelled incidents');
  }
  
  // Calculate paused time from when it was completed
  let additionalPausedMinutes = 0;
  if (incident.work_completed_at) {
    const completedTime = new Date(incident.work_completed_at).getTime();
    const reopenTime = new Date(now).getTime();
    additionalPausedMinutes = Math.round((reopenTime - completedTime) / 60000);
  }
  
  const totalPausedMinutes = (incident.total_paused_minutes || 0) + additionalPausedMinutes;
  
  // Update incident status to REOPENED
  // IMPORTANT: Preserve work_started_at to continue timer from where it started
  await run(
    `UPDATE incidents SET 
      status = 'REOPENED', 
      reopened_at = ?, 
      reopened_by = ?,
      reopen_count = COALESCE(reopen_count, 0) + 1,
      total_paused_minutes = ?,
      work_completed_at = NULL,
      paused_at = NULL,
      updated_at = ?
    WHERE id = ?`,
    [now, userId, totalPausedMinutes, now, incidentId]
  );
  
  // Add activity log
  await addActivity(incidentId, userId, userName, 'REOPENED', `Incident reopened by ${userName}`);

  const recipients = new Set<string>();

  if (incident.assigned_to) {
    const assignee = await get(`SELECT role FROM users WHERE id = ?`, [incident.assigned_to]);
    if (assignee?.role === 'ENGINEER') {
      recipients.add(incident.assigned_to);
    }
  }

  const adminsAndManagers = await all(
    `SELECT id FROM users WHERE role IN ('ADMIN', 'MANAGER') AND status = 'ACTIVE'`
  );

  for (const user of adminsAndManagers) {
    if (user?.id) {
      recipients.add(user.id);
    }
  }

  recipients.delete(userId);

  for (const recipientId of recipients) {
    const notificationId = uuidv4();
    await run(
      `INSERT INTO notifications (id, user_id, incident_id, channel, subject, message, status, created_at) 
       VALUES (?, ?, ?, 'IN_APP', ?, ?, 'UNREAD', ?)`,
      [
        notificationId,
        recipientId,
        incidentId,
        `Incident Reopened: ${incident.title}`,
        `Incident "${incident.title}" has been reopened by ${userName}.`,
        now
      ]
    );
  }
  
  // Return updated incident
  return await getIncidentById(incidentId);
}
/**
 * Override ISS-calculated metrics (Severity/Priority)
 * Only allowed for MANAGER/ADMIN roles
 * Requires override reason
 */
export async function overrideIncidentMetrics(
  incidentId: string,
  payload: {
    newSeverity?: string;
    newPriority?: string;
    overrideReason: string;
  },
  userId: string,
  userName: string,
  userRole: string
) {
  // Validate role
  if (!['MANAGER', 'ADMIN'].includes(userRole.toUpperCase())) {
    throw new Error('Only managers and admins can override incident metrics');
  }

  // Validate override reason
  if (!payload.overrideReason || payload.overrideReason.trim().length < 10) {
    throw new Error('Override reason must be at least 10 characters');
  }

  // Get incident
  const incident = await getIncidentById(incidentId);
  if (!incident) {
    throw new Error('Incident not found');
  }

  const now = new Date().toISOString();
  const updates: string[] = [];
  const values: any[] = [];

  let severity = normalizeSeverityToSevLabel(incident.severity);
  let priority = normalizePriorityLabel(incident.priority);

  const currentSeverityLabel = normalizeSeverityToSevLabel(incident.severity);
  const currentPriorityLabel = normalizePriorityLabel(incident.priority);
  const nextSeverityLabel = payload.newSeverity ? normalizeSeverityToSevLabel(payload.newSeverity) : null;
  const nextPriorityLabel = payload.newPriority ? normalizePriorityLabel(payload.newPriority) : null;

  // Apply overrides
  if (nextSeverityLabel && nextSeverityLabel !== currentSeverityLabel) {
    severity = nextSeverityLabel;
    updates.push('severity = ?');
    values.push(nextSeverityLabel);
    await addActivity(
      incidentId,
      userId,
      userName,
      'OVERRIDE',
      `Severity overridden from ${currentSeverityLabel} to ${nextSeverityLabel}: ${payload.overrideReason}`
    );
  }
  if (nextPriorityLabel && nextPriorityLabel !== currentPriorityLabel) {
    priority = nextPriorityLabel;
    updates.push('priority = ?');
    values.push(nextPriorityLabel);
    await addActivity(
      incidentId,
      userId,
      userName,
      'OVERRIDE',
      `Priority overridden from ${currentPriorityLabel} to ${nextPriorityLabel}: ${payload.overrideReason}`
    );
  }

  // Recalculate ISS, SLA target, and SLA status using configurable ISS settings.
  const { severityToPriority, priorityToSLAHours } = await import('../utils/issCalculator');
  const issSettings = await getISSSettings();
  const categoryRiskWeight = getCategoryRisk(incident.category, await getCategoryRiskWeight(incident.category));
  const newIssScore = calculateISS(
    incident.urgency,
    incident.impact,
    incident.category,
    categoryRiskWeight,
    issSettings.weights
  );
  const newCalculatedSeverity = issToSeverity(newIssScore, issSettings.thresholds);
  let newCalculatedPriority = severityToPriority(newCalculatedSeverity);
  if (nextPriorityLabel) {
    newCalculatedPriority = nextPriorityLabel === 'CRITICAL'
      ? 'P1'
      : nextPriorityLabel === 'HIGH'
        ? 'P2'
        : nextPriorityLabel === 'MEDIUM'
          ? 'P3'
          : 'P4';
  }
  const normalizedPriority = normalizePriorityLabel(priority);
  const priorityForSlaHours =
    normalizedPriority === 'CRITICAL' ? 'P1' :
    normalizedPriority === 'HIGH' ? 'P2' :
    normalizedPriority === 'MEDIUM' ? 'P3' :
    'P4';
  const slaHours = priorityToSLAHours(priorityForSlaHours) || (incident.estimated_resolution_time ? incident.estimated_resolution_time / 60 : 24);
  const priorityNum = priorityToNumber(priority);
  const policyForOverride = await get(
    'SELECT resolution_hours, response_hours, business_hours_config_id, business_hours_only FROM sla_policies WHERE priority = ? AND is_active = 1',
    [priorityNum]
  );
  const responseHours = policyForOverride?.response_hours || getDefaultResponseHours(priorityNum);
  const responseSlaMinutes = Math.max(1, Math.round(responseHours * 60));
  const configuredSlaHours = policyForOverride?.resolution_hours || 0;
  const overrideBusinessConfigId = resolveBusinessHoursConfigId(policyForOverride);
  const resolvedSlaHours = configuredSlaHours > 0 ? configuredSlaHours : slaHours;
  const responseDeadline = await calculateSLADeadlineFromHours(responseHours, new Date(incident.created_at), overrideBusinessConfigId);
  const slaDeadline = await calculateSLADeadlineFromHours(resolvedSlaHours, new Date(incident.created_at), overrideBusinessConfigId);

  updates.push('iss_score = ?');
  values.push(newIssScore);
  updates.push('calculated_severity = ?');
  values.push(newCalculatedSeverity);
  updates.push('calculated_priority = ?');
  values.push(newCalculatedPriority);
  updates.push('sla_deadline = ?');
  values.push(slaDeadline);
  updates.push('estimated_resolution_time = ?');
  values.push(resolvedSlaHours * 60);

  // If first response is not confirmed yet, realign response SLA to the active policy.
  if (!incident.response_time_confirmed_at) {
    updates.push('response_time_sla_minutes = ?');
    values.push(responseSlaMinutes);
    updates.push('response_deadline = ?');
    values.push(responseDeadline);
  }

  // Add override tracking fields
  updates.push('override_reason = ?');
  values.push(payload.overrideReason);
  updates.push('overridden_by = ?');
  values.push(userId);
  updates.push('overridden_at = ?');
  values.push(now);
  updates.push('updated_at = ?');
  values.push(now);

  // Update incident
  values.push(incidentId);
  await run(
    `UPDATE incidents SET ${updates.join(', ')} WHERE id = ?`,
    values
  );

  // Send notifications
  await sendIncidentNotifications(incidentId, 'METRICS_OVERRIDDEN', incident.severity, nextSeverityLabel || incident.severity, userId);

  return await getIncidentById(incidentId);
}

/**
 * Accept ISS-calculated metrics (no override needed)
 * Marks the incident as reviewed by manager
 */
export async function acceptIncidentMetrics(
  incidentId: string,
  userId: string,
  userName: string,
  userRole: string
) {
  // Validate role
  if (!['MANAGER', 'ADMIN'].includes(userRole.toUpperCase())) {
    throw new Error('Only managers and admins can accept incident metrics');
  }

  const incident = await getIncidentById(incidentId);
  if (!incident) {
    throw new Error('Incident not found');
  }

  // Add activity log
  await addActivity(
    incidentId,
    userId,
    userName,
    'REVIEWED',
    `ISS-calculated metrics accepted by ${userName}: Severity=${incident.severity}, Priority=${incident.priority}, ISS Score=${incident.iss_score}`
  );

  return { success: true, message: 'Metrics accepted' };
}

export async function confirmIncidentResponse(incidentId: string, userId: string, userRole: string, userName: string) {
  const incident = await getIncidentById(incidentId);
  if (!incident) {
    throw new Error('Incident not found');
  }

  // Engineers can confirm response only for incidents assigned to them.
  if (String(userRole || '').toUpperCase() === 'ENGINEER' && incident.assigned_to !== userId) {
    throw new Error('Engineers can only confirm response for incidents assigned to them');
  }

  if (incident.response_time_confirmed_at) {
    return {
      alreadyConfirmed: true,
      confirmedAt: incident.response_time_confirmed_at,
      responseTimeMinutes: incident.response_time_minutes,
      confirmedBy: incident.response_time_confirmed_by,
    };
  }

  const now = new Date().toISOString();
  const priorityNumber = priorityToNumber(incident.priority);
  const slaPolicy = await get(
    'SELECT business_hours_only, business_hours_config_id FROM sla_policies WHERE priority = ? AND is_active = 1',
    [priorityNumber]
  );
  const businessHoursConfigId = resolveBusinessHoursConfigId(slaPolicy);
  const responseTimeMinutes = await calculateBusinessMinutesBetween(
    new Date(incident.created_at),
    new Date(now),
    businessHoursConfigId
  );

  await run(
    `UPDATE incidents
     SET response_time_confirmed_at = ?,
         response_time_confirmed_by = ?,
         response_time_minutes = ?,
         updated_at = ?
     WHERE id = ?`,
    [now, userId, responseTimeMinutes, now, incidentId]
  );

  await addActivity(
    incidentId,
    userId,
    userName,
    'RESPONSE_CONFIRMED',
    `First response confirmed by ${userName} after ${responseTimeMinutes} minutes`
  );

  return {
    incidentId,
    confirmedAt: now,
    confirmedBy: userId,
    responseTimeMinutes,
  };
}

/**
 * Check SLA status for an incident
 * Returns remaining time and alert status
 */
export async function checkIncidentSLAStatus(incidentId: string) {
  const incident = await getIncidentById(incidentId);
  if (!incident) {
    throw new Error('Incident not found');
  }

  const getActualWorkMinutes = (): number | null => {
    const storedResolution = Number(incident.resolution_time);
    if (Number.isFinite(storedResolution) && storedResolution > 0) {
      return Math.max(0, Math.round(storedResolution));
    }

    if (!incident.work_started_at) {
      return null;
    }

    const startedAtMs = new Date(incident.work_started_at).getTime();
    if (!Number.isFinite(startedAtMs)) {
      return null;
    }

    let endMs = Date.now();
    if (incident.work_completed_at) {
      const completedAtMs = new Date(incident.work_completed_at).getTime();
      if (Number.isFinite(completedAtMs)) endMs = completedAtMs;
    } else if ((incident.status === 'RESOLVED' || incident.status === 'CANCELLED') && incident.resolved_at) {
      const resolvedAtMs = new Date(incident.resolved_at).getTime();
      if (Number.isFinite(resolvedAtMs)) endMs = resolvedAtMs;
    }

    let totalMinutes = Math.max(0, Math.round((endMs - startedAtMs) / 60000));
    let pausedMinutes = Math.max(0, Number(incident.total_paused_minutes || 0));

    const isCurrentlyPaused = incident.status === 'PENDING' && !!incident.paused_at && !incident.work_completed_at;
    if (isCurrentlyPaused && incident.paused_at) {
      const pausedAtMs = new Date(incident.paused_at).getTime();
      if (Number.isFinite(pausedAtMs)) {
        pausedMinutes += Math.max(0, Math.round((Date.now() - pausedAtMs) / 60000));
      }
    }

    totalMinutes = Math.max(0, totalMinutes - pausedMinutes);
    return totalMinutes;
  };

  const actualWorkMinutes = getActualWorkMinutes();

  const { warningThreshold, responseWarningThreshold } = await getSLAAlertSettings();

  const priorityNumber = priorityToNumber(incident.priority);
  const slaPolicy = await get(
    'SELECT response_hours, resolution_hours, business_hours_only, business_hours_config_id FROM sla_policies WHERE priority = ? AND is_active = 1',
    [priorityNumber]
  );
  const businessHoursConfigId = resolveBusinessHoursConfigId(slaPolicy);
  const responseHours = slaPolicy?.response_hours || getDefaultResponseHours(priorityNumber);
  const responseTargetMinutes = incident.response_time_sla_minutes || Math.max(1, Math.round(responseHours * 60));
  const responseDeadline = incident.response_deadline || await calculateSLADeadlineFromHours(responseHours, new Date(incident.created_at), businessHoursConfigId);

  const nowMs = Date.now();
  const responseReferenceDate = incident.response_time_confirmed_at
    ? new Date(incident.response_time_confirmed_at)
    : new Date();
  const responseConsumption = await calculateConsumptionFromDeadline(
    responseDeadline,
    responseTargetMinutes,
    responseReferenceDate,
    businessHoursConfigId
  );
  const responseTimeRemainingMinutes = Math.max(0, Math.round(responseConsumption.remainingMinutes));
  const responsePercentConsumed = responseConsumption.percentConsumed;
  const elapsedMinutes = incident.response_time_confirmed_at
    ? (typeof incident.response_time_minutes === 'number' && Number.isFinite(incident.response_time_minutes)
      ? Math.max(0, incident.response_time_minutes)
      : Math.max(0, Math.round(responseTargetMinutes - responseConsumption.remainingMinutes)))
    : null;
  const responseBreached = responseConsumption.remainingMinutes < 0 || responsePercentConsumed >= 100;
  const responseNearExpiry = !responseBreached && responsePercentConsumed >= responseWarningThreshold;

  const responseTime = {
    hasTarget: true,
    targetMinutes: responseTargetMinutes,
    deadline: responseDeadline,
    confirmedAt: incident.response_time_confirmed_at || null,
    confirmedBy: incident.response_time_confirmed_by || null,
    actualMinutes: incident.response_time_minutes ?? (incident.response_time_confirmed_at ? elapsedMinutes : null),
    remainingMinutes: responseTimeRemainingMinutes,
    percentConsumed: responsePercentConsumed,
    isBreached: responseBreached,
    isNearExpiry: responseNearExpiry,
    overtimeMinutes: responseBreached ? responseConsumption.overtimeMinutes : 0,
  };

  if (!incident.sla_deadline || !incident.priority) {
    return { 
      hasDeadline: false,
      message: 'No SLA deadline set for this incident',
      actualWorkMinutes,
      responseTime,
    };
  }

  // For RESOLVED/CANCELLED incidents, return saved percentage and actual resolution time
  if (incident.status === 'RESOLVED' || incident.status === 'CANCELLED') {
    const targetMinutes = Math.max(
      1,
      Math.round((Number(slaPolicy?.resolution_hours) > 0 ? Number(slaPolicy?.resolution_hours) : (incident.estimated_resolution_time ? incident.estimated_resolution_time / 60 : 4)) * 60)
    );
    const resolvedConsumption = await calculateConsumptionFromDeadline(
      incident.sla_deadline,
      targetMinutes,
      incident.resolved_at ? new Date(incident.resolved_at) : new Date(),
      businessHoursConfigId
    );
    const percentConsumed = resolvedConsumption.percentConsumed;
    const isExpired = percentConsumed >= 100;
    const isNearExpiry = percentConsumed >= 75 && percentConsumed < 100;
    const actualResolutionTotalMinutes = Math.max(0, Math.round(targetMinutes - resolvedConsumption.remainingMinutes));
    const actualResolutionHours = Math.floor(actualResolutionTotalMinutes / 60);
    const actualResolutionMinutes = actualResolutionTotalMinutes % 60;
    
    // SLA target hours: prefer active policy for current priority, then incident stored value.
    const policySlaHours = Number(slaPolicy?.resolution_hours);
    const incidentSlaHours = incident.estimated_resolution_time ? incident.estimated_resolution_time / 60 : 0;
    const slaHours = Number.isFinite(policySlaHours) && policySlaHours > 0
      ? policySlaHours
      : (incidentSlaHours > 0 ? incidentSlaHours : 4);
    
    return {
      hasDeadline: true,
      isResolved: true,
      slaDeadline: incident.sla_deadline,
      priority: incident.priority,
      actualWorkMinutes,
      percentConsumed: Math.round(percentConsumed),
      isExpired,
      isNearExpiry,
      hoursRemaining: 0,
      minutesRemaining: 0,
      actualResolutionHours,
      actualResolutionMinutes,
      slaHours,
      message: isExpired ? 'SLA was breached' : 'Resolved within SLA',
      responseTime,
    };
  }

  // SLA target hours: prefer active policy for current priority, then incident stored value.
  const policySlaHours = Number(slaPolicy?.resolution_hours);
  const incidentSlaHours = incident.estimated_resolution_time ? incident.estimated_resolution_time / 60 : 0;
  const slaHours = Number.isFinite(policySlaHours) && policySlaHours > 0
    ? policySlaHours
    : (incidentSlaHours > 0 ? incidentSlaHours : 4);
  const slaTargetMinutes = Math.max(1, Math.round(slaHours * 60));
  const slaConsumption = await calculateConsumptionFromDeadline(
    incident.sla_deadline,
    slaTargetMinutes,
    new Date(),
    businessHoursConfigId
  );
  const slaRemainingMinutes = Math.max(0, Math.round(slaConsumption.remainingMinutes));

  return {
    hasDeadline: true,
    slaDeadline: incident.sla_deadline,
    priority: incident.priority,
    slaHours,
    actualWorkMinutes,
    responseTime,
    hoursRemaining: Math.floor(slaRemainingMinutes / 60),
    minutesRemaining: slaRemainingMinutes % 60,
    percentConsumed: slaConsumption.percentConsumed,
    isExpired: slaConsumption.remainingMinutes < 0 || slaConsumption.percentConsumed >= 100,
    isNearExpiry: slaConsumption.percentConsumed >= warningThreshold && slaConsumption.percentConsumed < 100,
    overtimeHours: Math.floor(slaConsumption.overtimeMinutes / 60),
    overtimeMinutes: slaConsumption.overtimeMinutes % 60,
  };
}

/**
 * Check all active incidents for SLA breaches and send notifications
 * Should be run periodically (e.g., every 30 minutes)
 */
export async function checkAndNotifySLABreaches() {
  const {
    warningThreshold,
    responseWarningThreshold,
    responseRiskNotificationsEnabled,
  } = await getSLAAlertSettings();

  // Get all active incidents (not CANCELLED or RESOLVED)
  const activeIncidents = await all(
    `SELECT i.*, 
      assignee.email as assigned_to_email,
      assignee.full_name as assigned_to_name,
      assignee.role as assigned_to_role
    FROM incidents i
    LEFT JOIN users assignee ON i.assigned_to = assignee.id
    WHERE i.status IN ('OPEN', 'IN_PROGRESS', 'PENDING')
      AND i.sla_deadline IS NOT NULL
      AND i.priority IS NOT NULL`
  );

  const now = new Date().toISOString();
  const notifications = [];

  const policies = await all(
    'SELECT priority, resolution_hours, response_hours, business_hours_only, business_hours_config_id FROM sla_policies WHERE is_active = 1'
  );
  const policyByPriority = new Map<number, any>();
  for (const policy of policies || []) {
    policyByPriority.set(Number(policy.priority), policy);
  }

  const managers = await all(
    `SELECT id FROM users WHERE role IN ('ADMIN', 'MANAGER') AND status = 'ACTIVE'`
  );

  const responseManagers = await all(
    `SELECT id FROM users WHERE role = 'MANAGER' AND status = 'ACTIVE'`
  );

  const buildRecipients = (incident: any): string[] => {
    const recipients = new Set<string>();

    // Engineer gets SLA alerts only for incidents assigned to them.
    if (incident.assigned_to && incident.assigned_to_role === 'ENGINEER') {
      recipients.add(incident.assigned_to);
    }

    // Managers and admins get global SLA alerts.
    managers.forEach((m: any) => {
      if (m?.id) recipients.add(m.id);
    });
    return [...recipients];
  };

  const buildResponseRecipients = (incident: any): string[] => {
    const recipients = new Set<string>();
    if (incident.assigned_to && incident.assigned_to_role === 'ENGINEER') {
      recipients.add(incident.assigned_to);
    }

    // Managers should also receive response-time risk/breach alerts for intervention.
    responseManagers.forEach((m: any) => {
      if (m?.id) recipients.add(m.id);
    });

    return [...recipients];
  };

  for (const incident of activeIncidents) {
    const policy = policyByPriority.get(priorityToNumber(incident.priority));
    const businessHoursConfigId = resolveBusinessHoursConfigId(policy);
    const resolutionHours = Number(policy?.resolution_hours);
    const responseHours = Number(policy?.response_hours);
    const slaTargetMinutes = Number.isFinite(resolutionHours) && resolutionHours > 0
      ? Math.round(resolutionHours * 60)
      : Number(incident.estimated_resolution_time || 0);
    const responseTargetMinutes = Number(incident.response_time_sla_minutes) > 0
      ? Number(incident.response_time_sla_minutes)
      : (Number.isFinite(responseHours) && responseHours > 0 ? Math.round(responseHours * 60) : 0);
    const slaStatus = await calculateConsumptionFromDeadline(
      incident.sla_deadline,
      slaTargetMinutes,
      new Date(now),
      businessHoursConfigId
    );
    const calendarRemainingMs = new Date(incident.sla_deadline).getTime() - new Date(now).getTime();
    const hoursRemaining = Math.max(0, Math.floor(calendarRemainingMs / (1000 * 60 * 60)));
    const minutesRemaining = Math.max(0, Math.floor((calendarRemainingMs / (1000 * 60)) % 60));

    // SLA Expired
    if (slaStatus.remainingMinutes < 0 || slaStatus.percentConsumed >= 100) {
      // Check if we already sent expired notification (avoid spam)
      const existingNotif = await get(
        `SELECT id FROM notifications 
         WHERE incident_id = ? 
         AND subject LIKE '%SLA Expired%' 
         AND created_at > datetime('now', '-1 hour')`,
        [incident.id]
      );

      if (!existingNotif) {
        for (const userId of buildRecipients(incident)) {
            await createNotification(
              userId,
              incident.id,
              `⚠️ SLA Expired: ${incident.title}`,
              `Incident "${incident.title}" has exceeded its SLA deadline. Immediate attention required!`
            );
          notifications.push({ userId, incidentId: incident.id, type: 'EXPIRED' });
        }
      }
    }
    // SLA Near Expiry (>75% consumed)
    else if (slaStatus.percentConsumed >= warningThreshold && slaStatus.percentConsumed < 100) {
      // Check if we already sent near-expiry notification
      const existingNotif = await get(
        `SELECT id FROM notifications 
         WHERE incident_id = ? 
         AND subject LIKE '%SLA Risk%' 
         AND created_at > datetime('now', '-2 hours')`,
        [incident.id]
      );

      if (!existingNotif) {
        for (const userId of buildRecipients(incident)) {
          await createNotification(
            userId,
            incident.id,
            `⏰ SLA Risk: ${incident.title}`,
            `Incident "${incident.title}" reached ${Math.round(slaStatus.percentConsumed)}% SLA consumption. ${hoursRemaining}h ${minutesRemaining}m remaining.`
          );
          notifications.push({ userId, incidentId: incident.id, type: 'WARNING' });
        }
      }
    }

    // Response SLA monitoring (only before first response is confirmed)
    if (!incident.response_time_confirmed_at && incident.response_deadline && incident.created_at) {
      const responseStatus = await calculateConsumptionFromDeadline(
        incident.response_deadline,
        responseTargetMinutes,
        new Date(now),
        businessHoursConfigId
      );

      if (responseStatus.remainingMinutes < 0 || responseStatus.percentConsumed >= 100) {
        const existingResponseExpired = await get(
          `SELECT id FROM notifications
           WHERE incident_id = ?
           AND subject LIKE '%Response SLA Expired%'
           AND created_at > datetime('now', '-1 hour')`,
          [incident.id]
        );

        if (!existingResponseExpired) {
          const overtimeMinutes = responseStatus.overtimeMinutes;
          const overtimeHoursPart = Math.floor(overtimeMinutes / 60);
          const overtimeMinutesPart = overtimeMinutes % 60;
          for (const userId of buildResponseRecipients(incident)) {
            await createNotification(
              userId,
              incident.id,
              `⚠️ Response SLA Expired: ${incident.title}`,
              `Incident "${incident.title}" exceeded first-response SLA by ${overtimeHoursPart}h ${overtimeMinutesPart}m.`
            );
            notifications.push({ userId, incidentId: incident.id, type: 'RESPONSE_EXPIRED' });
          }
        }
      } else if (responseRiskNotificationsEnabled && responseStatus.percentConsumed >= responseWarningThreshold) {
        const existingResponseWarning = await get(
          `SELECT id FROM notifications
           WHERE incident_id = ?
           AND subject LIKE '%Response SLA Risk%'
           AND created_at > datetime('now', '-1 hour')`,
          [incident.id]
        );

        if (!existingResponseWarning) {
          const remainingMinutes = Math.max(0, Math.round(responseStatus.remainingMinutes));
          for (const userId of buildResponseRecipients(incident)) {
            await createNotification(
              userId,
              incident.id,
              `⏰ Response SLA Risk: ${incident.title}`,
              `Incident "${incident.title}" is at ${Math.round(responseStatus.percentConsumed)}% of first-response SLA. ${remainingMinutes} minutes remaining.`
            );
            notifications.push({ userId, incidentId: incident.id, type: 'RESPONSE_WARNING' });
          }
        }
      }
    }
  }

  return {
    checked: activeIncidents.length,
    notificationsSent: notifications.length,
    notifications
  };
}
