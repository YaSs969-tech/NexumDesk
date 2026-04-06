import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import logger from './logger';

const dbFile = process.env.SQLITE_FILE || path.join(process.cwd(), 'data', 'nexumdesk.db');

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

ensureDir(dbFile);

// Promisify sqlite3
const db = new sqlite3.Database(dbFile, (err) => {
  if (err) logger.error('DB connection error', err);
});

db.configure('busyTimeout', 5000);

// Enable WAL mode for better concurrent read performance
db.run('PRAGMA journal_mode=WAL');
db.run('PRAGMA foreign_keys=ON');

function runMigrations() {
  const defaultBusinessConfigId = 'bhcfg-standard';
  const roundTheClockConfigId = 'bhcfg-24x7';

  const migrations = `
    -- Create tables if they don't exist
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE,
      email TEXT UNIQUE,
      password_hash TEXT,
      full_name TEXT,
      phone TEXT,
      role TEXT,
      team_id TEXT,
      status TEXT,
      first_name TEXT,
      last_name TEXT,
      last_login TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE,
      description TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,
      title TEXT,
      description TEXT,
      severity TEXT,
      urgency TEXT,
      status TEXT,
      service_id TEXT,
      assigned_to TEXT,
      created_by TEXT,
      detected_at TEXT,
      created_at TEXT,
      updated_at TEXT,
      resolved_at TEXT,
      escalated INTEGER DEFAULT 0,
      escalated_at TEXT,
      department TEXT,
      attachment_url TEXT
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      incident_id TEXT,
      user_id TEXT,
      content TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      incident_id TEXT,
      channel TEXT,
      subject TEXT,
      message TEXT,
      status TEXT,
      sent_at TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS escalation_rules (
      id TEXT PRIMARY KEY,
      severity TEXT,
      minutes_threshold INTEGER,
      notify_role TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS on_call_schedule (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      schedule_date TEXT,
      shift TEXT,
      created_at TEXT
    );

    -- Migration: Add new columns to existing tables
    -- These will fail silently if columns already exist
    ALTER TABLE users ADD COLUMN first_name TEXT;
    ALTER TABLE users ADD COLUMN last_name TEXT;
    ALTER TABLE incidents ADD COLUMN urgency TEXT DEFAULT 'MEDIUM';
    ALTER TABLE incidents ADD COLUMN department TEXT;
    ALTER TABLE incidents ADD COLUMN attachment_url TEXT;
    ALTER TABLE incidents ADD COLUMN estimated_resolution_time INTEGER DEFAULT 0;
    ALTER TABLE incidents ADD COLUMN resolution_time INTEGER DEFAULT 0;
    ALTER TABLE incidents ADD COLUMN resolution_notes TEXT;
    ALTER TABLE users ADD COLUMN department TEXT;
    ALTER TABLE users ADD COLUMN job_title TEXT;
    ALTER TABLE users ADD COLUMN tier TEXT;

    -- New columns for comprehensive incident form
    ALTER TABLE incidents ADD COLUMN category TEXT DEFAULT 'OTHER';
    ALTER TABLE incidents ADD COLUMN priority TEXT DEFAULT 'MEDIUM';
    ALTER TABLE incidents ADD COLUMN impact TEXT DEFAULT 'SINGLE_USER';
    ALTER TABLE incidents ADD COLUMN office_location TEXT;
    ALTER TABLE incidents ADD COLUMN floor TEXT;
    ALTER TABLE incidents ADD COLUMN room TEXT;
    ALTER TABLE incidents ADD COLUMN cabin TEXT;
    ALTER TABLE incidents ADD COLUMN tsi TEXT;
    ALTER TABLE incidents ADD COLUMN workstation_id TEXT;

    -- Activity log for incidents
    CREATE TABLE IF NOT EXISTS incident_activities (
      id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL,
      user_id TEXT,
      user_name TEXT,
      action TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Timer tracking columns for incidents
    ALTER TABLE incidents ADD COLUMN work_started_at TEXT;
    ALTER TABLE incidents ADD COLUMN total_paused_minutes INTEGER DEFAULT 0;
    ALTER TABLE incidents ADD COLUMN paused_at TEXT;
    ALTER TABLE incidents ADD COLUMN work_completed_at TEXT;
    
    -- Reopened tracking
    ALTER TABLE incidents ADD COLUMN reopened_at TEXT;
    ALTER TABLE incidents ADD COLUMN reopened_by TEXT;
    ALTER TABLE incidents ADD COLUMN reopen_count INTEGER DEFAULT 0;

    -- ISS Calculation System (auto severity/priority/SLA)
    ALTER TABLE incidents ADD COLUMN affected_system TEXT;
    ALTER TABLE incidents ADD COLUMN subcategory_id TEXT;
    ALTER TABLE incidents ADD COLUMN iss_score REAL;
    ALTER TABLE incidents ADD COLUMN tss_score REAL;
    ALTER TABLE incidents ADD COLUMN calculated_severity TEXT;
    ALTER TABLE incidents ADD COLUMN calculated_priority TEXT;
    ALTER TABLE incidents ADD COLUMN sla_deadline TEXT;
    
    -- Override tracking for manager modifications
    ALTER TABLE incidents ADD COLUMN initial_severity TEXT;
    ALTER TABLE incidents ADD COLUMN initial_priority TEXT;
    ALTER TABLE incidents ADD COLUMN override_reason TEXT;
    ALTER TABLE incidents ADD COLUMN overridden_by TEXT;
    ALTER TABLE incidents ADD COLUMN overridden_at TEXT;

    -- SLA pause tracking (for PENDING) and pending reason
    ALTER TABLE incidents ADD COLUMN sla_paused_at TEXT;
    ALTER TABLE incidents ADD COLUMN sla_paused_minutes INTEGER DEFAULT 0;
    ALTER TABLE incidents ADD COLUMN pending_reason TEXT;

    -- SLA percentage tracking at resolve (for REOPEN continuation)
    ALTER TABLE incidents ADD COLUMN sla_percent_at_resolve REAL DEFAULT 0;

    -- First response SLA tracking
    ALTER TABLE incidents ADD COLUMN response_time_sla_minutes INTEGER;
    ALTER TABLE incidents ADD COLUMN response_deadline TEXT;
    ALTER TABLE incidents ADD COLUMN response_time_confirmed_at TEXT;
    ALTER TABLE incidents ADD COLUMN response_time_confirmed_by TEXT;
    ALTER TABLE incidents ADD COLUMN response_time_minutes INTEGER;
    ALTER TABLE sla_policies ADD COLUMN business_hours_config_id TEXT;
    ALTER TABLE business_hours ADD COLUMN config_id TEXT;
    ALTER TABLE business_hours ADD COLUMN updated_at TEXT;

    -- Auto-assign system: load points tracking per engineer
    ALTER TABLE users ADD COLUMN load_points INTEGER DEFAULT 0;

    -- Custom points limit per engineer (0 = use tier default)
    ALTER TABLE users ADD COLUMN points_limit INTEGER DEFAULT 0;

    -- Per-engineer auto-assign eligibility (1 = eligible)
    ALTER TABLE users ADD COLUMN auto_assign_enabled INTEGER DEFAULT 1;

    -- Auto-assign status on incident: 'AUTO', 'PENDING_APPROVAL', 'APPROVED', 'MANUAL'
    ALTER TABLE incidents ADD COLUMN assignment_status TEXT DEFAULT 'MANUAL';

    -- Auto-assign pending: suggested engineer before manager approval
    ALTER TABLE incidents ADD COLUMN pending_assigned_to TEXT;

    -- ========================================
    -- ADMIN CONFIGURATION TABLES
    -- ========================================

    -- SLA Policies: Configurable SLA hours per priority
    CREATE TABLE IF NOT EXISTS sla_policies (
      id TEXT PRIMARY KEY,
      priority INTEGER NOT NULL,
      name TEXT NOT NULL,
      response_hours REAL NOT NULL,
      resolution_hours REAL NOT NULL,
      business_hours_only INTEGER DEFAULT 1,
      business_hours_config_id TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Categories: Configurable incident categories
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      icon TEXT DEFAULT 'folder',
      color TEXT DEFAULT '#6B7280',
      risk_weight REAL DEFAULT 3.0,
      default_sla_hours REAL,
      is_active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Subcategories: TSS-scoped technical risk units under categories
    CREATE TABLE IF NOT EXISTS subcategories (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL,
      name TEXT NOT NULL,
      risk REAL DEFAULT 2,
      impact_affects INTEGER DEFAULT 1,
      status TEXT DEFAULT 'ACTIVE',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- System Settings: Key-value configuration store
    CREATE TABLE IF NOT EXISTS system_settings (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      value TEXT,
      type TEXT DEFAULT 'string',
      category TEXT DEFAULT 'general',
      label TEXT,
      description TEXT,
      updated_by TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Audit Logs: Track all admin/system actions
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      user_name TEXT,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT,
      resource_name TEXT,
      old_values TEXT,
      new_values TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Business Hour Configurations: Named calendars reusable across SLA policies
    CREATE TABLE IF NOT EXISTS business_hour_configs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Business Hours: Configurable working hours
    CREATE TABLE IF NOT EXISTS business_hours (
      id TEXT PRIMARY KEY,
      config_id TEXT,
      day_of_week INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      is_working_day INTEGER DEFAULT 1,
      updated_at TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Business Hour Holidays: Excluded dates per business-hour configuration
    CREATE TABLE IF NOT EXISTS business_hour_holidays (
      id TEXT PRIMARY KEY,
      config_id TEXT NOT NULL,
      holiday_date TEXT NOT NULL,
      name TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_business_hours_config_day
      ON business_hours(config_id, day_of_week);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_business_hour_holidays_unique
      ON business_hour_holidays(config_id, holiday_date);

    -- Performance indexes for common incident queries
    CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
    CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON incidents(created_at);
    CREATE INDEX IF NOT EXISTS idx_incidents_created_by ON incidents(created_by);
    CREATE INDEX IF NOT EXISTS idx_incidents_assigned_to ON incidents(assigned_to);
    CREATE INDEX IF NOT EXISTS idx_incidents_sla_deadline ON incidents(sla_deadline);
    CREATE INDEX IF NOT EXISTS idx_incidents_subcategory_id ON incidents(subcategory_id);
    CREATE INDEX IF NOT EXISTS idx_subcategories_category_id ON subcategories(category_id);
    CREATE INDEX IF NOT EXISTS idx_incident_activities_incident_id ON incident_activities(incident_id);
    CREATE INDEX IF NOT EXISTS idx_incident_activities_created_at ON incident_activities(created_at);
    CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
  `;

  migrations.split(';').filter(s => s.trim()).forEach(sql => {
    db.run(sql, (err: any) => {
      // Expected when migrations run on already-evolved databases.
      const ignorable = err?.message?.includes('duplicate column name')
        || err?.message?.includes('no such table')
        || err?.message?.includes('already exists')
        || err?.message?.includes('not an error');

      if (err && !ignorable) {
        logger.error(`Migration error for SQL: ${sql.trim()}`, err.message);
      }
    });
  });

  // Backfill configs for older databases that only had a flat business_hours table.
  db.serialize(() => {
    db.run(
      `INSERT OR IGNORE INTO business_hour_configs (id, name, description, is_active)
       VALUES (?, 'Standard Week (Mon-Fri 09:00-18:00)', 'Default business calendar', 1)`,
      [defaultBusinessConfigId]
    );

    db.run(
      `INSERT OR IGNORE INTO business_hour_configs (id, name, description, is_active)
       VALUES (?, '24/7', 'Always active calendar for nonstop SLAs', 1)`,
      [roundTheClockConfigId]
    );

    db.run(
      'UPDATE business_hours SET config_id = ? WHERE config_id IS NULL',
      [defaultBusinessConfigId]
    );

    for (let day = 0; day <= 6; day++) {
      const isWorkingDay = day >= 1 && day <= 5 ? 1 : 0;
      db.run(
        `INSERT OR IGNORE INTO business_hours (id, config_id, day_of_week, start_time, end_time, is_working_day)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [`${defaultBusinessConfigId}-${day}`, defaultBusinessConfigId, day, '09:00', '18:00', isWorkingDay]
      );

      db.run(
        `INSERT OR IGNORE INTO business_hours (id, config_id, day_of_week, start_time, end_time, is_working_day)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [`${roundTheClockConfigId}-${day}`, roundTheClockConfigId, day, '00:00', '23:59']
      );
    }

    db.run(
      `UPDATE sla_policies
       SET business_hours_config_id = CASE
         WHEN business_hours_only = 0 THEN ?
         ELSE ?
       END
       WHERE business_hours_config_id IS NULL`,
      [roundTheClockConfigId, defaultBusinessConfigId]
    );

    // Status terminology migration: CLOSED -> CANCELLED
    db.run(
      `UPDATE incidents
       SET status = 'CANCELLED'
       WHERE status = 'CLOSED'`
    );

    // SLA pause logic removed for PENDING: clear any leftover sla_paused_at on PENDING incidents
    // so they are correctly included in SLA monitoring going forward.
    db.run(
      `UPDATE incidents
       SET sla_paused_at = NULL
       WHERE status = 'PENDING' AND sla_paused_at IS NOT NULL`
    );

    // Keep historical activity messages aligned with new terminology.
    db.run(
      `UPDATE incident_activities
       SET description = REPLACE(description, 'CLOSED', 'CANCELLED')
       WHERE description LIKE '%CLOSED%'`
    );
  });
}

