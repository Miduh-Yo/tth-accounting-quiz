import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { audit } from '../audit.js';
import { toCsv } from '../csv.js';
import { gradeQuestion } from '../grading.js';
import { DATE_RE, MONTH_RE, addDays, eachDay, isWorkday, monthRange, vnDate, weekStart } from '../daily/dates.js';
import { BADGES, answerXp, levelInfo, liveStreak } from '../daily/rules.js';
import {
  activePool, badgeInfo, createdDateOf, dayStatus, ensureDeck, finalizeIfDone, finishedDatesByUser,
  getProgress, getSettings, holidaySet, lastUsedMap, loadQuestions, present, reveal
} from '../daily/service.js';

export const dailyRouter = Router();
dailyRouter.use(requireAuth);
const admin = requireRole('ADMIN');

const WEEKDAY_LABEL = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

// Tóm tắt phiên đã hoàn thành (dùng khi mở lại màn kết quả).
const sessionSummary = s => ({
  correct: s.correct, total: s.total, xpEarned: s.xpEarned, bestCombo: s.bestCombo,
  perfect: s.total > 0 && s.correct === s.total
});

// ---------- Nhân viên ----------

// Trang "Hôm nay": đề (tự tạo nếu chưa có), trạng thái phiên của tôi, chuỗi ngày, XP, tuần này, huy hiệu.
dailyRouter.get('/today', async (req, res, next) => {
  try {
    const today = vnDate();
    const [deck, settings, holidays, progress, badges] = await Promise.all([
      ensureDeck(today), getSettings(), holidaySet(), getProgress(req.user.id),
      prisma.userBadge.findMany({ where: { userId: req.user.id }, orderBy: { earnedAt: 'asc' } })
    ]);
    const session = deck && await prisma.dailySession.findUnique({
      where: { deckId_userId: { deckId: deck.id, userId: req.user.id } }, include: { _count: { select: { answers: true } } }
    });
    const from = weekStart(today), days = eachDay(from, addDays(from, 6));
    const done = (await finishedDatesByUser([req.user.id], from, addDays(from, 6))).get(req.user.id);
    const ctx = { today, holidays, done, createdDate: createdDateOf(req.user) };
    res.json({
      date: today, isWorkday: isWorkday(today, holidays),
      deck: deck ? { questionCount: deck.questionIds.length } : null,
      session: session ? { id: session.id, answeredCount: session._count.answers, total: session.total,
        finished: Boolean(session.finishedAt), ...sessionSummary(session) } : null,
      progress: { ...levelInfo(progress.xp), streak: liveStreak(progress, today, holidays), longestStreak: progress.longestStreak,
        playedToday: Boolean(session?.finishedAt) },
      week: days.map((date, i) => ({ date, label: WEEKDAY_LABEL[i], status: dayStatus(date, ctx), today: date === today })),
      badges: { earned: badges.map(b => ({ ...badgeInfo(b.code), earnedAt: b.earnedAt })),
        locked: Object.keys(BADGES).filter(c => !badges.some(b => b.code === c)).map(badgeInfo) },
      leaderboardEnabled: settings.leaderboardEnabled
    });
  } catch (e) { next(e); }
});

