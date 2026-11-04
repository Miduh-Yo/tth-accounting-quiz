import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { requireAuth, requireRole } from '../auth.js';

export const documentsRouter = Router();
documentsRouter.use(requireAuth);

// Chỉ nhận liên kết http/https (chặn javascript:, data: ... để không thành lỗ hổng XSS khi hiển thị thành <a href>).
const httpUrl = z.string().trim().max(500).refine(v => {
  try { return ['http:', 'https:'].includes(new URL(v).protocol); } catch { return false; }
}, 'Liên kết phải bắt đầu bằng http:// hoặc https://');

const blank = v => (v === '' ? undefined : v);
const schema = z.object({
  title: z.string().trim().min(1, 'Nhập tên tài liệu').max(300),
  code: z.preprocess(blank, z.string().trim().max(100).optional()).transform(v => v || null),
  url: z.preprocess(blank, httpUrl.optional()).transform(v => v || null),
  summary: z.preprocess(blank, z.string().trim().max(3000).optional()).transform(v => v || null),
  effectiveDate: z.preprocess(blank, z.coerce.date().optional()).transform(v => v ?? null),
  status: z.enum(['ACTIVE', 'ARCHIVED']).default('ACTIVE')
});

const withCount = { _count: { select: { questions: true } } };

// Mọi người dùng đã đăng nhập xem được thư viện (chỉ tài liệu đang hiệu lực); quản trị xem thêm bản lưu trữ bằng ?all=1.
documentsRouter.get('/', async (req, res, next) => {
  try {
    const isAdmin = req.user.role !== 'EMPLOYEE';
    const where = isAdmin && req.query.all === '1' ? {} : { status: 'ACTIVE' };
    const documents = await prisma.document.findMany({
      where, orderBy: [{ status: 'asc' }, { title: 'asc' }], include: isAdmin ? withCount : undefined
    });
    res.json({ documents });
  } catch (e) { next(e); }
});

const admin = requireRole('ADMIN');

documentsRouter.post('/', admin, async (req, res, next) => {
  try {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const document = await prisma.document.create({ data: { ...parsed.data, createdById: req.user.id }, include: withCount });
    await audit(req, 'DOCUMENT_CREATED', { targetType: 'Document', targetId: document.id, detail: document.title });
    res.status(201).json({ document });
  } catch (e) { next(e); }
});

documentsRouter.put('/:id', admin, async (req, res, next) => {
  try {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    if (!(await prisma.document.findUnique({ where: { id: req.params.id }, select: { id: true } }))) {
      return res.status(404).json({ error: 'Không tìm thấy tài liệu' });
    }
    const document = await prisma.document.update({ where: { id: req.params.id }, data: parsed.data, include: withCount });
    await audit(req, 'DOCUMENT_UPDATED', { targetType: 'Document', targetId: document.id, detail: `${document.title}, ${document.status}` });
    res.json({ document });
  } catch (e) { next(e); }
});

// Không xoá cứng: câu hỏi và bài đã làm vẫn tham chiếu được; chỉ chuyển sang Lưu trữ.
documentsRouter.delete('/:id', admin, async (req, res, next) => {
  try {
    if (!(await prisma.document.findUnique({ where: { id: req.params.id }, select: { id: true } }))) {
      return res.status(404).json({ error: 'Không tìm thấy tài liệu' });
    }
    const document = await prisma.document.update({ where: { id: req.params.id }, data: { status: 'ARCHIVED' }, include: withCount });
    await audit(req, 'DOCUMENT_ARCHIVED', { targetType: 'Document', targetId: document.id, detail: document.title });
    res.json({ document });
  } catch (e) { next(e); }
});
