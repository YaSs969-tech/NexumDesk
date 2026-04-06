import { Request, Response } from 'express';
import { run, get, all } from '../utils/sqlite';
import { v4 as uuidv4 } from 'uuid';

const ROUND_THE_CLOCK_CONFIG_ID = 'bhcfg-24x7';

function normalizeSystemSettingValue(key: string, value: any): string {
  const normalizeTierFallback = (raw: any): string => {
    const fallbackByKey: Record<string, string> = {
      'auto_assign.fallback_sev1': 'SENIOR',
      'auto_assign.fallback_sev2': 'MID',
      'auto_assign.fallback_sev3': 'JUNIOR',
      'auto_assign.fallback_sev4': 'JUNIOR',
    };
    const valid = new Set(['JUNIOR', 'MID', 'SENIOR']);
    const tokens = String(raw ?? '')
      .split(',')
      .map((item) => item.trim().toUpperCase())
      .filter((item) => valid.has(item));
    const deduped = tokens.filter((item, index) => tokens.indexOf(item) === index);
    if (deduped.length === 0) {
      return fallbackByKey[key] || 'SENIOR';
    }
    return deduped.join(',');
  };

  const toBooleanString = (raw: any): 'true' | 'false' => {
    if (typeof raw === 'boolean') {
      return raw ? 'true' : 'false';
    }
    const normalized = String(raw ?? '').trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return 'true';
    }
    return 'false';
  };

  if (key === 'upload.max_file_size_mb') {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return '10';
    }
    return String(Math.min(10, numeric));
  }

  if (key.startsWith('auto_assign.limit_')) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 1) {
      return '1';
    }
    return String(Math.round(numeric));
  }

  if (key.startsWith('tss.threshold_sev')) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return '1';
    }
    return String(Math.max(1, Math.min(5, numeric)));
  }

  if (key.startsWith('auto_assign.fallback_sev')) {
    return normalizeTierFallback(value);
  }

  if (
    key === 'auto_assign.enabled'
    || key === 'auto_assign.enable_junior'
    || key === 'auto_assign.enable_mid'
    || key === 'auto_assign.enable_senior'
  ) {
    return toBooleanString(value);
  }

  return String(value);
}

function normalizeBusinessHours(hours: any[] | undefined) {
  const defaultMap = new Map<number, any>();
  for (let day = 0; day <= 6; day++) {
    defaultMap.set(day, {
      day_of_week: day,
      start_time: '09:00',
      end_time: '18:00',
      is_working_day: day >= 1 && day <= 5 ? 1 : 0,
    });
  }

  if (Array.isArray(hours)) {
    for (const h of hours) {
      const day = Number(h.day_of_week);
      if (day < 0 || day > 6 || Number.isNaN(day)) continue;
      defaultMap.set(day, {
        day_of_week: day,
        start_time: h.start_time || '09:00',
        end_time: h.end_time || '18:00',
        is_working_day: h.is_working_day ? 1 : 0,
      });
    }
  }

  return Array.from(defaultMap.values()).sort((a, b) => a.day_of_week - b.day_of_week);
}

function normalizeHolidays(holidays: any[] | undefined) {
  if (!Array.isArray(holidays)) return [];
  const seen = new Set<string>();
  const items: { holiday_date: string; name: string | null }[] = [];

  for (const holiday of holidays) {
    const holidayDate = typeof holiday === 'string' ? holiday : holiday?.holiday_date;
    if (!holidayDate || typeof holidayDate !== 'string') continue;
    if (seen.has(holidayDate)) continue;
    seen.add(holidayDate);
    items.push({
      holiday_date: holidayDate,
      name: typeof holiday === 'string' ? null : (holiday?.name || null),
    });
  }

  return items.sort((a, b) => a.holiday_date.localeCompare(b.holiday_date));
}

