import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';

export const reportsRouter = Router();
reportsRouter.use(requireAuth, requireRole('ADMIN'));

const num = v => Number(v ?? 0);
const pct = (c, t) => (t ? Math.round((c / t) * 100) : 0);

// Tỷ lệ trả lời đúng theo chủ đề (chỉ tính bài đã nộp). Lọc tuỳ chọn theo đề và/hoặc nhân viên.
reportsRouter.get('/topics', async (req, res, next) => {
  try {
    const { examId, userId } = req.query;
    const conds = [Prisma.sql`t."submittedAt" IS NOT NULL`];
    if (typeof examId === 'string' && examId) conds.push(Prisma.sql`t."examId" = ${examId}`);
    if (typeof userId === 'string' && userId) conds.push(Prisma.sql`t."userId" = ${userId}`);
    const rows = await prisma.$queryRaw`
      SELECT q.topic, COUNT(*) AS total, SUM(CASE WHEN a."isCorrect" THEN 1 ELSE 0 END) AS correct,
             COUNT(DISTINCT t."userId") AS people
      FROM "AttemptAnswer" a
      JOIN "Attempt" t ON t.id = a."attemptId"
      JOIN "Question" q ON q.id = a."questionId"
      WHERE ${Prisma.join(conds, ' AND ')}
      GROUP BY q.topic`;
    const topics = rows.map(r => ({ topic: r.topic, total: num(r.total), correct: num(r.correct), people: num(r.people),
      percent: pct(num(r.correct), num(r.total)) })).sort((a, b) => a.percent - b.percent || a.topic.localeCompare(b.topic));
    res.json({ topics });
  } catch (e) { next(e); }
});

// Tổng hợp theo nhân viên: số bài, điểm trung bình, số bài đạt.
reportsRouter.get('/employees', async (req, res, next) => {
  try {
    const examId = typeof req.query.examId === 'string' && req.query.examId ? req.query.examId : undefined;
    const attempts = await prisma.attempt.findMany({
      where: { submittedAt: { not: null }, ...(examId && { examId }) },
      include: { user: { select: { id: true, username: true, fullName: true } } }
    });
    const by = new Map();
    for (const a of attempts) {
      const r = by.get(a.userId) ?? { ...a.user, attempts: 0, sum: 0, passed: 0 };
      r.attempts++; r.sum += a.percent ?? 0; r.passed += a.passed ? 1 : 0;
      by.set(a.userId, r);
    }
    const employees = [...by.values()].map(({ sum, ...r }) => ({ ...r, avgPercent: Math.round(sum / r.attempts) }))
      .sort((a, b) => a.avgPercent - b.avgPercent);
    res.json({ employees });
  } catch (e) { next(e); }
});
