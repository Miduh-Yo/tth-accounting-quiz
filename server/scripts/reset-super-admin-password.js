// Đặt lại mật khẩu Super Admin khi quên (chạy từ máy có quyền vào database).
//   SEED_SUPER_ADMIN_PASSWORD  : mật khẩu tạm mới (bắt buộc; >= 10 ký tự, có hoa, thường, số)
//   SEED_SUPER_ADMIN_USERNAME  : chọn tài khoản khi có nhiều Super Admin (không bắt buộc nếu chỉ có một)
// Tài khoản bị buộc đổi mật khẩu ở lần đăng nhập sau; mọi phiên đăng nhập cũ bị vô hiệu.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hashPassword, passwordSchema } from '../src/password.js';

const prisma = new PrismaClient();
try {
  const admins = await prisma.user.findMany({ where: { role: 'SUPER_ADMIN' }, orderBy: { createdAt: 'asc' } });
  if (admins.length === 0) throw new Error('Chưa có Super Admin nào. Hãy chạy: npm run seed:super-admin -w server');

  const wanted = (process.env.SEED_SUPER_ADMIN_USERNAME || '').trim().toLowerCase();
  let target;
  if (wanted) {
    target = admins.find(a => a.username === wanted);
    if (!target) throw new Error(`Không có Super Admin tên "${wanted}". Các tài khoản Super Admin: ${admins.map(a => a.username).join(', ')}`);
  } else if (admins.length === 1) {
    target = admins[0];
  } else {
    throw new Error(`Có nhiều Super Admin (${admins.map(a => a.username).join(', ')}). Đặt SEED_SUPER_ADMIN_USERNAME để chọn.`);
  }

  const password = process.env.SEED_SUPER_ADMIN_PASSWORD;
  if (!password) throw new Error(`Đặt SEED_SUPER_ADMIN_PASSWORD (mật khẩu tạm mới). Tài khoản sẽ được đặt lại: ${target.username}`);
  const check = passwordSchema.safeParse(password);
  if (!check.success) throw new Error(check.error.issues[0].message);

  await prisma.user.update({
    where: { id: target.id },
    data: {
      passwordHash: await hashPassword(password), mustChangePassword: true, status: 'ACTIVE',
      failedLogins: 0, lockedUntil: null, tokenVersion: { increment: 1 }
    }
  });
  await prisma.auditLog.create({ data: { action: 'SUPER_ADMIN_PASSWORD_RESET', actorName: 'cli', targetType: 'User', targetId: target.id, detail: target.username } });
  console.log(`Đã đặt lại mật khẩu cho Super Admin: ${target.username}`);
  console.log('Đăng nhập bằng mật khẩu tạm vừa đặt; hệ thống sẽ bắt đổi mật khẩu ngay.');
} catch (e) {
  console.error('Lỗi:', e.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
