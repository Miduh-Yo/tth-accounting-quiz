import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { DUMMY_HASH, hashPassword, passwordSchema, verifyPassword } from '../password.js';
import { audit } from '../audit.js';
import { clearSessionCookie, publicUser, requireAuth, setSessionCookie, signSession } from '../auth.js';

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Quá nhiều lần thử, vui lòng thử lại sau' }
});

const loginSchema = z.object({ username: z.string().trim().min(1).max(64), password: z.string().min(1).max(200) });

authRouter.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
    const { username, password } = parsed.data;
    const generic = { error: 'Sai tên đăng nhập hoặc mật khẩu' };

    const user = await prisma.user.findUnique({ where: { username: username.toLowerCase() } });
    const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);

    if (!user) { await audit(req, 'LOGIN_FAILED', { actor: null, detail: username.slice(0, 64) }); return res.status(401).json(generic); }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return res.status(429).json({ error: 'Tài khoản tạm khoá do đăng nhập sai nhiều lần. Thử lại sau.' });
    }
    if (!ok) {
      const failed = user.failedLogins + 1;
      const lock = failed >= config.maxFailedLogins;
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLogins: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + config.lockMinutes * 60000) : null }
      });
      await audit(req, 'LOGIN_FAILED', { actor: user, targetType: 'User', targetId: user.id, detail: lock ? 'locked' : undefined });
      return res.status(401).json(generic);
    }
    // Chỉ báo trạng thái khoá/vô hiệu sau khi mật khẩu đúng, tránh lộ thông tin tài khoản.
    if (user.status !== 'ACTIVE') return res.status(403).json({ error: 'Tài khoản đã bị khoá hoặc vô hiệu hoá' });
    await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
    setSessionCookie(res, signSession(user));
    await audit(req, 'LOGIN', { actor: user });
    res.json({ user: publicUser(user) });
  } catch (e) { next(e); }
});

authRouter.post('/logout', (_req, res) => { clearSessionCookie(res); res.json({ ok: true }); });

authRouter.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

const changeSchema = z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema });

authRouter.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const parsed = changeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const { currentPassword, newPassword } = parsed.data;
    if (!(await verifyPassword(currentPassword, req.user.passwordHash))) {
      return res.status(400).json({ error: 'Mật khẩu hiện tại không đúng' });
    }
    if (currentPassword === newPassword) return res.status(400).json({ error: 'Mật khẩu mới phải khác mật khẩu cũ' });
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false, tokenVersion: { increment: 1 } }
    });
    await audit(req, 'PASSWORD_CHANGED', { targetType: 'User', targetId: req.user.id });
    setSessionCookie(res, signSession(updated)); // các phiên cũ bị vô hiệu
    res.json({ user: publicUser(updated) });
  } catch (e) { next(e); }
});
