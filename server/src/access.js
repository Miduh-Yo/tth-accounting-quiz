// Người dùng được thấy đề nếu đề giao cho tất cả, hoặc cho nhóm của họ, hoặc họ đã có bài làm.
export const visibleTo = userId => ({ OR: [
  { assignAll: true },
  { groups: { some: { group: { members: { some: { userId } } } } } },
  { attempts: { some: { userId } } }
] });

export const GRACE_MS = 30_000; // bù độ trễ mạng khi nộp bài
export const deadline = (startedAt, durationMinutes) => new Date(startedAt.getTime() + durationMinutes * 60_000);
