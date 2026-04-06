import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { get, run } from '../utils/db';
import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';

const registerSchema = Joi.object({
  username: Joi.string().min(3).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  full_name: Joi.string().allow(null, ''),
  phone: Joi.string().allow(null, '')
});

export async function register(req: Request, res: Response) {
  const { error, value } = registerSchema.validate(req.body);
  if (error) return res.status(400).json({ success: false, error: error.message });

  const existing = await get('SELECT * FROM users WHERE email = ? OR username = ?', [value.email, value.username]);
  if (existing) return res.status(409).json({ success: false, error: 'User already exists' });

  const id = uuidv4();
  const hash = await bcrypt.hash(value.password, 10);
  const now = new Date().toISOString();

  // Split full_name into first_name and last_name
  const nameParts = (value.full_name || '').split(' ');
  const first_name = nameParts[0] || null;
  const last_name = nameParts.slice(1).join(' ') || null;

  await run(
    `INSERT INTO users (id, username, email, password_hash, first_name, last_name, phone, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, value.username, value.email, hash, first_name, last_name, value.phone || null, 'USER', 'ACTIVE', now, now]
  );

  return res.status(201).json({ success: true, data: { id, username: value.username, email: value.email } });
}

const loginSchema = Joi.object({ email: Joi.string().email().required(), password: Joi.string().required() });

const changePasswordSchema = Joi.object({
  current_password: Joi.string().required(),
  new_password: Joi.string().min(8).required(),
  confirm_new_password: Joi.string().valid(Joi.ref('new_password')).required(),
});

export async function login(req: Request, res: Response) {
  const { error, value } = loginSchema.validate(req.body);
  if (error) return res.status(400).json({ success: false, error: error.message });

  const user = await get('SELECT * FROM users WHERE email = ?', [value.email]);
  if (!user) return res.status(401).json({ success: false, error: 'Invalid credentials' });

  if (user.status === 'INACTIVE') {
    return res.status(403).json({ success: false, error: 'This account is inactive. Please contact your administrator.' });
  }

  const valid = await bcrypt.compare(value.password, user.password_hash);
  if (!valid) return res.status(401).json({ success: false, error: 'Invalid credentials' });

  const payload = { sub: user.id, role: user.role, username: user.username };
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    logger.error('JWT_SECRET is not set — using insecure fallback. Set JWT_SECRET in production!');
  }
  const token = jwt.sign(payload, jwtSecret || 'dev_secret_key', { expiresIn: '1h' });

  // Update last_login timestamp
  const now = new Date().toISOString();
  await run('UPDATE users SET last_login = ?, updated_at = ? WHERE id = ?', [now, now, user.id]);

  // Parse full_name into first_name and last_name
  const nameParts = (user.full_name || '').split(' ');
  const first_name = nameParts[0] || '';
  const last_name = nameParts.slice(1).join(' ') || '';

  return res.json({ 
    success: true, 
    data: { 
      access_token: token, 
      user: { 
        id: user.id, 
        username: user.username, 
        email: user.email,
        role: user.role,
        first_name,
        last_name
      } 
    } 
  });
}

export async function me(req: Request, res: Response) {
  const userId = (req as any).user?.sub || (req as any).user?.id;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  
  const user = await get('SELECT id, username, email, first_name, last_name, full_name, phone, department, job_title, role, status, last_login, created_at FROM users WHERE id = ?', [userId]);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });
  
  return res.json({ success: true, data: user });
}

export async function changePassword(req: Request, res: Response) {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const { error, value } = changePasswordSchema.validate(req.body);
  if (error) return res.status(400).json({ success: false, error: error.message });

  const user = await get('SELECT id, password_hash FROM users WHERE id = ?', [userId]);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });

  const isCurrentValid = await bcrypt.compare(value.current_password, user.password_hash);
  if (!isCurrentValid) {
    return res.status(400).json({ success: false, error: 'Current password is incorrect' });
  }

  const isSamePassword = await bcrypt.compare(value.new_password, user.password_hash);
  if (isSamePassword) {
    return res.status(400).json({ success: false, error: 'New password must be different from current password' });
  }

  const newHash = await bcrypt.hash(value.new_password, 10);
  const now = new Date().toISOString();
  await run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [newHash, now, userId]);

  return res.json({ success: true, message: 'Password changed successfully' });
}