// ============ SLA POLICIES ============
export const getSlaPolicies = async (req: Request, res: Response) => {
  try {
    const policies = await all(
      `SELECT p.*, c.name as business_hours_config_name
       FROM sla_policies p
       LEFT JOIN business_hour_configs c ON c.id = p.business_hours_config_id
       ORDER BY p.priority ASC`
    );
    res.json({ success: true, data: policies });
  } catch (error) {
    console.error('Error fetching SLA policies:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch SLA policies' });
  }
};

export const createSlaPolicy = async (req: Request, res: Response) => {
  try {
    const { priority, name, response_hours, resolution_hours, business_hours_config_id, is_active } = req.body;
    const id = `sla-${uuidv4().slice(0, 8)}`;

    const businessConfigId = business_hours_config_id || null;
    if (businessConfigId) {
      const config = await get('SELECT id FROM business_hour_configs WHERE id = ?', [businessConfigId]);
      if (!config) {
        return res.status(400).json({ success: false, message: 'Business hours configuration not found' });
      }
    }

    const businessHoursOnly = businessConfigId && businessConfigId !== ROUND_THE_CLOCK_CONFIG_ID ? 1 : 0;

    await run(
      `INSERT INTO sla_policies
       (id, priority, name, response_hours, resolution_hours, business_hours_only, business_hours_config_id, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, priority, name, response_hours, resolution_hours, businessHoursOnly, businessConfigId, is_active ? 1 : 0]
    );

    const policy = await get(
      `SELECT p.*, c.name as business_hours_config_name
       FROM sla_policies p
       LEFT JOIN business_hour_configs c ON c.id = p.business_hours_config_id
       WHERE p.id = ?`,
      [id]
    );

    res.status(201).json({ success: true, data: policy });
  } catch (error) {
    console.error('Error creating SLA policy:', error);
    res.status(500).json({ success: false, message: 'Failed to create SLA policy' });
  }
};

export const updateSlaPolicy = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { priority, name, response_hours, resolution_hours, business_hours_config_id, is_active } = req.body;
    
    const oldPolicy = await get('SELECT * FROM sla_policies WHERE id = ?', [id]);
    if (!oldPolicy) {
      return res.status(404).json({ success: false, message: 'SLA policy not found' });
    }
    
    const businessConfigId = business_hours_config_id || null;
    if (businessConfigId) {
      const config = await get('SELECT id FROM business_hour_configs WHERE id = ?', [businessConfigId]);
      if (!config) {
        return res.status(400).json({ success: false, message: 'Business hours configuration not found' });
      }
    }

    const businessHoursOnly = businessConfigId && businessConfigId !== ROUND_THE_CLOCK_CONFIG_ID ? 1 : 0;

    await run(
      `UPDATE sla_policies SET priority = ?, name = ?, response_hours = ?, resolution_hours = ?, 
       business_hours_only = ?, business_hours_config_id = ?, is_active = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [priority, name, response_hours, resolution_hours, businessHoursOnly, businessConfigId, is_active ? 1 : 0, id]
    );
    
    const newPolicy = await get(
      `SELECT p.*, c.name as business_hours_config_name
       FROM sla_policies p
       LEFT JOIN business_hour_configs c ON c.id = p.business_hours_config_id
       WHERE p.id = ?`,
      [id]
    );
    
    res.json({ success: true, data: newPolicy });
  } catch (error) {
    console.error('Error updating SLA policy:', error);
    res.status(500).json({ success: false, message: 'Failed to update SLA policy' });
  }
};

export const deleteSlaPolicy = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const policy = await get('SELECT * FROM sla_policies WHERE id = ?', [id]);
    if (!policy) {
      return res.status(404).json({ success: false, message: 'SLA policy not found' });
    }
    
    await run('DELETE FROM sla_policies WHERE id = ?', [id]);
    
    res.json({ success: true, message: 'SLA policy deleted' });
  } catch (error) {
    console.error('Error deleting SLA policy:', error);
    res.status(500).json({ success: false, message: 'Failed to delete SLA policy' });
  }
};

