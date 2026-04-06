import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { createIncident, listIncidents, getIncidentById, updateIncident, deleteIncident, completeIncident, getEngineers, addActivity, getIncidentActivities, getIncidentAuditChanges, getUserNotifications, getUnreadNotificationCount, markNotificationAsRead, getDashboardStats, getIncidentTrend, getSeverityStats, clearAllNotifications, reopenIncident, overrideIncidentMetrics, acceptIncidentMetrics, checkIncidentSLAStatus, checkAndNotifySLABreaches, confirmIncidentResponse, listIncidentCategories, listIncidentSubcategories, approveAssignment, triggerAutoAssign } from '../controllers/incidentController';
import { requireAuth } from '../middleware/auth';
import logger from '../utils/logger';
import { get } from '../utils/sqlite';

const router = Router();
const ABSOLUTE_MAX_FILE_SIZE_MB = 10;
const DEFAULT_FILE_SIZE_MB = 10;
const MAX_ATTACHMENTS_PER_INCIDENT = 10;

// Configure multer for file uploads
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp|pdf|doc|docx/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = file.mimetype.startsWith('image/') ||
                   file.mimetype === 'application/pdf' ||
                   file.mimetype === 'application/msword' ||
                   file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (extname || mimetype) {
    return cb(null, true);
  }
  cb(new Error('Only images, PDFs, and Word documents are allowed'));
};

async function getConfiguredUploadLimitMb(): Promise<number> {
  const row = await get('SELECT value FROM system_settings WHERE key = ? LIMIT 1', ['upload.max_file_size_mb']);
  const parsed = Number(row?.value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_FILE_SIZE_MB;
  }
  return Math.min(ABSOLUTE_MAX_FILE_SIZE_MB, parsed);
}

async function incidentUploadMiddleware(req: Request, res: Response, next: any) {
  try {
    const limitMb = await getConfiguredUploadLimitMb();
    const upload = multer({
      storage,
      limits: {
        fileSize: Math.floor(limitMb * 1024 * 1024),
        files: MAX_ATTACHMENTS_PER_INCIDENT,
      },
      fileFilter,
    }).fields([
      { name: 'attachment', maxCount: 1 },
      { name: 'attachments', maxCount: MAX_ATTACHMENTS_PER_INCIDENT },
    ]);

    upload(req, res, (err) => {
      if (err) {
        return res.status(400).json({ success: false, error: err.message });
      }
      next();
    });
  } catch (error: any) {
    logger.error('Failed to initialize incident upload middleware', error);
    res.status(500).json({ success: false, error: 'Failed to initialize upload middleware' });
  }
}

