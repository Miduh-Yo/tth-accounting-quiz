import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import rateLimit from 'express-rate-limit';
import { audit } from '../audit.js';
import { GeneratorError, MAX_GENERATE, aiConfigured, generateQuestions } from '../generator.js';
import { extractText } from '../extractText.js';
import { buildTemplate, parseXlsx } from '../xlsxImport.js';
import { MAX_IMPORT_ROWS, findDocument, parseImport, rowToQuestion } from '../importQuestions.js';
import { requireAuth, requireRole } from '../auth.js';

export const questionsRouter = Router();
// Ngân hàng câu hỏi chứa đáp án: chỉ ADMIN trở lên được truy cập.
questionsRouter.use(requireAuth, requireRole('ADMIN'));

const optionSchema = z.object({
  text: z.string().trim().min(1, 'Đáp án không được để trống').max(500),
  isCorrect: z.boolean()
});

export const questionSchema = z.object({
  topic: z.string().trim().min(1, 'Nhập chủ đề').max(100),
  type: z.enum(['SINGLE', 'MULTIPLE', 'TRUE_FALSE']),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).default('MEDIUM'),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).default('DRAFT'),
  content: z.string().trim().min(1, 'Nhập nội dung câu hỏi').max(2000),
  // Câu nhập từ Excel/AI có thể có giá trị null trong CSDL; khi sửa, giao diện gửi lại null nên phải chấp nhận.
  explanation: z.string().trim().max(2000).nullish().transform(v => v || null),
  reference: z.string().trim().max(500).nullish().transform(v => v || null),
  documentId: z.string().nullish().transform(v => v || null),
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

// Sinh câu hỏi bằng AI từ văn bản/file ghi chú. Câu hỏi vào ở trạng thái Nháp để quản trị rà soát.
const generateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 15, standardHeaders: true, legacyHeaders: false,
  keyGenerator: req => req.user.id,
  message: { error: 'Đã dùng quá nhiều lượt sinh câu hỏi trong 1 giờ, thử lại sau.' }
});
const generateSchema = z.object({
  topic: z.string().trim().min(1, 'Nhập chủ đề').max(100),
  count: z.number().int().min(1).max(MAX_GENERATE).default(5),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
  documentId: z.string().optional().transform(v => v || null),
  filename: z.string().max(255).optional(),
  text: z.string().max(200_000).optional(),
  base64: z.string().max(6_000_000).optional()
});

// Chuyển kết quả AI thành câu hỏi hợp lệ (cùng quy tắc kiểm tra như thêm tay); câu lỗi bị bỏ qua và đếm lại.
export function shapeGenerated(raw, { topic, documentId }) {
  const valid = []; let skipped = 0;
  for (const r of raw) {
    const v = questionSchema.safeParse({ ...r, topic, documentId, status: 'DRAFT' });
    if (v.success) valid.push(v.data); else skipped++;
  }
  return { valid, skipped };
}

// File mẫu Excel (.xlsx) có danh sách chọn sẵn.
questionsRouter.get('/import-template.xlsx', async (_req, res, next) => {
  try {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="mau-nhap-cau-hoi.xlsx"');
    res.send(await buildTemplate());
  } catch (e) { next(e); }
});

