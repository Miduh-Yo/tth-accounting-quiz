import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { hashPassword, passwordSchema } from '../password.js';
import { ROLE_RANK, publicUser, requireAuth, requireRole } from '../auth.js';

export const usersRouter = Router();
usersRouter.use(requireAuth, requireRole('ADMIN'));

// Chỉ được quản lý người có cấp thấp hơn mình; SUPER_ADMIN được cấp ADMIN, ADMIN chỉ cấp EMPLOYEE.
const canManage = (actor, targetRole) => ROLE_RANK[targetRole] < ROLE_RANK[actor.role];

usersRouter.get('/', async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ users: users.map(publicUser) });
  } catch (e) { next(e); }
});

const createSchema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,32}$/, 'Tên đăng nhập 3-32 ký tự: a-z, 0-9, . _ -'),
  fullName: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().optional().or(z.literal('').transform(() => undefined)),
  role: z.enum(['ADMIN', 'EMPLOYEE']).default('EMPLOYEE'),
  password: passwordSchema
});

usersRouter.post('/', async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const d = parsed.data;
    if (!canManage(req.user, d.role)) return res.status(403).json({ error: 'Bạn không có quyền tạo vai trò này' });
    const user = await prisma.user.create({
      data: { username: d.username, fullName: d.fullName, email: d.email, role: d.role,
              passwordHash: await hashPassword(d.password), mustChangePassword: true }
    });
    await audit(req, 'USER_CREATED', { targetType: 'User', targetId: user.id, detail: `${user.username} (${user.role})` });
    res.status(201).json({ user: publicUser(user) });
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Tên đăng nhập hoặc email đã tồn tại' });
    next(e);
  }
});

const updateSchema = z.object({
  fullName: z.string().trim().min(1).max(100).optional(),
  status: z.enum(['ACTIVE', 'LOCKED', 'DISABLED']).optional(),
  role: z.enum(['ADMIN', 'EMPLOYEE']).optional(),
  newPassword: passwordSchema.optional()
});

usersRouter.patch('/:id', async (req, res, next) => {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    if (target.id === req.user.id) return res.status(400).json({ error: 'Không thể tự sửa tài khoản của mình ở đây' });
    if (!canManage(req.user, target.role)) return res.status(403).json({ error: 'Bạn không có quyền với người dùng này' });
    const { fullName, status, role, newPassword } = parsed.data;
    if (role && !canManage(req.user, role)) return res.status(403).json({ error: 'Bạn không có quyền gán vai trò này' });

    const data = { fullName, status, role };
    if (status && status !== 'ACTIVE') data.tokenVersion = { increment: 1 };
    if (status === 'ACTIVE') { data.failedLogins = 0; data.lockedUntil = null; }
    if (newPassword) {
      data.passwordHash = await hashPassword(newPassword);
      data.mustChangePassword = true;
      data.tokenVersion = { increment: 1 };
    }
    const user = await prisma.user.update({ where: { id: target.id }, data });
    await audit(req, 'USER_UPDATED', { targetType: 'User', targetId: user.id,
      detail: [status && `status=${status}`, role && `role=${role}`, fullName && 'fullName', newPassword && 'password reset'].filter(Boolean).join(', ') });
    res.json({ user: publicUser(user) });
  } catch (e) { next(e); }
});
