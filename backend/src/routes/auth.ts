import { Router } from 'express';
import { register, login, me, changePassword } from '../controllers/authController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', requireAuth, me);
router.put('/change-password', requireAuth, changePassword);

export default router;