// ============ CATEGORIES ============
export const getCategories = async (req: Request, res: Response) => {
  try {
    const categories = await all('SELECT * FROM categories ORDER BY sort_order ASC');
    res.json({ success: true, data: categories });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch categories' });
  }
};

export const createCategory = async (req: Request, res: Response) => {
  try {
    const { name, description, icon, color, risk_weight, default_sla_hours, sort_order, is_active } = req.body;
    const id = `cat-${uuidv4().slice(0, 8)}`;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, message: 'Category name is required' });
    }
    
    const normalizedName = String(name).trim();
    const formattedName = normalizedName.charAt(0).toUpperCase() + normalizedName.slice(1).toLowerCase();

    await run(
      `INSERT INTO categories (id, name, description, icon, color, risk_weight, default_sla_hours, is_active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        formattedName,
        description || null,
        icon || 'folder',
        color || '#6B7280',
        Number.isFinite(Number(risk_weight)) ? Number(risk_weight) : 2.0,
        default_sla_hours ?? null,
        is_active !== undefined ? (is_active ? 1 : 0) : 1,
        Number.isFinite(Number(sort_order)) ? Number(sort_order) : 50,
      ]
    );
    
    const category = await get('SELECT * FROM categories WHERE id = ?', [id]);
    
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ success: false, message: 'Failed to create category' });
  }
};

export const updateCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, icon, color, risk_weight, default_sla_hours, is_active, sort_order } = req.body;
    
    const oldCategory = await get('SELECT * FROM categories WHERE id = ?', [id]);
    if (!oldCategory) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    
    const formattedName = name !== undefined
      ? String(name).trim().charAt(0).toUpperCase() + String(name).trim().slice(1).toLowerCase()
      : oldCategory.name;

    await run(
      `UPDATE categories SET name = ?, description = ?, icon = ?, color = ?, risk_weight = ?,
       default_sla_hours = ?, is_active = ?, sort_order = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [
        formattedName,
        description !== undefined ? description : oldCategory.description,
        icon !== undefined ? icon : oldCategory.icon,
        color !== undefined ? color : oldCategory.color,
        risk_weight !== undefined ? risk_weight : oldCategory.risk_weight,
        default_sla_hours !== undefined ? default_sla_hours : oldCategory.default_sla_hours,
        is_active !== undefined ? (is_active ? 1 : 0) : oldCategory.is_active,
        sort_order !== undefined ? sort_order : oldCategory.sort_order,
        id,
      ]
    );
    
    const newCategory = await get('SELECT * FROM categories WHERE id = ?', [id]);
    
    res.json({ success: true, data: newCategory });
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({ success: false, message: 'Failed to update category' });
  }
};

export const deleteCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const category = await get('SELECT * FROM categories WHERE id = ?', [id]);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    
    // Check if category is in use
    const inUse = await get('SELECT COUNT(*) as count FROM incidents WHERE category = ?', [category.name]);
    if (inUse && inUse.count > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Category is in use by ${inUse.count} incident(s). Deactivate it instead.` 
      });
    }
    
    await run('DELETE FROM categories WHERE id = ?', [id]);
    
    res.json({ success: true, message: 'Category deleted' });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ success: false, message: 'Failed to delete category' });
  }
};

// ============ SUBCATEGORIES (TSS) ============
export const getSubcategories = async (req: Request, res: Response) => {
  try {
    const categoryId = typeof req.query.category_id === 'string' ? req.query.category_id : '';

    const rows = await all(
      `SELECT sc.*, c.name as category_name
       FROM subcategories sc
       INNER JOIN categories c ON c.id = sc.category_id
       WHERE (? = '' OR sc.category_id = ?)
       ORDER BY c.sort_order ASC, sc.sort_order ASC, sc.name ASC`,
      [categoryId, categoryId]
    );

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching subcategories:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch subcategories' });
  }
};

export const createSubcategory = async (req: Request, res: Response) => {
  try {
    const { category_id, name, risk, impact_affects, status, sort_order } = req.body;
    const id = `sub-${uuidv4().slice(0, 8)}`;

    if (!category_id || !name || !String(name).trim()) {
      return res.status(400).json({ success: false, message: 'Category and subcategory name are required' });
    }

    const category = await get('SELECT id FROM categories WHERE id = ?', [category_id]);
    if (!category) {
      return res.status(400).json({ success: false, message: 'Category not found' });
    }

    await run(
      `INSERT INTO subcategories (id, category_id, name, risk, impact_affects, status, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        category_id,
        String(name).trim(),
        Math.max(1, Math.min(5, Number(risk || 2))),
        impact_affects ? 1 : 0,
        status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
        Number.isFinite(Number(sort_order)) ? Number(sort_order) : 50,
      ]
    );

    const created = await get(
      `SELECT sc.*, c.name as category_name
       FROM subcategories sc
       INNER JOIN categories c ON c.id = sc.category_id
       WHERE sc.id = ?`,
      [id]
    );

    res.status(201).json({ success: true, data: created });
  } catch (error) {
    console.error('Error creating subcategory:', error);
    res.status(500).json({ success: false, message: 'Failed to create subcategory' });
  }
};