// Bắt đầu hoặc tiếp tục phiên hôm nay. Câu chưa trả lời không bao giờ kèm đáp án đúng.
dailyRouter.post('/start', async (req, res, next) => {
  try {
    const today = vnDate();
    const deck = await ensureDeck(today);
    if (!deck) return res.status(503).json({ error: 'Chưa có câu hỏi "Đang dùng" để tạo bài luyện hôm nay' });
    const key = { deckId_userId: { deckId: deck.id, userId: req.user.id } };
    let session = await prisma.dailySession.findUnique({ where: key });
    if (!session) {
      try {
        session = await prisma.dailySession.create({ data: { deckId: deck.id, userId: req.user.id, total: deck.questionIds.length } });
      } catch (e) {
        if (e.code !== 'P2002') throw e;
        session = await prisma.dailySession.findUnique({ where: key });
      }
    }
    // Tự chữa: đã trả lời đủ nhưng chưa được chốt (hiếm, do hai yêu cầu đồng thời).
    let summary = null;
    if (!session.finishedAt) {
      summary = await prisma.$transaction(tx => finalizeIfDone(tx, session.id, new Set()));
      if (summary) session = await prisma.dailySession.findUnique({ where: key });
    }
    const [questions, answers] = await Promise.all([
      loadQuestions(deck.questionIds), prisma.dailyAnswer.findMany({ where: { sessionId: session.id } })
    ]);
    const answered = new Map(answers.map(a => [a.questionId, a]));
    res.json({
      sessionId: session.id, date: deck.date, total: session.total, finished: Boolean(session.finishedAt),
      correct: session.correct, xpEarned: session.xpEarned,
      questions: questions.map(q => present(q, deck.date)),
      answers: Object.fromEntries(questions.filter(q => answered.has(q.id)).map(q => {
        const a = answered.get(q.id);
        return [q.id, { selectedIds: a.selectedIds, isCorrect: a.isCorrect, xp: a.xp, ...reveal(q) }];
      })),
      ...(session.finishedAt && { summary: summary ?? sessionSummary(session) })
    });
  } catch (e) { next(e); }
});

const answerSchema = z.object({ questionId: z.string().min(1), selectedIds: z.array(z.string()).min(1, 'Hãy chọn đáp án').max(8) });

// Chấm ngay từng câu. Mỗi câu chỉ trả lời một lần; đáp án đúng chỉ lộ sau khi câu trả lời đã được ghi nhận.
dailyRouter.post('/sessions/:id/answer', async (req, res, next) => {
  try {
    const parsed = answerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const { questionId, selectedIds } = parsed.data;
    const session = await prisma.dailySession.findUnique({ where: { id: req.params.id }, include: { deck: true } });
    if (!session || session.userId !== req.user.id) return res.status(404).json({ error: 'Không tìm thấy phiên luyện' });
    if (session.finishedAt) return res.status(409).json({ error: 'Bạn đã hoàn thành bài luyện này' });
    if (session.deck.date < addDays(vnDate(), -1)) return res.status(400).json({ error: 'Phiên luyện đã hết hạn' });
    const position = session.deck.questionIds.indexOf(questionId);
    if (position < 0) return res.status(400).json({ error: 'Câu hỏi không thuộc bài luyện này' });
    const q = (await loadQuestions([questionId]))[0];
    if (!q) return res.status(404).json({ error: 'Không tìm thấy câu hỏi' });
    const { picked, isCorrect } = gradeQuestion(q.options, selectedIds);
    if (!picked.length) return res.status(400).json({ error: 'Hãy chọn đáp án' });
    const holidays = await holidaySet();

    let out;
    try {
      out = await prisma.$transaction(async tx => {
        const prev = await tx.dailyAnswer.findMany({ where: { sessionId: session.id }, orderBy: { answeredAt: 'desc' }, select: { isCorrect: true } });
        let run = 0;
        for (const a of prev) { if (!a.isCorrect) break; run++; }
        const combo = isCorrect ? run + 1 : 0;
        const xp = answerXp(isCorrect, combo);
        await tx.dailyAnswer.create({ data: { sessionId: session.id, questionId, position, selectedIds: picked, isCorrect, xp } });
        const cur = await tx.dailySession.findUnique({ where: { id: session.id } });
        await tx.dailySession.update({ where: { id: session.id }, data: {
          correct: { increment: isCorrect ? 1 : 0 }, xpEarned: { increment: xp }, bestCombo: Math.max(cur.bestCombo, combo) } });
        const summary = await finalizeIfDone(tx, session.id, holidays);
        return { combo, xp, summary, answeredCount: prev.length + 1 };
      });
    } catch (e) {
      if (e.code === 'P2002') return res.status(409).json({ error: 'Câu này đã được trả lời' });
      throw e;
    }
    res.json({ isCorrect, xp: out.xp, combo: out.combo, answeredCount: out.answeredCount, total: session.total,
      finished: Boolean(out.summary), ...(out.summary && { summary: out.summary }), ...reveal(q) });
  } catch (e) { next(e); }
});

