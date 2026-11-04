import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { audit } from '../audit.js';
import { toCsv } from '../csv.js';
import { gradeQuestion, summarize } from '../grading.js';

export const examsRouter = Router();
examsRouter.use(requireAuth);

const GRACE_MS = 30_000; // bù độ trễ mạng khi nộp bài
// Người dùng được thấy đề nếu đề giao cho tất cả, hoặc cho nhóm của họ, hoặc họ đã có bài làm.
const visibleTo = userId => ({ OR: [
  { assignAll: true },
  { groups: { some: { group: { members: { some: { userId } } } } } },
  { attempts: { some: { userId } } }
] });

const deadline = (attempt, exam) => new Date(attempt.startedAt.getTime() + exam.durationMinutes * 60_000);

// ---------- Quản trị: tạo / quản lý đề thi ----------
const admin = requireRole('ADMIN');

const examSchema = z.object({
  title: z.string().trim().min(1, 'Nhập tên đề thi').max(200),
  description: z.string().trim().max(1000).optional().transform(v => v || null),
  durationMinutes: z.number().int().min(1).max(240),
  passPercent: z.number().int().min(1).max(100).default(70),
  questionIds: z.array(z.string()).min(1, 'Chọn ít nhất 1 câu hỏi').max(200),
  assignAll: z.boolean().default(true),
  groupIds: z.array(z.string()).max(100).default([])
}).refine(d => d.assignAll || d.groupIds.length > 0, { message: 'Chọn ít nhất 1 nhóm hoặc giao cho tất cả', path: ['groupIds'] });

examsRouter.post('/', admin, async (req, res, next) => {
  try {
    const parsed = examSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const { questionIds, groupIds, ...data } = parsed.data;
    const ids = [...new Set(questionIds)];
    const gids = data.assignAll ? [] : [...new Set(groupIds)];
    if (gids.length && (await prisma.group.count({ where: { id: { in: gids } } })) !== gids.length) {
      return res.status(400).json({ error: 'Nhóm không tồn tại' });
    }
    const found = await prisma.question.count({ where: { id: { in: ids }, status: 'ACTIVE' } });
    if (found !== ids.length) return res.status(400).json({ error: 'Chỉ chọn được câu hỏi ở trạng thái "Đang dùng"' });
    const exam = await prisma.exam.create({
      data: { ...data, createdById: req.user.id,
        questions: { create: ids.map((questionId, position) => ({ questionId, position })) },
        groups: { create: gids.map(groupId => ({ groupId })) } }
    });
    await audit(req, 'EXAM_CREATED', { targetType: 'Exam', targetId: exam.id, detail: `${exam.title}${gids.length ? ` → ${gids.length} nhóm` : ' → tất cả'}` });
    res.status(201).json({ exam });
  } catch (e) { next(e); }
});

examsRouter.get('/manage', admin, async (_req, res, next) => {
  try {
    const exams = await prisma.exam.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { questions: true, attempts: true } }, groups: { include: { group: { select: { name: true } } } } }
    });
    res.json({ exams });
  } catch (e) { next(e); }
});