export const updateSubcategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { category_id, name, risk, impact_affects, status, sort_order } = req.body;

    const existing = await get('SELECT * FROM subcategories WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Subcategory not found' });
    }

    const nextCategoryId = category_id || existing.category_id;
    const category = await get('SELECT id FROM categories WHERE id = ?', [nextCategoryId]);
    if (!category) {
      return res.status(400).json({ success: false, message: 'Category not found' });
    }

    await run(
      `UPDATE subcategories
       SET category_id = ?, name = ?, risk = ?, impact_affects = ?, status = ?, sort_order = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [
        nextCategoryId,
        name !== undefined ? String(name).trim() : existing.name,
        risk !== undefined ? Math.max(1, Math.min(5, Number(risk))) : existing.risk,
        impact_affects !== undefined ? (impact_affects ? 1 : 0) : existing.impact_affects,
        status !== undefined ? (status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE') : existing.status,
        sort_order !== undefined ? Number(sort_order) : existing.sort_order,
        id,
      ]
    );

    const updated = await get(
      `SELECT sc.*, c.name as category_name
       FROM subcategories sc
       INNER JOIN categories c ON c.id = sc.category_id
       WHERE sc.id = ?`,
      [id]
    );

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error updating subcategory:', error);
    res.status(500).json({ success: false, message: 'Failed to update subcategory' });
  }
};

export const toggleSubcategoryStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await get('SELECT id, status FROM subcategories WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Subcategory not found' });
    }

    const nextStatus = existing.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    await run('UPDATE subcategories SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', [nextStatus, id]);

    const updated = await get('SELECT * FROM subcategories WHERE id = ?', [id]);
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error toggling subcategory status:', error);
    res.status(500).json({ success: false, message: 'Failed to toggle subcategory status' });
  }
};

export const deleteSubcategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const subcategory = await get('SELECT * FROM subcategories WHERE id = ?', [id]);
    if (!subcategory) {
      return res.status(404).json({ success: false, message: 'Subcategory not found' });
    }

    const inUse = await get('SELECT COUNT(*) as count FROM incidents WHERE subcategory_id = ?', [id]);
    if (inUse && inUse.count > 0) {
      return res.status(400).json({
        success: false,
        message: `Subcategory is in use by ${inUse.count} incident(s). Update incidents first before deleting.`,
      });
    }

    await run('DELETE FROM subcategories WHERE id = ?', [id]);

    res.json({ success: true, message: 'Subcategory deleted' });
  } catch (error) {
    console.error('Error deleting subcategory:', error);
    res.status(500).json({ success: false, message: 'Failed to delete subcategory' });
  }
};

// ============ SYSTEM SETTINGS ============
export const getSystemSettings = async (req: Request, res: Response) => {
  try {
    const { category } = req.query;
    let query = 'SELECT * FROM system_settings';
    const params: string[] = [];
    
    if (category) {
      query += ' WHERE category = ?';
      params.push(category as string);
    }
    
    query += ' ORDER BY category, key';
    const settings = await all(query, params);
    res.json({ success: true, data: settings });
  } catch (error) {
    console.error('Error fetching system settings:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch system settings' });
  }
};

export const updateSystemSetting = async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const normalizedValue = normalizeSystemSettingValue(key, req.body?.value);
    
    const oldSetting = await get('SELECT * FROM system_settings WHERE key = ?', [key]);
    if (!oldSetting) {
      return res.status(404).json({ success: false, message: 'Setting not found' });
    }
    
    await run(
      `UPDATE system_settings SET value = ?, updated_by = ?, updated_at = datetime('now') WHERE key = ?`,
      [normalizedValue, (req as any).user.id, key]
    );
    
    const newSetting = await get('SELECT * FROM system_settings WHERE key = ?', [key]);
    
    res.json({ success: true, data: newSetting });
  } catch (error) {
    console.error('Error updating system setting:', error);
    res.status(500).json({ success: false, message: 'Failed to update setting' });
  }
};

export const bulkUpdateSystemSettings = async (req: Request, res: Response) => {
  try {
    const { settings } = req.body; // Array of { key, value }
    
    for (const setting of settings) {
      const oldSetting = await get('SELECT * FROM system_settings WHERE key = ?', [setting.key]);
      if (oldSetting) {
        const normalizedValue = normalizeSystemSettingValue(setting.key, setting.value);
        await run(
          `UPDATE system_settings SET value = ?, updated_by = ?, updated_at = datetime('now') WHERE key = ?`,
          [normalizedValue, (req as any).user.id, setting.key]
        );
      }
    }
    
    const allSettings = await all('SELECT * FROM system_settings ORDER BY category, key');
    res.json({ success: true, data: allSettings });
  } catch (error) {
    console.error('Error bulk updating settings:', error);
    res.status(500).json({ success: false, message: 'Failed to update settings' });
  }
};

// ============ BUSINESS HOURS ============
export const getBusinessHours = async (req: Request, res: Response) => {
  try {
    const [configs, hours, holidays] = await Promise.all([
      all('SELECT * FROM business_hour_configs ORDER BY created_at DESC'),
      all('SELECT * FROM business_hours ORDER BY config_id ASC, day_of_week ASC'),
      all('SELECT * FROM business_hour_holidays ORDER BY config_id ASC, holiday_date ASC'),
    ]);

    const hoursByConfig = new Map<string, any[]>();
    const holidaysByConfig = new Map<string, any[]>();

    for (const hour of hours) {
      const configId = hour.config_id;
      if (!hoursByConfig.has(configId)) hoursByConfig.set(configId, []);
      hoursByConfig.get(configId)!.push(hour);
    }

    for (const holiday of holidays) {
      const configId = holiday.config_id;
      if (!holidaysByConfig.has(configId)) holidaysByConfig.set(configId, []);
      holidaysByConfig.get(configId)!.push(holiday);
    }

    const data = configs.map((config: any) => ({
      ...config,
      hours: (hoursByConfig.get(config.id) || []).sort((a, b) => a.day_of_week - b.day_of_week),
      holidays: holidaysByConfig.get(config.id) || [],
    }));

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching business hours:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch business hours' });
  }
};

export const updateBusinessHours = async (req: Request, res: Response) => {
  try {
    const { config_id, name, description, is_active, hours, holidays } = req.body;

    let configId = config_id;
    if (!configId) {
      const fallback = await get('SELECT id FROM business_hour_configs ORDER BY created_at ASC LIMIT 1');
      configId = fallback?.id;
    }

    if (!configId) {
      return res.status(400).json({ success: false, message: 'No business-hours configuration available' });
    }

    const config = await get('SELECT * FROM business_hour_configs WHERE id = ?', [configId]);
    if (!config) {
      return res.status(404).json({ success: false, message: 'Business-hours configuration not found' });
    }

    await run(
      `UPDATE business_hour_configs
       SET name = ?, description = ?, is_active = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [
        name || config.name,
        description !== undefined ? description : config.description,
        is_active !== undefined ? (is_active ? 1 : 0) : config.is_active,
        configId,
      ]
    );

    if (Array.isArray(hours)) {
      const normalizedHours = normalizeBusinessHours(hours);
      await run('DELETE FROM business_hours WHERE config_id = ?', [configId]);
      for (const h of normalizedHours) {
        await run(
          `INSERT INTO business_hours (id, config_id, day_of_week, start_time, end_time, is_working_day)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [`${configId}-${h.day_of_week}`, configId, h.day_of_week, h.start_time, h.end_time, h.is_working_day ? 1 : 0]
        );
      }
    }

    if (Array.isArray(holidays)) {
      const normalizedHolidays = normalizeHolidays(holidays);
      await run('DELETE FROM business_hour_holidays WHERE config_id = ?', [configId]);
      for (const holiday of normalizedHolidays) {
        await run(
          `INSERT INTO business_hour_holidays (id, config_id, holiday_date, name)
           VALUES (?, ?, ?, ?)`,
          [`bhh-${uuidv4().slice(0, 8)}`, configId, holiday.holiday_date, holiday.name]
        );
      }
    }

    const [newConfig, newHours, newHolidays] = await Promise.all([
      get('SELECT * FROM business_hour_configs WHERE id = ?', [configId]),
      all('SELECT * FROM business_hours WHERE config_id = ? ORDER BY day_of_week ASC', [configId]),
      all('SELECT * FROM business_hour_holidays WHERE config_id = ? ORDER BY holiday_date ASC', [configId]),
    ]);

    res.json({
      success: true,
      data: {
        ...newConfig,
        hours: newHours,
        holidays: newHolidays,
      },
    });
  } catch (error) {
    console.error('Error updating business hours:', error);
    res.status(500).json({ success: false, message: 'Failed to update business hours' });
  }
};

export const createBusinessHoursConfig = async (req: Request, res: Response) => {
  try {
    const { name, description, hours, holidays } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Configuration name is required' });
    }

    const existing = await get('SELECT id FROM business_hour_configs WHERE lower(name) = lower(?)', [name.trim()]);
    if (existing) {
      return res.status(400).json({ success: false, message: 'Configuration name already exists' });
    }

    const configId = `bhcfg-${uuidv4().slice(0, 8)}`;
    const normalizedHours = normalizeBusinessHours(hours);
    const normalizedHolidays = normalizeHolidays(holidays);

    await run(
      `INSERT INTO business_hour_configs (id, name, description, is_active)
       VALUES (?, ?, ?, 1)`,
      [configId, name.trim(), description || null]
    );

    for (const h of normalizedHours) {
      await run(
        `INSERT INTO business_hours (id, config_id, day_of_week, start_time, end_time, is_working_day)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [`${configId}-${h.day_of_week}`, configId, h.day_of_week, h.start_time, h.end_time, h.is_working_day]
      );
    }

    for (const holiday of normalizedHolidays) {
      await run(
        `INSERT INTO business_hour_holidays (id, config_id, holiday_date, name)
         VALUES (?, ?, ?, ?)`,
        [`bhh-${uuidv4().slice(0, 8)}`, configId, holiday.holiday_date, holiday.name]
      );
    }

    const [config, createdHours, createdHolidays] = await Promise.all([
      get('SELECT * FROM business_hour_configs WHERE id = ?', [configId]),
      all('SELECT * FROM business_hours WHERE config_id = ? ORDER BY day_of_week ASC', [configId]),
      all('SELECT * FROM business_hour_holidays WHERE config_id = ? ORDER BY holiday_date ASC', [configId]),
    ]);

    res.status(201).json({
      success: true,
      data: {
        ...config,
        hours: createdHours,
        holidays: createdHolidays,
      },
    });
  } catch (error) {
    console.error('Error creating business hours config:', error);
    res.status(500).json({ success: false, message: 'Failed to create business-hours configuration' });
  }
};