router.get('/upload-config', requireAuth, async (_req: Request, res: Response) => {
  try {
    const maxFileSizeMb = await getConfiguredUploadLimitMb();
    res.json({
      success: true,
      data: {
        max_file_size_mb: maxFileSizeMb,
        absolute_max_file_size_mb: ABSOLUTE_MAX_FILE_SIZE_MB,
        max_attachments_per_incident: MAX_ATTACHMENTS_PER_INCIDENT,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// List all incidents
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const result = await listIncidents(req.query);
  res.json({ success: true, data: result });
});

// Get user notifications
router.get('/notifications', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const notifications = await getUserNotifications(user.id);
    res.json({ success: true, data: notifications });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get unread notification count
router.get('/notifications/unread-count', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const count = await getUnreadNotificationCount(user.id);
    res.json({ success: true, data: { count } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Mark notification as read
router.put('/notifications/:id/read', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const updated = await markNotificationAsRead(req.params.id, user.id);
    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Clear all notifications
router.delete('/notifications', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const result = await clearAllNotifications(user.id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get dashboard statistics with optional date range
router.get('/stats/dashboard', requireAuth, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const stats = await getDashboardStats(startDate as string, endDate as string);
    res.json({ success: true, data: stats });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get incident trend with optional date range
router.get('/stats/trend', requireAuth, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const trend = await getIncidentTrend(startDate as string, endDate as string);
    res.json({ success: true, data: trend });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get severity statistics with optional date range
router.get('/stats/severity', requireAuth, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const stats = await getSeverityStats(startDate as string, endDate as string);
    res.json({ success: true, data: stats });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Check all incidents for SLA breaches and send notifications (cron endpoint)
router.post('/sla/check-breaches', async (_req: Request, res: Response) => {
  try {
    const result = await checkAndNotifySLABreaches();
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get engineers list (for manager assignment) - MUST be before /:id
router.get('/engineers/list', requireAuth, async (_req: Request, res: Response) => {
  try {
    const engineers = await getEngineers();
    res.json({ success: true, data: { engineers } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get active categories for incident creation forms - MUST be before /:id
router.get('/categories', requireAuth, listIncidentCategories);

// Get active subcategories for selected category - MUST be before /:id
router.get('/subcategories', requireAuth, listIncidentSubcategories);

// Audit change feed for reports - MUST be before /:id
router.get('/audit/changes', requireAuth, async (req: Request, res: Response) => {
  try {
    const start = typeof req.query.start === 'string' ? req.query.start : undefined;
    const end = typeof req.query.end === 'string' ? req.query.end : undefined;
    const changes = await getIncidentAuditChanges(start, end);
    res.json({ success: true, data: changes });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Complete incident (for engineer) - MUST be before /:id
router.post('/:id/complete', requireAuth, async (req: Request, res: Response) => {
  try {
    const { resolution_notes, resolution_time } = req.body;
    const user = (req as any).user;
    const completed = await completeIncident(req.params.id, resolution_notes, resolution_time, user?.id, user?.full_name || user?.username);
    res.json({ success: true, data: completed });
  } catch (error: any) {
    if (error.message === 'Incident not found') {
      return res.status(404).json({ success: false, error: error.message });
    }
    res.status(400).json({ success: false, error: error.message });
  }
});

// Reopen incident (for resolved/cancelled incidents) - MUST be before /:id
router.post('/:id/reopen', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const reopened = await reopenIncident(req.params.id, user?.id, user?.full_name || user?.username);
    res.json({ success: true, data: reopened });
  } catch (error: any) {
    if (error.message === 'Incident not found') {
      return res.status(404).json({ success: false, error: error.message });
    }
    res.status(400).json({ success: false, error: error.message });
  }
});

// Override ISS-calculated metrics (Manager/Admin only) - MUST be before /:id
router.post('/:id/override', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { newSeverity, newPriority, overrideReason } = req.body;
    
    const overridden = await overrideIncidentMetrics(
      req.params.id,
      { newSeverity, newPriority, overrideReason },
      user?.id,
      user?.full_name || user?.username,
      user?.role
    );
    
    res.json({ success: true, data: overridden });
  } catch (error: any) {
    if (error.message === 'Incident not found') {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (error.message.includes('Only managers') || error.message.includes('Override reason')) {
      return res.status(403).json({ success: false, error: error.message });
    }
    res.status(400).json({ success: false, error: error.message });
  }
});

// Accept ISS-calculated metrics (Manager/Admin only) - MUST be before /:id
router.post('/:id/accept', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    
    const result = await acceptIncidentMetrics(
      req.params.id,
      user?.id,
      user?.full_name || user?.username,
      user?.role
    );
    
    res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.message === 'Incident not found') {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (error.message.includes('Only managers')) {
      return res.status(403).json({ success: false, error: error.message });
    }
    res.status(400).json({ success: false, error: error.message });
  }
});

// Assign incident to engineer - MUST be before /:id
router.put('/:id/assign', requireAuth, async (req: Request, res: Response) => {
  try {
    const { assigned_to, estimated_resolution_time } = req.body;
    const user = (req as any).user;
    
    if (!assigned_to) {
      return res.status(400).json({ success: false, error: 'assigned_to is required' });
    }
    
    const payload: Record<string, any> = {
      assigned_to,
    };

    if (estimated_resolution_time !== undefined) {
      payload.estimated_resolution_time = estimated_resolution_time;
    }

    const updated = await updateIncident(req.params.id, payload, user?.id, user?.full_name || user?.username);
    res.json({ success: true, data: updated });
  } catch (error: any) {
    if (error.message === 'Incident not found') {
      return res.status(404).json({ success: false, error: error.message });
    }
    res.status(400).json({ success: false, error: error.message });
  }
});

// Check SLA status for specific incident - MUST be before /:id
router.get('/:id/sla-status', requireAuth, async (req: Request, res: Response) => {
  try {
    const slaStatus = await checkIncidentSLAStatus(req.params.id);
    res.json({ success: true, data: slaStatus });
  } catch (error: any) {
    if (error.message === 'Incident not found') {
      return res.status(404).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// Confirm first response time - MUST be before /:id
router.post('/:id/confirm-response', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const result = await confirmIncidentResponse(
      req.params.id,
      user?.id,
      user?.role,
      user?.full_name || user?.username || 'Unknown'
    );
    res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.message === 'Incident not found') {
      return res.status(404).json({ success: false, error: error.message });
    }
    res.status(400).json({ success: false, error: error.message });
  }
});

// Get incident activities - MUST be before /:id
router.get('/:id/activities', requireAuth, async (req: Request, res: Response) => {
  try {
    const activities = await getIncidentActivities(req.params.id);
    res.json({ success: true, data: activities });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Approve pending assignment (Manager/Admin) - MUST be before /:id
router.post('/:id/approve-assignment', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { engineer_id } = req.body; // optional override
    const result = await approveAssignment(
      req.params.id,
      user?.id,
      user?.full_name || user?.username || 'Manager',
      user?.role,
      engineer_id || null
    );
    res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.message === 'Incident not found') {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (error.message.includes('Only managers')) {
      return res.status(403).json({ success: false, error: error.message });
    }
    res.status(400).json({ success: false, error: error.message });
  }
});

// Trigger fresh auto-assign (Manager/Admin) - MUST be before /:id
router.post('/:id/trigger-autoassign', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!['ADMIN', 'MANAGER'].includes(user?.role)) {
      return res.status(403).json({ success: false, error: 'Only managers and admins can trigger auto-assign' });
    }
    const result = await triggerAutoAssign(
      req.params.id,
      user?.id,
      user?.full_name || user?.username || 'Manager'
    );
    res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.message === 'Incident not found') {
      return res.status(404).json({ success: false, error: error.message });
    }
    res.status(400).json({ success: false, error: error.message });
  }
});

// Add activity to incident - MUST be before /:id
router.post('/:id/activities', requireAuth, async (req: Request, res: Response) => {
  try {
    const { action, description } = req.body;
    const user = (req as any).user;
    
    if (!action) {
      return res.status(400).json({ success: false, error: 'action is required' });
    }
    
    const activity = await addActivity(
      req.params.id,
      user?.id || null,
      user?.full_name || user?.username || null,
      action,
      description || ''
    );
    
    res.json({ success: true, data: activity });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Create incident with optional file uploads
router.post('/', requireAuth, incidentUploadMiddleware, async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    
    // Get user ID and role from authenticated user
    const user = (req as any).user;
    const userId = user?.id;
    const userRole = user?.role;
    
    // Handle uploaded files from both legacy field (attachment) and new field (attachments)
    const filesByField = (req.files as { [fieldname: string]: Express.Multer.File[] } | undefined) || {};
    const uploadedFiles = [
      ...(filesByField.attachment || []),
      ...(filesByField.attachments || []),
    ];

    if (uploadedFiles.length > 0) {
      payload.attachment_url = uploadedFiles.map((file) => `/uploads/${file.filename}`).join(',');
    }
    
    // Pass userId and userRole to controller
    const created = await createIncident(payload, userId, userRole);
    res.status(201).json({ success: true, data: created });
  } catch (error: any) {
    logger.error('Create incident failed', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// Get single incident - MUST be last after all specific /:id/* routes
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const incident = await getIncidentById(req.params.id);
    if (!incident) {
      return res.status(404).json({ success: false, error: 'Incident not found' });
    }
    res.json({ success: true, data: incident });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update incident
router.put('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const updated = await updateIncident(req.params.id, req.body, user?.id, user?.full_name || user?.username);
    res.json({ success: true, data: updated });
  } catch (error: any) {
    if (error.message === 'Incident not found') {
      return res.status(404).json({ success: false, error: error.message });
    }
    res.status(400).json({ success: false, error: error.message });
  }
});

// Delete incident
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    await deleteIncident(req.params.id);
    res.json({ success: true, data: { deleted: true } });
  } catch (error: any) {
    if (error.message === 'Incident not found') {
      return res.status(404).json({ success: false, error: error.message });
    }
    res.status(400).json({ success: false, error: error.message });
  }
});

export default router;
