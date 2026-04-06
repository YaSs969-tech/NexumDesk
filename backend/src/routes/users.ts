import { Router } from 'express';
import { listUsers, createUser, getUser, updateUser, deleteUser, resetPassword } from '../controllers/userController';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// ============================================================================
// USER ROUTES
// ============================================================================

// GET /users - List all users (ADMIN only)
router.get('/', requireAuth, requireRole('ADMIN'), listUsers);

// POST /users - Create new user (ADMIN only)
router.post('/', requireAuth, requireRole('ADMIN'), createUser);

// GET /users/:id - Get user by ID (ADMIN or own profile)
router.get('/:id', requireAuth, (req, res, next) => {
  const isSelf = req.user?.id === req.params.id;
  const isAdmin = req.user?.role === 'ADMIN';
  if (!isSelf && !isAdmin) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }
  next();
}, getUser);

// PUT /users/:id - Update user (ADMIN or own profile)
router.put('/:id', requireAuth, (req, res, next) => {
  const isSelf = req.user?.id === req.params.id;
  const isAdmin = req.user?.role === 'ADMIN';
  if (!isSelf && !isAdmin) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }
  next();
}, updateUser);

// DELETE /users/:id - Delete user (ADMIN only)
router.delete('/:id', requireAuth, requireRole('ADMIN'), deleteUser);

// POST /users/:id/reset-password - Reset password (ADMIN only)
router.post('/:id/reset-password', requireAuth, requireRole('ADMIN'), resetPassword);

export default router;
