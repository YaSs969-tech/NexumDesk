/**
 * ISS (Incident Severity Score) Calculator
 * Automates calculation of Priority, and SLA based on Urgency, Impact, and Category
 */

// ============== ENUM DEFINITIONS ==============

export enum UrgencyLevel {
  LOW = 1,
  MEDIUM = 2,
  HIGH = 3,
  CRITICAL = 4
}

export enum ImpactLevel {
  SINGLE_USER = 1,
  DEPARTMENT = 3,
  ORGANIZATION = 5
}

export enum CategoryRisk {
  SOFTWARE = 2,
  HARDWARE = 3,
  NETWORK = 4,
  SECURITY = 5,
  OTHER = 2 // Default same as SOFTWARE
}

export type CategorySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * Maps category risk value to severity
 * 2 -> LOW
 * 3 -> MEDIUM
 * 4 -> HIGH
 * 5 -> CRITICAL
 */
export function categoryRiskToSeverity(risk: number): CategorySeverity {
  if (risk === 5) return 'CRITICAL';
  if (risk === 4) return 'HIGH';
  if (risk === 3) return 'MEDIUM';
  return 'LOW';
}

export type SeverityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type PriorityLevel = 'P4' | 'P3' | 'P2' | 'P1';

export interface ISSWeightsConfig {
  urgencyWeight: number;
  impactWeight: number;
  categoryWeight: number;
}

export interface SeverityThresholdConfig {
  p1: number;
  p2: number;
  p3: number;
}

// ============== MAPPING FUNCTIONS ==============

/**
 * Maps urgency string to numeric value
 */
export function getUrgencyValue(urgency: string): number {
  const urgencyMap: Record<string, number> = {
    'LOW': UrgencyLevel.LOW,
    'MEDIUM': UrgencyLevel.MEDIUM,
    'HIGH': UrgencyLevel.HIGH,
    'CRITICAL': UrgencyLevel.CRITICAL
  };
  return urgencyMap[urgency.toUpperCase()] || UrgencyLevel.MEDIUM;
}

/**
 * Maps impact string to numeric value
 */
export function getImpactValue(impact: string): number {
  const impactMap: Record<string, number> = {
    'SINGLE_USER': ImpactLevel.SINGLE_USER,
    'DEPARTMENT': ImpactLevel.DEPARTMENT,
    'ORGANIZATION': ImpactLevel.ORGANIZATION
  };
  return impactMap[impact.toUpperCase()] || ImpactLevel.SINGLE_USER;
}

/**
 * Maps category to risk numeric value
 */
export function getCategoryRisk(category: string, riskWeight?: number): number {
  if (typeof riskWeight === 'number' && Number.isFinite(riskWeight)) {
    return riskWeight;
  }

  const categoryMap: Record<string, number> = {
    'SOFTWARE': CategoryRisk.SOFTWARE,
    'HARDWARE': CategoryRisk.HARDWARE,
    'NETWORK': CategoryRisk.NETWORK,
    'SECURITY': CategoryRisk.SECURITY,
    'OTHER': CategoryRisk.OTHER
  };
  return categoryMap[category.toUpperCase()] || CategoryRisk.OTHER;
}



// ============== ISS CALCULATION ==============

/**
 * Calculates ISS (Incident Severity Score)
 * Formula: ISS = (0.4 * urgency) + (0.4 * impact) + (0.2 * category_risk)
 */
export function calculateISS(
  urgency: string,
  impact: string,
  category: string,
  categoryRiskWeight?: number,
  weights?: ISSWeightsConfig
): number {
  const urgencyValue = getUrgencyValue(urgency);
  const impactValue = getImpactValue(impact);
  const categoryRisk = getCategoryRisk(category, categoryRiskWeight);

  const urgencyWeight = Number.isFinite(weights?.urgencyWeight) ? Number(weights?.urgencyWeight) : 0.4;
  const impactWeight = Number.isFinite(weights?.impactWeight) ? Number(weights?.impactWeight) : 0.4;
  const categoryWeight = Number.isFinite(weights?.categoryWeight) ? Number(weights?.categoryWeight) : 0.2;

  const iss = (urgencyWeight * urgencyValue) + (impactWeight * impactValue) + (categoryWeight * categoryRisk);

  // Round to 2 decimals
  return Math.round(iss * 100) / 100;
}


/**
 * Maps ISS score to Priority
 * ISS < 2 → P4
 * 2 <= ISS < 3 → P3
 * 3 <= ISS < 4 → P2
 * ISS >= 4 → P1
 */
export function issToPriority(iss: number, thresholds?: SeverityThresholdConfig): PriorityLevel {
  const p1 = Number.isFinite(thresholds?.p1) ? Number(thresholds?.p1) : 4;
  const p2 = Number.isFinite(thresholds?.p2) ? Number(thresholds?.p2) : 3;
  const p3 = Number.isFinite(thresholds?.p3) ? Number(thresholds?.p3) : 2;

  if (iss >= p1) return 'P1';
  if (iss >= p2) return 'P2';
  if (iss >= p3) return 'P3';
  return 'P4';
}

