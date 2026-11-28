// Luật chơi (hàm thuần, có test): điểm XP, cấp độ, chuỗi ngày, huy hiệu.
import { addDays, isWorkday } from './dates.js';

export const XP = { correct: 10, comboStep: 2, comboCap: 10, complete: 20, perfect: 30 };

// combo = số câu đúng liên tiếp tính cả câu này (câu sai thì combo = 0).
export function answerXp(isCorrect, combo) {
  if (!isCorrect) return 0;
  const bonus = combo >= 2 ? Math.min((combo - 1) * XP.comboStep, XP.comboCap) : 0;
  return XP.correct + bonus;
}

export const completionXp = (correct, total) => XP.complete + (total > 0 && correct === total ? XP.perfect : 0);

// Cấp 1 từ 0 XP; mỗi cấp cần nhiều XP hơn cấp trước.
const LEVEL_UNIT = 60;
export const levelOf = xp => 1 + Math.floor(Math.sqrt(Math.max(0, xp) / LEVEL_UNIT));
export const xpForLevel = level => (level - 1) ** 2 * LEVEL_UNIT;
export function levelInfo(xp) {
  const level = levelOf(xp);
  const from = xpForLevel(level), to = xpForLevel(level + 1);
  return { level, xp, from, to, into: xp - from, need: to - from };
}

// Có ngày làm việc nào nằm giữa `last` và `date` (không tính hai đầu) mà bị bỏ lỡ không?
function missedWorkday(last, date, holidays) {
  for (let d = addDays(last, 1); d < date; d = addDays(d, 1)) if (isWorkday(d, holidays)) return true;
  return false;
}

// Cập nhật chuỗi khi hoàn thành một phiên vào ngày `date`. Chuỗi chỉ đứt khi bỏ lỡ một ngày làm việc;
// Thứ 7, Chủ nhật và ngày lễ không bắt buộc, nhưng chơi vào các ngày đó vẫn được cộng.
export function creditStreak({ currentStreak = 0, longestStreak = 0, lastCreditedDate = null }, date, holidays = new Set()) {
  if (lastCreditedDate && lastCreditedDate >= date) return { currentStreak, longestStreak, lastCreditedDate };
  const next = lastCreditedDate && !missedWorkday(lastCreditedDate, date, holidays) ? currentStreak + 1 : 1;
  return { currentStreak: next, longestStreak: Math.max(longestStreak, next), lastCreditedDate: date };
}

// Chuỗi đang hiển thị hôm nay: về 0 nếu đã bỏ lỡ một ngày làm việc trước hôm nay.
export function liveStreak({ currentStreak = 0, lastCreditedDate = null } = {}, today, holidays = new Set()) {
  if (!lastCreditedDate) return 0;
  return missedWorkday(lastCreditedDate, today, holidays) ? 0 : currentStreak;
}

export const BADGES = {
  FIRST_DAILY: { label: 'Bước đầu tiên', hint: 'Hoàn thành bài luyện đầu tiên' },
  STREAK_3: { label: 'Chuỗi 3 ngày', hint: 'Luyện liên tiếp 3 ngày' },
  STREAK_7: { label: 'Chuỗi 7 ngày', hint: 'Luyện liên tiếp 7 ngày' },
  STREAK_14: { label: 'Chuỗi 14 ngày', hint: 'Luyện liên tiếp 14 ngày' },
  STREAK_30: { label: 'Chuỗi 30 ngày', hint: 'Luyện liên tiếp 30 ngày' },
  PERFECT: { label: 'Điểm tuyệt đối', hint: 'Trả lời đúng tất cả câu trong một ngày' },
  COMBO_5: { label: 'Combo 5', hint: '5 câu đúng liên tiếp' },
  LEVEL_5: { label: 'Cấp 5', hint: 'Đạt cấp độ 5' }
};

// Huy hiệu đạt được sau một phiên; trả về các mã chưa có.
export function newBadges({ have = [], sessionsDone, streak, perfect, bestCombo, level }) {
  const want = [];
  if (sessionsDone >= 1) want.push('FIRST_DAILY');
  for (const n of [3, 7, 14, 30]) if (streak >= n) want.push(`STREAK_${n}`);
  if (perfect) want.push('PERFECT');
  if (bestCombo >= 5) want.push('COMBO_5');
  if (level >= 5) want.push('LEVEL_5');
  const owned = new Set(have);
  return want.filter(c => !owned.has(c));
}