export const deleteBusinessHoursConfig = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (id === 'bhcfg-standard' || id === ROUND_THE_CLOCK_CONFIG_ID) {
      return res.status(400).json({ success: false, message: 'Default configurations cannot be deleted' });
    }

    const config = await get('SELECT * FROM business_hour_configs WHERE id = ?', [id]);
    if (!config) {
      return res.status(404).json({ success: false, message: 'Business-hours configuration not found' });
    }

    const inUse = await get('SELECT COUNT(*) as count FROM sla_policies WHERE business_hours_config_id = ?', [id]);
    if (inUse?.count > 0) {
      const fallbackConfig = await get(
        'SELECT id FROM business_hour_configs WHERE id != ? ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END, created_at ASC LIMIT 1',
        [id, ROUND_THE_CLOCK_CONFIG_ID]
      );

      if (!fallbackConfig?.id) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete the last available business-hours configuration',
        });
      }

      const fallbackIs24x7 = fallbackConfig.id === ROUND_THE_CLOCK_CONFIG_ID;
      await run(
        `UPDATE sla_policies
         SET business_hours_config_id = ?,
             business_hours_only = ?,
             updated_at = datetime('now')
         WHERE business_hours_config_id = ?`,
        [fallbackConfig.id, fallbackIs24x7 ? 0 : 1, id]
      );
    }

    await run('DELETE FROM business_hour_holidays WHERE config_id = ?', [id]);
    await run('DELETE FROM business_hours WHERE config_id = ?', [id]);
    await run('DELETE FROM business_hour_configs WHERE id = ?', [id]);

    res.json({ success: true, message: 'Business-hours configuration deleted' });
  } catch (error) {
    console.error('Error deleting business hours config:', error);
    res.status(500).json({ success: false, message: 'Failed to delete business-hours configuration' });
  }
};

