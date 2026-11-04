import { parseCsv } from './csvParse.js';

// Cột cố định: Chủ đề, Loại, Độ khó, Câu hỏi, Đáp án A..F, Đáp án đúng, Giải thích, Căn cứ. Dòng đầu là tiêu đề.
export const IMPORT_HEADER = ['Chủ đề', 'Loại', 'Độ khó', 'Câu hỏi', 'Đáp án A', 'Đáp án B', 'Đáp án C', 'Đáp án D', 'Đáp án E', 'Đáp án F', 'Đáp án đúng', 'Giải thích', 'Căn cứ', 'Tài liệu'];
export const MAX_IMPORT_ROWS = 500;

const norm = s => String(s ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
const TYPES = { single: 'SINGLE', 'mot dap an': 'SINGLE', multiple: 'MULTIPLE', 'nhieu dap an': 'MULTIPLE',
  true_false: 'TRUE_FALSE', 'dung/sai': 'TRUE_FALSE', 'dung sai': 'TRUE_FALSE' };
const DIFFS = { easy: 'EASY', de: 'EASY', medium: 'MEDIUM', 'trung binh': 'MEDIUM', hard: 'HARD', kho: 'HARD' };

// Trả về { data } (dữ liệu thô để zod kiểm tra tiếp) hoặc { error }.
export function rowToQuestion(r) {
  const c = i => (r[i] ?? '').trim();
  const type = TYPES[norm(c(1))];
  if (!type) return { error: `Loại "${c(1)}" không hợp lệ (Một đáp án / Nhiều đáp án / Đúng/Sai)` };
  const difficulty = c(2) ? DIFFS[norm(c(2))] : 'MEDIUM';
  if (!difficulty) return { error: `Độ khó "${c(2)}" không hợp lệ (Dễ / Trung bình / Khó)` };

  const letters = (c(10).toUpperCase().match(/[A-F]/g) || []);
  let texts;
  let correctIdx;
  if (type === 'TRUE_FALSE') {
    texts = ['Đúng', 'Sai'];
    const v = norm(c(10));
    correctIdx = v === 'dung' || v === 'a' ? [0] : v === 'sai' || v === 'b' ? [1] : [];
  } else {
    texts = [4, 5, 6, 7, 8, 9].map(c);
    // Bỏ ô trống ở cuối; ô trống giữa chừng là lỗi.
    while (texts.length && texts[texts.length - 1] === '') texts.pop();
    if (texts.includes('')) return { error: 'Các đáp án phải liên tiếp, không bỏ trống giữa chừng' };
    correctIdx = [...new Set(letters)].map(l => l.charCodeAt(0) - 65);
    if (correctIdx.some(i => i >= texts.length)) return { error: 'Đáp án đúng trỏ tới đáp án không tồn tại' };
  }
  if (!correctIdx.length) return { error: 'Thiếu đáp án đúng' };
  return {
    documentRef: c(13),
    data: {
      topic: c(0), type, difficulty, status: 'DRAFT', content: c(3), explanation: c(11), reference: c(12),
      options: texts.map((text, i) => ({ text, isCorrect: correctIdx.includes(i) }))
    }
  };
}

// Khớp tài liệu theo số hiệu hoặc tên (không phân biệt hoa thường). Trả về document hoặc null.
export function findDocument(docs, ref) {
  const k = String(ref ?? '').trim().toLowerCase();
  if (!k) return null;
  return docs.find(d => d.code && d.code.trim().toLowerCase() === k) ?? docs.find(d => d.title.trim().toLowerCase() === k) ?? null;
}

export function parseImport(text) {
  const rows = parseCsv(text);
  return rows.slice(1).map((r, i) => ({ line: i + 2, row: r }));
}
