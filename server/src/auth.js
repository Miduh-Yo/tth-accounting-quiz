import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { prisma } from './db.js';

export const ROLE_RANK = { EMPLOYEE: 1, ADMIN: 2, SUPER_ADMIN: 3 };

export function signSession(user) {
  return jwt.sign({ sub: user.id, v: user.tokenVersion }, config.jwtSecret, {
    expiresIn: `${config.jwtExpiresHours}h`
  });
}

const cookieBase = () => ({ httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, path: '/' });

export function setSessionCookie(res, token) {
  res.cookie(config.cookieName, token, { ...cookieBase(), maxAge: config.jwtExpiresHours * 3600 * 1000 });
}

export function clearSessionCookie(res) {
  res.clearCookie(config.cookieName, cookieBase());
}

export function publicUser(u) {
  return {
    id: u.id, username: u.username, fullName: u.fullName, email: u.email,
    role: u.role, status: u.status, mustChangePassword: u.mustChangePassword,
    createdAt: u.createdAt
  };
}

// Xác thực: đọc cookie, kiểm tra JWT, nạp lại user từ DB (khoá/đổi quyền có hiệu lực ngay).
export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[config.cookieName];
    if (!token) return res.status(401).json({ error: 'Chưa đăng nhập' });
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== 'ACTIVE' || user.tokenVersion !== payload.v) {
      return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ' });
    }
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn' });
  }
}

// Phân quyền theo vai trò tối thiểu (SUPER_ADMIN > ADMIN > EMPLOYEE).
export function requireRole(minRole) {
  return (req, res, next) => {
    if (ROLE_RANK[req.user.role] >= ROLE_RANK[minRole]) return next();
    res.status(403).json({ error: 'Bạn không có quyền thực hiện thao tác này' });
  };
}