/**
 * Maps ISS score to severity label using the same thresholds used for priority.
 */
export function issToSeverity(iss: number, thresholds?: SeverityThresholdConfig): SeverityLevel {
  const p1 = Number.isFinite(thresholds?.p1) ? Number(thresholds?.p1) : 4;
  const p2 = Number.isFinite(thresholds?.p2) ? Number(thresholds?.p2) : 3;
  const p3 = Number.isFinite(thresholds?.p3) ? Number(thresholds?.p3) : 2;

  if (iss >= p1) return 'CRITICAL';
  if (iss >= p2) return 'HIGH';
  if (iss >= p3) return 'MEDIUM';
  return 'LOW';
}

/**
 * Maps severity label to ticket priority.
 */
export function severityToPriority(severity: SeverityLevel): PriorityLevel {
  const map: Record<SeverityLevel, PriorityLevel> = {
    CRITICAL: 'P1',
    HIGH: 'P2',
    MEDIUM: 'P3',
    LOW: 'P4',
  };
  return map[severity] ?? 'P4';
}

/**
 * Maps Priority to SLA hours
 * P1 → 4h
 * P2 → 8h
 * P3 → 24h
 * P4 → 72h
 */
export function priorityToSLAHours(priority: PriorityLevel): number {
  const slaMap: Record<PriorityLevel, number> = {
    'P1': 4,
    'P2': 8,
    'P3': 24,
    'P4': 72
  };
  return slaMap[priority];
}

/**
 * Calculates SLA deadline from current time
 * Uses BUSINESS HOURS logic: Monday-Friday, 9:00-18:00 (9 hours/day)
 * Excludes weekends
 * 
 * @param priority - Priority level (P1-P4)
 * @param fromDate - Starting date (defaults to now)
 * @param useBusinessHours - If true, uses business hours; if false, uses 24/7
 */
export function calculateSLADeadline(
  priority: PriorityLevel, 
  fromDate?: Date,
  useBusinessHours: boolean = true
): string {
  const hours = priorityToSLAHours(priority);
  const date = fromDate || new Date();
  
  if (!useBusinessHours) {
    // Simple 24/7 calculation
    const deadline = new Date(date);
    deadline.setHours(deadline.getHours() + hours);
    return deadline.toISOString();
  }
  
  // Business hours calculation
  return calculateBusinessHoursDeadline(date, hours);
}

/**
 * Helper: Checks if a date is a weekend (Saturday=6, Sunday=0)
 */
function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * Helper: Adjusts date to next business day if on weekend or after hours
 */
function adjustToNextBusinessDay(date: Date): Date {
  const result = new Date(date);
  
  // If weekend, move to Monday
  while (isWeekend(result)) {
    result.setDate(result.getDate() + 1);
    result.setHours(9, 0, 0, 0); // Start at 9 AM
  }
  
  // If before 9 AM, set to 9 AM
  if (result.getHours() < 9) {
    result.setHours(9, 0, 0, 0);
  }
  
  // If after 6 PM, move to next day 9 AM
  if (result.getHours() >= 18) {
    result.setDate(result.getDate() + 1);
    result.setHours(9, 0, 0, 0);
    // Check again if it's weekend
    return adjustToNextBusinessDay(result);
  }
  
  return result;
}

/**
 * Calculates deadline considering business hours (9 AM - 6 PM, Mon-Fri)
 * Business day = 9 hours (9:00-18:00)
 */
function calculateBusinessHoursDeadline(startDate: Date, hoursNeeded: number): string {
  let current = adjustToNextBusinessDay(new Date(startDate));
  let remainingHours = hoursNeeded;
  
  while (remainingHours > 0) {
    // Calculate hours left in current business day
    const currentHour = current.getHours();
    const hoursLeftToday = 18 - currentHour; // Until 6 PM
    
    if (remainingHours <= hoursLeftToday) {
      // Deadline is today
      current.setHours(currentHour + remainingHours);
      remainingHours = 0;
    } else {
      // Need more than today, move to next business day
      remainingHours -= hoursLeftToday;
      current.setDate(current.getDate() + 1);
      current.setHours(9, 0, 0, 0); // Next day at 9 AM
      current = adjustToNextBusinessDay(current); // Skip weekends
    }
  }
  
  return current.toISOString();
}

/**
 * Calculates time remaining until SLA deadline
 * Returns object with hours, minutes, and percentage consumed
 */
