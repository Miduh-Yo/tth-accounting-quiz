import test from 'node:test';
import assert from 'node:assert/strict';
import { vnDate, addDays, weekday, isWorkday, weekStart, monthRange, eachDay } from '../src/daily/dates.js';
import { answerXp, completionXp, levelInfo, creditStreak, liveStreak, newBadges } from '../src/daily/rules.js';
import { pickDeck, seeded, shuffle } from '../src/daily/deck.js';

test('ngày theo giờ Việt Nam: 23:30 UTC đã sang ngày hôm sau ở VN', () => {
  assert.equal(vnDate(new Date('2026-11-27T16:59:00Z')), '2026-11-27'); // 23:59 VN
  assert.equal(vnDate(new Date('2026-11-27T17:00:00Z')), '2026-11-28'); // 00:00 VN
});

test('tiện ích ngày: cộng ngày, thứ, ngày làm việc, đầu tuần, tháng', () => {
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(weekday('2026-11-28'), 6); // Thứ 7
  assert.equal(isWorkday('2026-11-27'), true); // Thứ 6
  assert.equal(isWorkday('2026-11-28'), false);
  assert.equal(isWorkday('2026-11-27', new Set(['2026-11-27'])), false); // ngày lễ
  assert.equal(weekStart('2026-11-29'), '2026-11-23'); // CN → Thứ 2 trước đó
  assert.equal(weekStart('2026-11-23'), '2026-11-23');
  assert.deepEqual(monthRange('2026-02'), { first: '2026-02-01', last: '2026-02-28' });
  assert.equal(eachDay('2026-11-28', '2026-12-01').length, 4);
});

test('XP: đúng +10, combo cộng dần có trần, sai 0', () => {
  assert.equal(answerXp(false, 0), 0);
  assert.equal(answerXp(true, 1), 10);
  assert.equal(answerXp(true, 2), 12);
  assert.equal(answerXp(true, 3), 14);
  assert.equal(answerXp(true, 20), 20); // trần thưởng combo +10
  assert.equal(completionXp(7, 10), 20);
  assert.equal(completionXp(10, 10), 50);
});

test('cấp độ tăng dần theo XP', () => {
  assert.equal(levelInfo(0).level, 1);
  assert.equal(levelInfo(59).level, 1);
  assert.equal(levelInfo(60).level, 2);
  const i = levelInfo(100);
  assert.ok(i.from <= 100 && 100 < i.to);
});

const empty = { currentStreak: 0, longestStreak: 0, lastCreditedDate: null };

test('chuỗi ngày: liên tiếp thì tăng, cùng ngày không tăng thêm', () => {
  let p = creditStreak(empty, '2026-11-23'); // Thứ 2
  assert.equal(p.currentStreak, 1);
  p = creditStreak(p, '2026-11-24');
  assert.equal(p.currentStreak, 2);
  assert.equal(creditStreak(p, '2026-11-24').currentStreak, 2);
});

test('chuỗi ngày: T7/CN không bắt buộc, không làm đứt chuỗi', () => {
  const fri = { currentStreak: 5, longestStreak: 5, lastCreditedDate: '2026-11-27' };
  assert.equal(creditStreak(fri, '2026-11-30').currentStreak, 6); // Thứ 6 → Thứ 2
  assert.equal(creditStreak(fri, '2026-11-28').currentStreak, 6); // chơi thêm Thứ 7 vẫn được cộng
  const sat = creditStreak(fri, '2026-11-28');
  assert.equal(creditStreak(sat, '2026-11-30').currentStreak, 7); // Thứ 7 → Thứ 2
});

test('chuỗi ngày: bỏ lỡ một ngày làm việc thì về 1, giữ kỷ lục', () => {
  const p = { currentStreak: 5, longestStreak: 9, lastCreditedDate: '2026-11-24' }; // Thứ 3
  const r = creditStreak(p, '2026-11-26'); // bỏ Thứ 4
  assert.equal(r.currentStreak, 1);
  assert.equal(r.longestStreak, 9);
});

