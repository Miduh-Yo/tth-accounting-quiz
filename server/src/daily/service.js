// Truy cập dữ liệu cho phần "Luyện mỗi ngày": cài đặt, đề của ngày, tiến trình, điểm danh.
import { prisma } from '../db.js';
import { addDays, isWorkday, vnDate } from './dates.js';
import { pickDeck, seeded, shuffle } from './deck.js';
import { BADGES, completionXp, creditStreak, levelInfo, newBadges } from './rules.js';

export const getSettings = () => prisma.dailySetting.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

export async function holidaySet() {
  return new Set((await prisma.holiday.findMany({ select: { date: true } })).map(h => h.date));
}

// Câu đủ điều kiện vào đề: "Đang dùng", có ít nhất 2 đáp án và ít nhất 1 đáp án đúng.
export async function activePool() {
  const rows = await prisma.question.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, topic: true, difficulty: true, options: { select: { isCorrect: true } } }
  });
  return rows.filter(q => q.options.length >= 2 && q.options.some(o => o.isCorrect))
    .map(({ id, topic, difficulty }) => ({ id, topic, difficulty }));
}

// Ngày gần nhất mỗi câu được đưa vào đề (để ưu tiên câu chưa dùng / dùng lâu nhất).
export async function lastUsedMap() {
  const decks = await prisma.dailyDeck.findMany({ orderBy: { date: 'desc' }, take: 400, select: { date: true, questionIds: true } });
  const m = new Map();
  for (const d of decks) for (const id of d.questionIds) if (!m.has(id)) m.set(id, d.date);
  return m;
}

// Đề của một ngày: tạo tự động ở lần đầu có người mở trong ngày (không cần tác vụ định giờ).
// Ràng buộc duy nhất theo ngày chống tạo trùng khi nhiều người mở cùng lúc.
export async function ensureDeck(date) {
  const found = await prisma.dailyDeck.findUnique({ where: { date } });
  if (found) return found;
  const [settings, pool, lastUsed] = await Promise.all([getSettings(), activePool(), lastUsedMap()]);
  if (!pool.length) return null;
  const questionIds = pickDeck({ pool, lastUsed, count: settings.questionsPerDeck, seed: date });
  try {
    return await prisma.dailyDeck.create({ data: { date, questionIds } });
  } catch (e) {
    if (e.code === 'P2002') return prisma.dailyDeck.findUnique({ where: { date } });
    throw e;
  }
}

// ---- Trình bày câu hỏi ----
const DOC = { select: { title: true, code: true, url: true } };

export async function loadQuestions(ids) {
  const rows = await prisma.question.findMany({
    where: { id: { in: ids } },
    include: { options: { orderBy: { position: 'asc' } }, document: DOC }
  });
  const by = new Map(rows.map(q => [q.id, q]));
  return ids.map(id => by.get(id)).filter(Boolean);
}

// Thứ tự đáp án xáo theo ngày (ổn định khi tải lại); câu Đúng/Sai giữ nguyên thứ tự.
export function present(q, date) {
  const opts = q.type === 'TRUE_FALSE' ? q.options : shuffle(q.options, seeded(`${date}:${q.id}`));
  return { id: q.id, topic: q.topic, type: q.type, content: q.content, options: opts.map(o => ({ id: o.id, text: o.text })) };
}

// Chỉ gọi sau khi người chơi đã trả lời câu đó.
export const reveal = q => ({
  correctIds: q.options.filter(o => o.isCorrect).map(o => o.id),
  explanation: q.explanation, reference: q.reference, document: q.document
});

// ---- Tiến trình ----
export async function getProgress(userId) {
  return (await prisma.userProgress.findUnique({ where: { userId } }))
    ?? { userId, xp: 0, currentStreak: 0, longestStreak: 0, lastCreditedDate: null };
}

export const badgeInfo = code => ({ code, ...(BADGES[code] ?? { label: code, hint: '' }) });

// Khi câu cuối được trả lời: chốt phiên, cộng XP thưởng, cập nhật chuỗi ngày và cấp huy hiệu.
// Chạy trong transaction; updateMany có điều kiện finishedAt = null đảm bảo chỉ chốt một lần.
export async function finalizeIfDone(tx, sessionId, holidays) {
  const session = await tx.dailySession.findUnique({ where: { id: sessionId }, include: { deck: true } });
  if (!session || session.finishedAt) return null;
  if ((await tx.dailyAnswer.count({ where: { sessionId } })) < session.total) return null;
  const lock = await tx.dailySession.updateMany({ where: { id: sessionId, finishedAt: null }, data: { finishedAt: new Date() } });
  if (lock.count !== 1) return null;

  const bonusXp = completionXp(session.correct, session.total);
  const xpEarned = session.xpEarned + bonusXp;
  await tx.dailySession.update({ where: { id: sessionId }, data: { xpEarned } });

  const before = (await tx.userProgress.findUnique({ where: { userId: session.userId } }))
    ?? { xp: 0, currentStreak: 0, longestStreak: 0, lastCreditedDate: null };
  const streak = creditStreak(before, session.deck.date, holidays);
  const xp = before.xp + xpEarned;
  await tx.userProgress.upsert({
    where: { userId: session.userId },
    create: { userId: session.userId, xp, ...streak },
    update: { xp, ...streak }
  });

  const have = (await tx.userBadge.findMany({ where: { userId: session.userId }, select: { code: true } })).map(b => b.code);
  const sessionsDone = await tx.dailySession.count({ where: { userId: session.userId, finishedAt: { not: null } } });
  const perfect = session.total > 0 && session.correct === session.total;
  const level = levelInfo(xp);
  const earned = newBadges({ have, sessionsDone, streak: streak.currentStreak, perfect, bestCombo: session.bestCombo, level: level.level });
  if (earned.length) await tx.userBadge.createMany({ data: earned.map(code => ({ userId: session.userId, code })) });

  return {
    correct: session.correct, total: session.total, xpEarned, bonusXp, perfect, bestCombo: session.bestCombo,
    streak: { current: streak.currentStreak, longest: streak.longestStreak },
    level, levelUp: levelInfo(before.xp).level < level.level, newBadges: earned.map(badgeInfo)
  };
}

// ---- Điểm danh ----
// done: đã hoàn thành · missed: ngày làm việc đã qua mà chưa chơi · pending: hôm nay chưa chơi
// rest: T7/CN/ngày lễ không chơi · off: trước ngày tạo tài khoản · future: chưa tới
export function dayStatus(date, { today, holidays, done, createdDate }) {
  if (createdDate && date < createdDate) return 'off';
  if (done.has(date)) return 'done';
  if (date > today) return 'future';
  if (!isWorkday(date, holidays)) return 'rest';
  return date === today ? 'pending' : 'missed';
}

export const createdDateOf = user => vnDate(user.createdAt);

export async function finishedDatesByUser(userIds, from, to) {
  const rows = await prisma.dailySession.findMany({
    where: { userId: { in: userIds }, finishedAt: { not: null }, deck: { date: { gte: from, lte: to } } },
    select: { userId: true, deck: { select: { date: true } } }
  });
  const m = new Map(userIds.map(id => [id, new Set()]));
  for (const r of rows) m.get(r.userId).add(r.deck.date);
  return m;
}

export { addDays };
