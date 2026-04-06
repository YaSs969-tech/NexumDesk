import { Request, Response } from 'express';
import Joi from 'joi';
import bcrypt from 'bcryptjs';
import { all, get, run } from '../utils/db';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

export const userCreateSchema = Joi.object({
  username: Joi.string().min(2).max(50).required(),
  email: Joi.string().email().required(),
  full_name: Joi.string().allow('', null).max(100),
  phone: Joi.string().allow('', null).max(20),
  department: Joi.string().allow('', null).max(50),
  job_title: Joi.string().allow('', null).max(50),
  password: Joi.string().min(8).required(),
  role: Joi.string().valid('ADMIN', 'MANAGER', 'ENGINEER', 'USER').default('USER'),
  status: Joi.string().valid('ACTIVE', 'INACTIVE').default('ACTIVE'),
  tier: Joi.string().valid('JUNIOR', 'MID', 'SENIOR').allow('', null),
  points_limit: Joi.number().integer().min(0).max(10000).default(0),
  auto_assign_enabled: Joi.boolean().default(true),
});

export const userUpdateSchema = Joi.object({
  username: Joi.string().min(2).max(50),
  email: Joi.string().email(),
  full_name: Joi.string().allow('', null).max(100),
  phone: Joi.string().allow('', null).max(20),
  department: Joi.string().allow('', null).max(50),
  job_title: Joi.string().allow('', null).max(50),
  role: Joi.string().valid('ADMIN', 'MANAGER', 'ENGINEER', 'USER'),
  status: Joi.string().valid('ACTIVE', 'INACTIVE'),
  tier: Joi.string().valid('JUNIOR', 'MID', 'SENIOR').allow('', null),
  points_limit: Joi.number().integer().min(0).max(10000),
  auto_assign_enabled: Joi.boolean(),
}).min(1);

export const userLoginSchema = Joi.object({
  username: Joi.string().required(),
  password: Joi.string().required(),
});

function normalizeTierForRole(role: string, tier?: string | null): string | null {
  if (role !== 'ENGINEER') {
    return null;
  }

  if (!tier) {
    return null;
  }

  return tier;
}

// ============================================================================
// CONTROLLERS
// ============================================================================

