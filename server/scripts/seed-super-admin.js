// Khởi tạo Super Admin an toàn. Chỉ chạy được khi CHƯA có Super Admin nào.
import 'dotenv/config';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { hashPassword, passwordSchema } from '../src/password.js';

const prisma = new PrismaClient();
try {
  if (await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } })) {
    console.log('Đã tồn tại Super Admin. Không có gì để làm.');
  } else {
    const username = (process.env.SEED_SUPER_ADMIN_USERNAME || 'superadmin').trim().toLowerCase();
    const fullName = process.env.SEED_SUPER_ADMIN_FULLNAME || 'Super Admin';
    let password = process.env.SEED_SUPER_ADMIN_PASSWORD;
    const generated = !password;
    if (generated) password = crypto.randomBytes(12).toString('base64url') + 'Aa1';
    const check = passwordSchema.safeParse(password);
    if (!check.success) throw new Error(check.error.issues[0].message);
    await prisma.user.create({
      data: { username, fullName, role: 'SUPER_ADMIN', passwordHash: await hashPassword(password), mustChangePassword: true }
    });
    console.log(`Đã tạo Super Admin: ${username}`);
    if (generated) console.log(`Mật khẩu tạm (chỉ hiển thị một lần, phải đổi khi đăng nhập): ${password}`);
  }
} catch (e) {
  console.error('Lỗi:', e.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