examsRouter.patch('/:id/status', admin, async (req, res, next) => {
  try {
    const parsed = z.object({ status: z.enum(['DRAFT', 'PUBLISHED', 'CLOSED']) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Trạng thái không hợp lệ' });
    const exam = await prisma.exam.findUnique({ where: { id: req.params.id }, select: { id: true, _count: { select: { attempts: true } } } });
    if (!exam) return res.status(404).json({ error: 'Không tìm thấy đề thi' });
    if (parsed.data.status === 'DRAFT' && exam._count.attempts > 0) {
      return res.status(400).json({ error: 'Đề đã có người làm, không thể chuyển về nháp' });
    }
    const updated = await prisma.exam.update({ where: { id: exam.id }, data: { status: parsed.data.status } });
    await audit(req, 'EXAM_STATUS', { targetType: 'Exam', targetId: exam.id, detail: parsed.data.status });
    res.json({ exam: updated });
  } catch (e) { next(e); }
});

examsRouter.get('/:id/results.csv', admin, async (req, res, next) => {
  try {
    const exam = await prisma.exam.findUnique({ where: { id: req.params.id } });
    if (!exam) return res.status(404).json({ error: 'Không tìm thấy đề thi' });
    const attempts = await prisma.attempt.findMany({
      where: { examId: exam.id }, orderBy: { startedAt: 'asc' },
      include: { user: { select: { username: true, fullName: true } } }
    });
    const fmt = d => (d ? d.toISOString() : '');
    const rows = [['Tài khoản', 'Họ tên', 'Bắt đầu', 'Nộp bài', 'Số câu đúng', 'Tổng số câu', 'Tỷ lệ (%)', 'Kết quả', 'Nộp trễ'],
      ...attempts.map(a => [a.user.username, a.user.fullName, fmt(a.startedAt), fmt(a.submittedAt), a.correct, a.total, a.percent,
        a.submittedAt ? (a.passed ? 'Đạt' : 'Chưa đạt') : 'Đang làm', a.late ? 'Có' : ''])];
    await audit(req, 'RESULTS_EXPORTED', { targetType: 'Exam', targetId: exam.id });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ket-qua-${exam.id}.csv"`);
    res.send(toCsv(rows));
  } catch (e) { next(e); }
});

examsRouter.get('/:id/results', admin, async (req, res, next) => {
  try {
    const attempts = await prisma.attempt.findMany({
      where: { examId: req.params.id },
      include: { user: { select: { username: true, fullName: true } } },
      orderBy: { startedAt: 'desc' }
    });
    res.json({ results: attempts.map(a => ({
      id: a.id, username: a.user.username, fullName: a.user.fullName, startedAt: a.startedAt,
      submittedAt: a.submittedAt, late: a.late, correct: a.correct, total: a.total, percent: a.percent, passed: a.passed
    })) });
  } catch (e) { next(e); }
});

// ---------- Nhân viên: làm bài ----------
// Chấm bài: đúng khi tập đáp án chọn trùng khớp tập đáp án đúng.
async function finalize(attempt, selections, late) {
  const examQs = await prisma.examQuestion.findMany({
    where: { examId: attempt.examId },
    include: { question: { include: { options: true } } }
  });
  const exam = await prisma.exam.findUnique({ where: { id: attempt.examId } });
  const rows = examQs.map(({ question }) => {
    const { picked, isCorrect } = gradeQuestion(question.options, selections[question.id]);
    return { attemptId: attempt.id, questionId: question.id, selectedIds: picked, isCorrect };
  });
  const correct = rows.filter(r => r.isCorrect).length;
  const total = rows.length;
  const { percent, passed } = summarize(correct, total, exam.passPercent);
  const [, updated] = await prisma.$transaction([
    prisma.attemptAnswer.createMany({ data: rows }),
    prisma.attempt.update({
      where: { id: attempt.id },
      data: { submittedAt: new Date(), late, correct, total, percent, passed }
    })
  ]);
  return updated;
}

async function review(attemptId) {
  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: { answers: true, exam: { include: { questions: { orderBy: { position: 'asc' },
      include: { question: { include: { options: { orderBy: { position: 'asc' } } } } } } } } }
  });
  const byQ = new Map(attempt.answers.map(a => [a.questionId, a]));
  return {
    attempt: { id: attempt.id, correct: attempt.correct, total: attempt.total, percent: attempt.percent,
      passed: attempt.passed, late: attempt.late, submittedAt: attempt.submittedAt },
    exam: { id: attempt.exam.id, title: attempt.exam.title, passPercent: attempt.exam.passPercent },
    items: attempt.exam.questions.map(({ question: q }) => ({
      id: q.id, content: q.content, type: q.type, explanation: q.explanation, reference: q.reference,
      isCorrect: byQ.get(q.id)?.isCorrect ?? false, selectedIds: byQ.get(q.id)?.selectedIds ?? [],
      options: q.options.map(o => ({ id: o.id, text: o.text, isCorrect: o.isCorrect }))
    }))
  };
}