// Bảng xếp hạng theo XP của các phiên đã hoàn thành: tuần này hoặc tháng này, tuỳ chọn lọc theo nhóm.
dailyRouter.get('/leaderboard', async (req, res, next) => {
  try {
    const settings = await getSettings();
    const isAdmin = req.user.role !== 'EMPLOYEE';
    if (!settings.leaderboardEnabled && !isAdmin) return res.json({ enabled: false, rows: [] });
    const today = vnDate();
    const scope = req.query.scope === 'month' ? 'month' : 'week';
    const range = scope === 'month' ? monthRange(today.slice(0, 7)) : { first: weekStart(today), last: addDays(weekStart(today), 6) };
    const groupId = typeof req.query.groupId === 'string' && req.query.groupId ? req.query.groupId : null;
    const sums = await prisma.dailySession.groupBy({
      by: ['userId'], _sum: { xpEarned: true, correct: true }, _count: { _all: true },
      where: { finishedAt: { not: null }, deck: { date: { gte: range.first, lte: range.last } },
        user: { status: 'ACTIVE', ...(groupId && { groupMemberships: { some: { groupId } } }) } }
    });
    const users = await prisma.user.findMany({ where: { id: { in: sums.map(s => s.userId) } }, select: { id: true, fullName: true, username: true } });
    const name = new Map(users.map(u => [u.id, u]));
    const ranked = sums.map(s => ({ userId: s.userId, fullName: name.get(s.userId)?.fullName ?? '', xp: s._sum.xpEarned ?? 0,
      correct: s._sum.correct ?? 0, days: s._count._all }))
      .sort((a, b) => b.xp - a.xp || b.correct - a.correct || a.fullName.localeCompare(b.fullName))
      .map((r, i) => ({ ...r, rank: i + 1, me: r.userId === req.user.id }));
    const top = ranked.slice(0, 20);
    const mine = ranked.find(r => r.me);
    res.json({ enabled: settings.leaderboardEnabled, scope, from: range.first, to: range.last,
      rows: top.map(({ userId, ...r }) => r), me: mine && mine.rank > 20 ? (({ userId, ...r }) => r)(mine) : null });
  } catch (e) { next(e); }
});

const monthParam = q => (typeof q === 'string' && MONTH_RE.test(q) ? q : vnDate().slice(0, 7));

// Lịch ✓/✗ của chính tôi trong một tháng.
dailyRouter.get('/calendar', async (req, res, next) => {
  try {
    const month = monthParam(req.query.month), { first, last } = monthRange(month);
    const holidays = await holidaySet();
    const done = (await finishedDatesByUser([req.user.id], first, last)).get(req.user.id);
    const ctx = { today: vnDate(), holidays, done, createdDate: createdDateOf(req.user) };
    const days = eachDay(first, last).map(date => ({ date, status: dayStatus(date, ctx) }));
    res.json({ month, days, doneCount: days.filter(d => d.status === 'done').length,
      missedCount: days.filter(d => d.status === 'missed').length });
  } catch (e) { next(e); }
});

// ---------- Quản trị ----------
const settingsSchema = z.object({
  questionsPerDeck: z.number().int().min(5).max(20).optional(),
  repeatGapDays: z.number().int().min(7).max(120).optional(),
  leaderboardEnabled: z.boolean().optional()
});

dailyRouter.get('/settings', admin, async (_req, res, next) => {
  try { res.json({ settings: await getSettings() }); } catch (e) { next(e); }
});

