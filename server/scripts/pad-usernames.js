// Đổi hàng loạt mã tài khoản toàn số thành đủ N chữ số (thêm số 0 ở đầu), ví dụ 921 -> 000921.
//   PAD_LENGTH : số chữ số mong muốn (mặc định 6)
//   APPLY=1    : thực sự ghi vào database; mặc định chỉ chạy thử (in danh sách, không đổi gì)
// Chỉ đổi tài khoản có mã toàn chữ số và ngắn hơn PAD_LENGTH. Bỏ qua nếu mã mới đã có người dùng.
// Phiên đăng nhập cũ của tài khoản bị đổi mã sẽ bị vô hiệu.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
try {
  const len = Number(process.env.PAD_LENGTH || 6);
  if (!Number.isInteger(len) || len < 3 || len > 32) throw new Error('PAD_LENGTH phải là số nguyên từ 3 đến 32');
  const apply = process.env.APPLY === '1';

  const users = await prisma.user.findMany({ select: { id: true, username: true } });
  const taken = new Set(users.map(u => u.username));
  const plan = [], skipped = [];
  for (const u of users) {
    if (!/^\d+$/.test(u.username) || u.username.length >= len) continue;
    const next = u.username.padStart(len, '0');
    if (taken.has(next)) { skipped.push(`${u.username} -> ${next} (mã mới đã tồn tại)`); continue; }
    taken.add(next);
    plan.push({ id: u.id, from: u.username, to: next });
  }

  console.log(`${apply ? 'ĐỔI' : 'CHẠY THỬ'}: ${plan.length} tài khoản sẽ đổi sang ${len} chữ số`);
  for (const p of plan) console.log(`  ${p.from} -> ${p.to}`);
  for (const s of skipped) console.log(`  BỎ QUA ${s}`);

  if (apply && plan.length) {
    await prisma.$transaction(async tx => {
      for (const p of plan) {
        await tx.user.update({ where: { id: p.id }, data: { username: p.to, tokenVersion: { increment: 1 } } });
        await tx.auditLog.create({ data: { action: 'USER_UPDATED', actorName: 'cli', targetType: 'User', targetId: p.id, detail: `username ${p.from}->${p.to}` } });
      }
    });
    console.log('Đã đổi xong.');
  } else if (!apply && plan.length) {
    console.log('Chưa đổi gì. Chạy lại với APPLY=1 để áp dụng.');
  }
} catch (e) {
  console.error('Lỗi:', e.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