runMigrations();

// Seed default data for admin tables
async function seedDefaults() {
  const defaultBusinessConfigId = 'bhcfg-standard';
  const roundTheClockConfigId = 'bhcfg-24x7';

  const businessConfigs = await all('SELECT COUNT(*) as count FROM business_hour_configs');
  if (businessConfigs[0]?.count === 0) {
    await run(
      `INSERT INTO business_hour_configs (id, name, description, is_active)
       VALUES (?, ?, ?, 1)`,
      [defaultBusinessConfigId, 'Standard Week (Mon-Fri 09:00-18:00)', 'Default business calendar']
    );
    await run(
      `INSERT INTO business_hour_configs (id, name, description, is_active)
       VALUES (?, ?, ?, 1)`,
      [roundTheClockConfigId, '24/7', 'Always active calendar for nonstop SLAs']
    );
    logger.info('Seeded default business-hour configs');
  }

  // Check if sla_policies is empty, seed defaults
  const slaPolicies = await all('SELECT COUNT(*) as count FROM sla_policies');
  if (slaPolicies[0]?.count === 0) {
    const defaults = [
      { id: 'sla-p1', priority: 1, name: 'Critical', response_hours: 0.5, resolution_hours: 4, business_hours_only: 0, business_hours_config_id: roundTheClockConfigId },
      { id: 'sla-p2', priority: 2, name: 'High', response_hours: 1, resolution_hours: 8, business_hours_only: 1, business_hours_config_id: defaultBusinessConfigId },
      { id: 'sla-p3', priority: 3, name: 'Medium', response_hours: 4, resolution_hours: 24, business_hours_only: 1, business_hours_config_id: defaultBusinessConfigId },
      { id: 'sla-p4', priority: 4, name: 'Low', response_hours: 8, resolution_hours: 72, business_hours_only: 1, business_hours_config_id: defaultBusinessConfigId },
    ];
    for (const p of defaults) {
      await run(
        `INSERT INTO sla_policies 
         (id, priority, name, response_hours, resolution_hours, business_hours_only, business_hours_config_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [p.id, p.priority, p.name, p.response_hours, p.resolution_hours, p.business_hours_only, p.business_hours_config_id]
      );
    }
    logger.info('Seeded default SLA policies');
  }

  // Check if categories is empty, seed defaults
  const categories = await all('SELECT COUNT(*) as count FROM categories');
  if (categories[0]?.count === 0) {
    const defaults = [
      { id: 'cat-hw', name: 'HARDWARE', description: 'Physical equipment issues', icon: 'cpu', color: '#EF4444', risk_weight: 3.0, sort_order: 1 },
      { id: 'cat-sw', name: 'SOFTWARE', description: 'Application and system software', icon: 'code', color: '#3B82F6', risk_weight: 2.0, sort_order: 2 },
      { id: 'cat-net', name: 'NETWORK', description: 'Connectivity and network issues', icon: 'wifi', color: '#F59E0B', risk_weight: 4.0, sort_order: 3 },
      { id: 'cat-sec', name: 'SECURITY', description: 'Security incidents and threats', icon: 'shield', color: '#DC2626', risk_weight: 5.0, sort_order: 4 },
      { id: 'cat-other', name: 'OTHER', description: 'Other uncategorized issues', icon: 'folder', color: '#6B7280', risk_weight: 2.0, sort_order: 99 },
    ];
    for (const c of defaults) {
      await run(
        'INSERT INTO categories (id, name, description, icon, color, risk_weight, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [c.id, c.name, c.description, c.icon, c.color, c.risk_weight, c.sort_order]
      );
    }
    logger.info('Seeded default categories');
  }

  const subcategories = await all('SELECT COUNT(*) as count FROM subcategories');
  if (subcategories[0]?.count === 0) {
    const categoryRows = await all('SELECT id, name FROM categories');
    const categoryIdByName = new Map<string, string>();
    for (const category of categoryRows) {
      categoryIdByName.set(String(category.name || '').toUpperCase(), category.id);
    }

    const defaults = [
      ['HARDWARE', 'Monitor / USB Peripheral', 1, 1, 1],
      ['HARDWARE', 'Printer / Scanner', 2, 1, 2],
      ['HARDWARE', 'PC / Laptop', 3, 1, 3],
      ['HARDWARE', 'UPS / Power Supply', 4, 0, 4],
      ['HARDWARE', 'Server / NAS', 4, 0, 5],
      ['HARDWARE', 'Datacenter / Rack', 5, 0, 6],
      ['SOFTWARE', 'Email Client / Office', 2, 1, 1],
      ['SOFTWARE', 'Internal Application', 2, 1, 2],
      ['SOFTWARE', 'OS / Drivers', 3, 1, 3],
      ['SOFTWARE', 'ERP / CRM / Business System', 4, 1, 4],
      ['SOFTWARE', 'Database / Application Server', 4, 1, 5],
      ['SOFTWARE', 'Production System', 5, 0, 6],
      ['NETWORK', 'Network Peripheral', 1, 1, 1],
      ['NETWORK', 'WiFi / Internet', 2, 1, 2],
      ['NETWORK', 'VPN / Remote Access', 3, 1, 3],
      ['NETWORK', 'Switch / Router', 4, 0, 4],
      ['NETWORK', 'Firewall / DNS', 4, 0, 5],
      ['NETWORK', 'Complete Network Failure', 5, 0, 6],
      ['SECURITY', 'Phishing / Suspicious Email', 2, 1, 1],
      ['SECURITY', 'Virus / Malware Detected', 3, 1, 2],
      ['SECURITY', 'Compromised Account / DDoS', 4, 0, 3],
      ['SECURITY', 'Unauthorized Access Confirmed', 5, 0, 4],
      ['SECURITY', 'Ransomware / Data Compromise', 5, 0, 5],
      ['OTHER', 'Uncategorized', 2, 1, 1],
    ] as const;

    for (const [categoryName, name, risk, impactAffects, sortOrder] of defaults) {
      const categoryId = categoryIdByName.get(categoryName);
      if (!categoryId) continue;
      await run(
        `INSERT INTO subcategories (id, category_id, name, risk, impact_affects, status, sort_order)
         VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?)`,
        [
          `sub-${categoryName.toLowerCase().slice(0, 3)}-${sortOrder}`,
          categoryId,
          name,
          risk,
          impactAffects,
          sortOrder,
        ]
      );
    }
    logger.info('Seeded default subcategories');
  }

  // Check if business_hours is empty, seed defaults (Mon-Fri 9-18)
  const businessHours = await all('SELECT COUNT(*) as count FROM business_hours');
  if (businessHours[0]?.count === 0) {
    for (let day = 0; day <= 6; day++) {
      const isWorkingDay = day >= 1 && day <= 5; // Mon-Fri
      await run(
        `INSERT INTO business_hours (id, config_id, day_of_week, start_time, end_time, is_working_day)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [`${defaultBusinessConfigId}-${day}`, defaultBusinessConfigId, day, '09:00', '18:00', isWorkingDay ? 1 : 0]
      );
      await run(
        `INSERT INTO business_hours (id, config_id, day_of_week, start_time, end_time, is_working_day)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [`${roundTheClockConfigId}-${day}`, roundTheClockConfigId, day, '00:00', '23:59']
      );
    }
    logger.info('Seeded default business hours');
  }

  const defaults = [
    { key: 'iss.urgency_weight', value: '0.4', type: 'number', category: 'iss', label: 'Urgency Weight', description: 'Weight factor for urgency in ISS calculation' },
    { key: 'iss.impact_weight', value: '0.4', type: 'number', category: 'iss', label: 'Impact Weight', description: 'Weight factor for impact in ISS calculation' },
    { key: 'iss.category_weight', value: '0.2', type: 'number', category: 'iss', label: 'Category Weight', description: 'Weight factor for category risk in ISS calculation' },
    { key: 'iss.threshold_p1', value: '4.0', type: 'number', category: 'iss', label: 'P1 Score Threshold', description: 'ISS score threshold that maps incidents to Priority P1 (Critical)' },
    { key: 'iss.threshold_p2', value: '3.0', type: 'number', category: 'iss', label: 'P2 Score Threshold', description: 'ISS score threshold that maps incidents to Priority P2 (High)' },
    { key: 'iss.threshold_p3', value: '2.0', type: 'number', category: 'iss', label: 'P3 Score Threshold', description: 'ISS score threshold that maps incidents to Priority P3 (Medium)' },
    { key: 'tss.boost_single_user', value: '0', type: 'number', category: 'tss', label: 'Single User Boost', description: 'Impact boost for SINGLE_USER incidents in TSS formula' },
    { key: 'tss.boost_department', value: '0.5', type: 'number', category: 'tss', label: 'Department Boost', description: 'Impact boost for DEPARTMENT incidents in TSS formula' },
    { key: 'tss.boost_organization', value: '1', type: 'number', category: 'tss', label: 'Organization Boost', description: 'Impact boost for ORGANIZATION incidents in TSS formula' },
    { key: 'tss.threshold_sev1', value: '5', type: 'number', category: 'tss', label: 'SEV-1 Score Threshold', description: 'TSS score threshold that maps incidents to SEV-1 (Critical)' },
    { key: 'tss.threshold_sev2', value: '4', type: 'number', category: 'tss', label: 'SEV-2 Score Threshold', description: 'TSS score threshold that maps incidents to SEV-2 (High)' },
    { key: 'tss.threshold_sev3', value: '3', type: 'number', category: 'tss', label: 'SEV-3 Score Threshold', description: 'TSS score threshold that maps incidents to SEV-3 (Medium)' },
    { key: 'tss.threshold_sev4', value: '2', type: 'number', category: 'tss', label: 'SEV-4 Score Threshold', description: 'TSS score threshold that maps incidents to SEV-4 (Low)' },
    { key: 'sla.check_interval_minutes', value: '30', type: 'number', category: 'sla', label: 'SLA Check Interval', description: 'Minutes between SLA monitor runs' },
    { key: 'sla.warning_threshold', value: '75', type: 'number', category: 'sla', label: 'SLA Warning Threshold', description: 'Percentage at which to warn about SLA risk' },
    { key: 'sla.response_warning_threshold', value: '75', type: 'number', category: 'sla', label: 'Response SLA Warning Threshold', description: 'Percentage at which to warn about first-response SLA risk' },
    { key: 'sla.response_risk_notifications_enabled', value: 'true', type: 'boolean', category: 'sla', label: 'Response Risk Notifications', description: 'Enable at-risk notifications for first-response SLA consumption' },
    { key: 'auto_assign.enabled', value: 'true', type: 'boolean', category: 'auto_assign', label: 'Auto-Assign Enabled', description: 'Enable or disable automatic engineer assignment globally' },
    { key: 'auto_assign.enable_junior', value: 'true', type: 'boolean', category: 'auto_assign', label: 'Enable Junior Tier', description: 'When enabled, incidents created by JUNIOR engineers are auto-assigned directly (no manager confirmation)' },
    { key: 'auto_assign.enable_mid', value: 'true', type: 'boolean', category: 'auto_assign', label: 'Enable Mid Tier', description: 'When enabled, incidents created by MID engineers are auto-assigned directly (no manager confirmation)' },
    { key: 'auto_assign.enable_senior', value: 'true', type: 'boolean', category: 'auto_assign', label: 'Enable Senior Tier', description: 'When enabled, incidents created by SENIOR engineers are auto-assigned directly (no manager confirmation)' },
    { key: 'auto_assign.limit_junior', value: '100', type: 'number', category: 'auto_assign', label: 'Junior Points Limit', description: 'Default points limit used for JUNIOR tier when engineer override is 0' },
    { key: 'auto_assign.limit_mid', value: '160', type: 'number', category: 'auto_assign', label: 'Mid Points Limit', description: 'Default points limit used for MID tier when engineer override is 0' },
    { key: 'auto_assign.limit_senior', value: '240', type: 'number', category: 'auto_assign', label: 'Senior Points Limit', description: 'Default points limit used for SENIOR tier when engineer override is 0' },
    { key: 'auto_assign.severity_points_sev1', value: '60', type: 'number', category: 'auto_assign', label: 'SEV-1 Points Cost', description: 'Points cost added to engineer load for SEV-1 incidents' },
    { key: 'auto_assign.severity_points_sev2', value: '35', type: 'number', category: 'auto_assign', label: 'SEV-2 Points Cost', description: 'Points cost added to engineer load for SEV-2 incidents' },
    { key: 'auto_assign.severity_points_sev3', value: '20', type: 'number', category: 'auto_assign', label: 'SEV-3 Points Cost', description: 'Points cost added to engineer load for SEV-3 incidents' },
    { key: 'auto_assign.severity_points_sev4', value: '10', type: 'number', category: 'auto_assign', label: 'SEV-4 Points Cost', description: 'Points cost added to engineer load for SEV-4 incidents' },
    { key: 'auto_assign.fallback_sev1', value: 'SENIOR', type: 'string', category: 'auto_assign', label: 'SEV-1 Required Tier', description: 'Preferred engineer tier order for SEV-1 auto-assign. The first tier is used as the required tier.' },
    { key: 'auto_assign.fallback_sev2', value: 'MID', type: 'string', category: 'auto_assign', label: 'SEV-2 Required Tier', description: 'Preferred engineer tier order for SEV-2 auto-assign. The first tier is used as the required tier.' },
    { key: 'auto_assign.fallback_sev3', value: 'JUNIOR', type: 'string', category: 'auto_assign', label: 'SEV-3 Required Tier', description: 'Preferred engineer tier order for SEV-3 auto-assign. The first tier is used as the required tier.' },
    { key: 'auto_assign.fallback_sev4', value: 'JUNIOR', type: 'string', category: 'auto_assign', label: 'SEV-4 Required Tier', description: 'Preferred engineer tier order for SEV-4 auto-assign. The first tier is used as the required tier.' },
    { key: 'upload.max_file_size_mb', value: '10', type: 'number', category: 'upload', label: 'Max File Size (MB)', description: 'Maximum file upload size in megabytes' },
    { key: 'notifications.email_enabled', value: 'false', type: 'boolean', category: 'notifications', label: 'Email Notifications', description: 'Enable email notifications' },
  ];

  for (const s of defaults) {
    await run(
      `INSERT OR IGNORE INTO system_settings (id, key, value, type, category, label, description)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [`set-${s.key.replace(/\./g, '-')}`, s.key, s.value, s.type, s.category, s.label, s.description]
    );
  }

  // Refresh fallback metadata without overwriting saved tier order selections.
  await run(
    `UPDATE system_settings
     SET value = CASE
       WHEN key = 'auto_assign.fallback_sev1' AND TRIM(COALESCE(value, '')) = '' THEN 'SENIOR'
       WHEN key = 'auto_assign.fallback_sev2' AND TRIM(COALESCE(value, '')) = '' THEN 'MID'
       WHEN key = 'auto_assign.fallback_sev3' AND TRIM(COALESCE(value, '')) = '' THEN 'JUNIOR'
       WHEN key = 'auto_assign.fallback_sev4' AND TRIM(COALESCE(value, '')) = '' THEN 'JUNIOR'
       ELSE value
     END,
     label = CASE
       WHEN key = 'auto_assign.fallback_sev1' THEN 'SEV-1 Required Tier'
       WHEN key = 'auto_assign.fallback_sev2' THEN 'SEV-2 Required Tier'
       WHEN key = 'auto_assign.fallback_sev3' THEN 'SEV-3 Required Tier'
       WHEN key = 'auto_assign.fallback_sev4' THEN 'SEV-4 Required Tier'
       ELSE label
     END,
     description = CASE
       WHEN key = 'auto_assign.fallback_sev1' THEN 'Preferred engineer tier order for SEV-1 auto-assign. The first tier is used as the required tier.'
       WHEN key = 'auto_assign.fallback_sev2' THEN 'Preferred engineer tier order for SEV-2 auto-assign. The first tier is used as the required tier.'
       WHEN key = 'auto_assign.fallback_sev3' THEN 'Preferred engineer tier order for SEV-3 auto-assign. The first tier is used as the required tier.'
       WHEN key = 'auto_assign.fallback_sev4' THEN 'Preferred engineer tier order for SEV-4 auto-assign. The first tier is used as the required tier.'
       ELSE description
     END
     WHERE key IN ('auto_assign.fallback_sev1', 'auto_assign.fallback_sev2', 'auto_assign.fallback_sev3', 'auto_assign.fallback_sev4')`
  );

  await run(
    `UPDATE system_settings
     SET label = CASE key
       WHEN 'auto_assign.severity_points_sev1' THEN 'SEV-1 Points Cost'
       WHEN 'auto_assign.severity_points_sev2' THEN 'SEV-2 Points Cost'
       WHEN 'auto_assign.severity_points_sev3' THEN 'SEV-3 Points Cost'
       WHEN 'auto_assign.severity_points_sev4' THEN 'SEV-4 Points Cost'
       ELSE label
     END,
     description = CASE key
       WHEN 'auto_assign.severity_points_sev1' THEN 'Points cost added to engineer load for SEV-1 incidents'
       WHEN 'auto_assign.severity_points_sev2' THEN 'Points cost added to engineer load for SEV-2 incidents'
       WHEN 'auto_assign.severity_points_sev3' THEN 'Points cost added to engineer load for SEV-3 incidents'
       WHEN 'auto_assign.severity_points_sev4' THEN 'Points cost added to engineer load for SEV-4 incidents'
       ELSE description
     END
     WHERE key IN (
       'auto_assign.severity_points_sev1',
       'auto_assign.severity_points_sev2',
       'auto_assign.severity_points_sev3',
       'auto_assign.severity_points_sev4'
     )`
  );

  await run(
    `UPDATE system_settings
     SET description = CASE key
       WHEN 'auto_assign.enable_junior' THEN 'When enabled, incidents created by JUNIOR engineers are auto-assigned directly (no manager confirmation)'
       WHEN 'auto_assign.enable_mid' THEN 'When enabled, incidents created by MID engineers are auto-assigned directly (no manager confirmation)'
       WHEN 'auto_assign.enable_senior' THEN 'When enabled, incidents created by SENIOR engineers are auto-assigned directly (no manager confirmation)'
       ELSE description
     END
     WHERE key IN (
       'auto_assign.enable_junior',
       'auto_assign.enable_mid',
       'auto_assign.enable_senior'
     )`
  );

  await run(
    `UPDATE system_settings
     SET label = CASE key
       WHEN 'iss.threshold_p1' THEN 'P1 Score Threshold'
       WHEN 'iss.threshold_p2' THEN 'P2 Score Threshold'
       WHEN 'iss.threshold_p3' THEN 'P3 Score Threshold'
       ELSE label
     END,
     description = CASE key
       WHEN 'iss.threshold_p1' THEN 'ISS score threshold that maps incidents to Priority P1 (Critical)'
       WHEN 'iss.threshold_p2' THEN 'ISS score threshold that maps incidents to Priority P2 (High)'
       WHEN 'iss.threshold_p3' THEN 'ISS score threshold that maps incidents to Priority P3 (Medium)'
       ELSE description
     END
     WHERE key IN ('iss.threshold_p1', 'iss.threshold_p2', 'iss.threshold_p3')`
  );

  await run(
    `UPDATE system_settings
     SET label = CASE key
       WHEN 'tss.threshold_sev1' THEN 'SEV-1 Score Threshold'
       WHEN 'tss.threshold_sev2' THEN 'SEV-2 Score Threshold'
       WHEN 'tss.threshold_sev3' THEN 'SEV-3 Score Threshold'
       WHEN 'tss.threshold_sev4' THEN 'SEV-4 Score Threshold'
       ELSE label
     END,
     description = CASE key
       WHEN 'tss.threshold_sev1' THEN 'TSS score threshold that maps incidents to SEV-1 (Critical)'
       WHEN 'tss.threshold_sev2' THEN 'TSS score threshold that maps incidents to SEV-2 (High)'
       WHEN 'tss.threshold_sev3' THEN 'TSS score threshold that maps incidents to SEV-3 (Medium)'
       WHEN 'tss.threshold_sev4' THEN 'TSS score threshold that maps incidents to SEV-4 (Low)'
       ELSE description
     END
     WHERE key IN ('tss.threshold_sev1', 'tss.threshold_sev2', 'tss.threshold_sev3', 'tss.threshold_sev4')`
  );

  // Legacy single-threshold setting is no longer used.
  await run(`DELETE FROM system_settings WHERE key = 'tss.severity_score_threshold'`);
}

