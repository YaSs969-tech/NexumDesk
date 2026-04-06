import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import { run, all } from '../utils/db';
import { requireAuth } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// Get multer from app
const getUpload = (req: Request) => (req as any).app.get('upload') as multer.Multer;

// Upload single file
router.post('/upload', async (req: Request, res: Response) => {
  try {
    const upload = getUpload(req);
    
    upload.single('file')(req, res, async (err: any) => {
      if (err) {
        return res.status(400).json({ success: false, error: err.message });
      }

      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
      }

      const { incident_id, description } = req.body;
      const fileId = uuidv4();
      const now = new Date().toISOString();

      // Save to database
      await run(
        `INSERT INTO attachments (id, incident_id, filename, original_name, file_size, mime_type, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [fileId, incident_id || null, req.file.filename, req.file.originalname, req.file.size, req.file.mimetype, description || null, now]
      );

      res.json({ 
        success: true, 
        data: {
          id: fileId,
          filename: req.file.filename,
          original_name: req.file.originalname,
          file_size: req.file.size,
          incident_id: incident_id,
          created_at: now
        }
      });
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get attachments for incident
router.get('/incidents/:id/attachments', async (req: Request, res: Response) => {
  try {
    const attachments = await all('SELECT * FROM attachments WHERE incident_id = ? ORDER BY created_at DESC', [req.params.id]);
    res.json({ success: true, data: { attachments } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get user's attachments
router.get('/users/:id/attachments', async (req: Request, res: Response) => {
  try {
    const attachments = await all(
      `SELECT a.* FROM attachments a 
       JOIN incidents i ON a.incident_id = i.id 
       WHERE i.created_by = ? 
       ORDER BY a.created_at DESC`,
      [req.params.id]
    );
    res.json({ success: true, data: { attachments } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete attachment
router.delete('/attachments/:id', async (req: Request, res: Response) => {
  try {
    const attachment = await all('SELECT * FROM attachments WHERE id = ?', [req.params.id]);
    if (!attachment || !attachment[0]) {
      return res.status(404).json({ success: false, error: 'Attachment not found' });
    }

    const file = attachment[0];
    
    // Delete file from disk
    const filePath = path.join(process.cwd(), 'uploads', file.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete from database
    await run('DELETE FROM attachments WHERE id = ?', [req.params.id]);

    res.json({ success: true, data: { deleted: true } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Download file
router.get('/attachments/:id/download', async (req: Request, res: Response) => {
  try {
    const attachment = await all('SELECT * FROM attachments WHERE id = ?', [req.params.id]);
    if (!attachment || !attachment[0]) {
      return res.status(404).json({ success: false, error: 'Attachment not found' });
    }

    const file = attachment[0];
    const filePath = path.join(process.cwd(), 'uploads', file.filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'File not found on disk' });
    }

    res.download(filePath, file.original_name);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
