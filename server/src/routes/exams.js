import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { audit } from '../audit.js';
import { toCsv } from '../csv.js';
import { gradeQuestion, summarize, pickBest } from '../grading.js';
import { GRACE_MS, deadline as deadlineAt, visibleTo } from '../access.js';
import { announceStart, broadcastRoom, roomInfo } from '../realtime.js';

export const examsRouter = Router();
examsRouter.use(requireAuth);

const deadline = (attempt, exam) => deadlineAt(attempt.startedAt, exam.durationMinutes);

// ---------- Quản trị: tạo / quản lý đề thi ----------
const admin = requireRole('ADMIN');

const examSchema = z.object({
  title: z.string().trim().min(1, 'Nhập tên đề thi').max(200),
  description: z.string().trim().max(1000).optional().transform(v => v || null),
  durationMinutes: z.number().int().min(1).max(240),
  passPercent: z.number().int().min(1).max(100).default(70),
  questionIds: z.array(z.string()).min(1, 'Chọn ít nhất 1 câu hỏi').max(200),
  assignAll: z.boolean().default(true),
  live: z.boolean().default(false),
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
    await audit(req, 'EXAM_CREATED', { targetType: 'Exam', targetId: exam.id, detail: `${exam.title}${exam.live ? ' [live]' : ''}${gids.length ? ` → ${gids.length} nhóm` : ' → tất cả'}` });
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

// Quản trị bấm "Bắt đầu" cho phòng thi trực tiếp: mọi thí sinh trong phòng chờ nhận tín hiệu cùng lúc.
examsRouter.post('/:id/live/start', admin, async (req, res, next) => {
  try {
    const exam = await prisma.exam.findUnique({ where: { id: req.params.id } });
    if (!exam || !exam.live) return res.status(404).json({ error: 'Không tìm thấy phòng thi trực tiếp' });
    if (exam.status !== 'PUBLISHED') return res.status(400).json({ error: 'Cần mở thi (Đang mở) trước khi bắt đầu phòng' });
    if (exam.liveStartedAt) return res.status(409).json({ error: 'Phòng thi đã bắt đầu' });
    const updated = await prisma.exam.update({ where: { id: exam.id }, data: { liveStartedAt: new Date() } });
    await audit(req, 'LIVE_STARTED', { targetType: 'Exam', targetId: exam.id, detail: exam.title });
    announceStart(updated);
    res.json({ room: roomInfo(updated) });
  } catch (e) { next(e); }
});

examsRouter.get('/:id/results.csv', admin, async (req, res, next) => {
  try {
    const exam = await prisma.exam.findUnique({ where: { id: req.params.id } });
    if (!exam) return res.status(404).json({ error: 'Không tìm thấy đề thi' });
    const attempts = bestPerUser(await prisma.attempt.findMany({
      where: { examId: exam.id }, orderBy: { startedAt: 'asc' },
      include: { user: { select: { username: true, fullName: true } } }
    }));
    const fmt = d => (d ? d.toISOString() : '');
    const rows = [['Tài khoản', 'Họ tên', 'Bắt đầu', 'Nộp bài', 'Số câu đúng', 'Tổng số câu', 'Tỷ lệ (%)', 'Kết quả', 'Nộp trễ', 'Số lần rời tab', 'Số lần thi'],
      ...attempts.map(a => [a.user.username, a.user.fullName, fmt(a.startedAt), fmt(a.submittedAt), a.correct, a.total, a.percent,
        a.submittedAt ? (a.passed ? 'Đạt' : 'Chưa đạt') : 'Đang làm', a.late ? 'Có' : '', a.focusLosses, a.attemptCount])];
    await audit(req, 'RESULTS_EXPORTED', { targetType: 'Exam', targetId: exam.id });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ket-qua-${exam.id}.csv"`);
    res.send(toCsv(rows));
  } catch (e) { next(e); }
});

examsRouter.get('/:id/results', admin, async (req, res, next) => {
  try {
    const attempts = bestPerUser(await prisma.attempt.findMany({
      where: { examId: req.params.id },
      include: { user: { select: { username: true, fullName: true } } },
      orderBy: { startedAt: 'desc' }
    }));
    res.json({ results: attempts.map(a => ({
      attemptCount: a.attemptCount, id: a.id, username: a.user.username, fullName: a.user.fullName, startedAt: a.startedAt,
      submittedAt: a.submittedAt, late: a.late, focusLosses: a.focusLosses, correct: a.correct, total: a.total, percent: a.percent, passed: a.passed
    })) });
  } catch (e) { next(e); }
});

// Mỗi nhân viên một dòng: lần thi cao nhất (chưa nộp lần nào thì lấy lần mới nhất), kèm số lần thi.
function bestPerUser(attempts) {
  const by = new Map();
  for (const a of attempts) by.set(a.userId, [...(by.get(a.userId) ?? []), a]);
  return [...by.values()].map(list => ({ ...(pickBest(list) ?? list[0]), attemptCount: list.length }));
}

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
      include: { question: { include: { options: { orderBy: { position: 'asc' } },
        document: { select: { title: true, code: true, url: true } } } } } } } } }
  });
  const byQ = new Map(attempt.answers.map(a => [a.questionId, a]));
  return {
    attempt: { id: attempt.id, correct: attempt.correct, total: attempt.total, percent: attempt.percent,
      passed: attempt.passed, late: attempt.late, submittedAt: attempt.submittedAt },
    exam: { id: attempt.exam.id, title: attempt.exam.title, passPercent: attempt.exam.passPercent },
    items: attempt.exam.questions.map(({ question: q }) => ({
      id: q.id, content: q.content, type: q.type, explanation: q.explanation, reference: q.reference, document: q.document,
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
      include: { _count: { select: { questions: true } }, attempts: { where: { userId: req.user.id }, orderBy: { startedAt: 'desc' } } }
    });
    res.json({ exams: exams.map(e => {
      const expired = a => Date.now() > deadline(a, e).getTime() + GRACE_MS;
      const active = e.attempts.find(a => !a.submittedAt && !expired(a));
      const best = pickBest(e.attempts);
      const shown = active ?? best ?? e.attempts[0];
      return { id: e.id, title: e.title, description: e.description, durationMinutes: e.durationMinutes,
        passPercent: e.passPercent, status: e.status, questionCount: e._count.questions,
        live: e.live, liveStartedAt: e.liveStartedAt, attemptCount: e.attempts.length,
        canRetake: e.status === 'PUBLISHED' && !e.live && !active && e.attempts.length > 0,
        attempt: shown ? { id: (best ?? shown).id, inProgress: Boolean(active), submitted: !active,
          percent: best?.percent ?? null, passed: best?.passed ?? null } : null };
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

    const mine = await prisma.attempt.findMany({ where: { examId: exam.id, userId: req.user.id }, orderBy: { startedAt: 'desc' } });
    let attempt = mine[0];
    if (attempt && !attempt.submittedAt && Date.now() > deadline(attempt, exam).getTime() + GRACE_MS) {
      await finalize(attempt, {}, true); // hết giờ mà chưa nộp: chấm 0 câu
      attempt = { ...attempt, submittedAt: new Date(), percent: 0, correct: 0 };
      mine[0] = attempt;
    }
    const retake = req.body?.retake === true && attempt?.submittedAt && !exam.live && exam.status === 'PUBLISHED';
    if (!attempt || retake) {
      if (exam.status !== 'PUBLISHED') return res.status(400).json({ error: 'Đề thi đã đóng' });
      if (exam.live) {
        // Phòng thi trực tiếp: chỉ vào được sau khi quản trị bấm bắt đầu; mọi người cùng một mốc giờ.
        if (!exam.liveStartedAt) return res.status(409).json({ error: 'Phòng thi chưa bắt đầu' });
        if (Date.now() > deadlineAt(exam.liveStartedAt, exam.durationMinutes).getTime()) {
          return res.status(400).json({ error: 'Phòng thi đã hết giờ' });
        }
      }
      attempt = await prisma.attempt.create({
        data: { examId: exam.id, userId: req.user.id, ...(exam.live && { startedAt: exam.liveStartedAt }) }
      });
    }
    const end = deadline(attempt, exam);
    if (attempt.submittedAt) return res.json({ done: true, attemptId: (pickBest(mine) ?? attempt).id });

    res.json({
      done: false, attemptId: attempt.id, endsAt: end, serverNow: new Date(),
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
    if (attempt.exam.live) broadcastRoom(attempt.examId);
    await audit(req, 'EXAM_SUBMITTED', { targetType: 'Attempt', targetId: attempt.id, detail: late ? 'late' : undefined });
    res.json(await review(attempt.id));
  } catch (e) { next(e); }
});

// Xem lại kết quả: chỉ chủ bài làm hoặc quản trị viên, và chỉ sau khi đã nộp.
// Thí sinh rời khỏi tab/cửa sổ khi đang làm bài: tăng bộ đếm để quản trị xem (không tự động trừ điểm).
examsRouter.post('/attempts/:attemptId/focus-lost', async (req, res, next) => {
  try {
    const attempt = await prisma.attempt.findUnique({ where: { id: req.params.attemptId }, include: { exam: true } });
    if (!attempt || attempt.userId !== req.user.id) return res.status(404).json({ error: 'Không tìm thấy bài làm' });
    if (attempt.submittedAt || Date.now() > deadline(attempt, attempt.exam).getTime() + GRACE_MS) return res.json({ focusLosses: attempt.focusLosses });
    if (attempt.focusLosses >= 1000) return res.json({ focusLosses: attempt.focusLosses });
    const updated = await prisma.attempt.update({ where: { id: attempt.id }, data: { focusLosses: { increment: 1 } } });
    res.json({ focusLosses: updated.focusLosses });
  } catch (e) { next(e); }
});

examsRouter.get('/attempts/:attemptId/review', async (req, res, next) => {
  try {
    const attempt = await prisma.attempt.findUnique({ where: { id: req.params.attemptId } });
    const isAdmin = req.user.role !== 'EMPLOYEE';
    if (!attempt || (attempt.userId !== req.user.id && !isAdmin)) return res.status(404).json({ error: 'Không tìm thấy bài làm' });
    if (!attempt.submittedAt) return res.status(400).json({ error: 'Bài chưa nộp' });
    res.json(await review(attempt.id));
  } catch (e) { next(e); }
});