dailyRouter.put('/settings', admin, async (req, res, next) => {
  try {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Giá trị cài đặt không hợp lệ' });
    const settings = await prisma.dailySetting.upsert({ where: { id: 1 }, update: parsed.data, create: { id: 1, ...parsed.data } });
    await audit(req, 'DAILY_SETTINGS', { detail: JSON.stringify(parsed.data) });
    res.json({ settings });
  } catch (e) { next(e); }
});

dailyRouter.get('/holidays', admin, async (_req, res, next) => {
  try { res.json({ holidays: await prisma.holiday.findMany({ orderBy: { date: 'asc' } }) }); } catch (e) { next(e); }
});

const holidaySchema = z.object({ date: z.string().regex(DATE_RE, 'Ngày không hợp lệ'), note: z.string().trim().max(200).optional().transform(v => v || null) });

dailyRouter.post('/holidays', admin, async (req, res, next) => {
  try {
    const parsed = holidaySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const holiday = await prisma.holiday.upsert({ where: { date: parsed.data.date }, update: { note: parsed.data.note }, create: parsed.data });
    await audit(req, 'DAILY_HOLIDAY_SET', { targetType: 'Holiday', targetId: holiday.date, detail: holiday.note ?? undefined });
    res.status(201).json({ holiday });
  } catch (e) { next(e); }
});

