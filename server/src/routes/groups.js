import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { requireAuth, requireRole } from '../auth.js';

export const groupsRouter = Router();
groupsRouter.use(requireAuth, requireRole('ADMIN'));

const schema = z.object({
  name: z.string().trim().min(1, 'Nhập tên nhóm').max(100),
  memberIds: z.array(z.string()).max(1000)
});

const include = { members: { include: { user: { select: { id: true, username: true, fullName: true } } } }, _count: { select: { exams: true } } };
const shape = g => ({ id: g.id, name: g.name, examCount: g._count.exams, members: g.members.map(m => m.user) });

groupsRouter.get('/', async (_req, res, next) => {
  try {
    const groups = await prisma.group.findMany({ include, orderBy: { name: 'asc' } });
    res.json({ groups: groups.map(shape) });
  } catch (e) { next(e); }
});

// Chỉ nhận tài khoản nhân viên đang hoạt động; id lạ bị loại.
async function validMembers(ids) {
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(ids)] }, role: 'EMPLOYEE', status: 'ACTIVE' }, select: { id: true } });
  return users.map(u => u.id);
}

groupsRouter.post('/', async (req, res, next) => {
  try {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const members = await validMembers(parsed.data.memberIds);
    const group = await prisma.group.create({
      data: { name: parsed.data.name, members: { create: members.map(userId => ({ userId })) } }, include
    });
    await audit(req, 'GROUP_CREATED', { targetType: 'Group', targetId: group.id, detail: `${group.name} (${members.length} người)` });
    res.status(201).json({ group: shape(group) });
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Tên nhóm đã tồn tại' });
    next(e);
  }
});

groupsRouter.put('/:id', async (req, res, next) => {
  try {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    if (!(await prisma.group.findUnique({ where: { id: req.params.id }, select: { id: true } }))) {
      return res.status(404).json({ error: 'Không tìm thấy nhóm' });
    }
    const members = await validMembers(parsed.data.memberIds);
    const [, group] = await prisma.$transaction([
      prisma.groupMember.deleteMany({ where: { groupId: req.params.id } }),
      prisma.group.update({
        where: { id: req.params.id },
        data: { name: parsed.data.name, members: { create: members.map(userId => ({ userId })) } }, include
      })
    ]);
    await audit(req, 'GROUP_UPDATED', { targetType: 'Group', targetId: group.id, detail: `${group.name} (${members.length} người)` });
    res.json({ group: shape(group) });
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Tên nhóm đã tồn tại' });
    next(e);
  }
});

groupsRouter.delete('/:id', async (req, res, next) => {
  try {
    const group = await prisma.group.findUnique({ where: { id: req.params.id }, include: { _count: { select: { exams: true } } } });
    if (!group) return res.status(404).json({ error: 'Không tìm thấy nhóm' });
    if (group._count.exams > 0) return res.status(400).json({ error: 'Nhóm đang được giao đề thi, không thể xoá' });
    await prisma.group.delete({ where: { id: group.id } });
    await audit(req, 'GROUP_DELETED', { targetType: 'Group', targetId: group.id, detail: group.name });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
