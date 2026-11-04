import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';

export const auditRouter = Router();
// Nhật ký chỉ đọc, chỉ Super Admin xem được.
auditRouter.use(requireAuth, requireRole('SUPER_ADMIN'));

auditRouter.get('/', async (req, res, next) => {
  try {
    const where = {};
    if (typeof req.query.action === 'string' && req.query.action) where.action = req.query.action;
    const logs = await prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 });
    res.json({ logs });
  } catch (e) { next(e); }
});
