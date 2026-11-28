// Chọn câu hỏi cho đề của một ngày (hàm thuần, có test). Cùng đầu vào + cùng ngày luôn ra cùng kết quả.

// Bộ sinh số ngẫu nhiên có hạt giống để đề và thứ tự đáp án ổn định trong ngày.
export function seeded(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = (h ^= h >>> 16) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(list, rand) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const SHARE = { EASY: 0.4, MEDIUM: 0.4, HARD: 0.2 };

/**
 * pool: [{ id, topic, difficulty }] – câu "Đang dùng".
 * lastUsed: Map id -> ngày gần nhất câu đó được đưa vào đề (không có = chưa dùng bao giờ).
 * Ưu tiên câu chưa dùng, rồi câu dùng lâu nhất; trộn độ khó 4-4-2 và dàn trải chủ đề.
 */
export function pickDeck({ pool, lastUsed = new Map(), count, seed }) {
  if (pool.length <= count) return shuffle(pool.map(q => q.id), seeded(`${seed}:order`));
  const rand = seeded(seed);
  // Cùng mức "độ cũ" thì xáo ngẫu nhiên; mức cũ hơn (hoặc chưa dùng) đứng trước.
  const ranked = shuffle(pool, rand).sort((a, b) => (lastUsed.get(a.id) ?? '').localeCompare(lastUsed.get(b.id) ?? ''));
  const topics = new Set(pool.map(q => q.topic)).size;
  const topicCap = Math.ceil(count / Math.min(topics, count)) + 1;
  const quota = { EASY: Math.round(count * SHARE.EASY), HARD: Math.round(count * SHARE.HARD) };
  quota.MEDIUM = count - quota.EASY - quota.HARD;

  const picked = [], taken = new Set(), perTopic = {}, perDiff = { EASY: 0, MEDIUM: 0, HARD: 0 };
  const take = q => { picked.push(q.id); taken.add(q.id); perTopic[q.topic] = (perTopic[q.topic] ?? 0) + 1; perDiff[q.difficulty]++; };
  for (const q of ranked) {
    if (picked.length >= count) break;
    if (perDiff[q.difficulty] < quota[q.difficulty] && (perTopic[q.topic] ?? 0) < topicCap) take(q);
  }
  // Thiếu câu ở một mức độ khó thì bù từ các câu còn lại (vẫn tôn trọng giới hạn chủ đề trước, rồi nới).
  for (const q of ranked) if (picked.length < count && !taken.has(q.id) && (perTopic[q.topic] ?? 0) < topicCap) take(q);
  for (const q of ranked) if (picked.length < count && !taken.has(q.id)) take(q);
  return shuffle(picked, seeded(`${seed}:order`));
}
