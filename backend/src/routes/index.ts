import { Router } from 'express';
import incidentsRouter from './incidents';
import adminRouter from './admin';
import authRouter from './auth';
import usersRouter from './users';
import uploadsRouter from './uploads';

const router = Router();

router.use('/incidents', incidentsRouter);
router.use('/admin', adminRouter);
router.use('/auth', authRouter);
router.use('/users', usersRouter);
router.use('/uploads', uploadsRouter);

export default router;
