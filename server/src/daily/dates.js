// Ngày cho phần "Luyện mỗi ngày": chuỗi "YYYY-MM-DD" theo giờ Việt Nam, tách khỏi múi giờ của máy chủ.
const VN = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' });

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MONTH_RE = /^\d{4}-\d{2}$/;

export const vnDate = (now = new Date()) => VN.format(now);

const toUtc = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const fromUtc = ms => new Date(ms).toISOString().slice(0, 10);

export const addDays = (s, n) => fromUtc(toUtc(s) + n * 86_400_000);
// 0 = Chủ nhật … 6 = Thứ bảy
export const weekday = s => new Date(toUtc(s)).getUTCDay();
export const diffDays = (a, b) => Math.round((toUtc(a) - toUtc(b)) / 86_400_000);

// Ngày làm việc: Thứ 2–Thứ 6 và không nằm trong danh sách ngày lễ (Set các chuỗi ngày).
export function isWorkday(s, holidays = new Set()) {
  const w = weekday(s);
  return w >= 1 && w <= 5 && !holidays.has(s);
}

// Thứ 2 của tuần chứa ngày s.
export const weekStart = s => addDays(s, -((weekday(s) + 6) % 7));

export function monthRange(month) {
  const first = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  const last = fromUtc(Date.UTC(y, m, 0));
  return { first, last };
}

export function eachDay(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
