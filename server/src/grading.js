// Chấm một câu: đúng khi tập đáp án chọn (đã lọc id hợp lệ, bỏ trùng) trùng khớp tập đáp án đúng.
export function gradeQuestion(options, selectedIds) {
  const valid = new Set(options.map(o => o.id));
  const picked = [...new Set(selectedIds || [])].filter(id => valid.has(id));
  const right = options.filter(o => o.isCorrect).map(o => o.id);
  const isCorrect = picked.length === right.length && right.every(id => picked.includes(id));
  return { picked, isCorrect };
}

export function summarize(correct, total, passPercent) {
  const percent = total ? Math.round((correct / total) * 100) : 0;
  return { percent, passed: percent >= passPercent };
}
