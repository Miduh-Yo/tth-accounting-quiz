import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { MAX_IMPORT_ROWS, parseImport, rowToQuestion } from '../importQuestions.js';
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
  documentId: z.string().optional().transform(v => v || null),
  options: z.array(optionSchema).min(2, 'Cần ít nhất 2 đáp án').max(8)
}).superRefine((q, ctx) => {
  const correct = q.options.filter(o => o.isCorrect).length;
  const bad = msg => ctx.addIssue({ code: 'custom', message: msg, path: ['options'] });
  if (q.type === 'TRUE_FALSE' && q.options.length !== 2) bad('Câu Đúng/Sai phải có đúng 2 đáp án');
  if (q.type !== 'MULTIPLE' && correct !== 1) bad('Câu này phải có đúng 1 đáp án đúng');
  if (q.type === 'MULTIPLE' && correct < 1) bad('Cần ít nhất 1 đáp án đúng');
});

const include = { options: { orderBy: { position: 'asc' } }, document: { select: { id: true, title: true, code: true } } };

const docMissing = async id => id && !(await prisma.document.findUnique({ where: { id }, select: { id: true } }));

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

// Nhập hàng loạt từ CSV. commit=false: chỉ kiểm tra; commit=true: nhập tất cả hoặc không nhập gì (câu hỏi vào ở trạng thái Nháp).
questionsRouter.post('/import', async (req, res, next) => {
  try {
    const parsed = z.object({ csv: z.string().min(1).max(100_000), commit: z.boolean().default(false) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Nội dung CSV không hợp lệ hoặc quá lớn (tối đa ~100KB)' });
    const lines = parseImport(parsed.data.csv);
    if (lines.length === 0) return res.status(400).json({ error: 'File không có dòng dữ liệu nào' });
    if (lines.length > MAX_IMPORT_ROWS) return res.status(400).json({ error: `Tối đa ${MAX_IMPORT_ROWS} câu mỗi lần nhập` });

    const errors = [], valid = [];
    for (const { line, row } of lines) {
      const m = rowToQuestion(row);
      if (m.error) { errors.push({ line, error: m.error }); continue; }
      const v = questionSchema.safeParse(m.data);
      if (!v.success) errors.push({ line, error: v.error.issues[0].message });
      else valid.push(v.data);
    }
    if (errors.length || !parsed.data.commit) return res.json({ total: lines.length, valid: valid.length, errors, imported: 0 });

    await prisma.$transaction(valid.map(({ options, ...data }) => prisma.question.create({
      data: { ...data, createdById: req.user.id, options: { create: options.map((o, i) => ({ ...o, position: i })) } }
    })));
    await audit(req, 'QUESTIONS_IMPORTED', { detail: `${valid.length} câu` });
    res.json({ total: lines.length, valid: valid.length, errors: [], imported: valid.length });
  } catch (e) { next(e); }
});

questionsRouter.post('/', async (req, res, next) => {
  try {
    const parsed = questionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const { options, ...data } = parsed.data;
    if (await docMissing(data.documentId)) return res.status(400).json({ error: 'Tài liệu không tồn tại' });
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
    if (await docMissing(data.documentId)) return res.status(400).json({ error: 'Tài liệu không tồn tại' });
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