examsRouter.get('/', async (req, res, next) => {
  try {
    const exams = await prisma.exam.findMany({
      where: { status: { in: ['PUBLISHED', 'CLOSED'] }, ...visibleTo(req.user.id) },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { questions: true } }, attempts: { where: { userId: req.user.id } } }
    });
    res.json({ exams: exams.map(e => {
      const a = e.attempts[0];
      const expired = a && !a.submittedAt && Date.now() > deadline(a, e).getTime() + GRACE_MS;
      return { id: e.id, title: e.title, description: e.description, durationMinutes: e.durationMinutes,
        passPercent: e.passPercent, status: e.status, questionCount: e._count.questions,
        attempt: a ? { id: a.id, submitted: Boolean(a.submittedAt) || expired, percent: a.percent, passed: a.passed } : null };
    }) });
  } catch (e) { next(e); }
});

// Bắt đầu (hoặc tiếp tục) làm bài. Không bao giờ trả isCorrect cho người làm.
examsRouter.post('/:id/start', async (req, res, next) => {
  try {
    const exam = await prisma.exam.findFirst({
      where: { id: req.params.id, ...visibleTo(req.user.id) },
      include: { questions: { orderBy: { position: 'asc' },
        include: { question: { include: { options: { orderBy: { position: 'asc' } } } } } } }
    });
    if (!exam || exam.status === 'DRAFT') return res.status(404).json({ error: 'Không tìm thấy đề thi' });

    let attempt = await prisma.attempt.findUnique({ where: { examId_userId: { examId: exam.id, userId: req.user.id } } });
    if (!attempt) {
      if (exam.status !== 'PUBLISHED') return res.status(400).json({ error: 'Đề thi đã đóng' });
      attempt = await prisma.attempt.create({ data: { examId: exam.id, userId: req.user.id } });
    }
    const end = deadline(attempt, exam);
    if (!attempt.submittedAt && Date.now() > end.getTime() + GRACE_MS) {
      await finalize(attempt, {}, true); // hết giờ mà chưa nộp: chấm 0 câu
      attempt = { ...attempt, submittedAt: new Date() };
    }
    if (attempt.submittedAt) return res.json({ done: true, attemptId: attempt.id });

    res.json({
      done: false, attemptId: attempt.id, endsAt: end,
      exam: { id: exam.id, title: exam.title },
      questions: exam.questions.map(({ question: q }) => ({
        id: q.id, content: q.content, type: q.type,
        options: q.options.map(o => ({ id: o.id, text: o.text }))
      }))
    });
  } catch (e) { next(e); }
});

const submitSchema = z.object({ answers: z.record(z.array(z.string()).max(8)) });

examsRouter.post('/attempts/:attemptId/submit', async (req, res, next) => {
  try {
    const parsed = submitSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Dữ liệu bài làm không hợp lệ' });
    const attempt = await prisma.attempt.findUnique({ where: { id: req.params.attemptId }, include: { exam: true } });
    if (!attempt || attempt.userId !== req.user.id) return res.status(404).json({ error: 'Không tìm thấy bài làm' });
    if (attempt.submittedAt) return res.status(409).json({ error: 'Bài đã được nộp' });
    const late = Date.now() > deadline(attempt, attempt.exam).getTime() + GRACE_MS;
    // Nộp trễ quá thời gian cho phép: không nhận đáp án, chấm 0 câu.
    await finalize(attempt, late ? {} : parsed.data.answers, late);
    await audit(req, 'EXAM_SUBMITTED', { targetType: 'Attempt', targetId: attempt.id, detail: late ? 'late' : undefined });
    res.json(await review(attempt.id));
  } catch (e) { next(e); }
});

// Xem lại kết quả: chỉ chủ bài làm hoặc quản trị viên, và chỉ sau khi đã nộp.
examsRouter.get('/attempts/:attemptId/review', async (req, res, next) => {
  try {
    const attempt = await prisma.attempt.findUnique({ where: { id: req.params.attemptId } });
    const isAdmin = req.user.role !== 'EMPLOYEE';
    if (!attempt || (attempt.userId !== req.user.id && !isAdmin)) return res.status(404).json({ error: 'Không tìm thấy bài làm' });
    if (!attempt.submittedAt) return res.status(400).json({ error: 'Bài chưa nộp' });
    res.json(await review(attempt.id));
  } catch (e) { next(e); }
});
