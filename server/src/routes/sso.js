// Đăng nhập một lần từ Cổng phần mềm TTH (http://localhost:8100).
// Cổng cấp «vé» dùng một lần (60 giây) rồi chuyển trình duyệt tới GET /sso?ve=...
// Ở đây đổi vé lấy mã NV bằng lời gọi máy-chủ-sang-máy-chủ tới Cổng (Cổng chỉ nhận từ cùng máy),
// tìm tài khoản có username = mã NV rồi mở phiên như đăng nhập thường. Không tự tạo tài khoản.
import { Router } from 'express';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { setSessionCookie, signSession } from '../auth.js';

export const ssoRouter = Router();

const portalUrl = () => (process.env.TTH_CONG_URL || 'http://127.0.0.1:8100').replace(/\/+$/, '');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

class SsoError extends Error { constructor(status, message) { super(message); this.status = status; } }

export async function redeemTicket(ve) {
  let res;
  try {
    res = await fetch(`${portalUrl()}/api/ve/doi`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ve }),
      signal: AbortSignal.timeout(5000)
    });
  } catch {
    throw new SsoError(503, 'Không kết nối được Cổng phần mềm. Hãy đăng nhập bằng tên đăng nhập và mật khẩu.');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new SsoError(res.status === 401 ? 401 : 403,
      typeof body.detail === 'string' && body.detail ? body.detail : 'Cổng không chấp nhận vé đăng nhập.');
  }
  return body;
}

function errorPage(res, status, message) {
  res.status(status).set('Cache-Control', 'no-store').type('html').send(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Không đăng nhập được</title>'
    + '<body style="font:15px Segoe UI,sans-serif;max-width:480px;margin:12vh auto;padding:0 16px"><h2>Không đăng nhập tự động được</h2>'
    + `<p>${esc(message)}</p><p><a href="/">Đăng nhập bằng tên đăng nhập và mật khẩu</a></p></body>`);
}

ssoRouter.get('/', async (req, res, next) => {
  try {
    const ve = typeof req.query.ve === 'string' ? req.query.ve : '';
    if (!ve || ve.length > 200) return errorPage(res, 400, 'Thiếu vé đăng nhập. Hãy bấm lại từ trang chủ Cổng phần mềm.');
    let info;
    try { info = await redeemTicket(ve); } catch (e) {
      if (e instanceof SsoError) return errorPage(res, e.status, e.message);
      throw e;
    }
    const code = String(info?.ma_nv ?? '').trim().toLowerCase();
    if (!/^[a-z0-9._-]{1,64}$/.test(code)) {
      return errorPage(res, 403, 'Tài khoản của bạn chưa có mã nhân viên hợp lệ ở Cổng phần mềm. Liên hệ quản lý Cổng.');
    }
    const user = await prisma.user.findUnique({ where: { username: code } });
    if (!user || user.status !== 'ACTIVE') {
      await audit(req, 'LOGIN_FAILED', { actor: null, detail: `SSO ${code}`.slice(0, 64) });
      return errorPage(res, 403, `Mã nhân viên ${code} chưa có tài khoản trong phần mềm này hoặc đã bị khoá. Liên hệ quản trị.`);
    }
    await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
    setSessionCookie(res, signSession(user));
    await audit(req, 'LOGIN', { actor: user, detail: 'SSO' });
    res.set('Cache-Control', 'no-store').redirect(303, '/');
  } catch (e) { next(e); }
});
