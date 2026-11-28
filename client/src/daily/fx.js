// Hiệu ứng vui: pháo hoa và âm thanh. Tôn trọng "giảm chuyển động" của hệ điều hành; âm thanh mặc định tắt.
import confetti from 'canvas-confetti';

const COLORS = ['#00529c', '#ffb800', '#1a8a55', '#ff7a1a', '#e5484d', '#7c5cff'];
const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Pháo nhỏ bắn ra từ một phần tử (nút bấm) khi trả lời đúng.
export function cheer(el) {
  if (reduced()) return;
  const r = el?.getBoundingClientRect?.();
  const origin = r ? { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight } : { x: 0.5, y: 0.7 };
  confetti({ particleCount: 55, spread: 70, startVelocity: 34, ticks: 130, scalar: 0.9, origin, colors: COLORS, disableForReducedMotion: true });
}

// Pháo lớn khi hoàn thành bài; nhiều đợt hơn nếu đúng hết.
export function celebrate(perfect) {
  if (reduced()) return;
  const shots = perfect ? 5 : 2;
  for (let i = 0; i < shots; i++) {
    setTimeout(() => {
      confetti({ particleCount: perfect ? 90 : 70, spread: 100, startVelocity: 45, ticks: 200, origin: { x: Math.random() * 0.6 + 0.2, y: 0.55 },
        colors: COLORS, disableForReducedMotion: true });
    }, i * 260);
  }
}

// ---- Âm thanh (WebAudio, không cần file) ----
const KEY = 'tth-daily-sound';
export const soundOn = () => { try { return localStorage.getItem(KEY) === 'on'; } catch { return false; } };
export const setSound = on => { try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* bỏ qua */ } };

let ctx;
function tone(freq, start, dur, type = 'sine', gain = 0.08) {
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator(), g = ctx.createGain();
  osc.type = type; osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0); osc.stop(t0 + dur + 0.02);
}

export function beep(kind) {
  if (!soundOn()) return;
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    if (kind === 'right') { tone(659, 0, 0.14); tone(880, 0.1, 0.22); }
    else if (kind === 'wrong') { tone(220, 0, 0.28, 'triangle', 0.1); }
    else if (kind === 'win') { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.25)); }
  } catch { /* trình duyệt không hỗ trợ âm thanh: bỏ qua */ }
}