// ============ ADMIN DASHBOARD STATS ============
export const getAdminStats = async (req: Request, res: Response) => {
  try {
    const [
      usersCount,
      activeUsersCount,
      totalIncidents,
      openIncidents,
      criticalIncidents,
      slaStats,
      statusCounts,
      recentIncidents
    ] = await Promise.all([
      get('SELECT COUNT(*) as count FROM users'),
      get('SELECT COUNT(*) as count FROM users WHERE is_active = 1'),
      get('SELECT COUNT(*) as count FROM incidents'),
      get(`SELECT COUNT(*) as count FROM incidents WHERE status NOT IN ('RESOLVED', 'CANCELLED')`),
      get(`SELECT COUNT(*) as count FROM incidents WHERE priority = '1' AND status NOT IN ('RESOLVED', 'CANCELLED')`),
      get(`SELECT 
        COUNT(CASE WHEN sla_percent_at_resolve <= 100 THEN 1 END) as met,
        COUNT(*) as total
        FROM incidents WHERE status IN ('RESOLVED', 'CANCELLED') AND sla_percent_at_resolve IS NOT NULL`),
      all(`SELECT status, COUNT(*) as count FROM incidents GROUP BY status`),
      all(`SELECT id, title, priority, status, created_at FROM incidents ORDER BY created_at DESC LIMIT 5`)
    ]);
    
    const slaCompliance = slaStats?.total > 0 
      ? Math.round((slaStats.met / slaStats.total) * 100) 
      : 100;
    
    res.json({
      success: true,
      data: {
        totalUsers: usersCount?.count || 0,
        activeUsers: activeUsersCount?.count || 0,
        totalIncidents: totalIncidents?.count || 0,
        openIncidents: openIncidents?.count || 0,
        criticalIncidents: criticalIncidents?.count || 0,
        slaCompliance,
        statusCounts: statusCounts || [],
        recentIncidents: recentIncidents || []
      }
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch admin stats' });
  }
};
