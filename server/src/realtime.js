import { prisma } from './db.js';
import { ROLE_RANK } from './auth.js';
import { visibleTo, deadline } from './access.js';

// Phòng thi trực tiếp: chỉ truyền trạng thái (ai đang online, ai đã nộp, thời điểm bắt đầu).
// Đề và câu hỏi KHÔNG đi qua socket; thí sinh lấy câu hỏi qua REST sau khi phòng bắt đầu.
let io = null;
const cand = id => `exam:${id}`;
const mon = id => `exam:${id}:monitor`;

export function roomInfo(exam) {
  const started = Boolean(exam.liveStartedAt);
  return {
    id: exam.id, title: exam.title, durationMinutes: exam.durationMinutes, started,
    startedAt: started ? exam.liveStartedAt : null,
    endsAt: started ? deadline(exam.liveStartedAt, exam.durationMinutes) : null,
    serverNow: new Date()
  };
}

async function snapshot(examId) {
  const [sockets, submitted] = await Promise.all([
    io.in(cand(examId)).fetchSockets(),
    prisma.attempt.findMany({
      where: { examId, submittedAt: { not: null } }, include: { user: { select: { id: true, fullName: true } } }
    })
  ]);
  const online = new Map();
  for (const s of sockets) online.set(s.data.user.id, { id: s.data.user.id, fullName: s.data.user.fullName });
  return {
    online: [...online.values()].sort((a, b) => a.fullName.localeCompare(b.fullName)),
    submitted: submitted.map(a => ({ id: a.user.id, fullName: a.user.fullName }))
  };
}

export async function broadcastRoom(examId) {
  if (!io) return;
  try {
    const snap = await snapshot(examId);
    io.to(mon(examId)).emit('room:update', snap);
    io.to(cand(examId)).emit('room:count', { online: snap.online.length });
  } catch (e) { console.error('broadcastRoom', e.message); }
}

export function announceStart(exam) {
  if (!io) return;
  io.to(cand(exam.id)).emit('room:started', roomInfo(exam));
  broadcastRoom(exam.id);
}

export function attachRealtime(server) {
  io = server;
  io.on('connection', socket => {
    const user = socket.data.user;
    const liveExam = (examId, extra = {}) => prisma.exam.findFirst({
      where: { id: String(examId), live: true, status: 'PUBLISHED', ...extra }
    });

    socket.on('room:join', async (examId, ack) => {
      try {
        const exam = await liveExam(examId, visibleTo(user.id));
        if (!exam) return ack?.({ error: 'Không tìm thấy phòng thi' });
        socket.join(cand(exam.id));
        ack?.({ room: roomInfo(exam) });
        broadcastRoom(exam.id);
      } catch { ack?.({ error: 'Lỗi máy chủ' }); }
    });

    socket.on('room:monitor', async (examId, ack) => {
      try {
        if (ROLE_RANK[user.role] < ROLE_RANK.ADMIN) return ack?.({ error: 'Không có quyền' });
        const exam = await liveExam(examId);
        if (!exam) return ack?.({ error: 'Không tìm thấy phòng thi' });
        socket.join(mon(exam.id));
        ack?.({ room: roomInfo(exam), ...(await snapshot(exam.id)) });
      } catch { ack?.({ error: 'Lỗi máy chủ' }); }
    });

    socket.on('room:leave', async examId => {
      socket.leave(cand(String(examId)));
      socket.leave(mon(String(examId)));
      broadcastRoom(String(examId));
    });

    socket.on('disconnecting', () => {
      const ids = [...socket.rooms].filter(r => r.startsWith('exam:') && !r.endsWith(':monitor')).map(r => r.slice(5));
      setTimeout(() => ids.forEach(broadcastRoom), 50); // sau khi socket đã rời phòng
    });
  });
}