questionsRouter.post('/generate', generateLimiter, async (req, res, next) => {
  try {
    if (!aiConfigured()) return res.status(503).json({ error: 'Chưa cấu hình ANTHROPIC_API_KEY trên máy chủ nên chưa dùng được tính năng này.' });
    const parsed = generateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const d = parsed.data;
    if (await docMissing(d.documentId)) return res.status(400).json({ error: 'Tài liệu không tồn tại' });
    const text = await extractText({ filename: d.filename, text: d.text, base64: d.base64 });
    if (text.length < 200) return res.status(400).json({ error: 'Nội dung quá ngắn để sinh câu hỏi (tối thiểu ~200 ký tự).' });

    const raw = await generateQuestions({ text, count: d.count, topic: d.topic, difficulty: d.difficulty });
    const { valid, skipped } = shapeGenerated(raw, d);
    if (valid.length) {
      await prisma.$transaction(valid.map(({ options, ...data }) => prisma.question.create({
        data: { ...data, createdById: req.user.id, options: { create: options.map((o, i) => ({ ...o, position: i })) } }
      })));
    }
    await audit(req, 'QUESTIONS_GENERATED', { detail: `${valid.length} câu, chủ đề ${d.topic}${skipped ? `, bỏ ${skipped} câu lỗi` : ''}` });
    res.json({ created: valid.length, skipped });
  } catch (e) {
    if (e instanceof GeneratorError || e?.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

// Nhập hàng loạt từ CSV hoặc Excel (.xlsx). commit=false: chỉ kiểm tra; commit=true: nhập tất cả hoặc không nhập gì (câu hỏi vào ở trạng thái Nháp).
questionsRouter.post('/import', async (req, res, next) => {
  try {
    const parsed = z.object({
      csv: z.string().min(1).max(100_000).optional(),
      xlsxBase64: z.string().min(1).max(4_500_000).optional(),
      commit: z.boolean().default(false)
    }).refine(d => Boolean(d.csv) !== Boolean(d.xlsxBase64)).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Gửi đúng một trong hai: nội dung CSV (tối đa ~100KB) hoặc file Excel (tối đa 3MB)' });
    const lines = parsed.data.xlsxBase64 ? await parseXlsx(Buffer.from(parsed.data.xlsxBase64, 'base64')) : parseImport(parsed.data.csv);
    if (lines.length === 0) return res.status(400).json({ error: 'File không có dòng dữ liệu nào' });
    if (lines.length > MAX_IMPORT_ROWS) return res.status(400).json({ error: `Tối đa ${MAX_IMPORT_ROWS} câu mỗi lần nhập` });

    const docs = await prisma.document.findMany({ where: { status: 'ACTIVE' }, select: { id: true, code: true, title: true } });
    const errors = [], valid = [];
    for (const { line, row } of lines) {
      const m = rowToQuestion(row);
      if (m.error) { errors.push({ line, error: m.error }); continue; }
      let documentId;
      if (m.documentRef) {
        const d = findDocument(docs, m.documentRef);
        if (!d) { errors.push({ line, error: `Không tìm thấy tài liệu "${m.documentRef}" (khớp theo số hiệu hoặc tên)` }); continue; }
        documentId = d.id;
      }
      const v = questionSchema.safeParse({ ...m.data, documentId });
      if (!v.success) errors.push({ line, error: v.error.issues[0].message });
      else valid.push(v.data);
    }
    if (errors.length || !parsed.data.commit) return res.json({ total: lines.length, valid: valid.length, errors, imported: 0 });

    await prisma.$transaction(valid.map(({ options, ...data }) => prisma.question.create({
      data: { ...data, createdById: req.user.id, options: { create: options.map((o, i) => ({ ...o, position: i })) } }
    })));
    await audit(req, 'QUESTIONS_IMPORTED', { detail: `${valid.length} câu` });
    res.json({ total: lines.length, valid: valid.length, errors: [], imported: valid.length });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

// Duyệt hàng loạt: chuyển các câu Nháp khớp bộ lọc (chủ đề/độ khó/từ khoá) sang Đang dùng.
questionsRouter.post('/activate-drafts', async (req, res, next) => {
  try {
    const { topic, difficulty, q } = req.body || {};
    const where = { status: 'DRAFT' };
    if (typeof topic === 'string' && topic) where.topic = topic;
    if (['EASY', 'MEDIUM', 'HARD'].includes(difficulty)) where.difficulty = difficulty;
    if (typeof q === 'string' && q.trim()) where.content = { contains: q.trim(), mode: 'insensitive' };
    const r = await prisma.question.updateMany({ where, data: { status: 'ACTIVE' } });
    await audit(req, 'QUESTIONS_ACTIVATED', { detail: `${r.count} câu${topic ? `, chủ đề ${topic}` : ''}` });
    res.json({ activated: r.count });
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
