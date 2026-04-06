import { Router, Request, Response } from 'express';
import { exportData, importData } from '../utils/db';
import { requireAuth } from '../middleware/auth';
import {
  getSlaPolicies,
  createSlaPolicy,
  updateSlaPolicy,
  deleteSlaPolicy,
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getSubcategories,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,
  toggleSubcategoryStatus,
  getSystemSettings,
  updateSystemSetting,
  bulkUpdateSystemSettings,
  getBusinessHours,
  updateBusinessHours,
  createBusinessHoursConfig,
  deleteBusinessHoursConfig,
  getAdminStats
} from '../controllers/adminController';

const router = Router();

// Admin check middleware
const requireAdmin = (req: any, res: any, next: any) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};

// Manager or Admin check middleware
const requireManagerOrAdmin = (req: any, res: any, next: any) => {
  if (req.user?.role !== 'ADMIN' && req.user?.role !== 'MANAGER') {
    return res.status(403).json({ success: false, message: 'Manager or Admin access required' });
  }
  next();
};

// Export/Import routes — require authentication and admin role
router.get('/export', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const data = await exportData();
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

router.post('/import', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    await importData(payload);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// Authenticated admin routes
router.use(requireAuth);

// Admin Dashboard Stats
router.get('/stats', requireAdmin, getAdminStats);

// SLA Policies
router.get('/sla-policies', requireManagerOrAdmin, getSlaPolicies);
router.post('/sla-policies', requireAdmin, createSlaPolicy);
router.put('/sla-policies/:id', requireAdmin, updateSlaPolicy);
router.delete('/sla-policies/:id', requireAdmin, deleteSlaPolicy);

// Categories
router.get('/categories', requireManagerOrAdmin, getCategories);
router.post('/categories', requireAdmin, createCategory);
router.put('/categories/:id', requireAdmin, updateCategory);
router.delete('/categories/:id', requireAdmin, deleteCategory);

// Subcategories (TSS)
router.get('/subcategories', requireManagerOrAdmin, getSubcategories);
router.post('/subcategories', requireAdmin, createSubcategory);
router.put('/subcategories/:id', requireAdmin, updateSubcategory);
router.delete('/subcategories/:id', requireAdmin, deleteSubcategory);
router.patch('/subcategories/:id/toggle-status', requireAdmin, toggleSubcategoryStatus);

// System Settings
router.get('/settings', requireAdmin, getSystemSettings);
router.put('/settings/:key', requireAdmin, updateSystemSetting);
router.put('/settings', requireAdmin, bulkUpdateSystemSettings);

// Business Hours
router.get('/business-hours', requireManagerOrAdmin, getBusinessHours);
router.post('/business-hours', requireAdmin, createBusinessHoursConfig);
router.put('/business-hours', requireAdmin, updateBusinessHours);
router.delete('/business-hours/:id', requireAdmin, deleteBusinessHoursConfig);

export default router;