dailyRouter.delete('/holidays/:date', admin, async (req, res, next) => {
  try {
    if (!DATE_RE.test(req.params.date)) return res.status(400).json({ error: 'Ngày không hợp lệ' });
    await prisma.holiday.deleteMany({ where: { date: req.params.date } });
    await audit(req, 'DAILY_HOLIDAY_REMOVED', { targetType: 'Holiday', targetId: req.params.date });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Ghim đề riêng cho một ngày (hôm nay hoặc tương lai) khi cần, ví dụ ngày có quy định mới. Bình thường không cần.
const pinSchema = z.object({ date: z.string().regex(DATE_RE, 'Ngày không hợp lệ'), questionIds: z.array(z.string()).min(5, 'Chọn ít nhất 5 câu').max(20, 'Tối đa 20 câu') });

dailyRouter.post('/pin', admin, async (req, res, next) => {
  try {
    const parsed = pinSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const { date } = parsed.data, ids = [...new Set(parsed.data.questionIds)];
    if (date < vnDate()) return res.status(400).json({ error: 'Chỉ ghim được đề cho hôm nay hoặc ngày sau' });
    const pool = new Set((await activePool()).map(q => q.id));
    if (ids.length < 5 || ids.some(id => !pool.has(id))) return res.status(400).json({ error: 'Chỉ chọn được câu hỏi "Đang dùng" hợp lệ (tối thiểu 5 câu)' });
    const existing = await prisma.dailyDeck.findUnique({ where: { date }, include: { _count: { select: { sessions: true } } } });
    if (existing?._count.sessions) return res.status(409).json({ error: 'Đã có người làm đề của ngày này, không thể thay' });
    const deck = await prisma.dailyDeck.upsert({ where: { date }, update: { questionIds: ids, pinned: true }, create: { date, questionIds: ids, pinned: true } });
    await audit(req, 'DAILY_PINNED', { targetType: 'DailyDeck', targetId: deck.id, detail: `${date}: ${ids.length} câu` });
    res.status(201).json({ deck: { date: deck.date, questionCount: ids.length, pinned: true } });
  } catch (e) { next(e); }
});

// Thống kê: kho còn đủ cho mấy ngày, hôm nay ai đã/chưa chơi.
dailyRouter.get('/stats', admin, async (_req, res, next) => {
  try {
    const today = vnDate();
    const [settings, pool, lastUsed, employees, deck] = await Promise.all([
      getSettings(), activePool(), lastUsedMap(),
      prisma.user.findMany({ where: { role: 'EMPLOYEE', status: 'ACTIVE' }, select: { id: true, fullName: true, username: true }, orderBy: { fullName: 'asc' } }),
      prisma.dailyDeck.findUnique({ where: { date: today } })
    ]);
    const cutoff = addDays(today, -settings.repeatGapDays);
    const freshCount = pool.filter(q => !(lastUsed.get(q.id) >= cutoff)).length;
    const doneToday = deck ? new Set((await prisma.dailySession.findMany({
      where: { deckId: deck.id, finishedAt: { not: null } }, select: { userId: true } })).map(s => s.userId)) : new Set();
    const notPlayed = employees.filter(u => !doneToday.has(u.id));
    res.json({
      date: today, poolCount: pool.length, freshCount, perDeck: settings.questionsPerDeck, repeatGapDays: settings.repeatGapDays,
      daysLeft: Math.floor(freshCount / settings.questionsPerDeck), lowStock: freshCount < settings.questionsPerDeck * 14,
      deckCreated: Boolean(deck), pinned: Boolean(deck?.pinned),
      employeeCount: employees.length, playedToday: employees.length - notPlayed.length, notPlayed
    });
  } catch (e) { next(e); }
});

// Bảng điểm danh: mỗi nhân viên một hàng, mỗi ngày một ô ✓ / ✗ (T7, CN, ngày lễ là "nghỉ").
async function buildAttendance(month, groupId) {
  const { first, last } = monthRange(month);
  const today = vnDate();
  const users = await prisma.user.findMany({
    where: { role: 'EMPLOYEE', status: 'ACTIVE', ...(groupId && { groupMemberships: { some: { groupId } } }) },
    select: { id: true, fullName: true, username: true, createdAt: true }, orderBy: { fullName: 'asc' }
  });
  const [holidays, doneBy] = await Promise.all([holidaySet(), finishedDatesByUser(users.map(u => u.id), first, last)]);
  const dates = eachDay(first, last);
  const rows = users.map(u => {
    const ctx = { today, holidays, done: doneBy.get(u.id), createdDate: createdDateOf(u) };
    const days = dates.map(d => dayStatus(d, ctx));
    const missed = days.filter(s => s === 'missed').length, done = days.filter(s => s === 'done').length;
    // Tỷ lệ tính trên các ngày làm việc đã qua (+ hôm nay nếu đã chơi); chơi cuối tuần không làm tăng quá 100%.
    const dueDays = dates.filter((d, i) => days[i] !== 'off' && isWorkday(d, holidays) && d <= today && (d < today || days[i] === 'done')).length;
    const doneWorkdays = dates.filter((d, i) => days[i] === 'done' && isWorkday(d, holidays)).length;
    return { userId: u.id, fullName: u.fullName, username: u.username, days, doneCount: done, missedCount: missed,
      rate: dueDays ? Math.round((doneWorkdays / dueDays) * 100) : null };
  });
  return { month, dates, holidays: [...holidays].filter(d => d >= first && d <= last), rows };
}

const groupParam = q => (typeof q === 'string' && q ? q : null);

dailyRouter.get('/attendance', admin, async (req, res, next) => {
  try { res.json(await buildAttendance(monthParam(req.query.month), groupParam(req.query.groupId))); } catch (e) { next(e); }
});

dailyRouter.get('/attendance.csv', admin, async (req, res, next) => {
  try {
    const a = await buildAttendance(monthParam(req.query.month), groupParam(req.query.groupId));
    const mark = { done: '✓', missed: '✗', rest: 'nghỉ', pending: '…', off: '', future: '' };
    const rows = [['Tài khoản', 'Họ tên', ...a.dates.map(d => d.slice(8) + '/' + d.slice(5, 7)), 'Số ngày hoàn thành', 'Số ngày bỏ lỡ', 'Tỷ lệ ngày làm việc (%)'],
      ...a.rows.map(r => [r.username, r.fullName, ...r.days.map(s => mark[s]), r.doneCount, r.missedCount, r.rate ?? ''])];
    await audit(req, 'DAILY_ATTENDANCE_EXPORTED', { detail: a.month });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="diem-danh-${a.month}.csv"`);
    res.send(toCsv(rows));
  } catch (e) { next(e); }
});
