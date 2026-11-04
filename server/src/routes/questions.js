import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { requireAuth, requireRole } from '../auth.js';

export const questionsRouter = Router();
// Ngân hàng câu hỏi chứa đáp án: chỉ ADMIN trở lên được truy cập.
questionsRouter.use(requireAuth, requireRole('ADMIN'));

const optionSchema = z.object({
  text: z.string().trim().min(1, 'Đáp án không được để trống').max(500),
  isCorrect: z.boolean()
});

const questionSchema = z.object({
  topic: z.string().trim().min(1, 'Nhập chủ đề').max(100),
  type: z.enum(['SINGLE', 'MULTIPLE', 'TRUE_FALSE']),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).default('MEDIUM'),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).default('DRAFT'),
  content: z.string().trim().min(1, 'Nhập nội dung câu hỏi').max(2000),
  explanation: z.string().trim().max(2000).optional().transform(v => v || null),
  reference: z.string().trim().max(500).optional().transform(v => v || null),
  options: z.array(optionSchema).min(2, 'Cần ít nhất 2 đáp án').max(8)
}).superRefine((q, ctx) => {
  const correct = q.options.filter(o => o.isCorrect).length;
  const bad = msg => ctx.addIssue({ code: 'custom', message: msg, path: ['options'] });
  if (q.type === 'TRUE_FALSE' && q.options.length !== 2) bad('Câu Đúng/Sai phải có đúng 2 đáp án');
  if (q.type !== 'MULTIPLE' && correct !== 1) bad('Câu này phải có đúng 1 đáp án đúng');
  if (q.type === 'MULTIPLE' && correct < 1) bad('Cần ít nhất 1 đáp án đúng');
});

const include = { options: { orderBy: { position: 'asc' } } };

questionsRouter.get('/', async (req, res, next) => {
  try {
    const { topic, status, difficulty, q } = req.query;
    const where = {};
    if (typeof topic === 'string' && topic) where.topic = topic;
    if (['DRAFT', 'ACTIVE', 'ARCHIVED'].includes(status)) where.status = status;
    if (['EASY', 'MEDIUM', 'HARD'].includes(difficulty)) where.difficulty = difficulty;
    if (typeof q === 'string' && q.trim()) where.content = { contains: q.trim(), mode: 'insensitive' };
    const [questions, topics] = await Promise.all([
      prisma.question.findMany({ where, include, orderBy: { createdAt: 'desc' }, take: 500 }),
      prisma.question.findMany({ select: { topic: true }, distinct: ['topic'], orderBy: { topic: 'asc' } })
    ]);
    res.json({ questions, topics: topics.map(t => t.topic) });
  } catch (e) { next(e); }
});

questionsRouter.post('/', async (req, res, next) => {
  try {
    const parsed = questionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const { options, ...data } = parsed.data;
    const question = await prisma.question.create({
      data: { ...data, createdById: req.user.id,
        options: { create: options.map((o, i) => ({ ...o, position: i })) } },
      include
    });
    await audit(req, 'QUESTION_CREATED', { targetType: 'Question', targetId: question.id, detail: question.topic });
    res.status(201).json({ question });
  } catch (e) { next(e); }
});

questionsRouter.put('/:id', async (req, res, next) => {
  try {
    const parsed = questionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const { options, ...data } = parsed.data;
    const exists = await prisma.question.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!exists) return res.status(404).json({ error: 'Không tìm thấy câu hỏi' });
    const [, question] = await prisma.$transaction([
      prisma.questionOption.deleteMany({ where: { questionId: req.params.id } }),
      prisma.question.update({
        where: { id: req.params.id },
        data: { ...data, options: { create: options.map((o, i) => ({ ...o, position: i })) } },
        include
      })
    ]);
    await audit(req, 'QUESTION_UPDATED', { targetType: 'Question', targetId: question.id, detail: `${question.topic}, ${question.status}` });
    res.json({ question });
  } catch (e) { next(e); }
});

// Không xoá cứng để sau này đề thi/kết quả cũ vẫn tham chiếu được: chỉ lưu trữ.
questionsRouter.delete('/:id', async (req, res, next) => {
  try {
    const exists = await prisma.question.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!exists) return res.status(404).json({ error: 'Không tìm thấy câu hỏi' });
    const question = await prisma.question.update({
      where: { id: req.params.id }, data: { status: 'ARCHIVED' }, include
    });
    await audit(req, 'QUESTION_ARCHIVED', { targetType: 'Question', targetId: question.id });
    res.json({ question });
  } catch (e) { next(e); }
});