// Run seeding after a short delay to ensure tables are created
setTimeout(() => {
  seedDefaults().catch(err => logger.error('Seed error', err));
}, 1000);

export function run(sql: string, params?: any[]): Promise<any> {
  return new Promise((resolve, reject) => {
    if (params) db.run(sql, params, function(err: any) {
      if (err) reject(err);
      else resolve(this);
    });
    else db.run(sql, function(err: any) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

export function get(sql: string, params?: any[]): Promise<any> {
  return new Promise((resolve, reject) => {
    if (params) db.get(sql, params, (err: any, row: any) => {
      if (err) reject(err);
      else resolve(row);
    });
    else db.get(sql, (err: any, row: any) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

export function all(sql: string, params?: any[]): Promise<any[]> {
  return new Promise((resolve, reject) => {
    if (params) db.all(sql, params, (err: any, rows: any) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
    else db.all(sql, (err: any, rows: any) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

export async function exportData() {
  const tables = [
    'users',
    'services',
    'incidents',
    'comments',
    'notifications',
    'escalation_rules',
    'on_call_schedule',
    'incident_activities',
    'sla_policies',
    'categories',
    'subcategories',
    'system_settings',
    'audit_logs',
    'business_hour_configs',
    'business_hours',
    'business_hour_holidays'
  ];
  const result: Record<string, any[]> = {};
  for (const t of tables) {
    result[t] = await all(`SELECT * FROM ${t}`);
  }
  return result;
}

export async function importData(data: Record<string, any[]>) {
  const tables = Object.keys(data || {});
  for (const t of tables) {
    const rows = data[t];
    if (!Array.isArray(rows)) continue;
    // Clear table
    await run(`DELETE FROM ${t}`);
    if (rows.length === 0) continue;
    const cols = Object.keys(rows[0]);
    const placeholders = cols.map(() => '?').join(',');
    for (const r of rows) {
      await run(`INSERT INTO ${t} (${cols.join(',')}) VALUES (${placeholders})`, cols.map(c => r[c]));
    }
  }
}

export default { run, get, all, exportData, importData };
