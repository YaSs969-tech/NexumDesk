import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { get } from '../utils/db';
import logger from '../utils/logger';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        username: string;
        email: string;
        full_name: string;
        role: string;
        status: string;
      };
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = req.headers.authorization as string | undefined;
    
    if (!auth || !auth.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }
    
    const token = auth.split(' ')[1];
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      logger.error('JWT_SECRET is not set — using insecure fallback. Set JWT_SECRET in production!');
    }
    const payload: any = jwt.verify(token, secret || 'dev_secret_key');
    
    // Load user from database
    const user = await get(
      'SELECT id, username, email, full_name, role, status FROM users WHERE id = ?',
      [payload.sub]
    );
    
    if (!user) {
      res.status(401).json({ success: false, error: 'Invalid token' });
      return;
    }
    
    if (user.status !== 'ACTIVE') {
      res.status(403).json({ success: false, error: 'Account is inactive' });
      return;
    }
    
    req.user = user;
    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      res.status(401).json({ success: false, error: 'Token expired' });
    } else if (err.name === 'JsonWebTokenError') {
      res.status(401).json({ success: false, error: 'Invalid token' });
    } else {
      res.status(401).json({ success: false, error: 'Authentication failed' });
    }
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;
    
    if (!user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }
    
    if (!roles.includes(user.role)) {
      res.status(403).json({ 
        success: false, 
        error: `Access denied. Required role: ${roles.join(' or ')}` 
      });
      return;
    }
    
    next();
  };
}

export function requireAdminOrSelf(req: Request): boolean {
  const user = req.user;
  if (!user) return false;
  
  const resourceId = req.params.id;
  const isAdmin = user.role === 'ADMIN';
  const isSelf = user.id === resourceId;
  
  return isAdmin || isSelf;
}

export function requireRoleOrSelf(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;
    
    if (!user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }
    
    const isSelf = user.id === req.params.id;
    const hasRequiredRole = roles.includes(user.role);
    
    if (!isSelf && !hasRequiredRole) {
      res.status(403).json({ 
        success: false, 
        error: `Access denied` 
      });
      return;
    }
    
    next();
  };
}
