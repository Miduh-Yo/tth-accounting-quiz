import { prisma } from './db.js';

// Ghi nhật ký kiểm toán. Lỗi ghi log không được làm hỏng thao tác chính.
export async function audit(req, action, { actor, targetType, targetId, detail } = {}) {
  try {
    const who = actor ?? req.user;
    await prisma.auditLog.create({
      data: {
        action, actorId: who?.id ?? null, actorName: who?.username ?? null,
        targetType: targetType ?? null, targetId: targetId ?? null,
        detail: detail ?? null, ip: req.ip ?? null
      }
    });
  } catch (e) { console.error('audit failed', e.message); }
}