export function calculateSLARemaining(slaDeadline: string, priority: PriorityLevel): {
  hoursRemaining: number;
  minutesRemaining: number;
  percentConsumed: number;
  isExpired: boolean;
  isNearExpiry: boolean; // >75% consumed
}
{
  const now = new Date();
  const deadline = new Date(slaDeadline);
  const totalSLAHours = priorityToSLAHours(priority);
  
  const msRemaining = deadline.getTime() - now.getTime();
  const hoursRemaining = msRemaining / (1000 * 60 * 60);
  const minutesRemaining = Math.floor((msRemaining / (1000 * 60)) % 60);
  
  const percentConsumed = Math.max(0, Math.min(100, 
    ((totalSLAHours - hoursRemaining) / totalSLAHours) * 100
  ));
  
  return {
    hoursRemaining: Math.floor(hoursRemaining),
    minutesRemaining,
    percentConsumed: Math.round(percentConsumed),
    isExpired: msRemaining < 0,
    isNearExpiry: percentConsumed >= 75
  };
}

/**
 * Calculates time remaining until SLA deadline using actual SLA hours from database
 * This version uses the stored SLA hours instead of hardcoded priority mapping
 */
export function calculateSLARemainingWithHours(
  slaDeadline: string,
  totalSLAHours: number,
  warningThreshold: number = 75
): {
  hoursRemaining: number;
  minutesRemaining: number;
  percentConsumed: number;
  isExpired: boolean;
  isNearExpiry: boolean;
  overtimeHours: number;
  overtimeMinutes: number;
} {
  const now = new Date();
  const deadline = new Date(slaDeadline);
  
  const msRemaining = deadline.getTime() - now.getTime();
  const hoursRemaining = msRemaining / (1000 * 60 * 60);
  const minutesRemaining = Math.floor((msRemaining / (1000 * 60)) % 60);
  
  const percentConsumed = ((totalSLAHours - hoursRemaining) / totalSLAHours) * 100;
  
  // Calculate overtime (time past deadline)
  let overtimeHours = 0;
  let overtimeMinutes = 0;
  if (msRemaining < 0) {
    const overtimeMs = Math.abs(msRemaining);
    overtimeHours = Math.floor(overtimeMs / (1000 * 60 * 60));
    overtimeMinutes = Math.floor((overtimeMs / (1000 * 60)) % 60);
  }
  
  return {
    hoursRemaining: Math.max(0, Math.floor(hoursRemaining)),
    minutesRemaining: Math.max(0, minutesRemaining),
    percentConsumed: Math.round(Math.max(0, percentConsumed)), // Allow >100% for breached
    isExpired: msRemaining < 0,
    isNearExpiry: percentConsumed >= warningThreshold && percentConsumed < 100,
    overtimeHours,
    overtimeMinutes
  };
}

// ============== MAIN CALCULATION FUNCTION ==============

export interface ISSCalculationResult {
  impact: string;
  issScore: number;
  calculatedSeverity: SeverityLevel;
  calculatedPriority: PriorityLevel;
  slaDeadline: string;
  slaHours: number;
}

/**
 * Main function: calculates all incident metrics
 * @param urgency - User-provided urgency level
 * @param category - Incident category
 * @param impact - Impact level (user-specified, required)
 * @param useBusinessHours - Optional: use business hours for SLA (default: true)
 */
export function calculateIncidentMetrics(
  urgency: string,
  category: string,
  impact: string,
  useBusinessHours: boolean = true,
  categoryRiskWeight?: number,
  issWeights?: ISSWeightsConfig,
  severityThresholds?: SeverityThresholdConfig
): ISSCalculationResult {
  
  // Use provided impact (no auto-determination from affected_system)
  const finalImpact = impact || 'SINGLE_USER'; // Fallback to SINGLE_USER if not provided
  
  // Calculate ISS
  const issScore = calculateISS(urgency, finalImpact, category, categoryRiskWeight, issWeights);

  // Derive Severity from category risk
  const categoryRisk = getCategoryRisk(category, categoryRiskWeight);
  const calculatedSeverity = categoryRiskToSeverity(categoryRisk);

  // Derive Priority from ISS
  const calculatedPriority = issToPriority(issScore, severityThresholds);

  // Calculate SLA deadline (with business hours support)
  const slaHours = priorityToSLAHours(calculatedPriority);
  const slaDeadline = calculateSLADeadline(calculatedPriority, undefined, useBusinessHours);

  return {
    impact: finalImpact,
    issScore,
    calculatedSeverity,
    calculatedPriority,
    slaDeadline,
    slaHours
  };
}

// ============== VALIDATION FUNCTIONS ==============

/**
 * Validates if override is allowed (must be manager role)
 */
export function canOverride(userRole: string): boolean {
  return ['MANAGER', 'ADMIN'].includes(userRole.toUpperCase());
}

/**
 * Validates override reason is provided
 */
export function validateOverrideReason(reason: string): boolean {
  return !!(reason && reason.trim().length >= 10); // Minimum 10 characters
}