export async function listUsers(_req: Request, res: Response) {
  try {
    const rows = await all(
      'SELECT id, username, email, full_name, phone, department, job_title, role, tier, status, COALESCE(points_limit, 0) AS points_limit, COALESCE(auto_assign_enabled, 1) AS auto_assign_enabled, last_login, created_at FROM users ORDER BY created_at DESC'
    );
    res.json({ success: true, data: { users: rows } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function createUser(req: Request, res: Response) {
  const { error, value } = userCreateSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ success: false, error: error.details[0].message });
  }

  try {
    // Check if user already exists
    const existing = await get(
      'SELECT id FROM users WHERE email = ? OR username = ?',
      [value.email, value.username]
    );
    if (existing) {
      return res.status(409).json({ success: false, error: 'Username or email already exists' });
    }

    const id = uuidv4();
    const hash = await bcrypt.hash(value.password, 10);
    const now = new Date().toISOString();
    const tier = normalizeTierForRole(value.role, value.tier || null);

    if (value.role === 'ENGINEER' && !tier) {
      return res.status(400).json({ success: false, error: 'Tier is required for engineer role' });
    }
    
    const pointsLimit = value.role === 'ENGINEER' ? Number(value.points_limit ?? 0) : 0;
    const autoAssignEnabled = value.role === 'ENGINEER' ? (value.auto_assign_enabled ? 1 : 0) : 1;

    await run(
      `INSERT INTO users (id, username, email, password_hash, full_name, phone, department, job_title, role, tier, status, points_limit, auto_assign_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, value.username, value.email, hash, value.full_name || null, value.phone || null, value.department || null, value.job_title || null, value.role, tier, value.status || 'ACTIVE', pointsLimit, autoAssignEnabled, now, now]
    );

    res.status(201).json({ 
      success: true, 
      data: { id, username: value.username, email: value.email } 
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getUser(req: Request, res: Response) {
  try {
    const uid = req.params.id;
    const row = await get(
      'SELECT id, username, email, full_name, phone, department, job_title, role, tier, status, COALESCE(points_limit, 0) AS points_limit, COALESCE(auto_assign_enabled, 1) AS auto_assign_enabled, created_at FROM users WHERE id = ?',
      [uid]
    );
    if (!row) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({ success: true, data: row });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function updateUser(req: Request, res: Response) {
  const { error, value } = userUpdateSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ success: false, error: error.details[0].message });
  }

  try {
    const uid = req.params.id;

    const currentUser = await get('SELECT id, role, tier, points_limit, auto_assign_enabled FROM users WHERE id = ?', [uid]);
    if (!currentUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Check for duplicate username/email (excluding current user)
    if (value.username || value.email) {
      const existing = await get(
        'SELECT id FROM users WHERE id != ? AND (username = ? OR email = ?)',
        [uid, value.username, value.email]
      );
      if (existing) {
        return res.status(409).json({ success: false, error: 'Username or email already exists' });
      }
    }

    const effectiveRole = value.role ?? currentUser.role;
    const requestedTier = value.tier !== undefined ? value.tier : currentUser.tier;
    const normalizedTier = normalizeTierForRole(effectiveRole, requestedTier);

    if (effectiveRole === 'ENGINEER' && !normalizedTier) {
      return res.status(400).json({ success: false, error: 'Tier is required for engineer role' });
    }

    const now = new Date().toISOString();
    const updates: string[] = [];
    const values: any[] = [];

    const fieldMap: Record<string, string> = {
      username: 'username',
      email: 'email',
      full_name: 'full_name',
      phone: 'phone',
      department: 'department',
      job_title: 'job_title',
      role: 'role',
      status: 'status',
      tier: 'tier',
      points_limit: 'points_limit',
      auto_assign_enabled: 'auto_assign_enabled',
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (value[key as keyof typeof value] !== undefined) {
        updates.push(`${dbField} = ?`);
        if (key === 'tier') {
          values.push(normalizedTier);
        } else if (key === 'auto_assign_enabled') {
          values.push(value[key as keyof typeof value] ? 1 : 0);
        } else if (key === 'points_limit') {
          const pointsLimit = effectiveRole === 'ENGINEER' ? Number(value[key as keyof typeof value] ?? 0) : 0;
          values.push(pointsLimit);
        } else {
          values.push(value[key as keyof typeof value]);
        }
      }
    }

    if (value.role !== undefined && value.tier === undefined) {
      updates.push('tier = ?');
      values.push(normalizedTier);
    }

    if (value.role !== undefined && value.points_limit === undefined) {
      updates.push('points_limit = ?');
      values.push(effectiveRole === 'ENGINEER' ? Number(currentUser.points_limit || 0) : 0);
    }

    if (value.role !== undefined && value.auto_assign_enabled === undefined) {
      updates.push('auto_assign_enabled = ?');
      values.push(effectiveRole === 'ENGINEER' ? Number(currentUser.auto_assign_enabled ?? 1) : 1);
    }
    
    updates.push('updated_at = ?');
    values.push(now);
    values.push(uid);

    await run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
    
    res.json({ 
      success: true, 
      data: { id: uid, ...value, updated_at: now } 
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function deleteUser(req: Request, res: Response) {
  try {
    const id = req.params.id;
    await run('DELETE FROM users WHERE id = ?', [id]);
    res.json({ success: true, data: { deleted: true } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function resetPassword(req: Request, res: Response) {
  const { password } = req.body;
  
  if (!password || password.length < 8) {
    return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
  }
  
  try {
    const id = req.params.id;
    const hash = await bcrypt.hash(password, 10);
    const now = new Date().toISOString();
    
    await run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [hash, now, id]);
    
    res.json({ success: true, data: { message: 'Password reset successfully' } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}