test('chuỗi ngày: ngày lễ giữa tuần không làm đứt chuỗi', () => {
  const holidays = new Set(['2026-11-25']);
  const p = { currentStreak: 3, longestStreak: 3, lastCreditedDate: '2026-11-24' };
  assert.equal(creditStreak(p, '2026-11-26', holidays).currentStreak, 4);
});

test('chuỗi hiển thị: hôm nay chưa chơi thì chưa mất', () => {
  const p = { currentStreak: 4, lastCreditedDate: '2026-11-26' }; // Thứ 5
  assert.equal(liveStreak(p, '2026-11-27'), 4); // Thứ 6 chưa chơi: chưa mất
});
test('chuỗi hiển thị: bỏ lỡ Thứ 6 rồi sang Thứ 2 thì mất', () => {
  const p = { currentStreak: 4, lastCreditedDate: '2026-11-26' };
  assert.equal(liveStreak(p, '2026-11-30'), 0);
  assert.equal(liveStreak({ currentStreak: 4, lastCreditedDate: '2026-11-27' }, '2026-11-30'), 4);
  assert.equal(liveStreak(undefined, '2026-11-30'), 0);
});

test('huy hiệu: chỉ trả mã chưa có', () => {
  const b = newBadges({ have: ['FIRST_DAILY'], sessionsDone: 3, streak: 7, perfect: true, bestCombo: 6, level: 2 });
  assert.deepEqual(b.sort(), ['COMBO_5', 'PERFECT', 'STREAK_3', 'STREAK_7']);
});

const pool = [];
for (let i = 0; i < 60; i++) pool.push({ id: `q${i}`, topic: `T${i % 6}`, difficulty: ['EASY', 'MEDIUM', 'HARD'][i % 3] });

test('đề hàng ngày: ổn định theo ngày, đủ số câu, không trùng', () => {
  const a = pickDeck({ pool, count: 10, seed: '2026-11-28' });
  assert.deepEqual(a, pickDeck({ pool, count: 10, seed: '2026-11-28' }));
  assert.notDeepEqual(a, pickDeck({ pool, count: 10, seed: '2026-11-29' }));
  assert.equal(a.length, 10);
  assert.equal(new Set(a).size, 10);
});

test('đề hàng ngày: trộn độ khó 4-4-2 và dàn trải chủ đề', () => {
  const ids = pickDeck({ pool, count: 10, seed: 'x' });
  const by = id => pool.find(q => q.id === id);
  const diff = ids.reduce((m, id) => ({ ...m, [by(id).difficulty]: (m[by(id).difficulty] ?? 0) + 1 }), {});
  assert.deepEqual(diff, { EASY: 4, MEDIUM: 4, HARD: 2 });
  const perTopic = ids.reduce((m, id) => ({ ...m, [by(id).topic]: (m[by(id).topic] ?? 0) + 1 }), {});
  assert.ok(Math.max(...Object.values(perTopic)) <= 3);
});

test('đề hàng ngày: ưu tiên câu chưa dùng, rồi câu dùng lâu nhất', () => {
  const lastUsed = new Map(pool.slice(0, 50).map((q, i) => [q.id, `2026-10-${String(1 + (i % 28)).padStart(2, '0')}`]));
  const ids = pickDeck({ pool, lastUsed, count: 10, seed: 'y' });
  const fresh = pool.slice(50).map(q => q.id); // 10 câu chưa dùng bao giờ
  assert.equal(ids.filter(id => fresh.includes(id)).length >= 8, true);
});

test('đề hàng ngày: kho nhỏ hơn số câu thì dùng hết; thiếu một mức khó thì bù', () => {
  assert.equal(pickDeck({ pool: pool.slice(0, 4), count: 10, seed: 'z' }).length, 4);
  const allEasy = pool.filter(q => q.difficulty === 'EASY');
  assert.equal(new Set(pickDeck({ pool: allEasy, count: 10, seed: 'z' })).size, 10);
});

test('bộ xáo có hạt giống: cùng hạt cho cùng thứ tự', () => {
  assert.deepEqual(shuffle([1, 2, 3, 4, 5, 6], seeded('a')), shuffle([1, 2, 3, 4, 5, 6], seeded('a')));
});
