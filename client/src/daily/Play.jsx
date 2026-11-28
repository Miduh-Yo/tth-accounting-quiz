import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, Clock, Flame, Volume2, VolumeX, XCircle, Zap } from 'lucide-react';
import { api } from '../api.js';
import Mascot from './Mascot.jsx';
import { beep, cheer, setSound, soundOn } from './fx.js';

const RIGHT = ['Chính xác!', 'Quá đỉnh!', 'Giỏi lắm!', 'Chuẩn không cần chỉnh!', 'Đúng rồi!', 'Tuyệt vời!'];
const WRONG = ['Chưa đúng, cùng xem nhé', 'Suýt nữa rồi!', 'Không sao, rút kinh nghiệm nào', 'Ghi nhớ đáp án này nhé'];
const SOFT_LIMIT = 10 * 60; // 10 phút chỉ là gợi ý, không phạt

const mmss = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export default function Play({ data, onExit, onFinished, onReload }) {
  const qs = data.questions;
  const [answers, setAnswers] = useState(data.answers);
  const firstOpen = qs.findIndex(q => !data.answers[q.id]);
  const [idx, setIdx] = useState(firstOpen === -1 ? 0 : firstOpen);
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [xp, setXp] = useState(data.xpEarned);
  const [combo, setCombo] = useState(0);
  const [gain, setGain] = useState(null); // {id, xp} cho hiệu ứng "+XP" nổi lên
  const [summary, setSummary] = useState(null);
  const [sound, setSoundState] = useState(soundOn);
  const [secs, setSecs] = useState(0);
  const checkRef = useRef(null);
  const nextRef = useRef(null);
  const fbRef = useRef(null);

  useEffect(() => { const t = setInterval(() => setSecs(s => s + 1), 1000); return () => clearInterval(t); }, []);

  const q = qs[idx];
  const ans = answers[q.id];
  const answeredCount = Object.keys(answers).length;
  const isLast = idx === qs.length - 1;

  // Sau khi chấm xong, đưa tiêu điểm tới nút "Câu tiếp theo" để bấm Enter liên tục.
  useEffect(() => {
    if (!ans) return;
    nextRef.current?.focus({ preventScroll: true });
    fbRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [ans]);

  function toggle(id) {
    if (ans || busy) return;
    setPicked(q.type === 'MULTIPLE' ? (picked.includes(id) ? picked.filter(x => x !== id) : [...picked, id]) : [id]);
  }

  async function check() {
    if (!picked.length || busy || ans) return;
    setBusy(true); setError('');
    try {
      const r = await api(`/daily/sessions/${data.sessionId}/answer`, { method: 'POST', body: { questionId: q.id, selectedIds: picked } });
      setAnswers(a => ({ ...a, [q.id]: { selectedIds: picked, isCorrect: r.isCorrect, xp: r.xp, correctIds: r.correctIds,
        explanation: r.explanation, reference: r.reference, document: r.document } }));
      setXp(v => v + r.xp);
      setCombo(r.combo);
      if (r.xp) setGain({ id: q.id, xp: r.xp });
      if (r.isCorrect) { cheer(checkRef.current); beep('right'); } else beep('wrong');
      if (r.finished) setSummary(r.summary);
    } catch (e) {
      setError(e.message);
      if (e.status === 409) setTimeout(onReload, 1200); // đã trả lời ở thiết bị khác: tải lại phiên
    } finally { setBusy(false); }
  }

  function next() {
    if (summary) return onFinished(summary, { questions: qs, answers });
    if (isLast) return onReload(); // câu cuối đã trả lời nhưng máy chủ chưa chốt (hiếm): tải lại để chốt
    setIdx(idx + 1); setPicked([]); setGain(null);
  }

  const toggleSound = () => { const on = !sound; setSound(on); setSoundState(on); if (on) beep('right'); };

  return <div className="daily daily-play">
    <div className="play-top">
      <button className="btn btn-ghost btn-sm" onClick={onExit}>Thoát</button>
      <div className="play-progress" role="progressbar" aria-valuemin={0} aria-valuemax={qs.length} aria-valuenow={answeredCount} aria-label="Tiến độ">
        <span style={{ width: `${(answeredCount / qs.length) * 100}%` }} />
      </div>
      <span className="play-count">{answeredCount}/{qs.length}</span>
    </div>

    <div className="play-meta">
      <span className={secs > SOFT_LIMIT ? 'pill pill-warn' : 'pill'}><Clock />{mmss(secs)} <small>/ gợi ý 10:00</small></span>
      <span className="pill pill-sun"><Zap />{xp} XP</span>
      {combo >= 2 && <span className="pill pill-flame combo-pop" key={combo}><Flame />Combo ×{combo}</span>}
      <button className="icon-btn" onClick={toggleSound} aria-pressed={sound} aria-label={sound ? 'Tắt âm thanh' : 'Bật âm thanh'}>
        {sound ? <Volume2 /> : <VolumeX />}
      </button>
    </div>

    <div className="q-card" key={q.id}>
      <div className="q-topic">Câu {idx + 1} · {q.topic}</div>
      <p className="q-title">{q.content}</p>
      {q.type === 'MULTIPLE' && <p className="q-hint">Chọn tất cả đáp án đúng</p>}
      <div className="opt-list" role={q.type === 'MULTIPLE' ? 'group' : 'radiogroup'} aria-label="Đáp án">
        {q.options.map((o, i) => {
          const chosen = (ans ? ans.selectedIds : picked).includes(o.id);
          const isRight = ans?.correctIds.includes(o.id);
          const cls = ['opt', chosen && !ans && 'on', ans && isRight && 'right', ans && chosen && !isRight && 'wrong', ans && !chosen && !isRight && 'dim'].filter(Boolean).join(' ');
          return <label key={o.id} className={cls}>
            <input type={q.type === 'MULTIPLE' ? 'checkbox' : 'radio'} name={q.id} checked={chosen} disabled={Boolean(ans)} onChange={() => toggle(o.id)} />
            <span className="opt-key">{String.fromCharCode(65 + i)}</span>
            <span className="opt-text">{o.text}</span>
            {ans && isRight && <CheckCircle2 className="opt-icon" aria-label="Đáp án đúng" />}
            {ans && chosen && !isRight && <XCircle className="opt-icon" aria-label="Bạn chọn sai" />}
          </label>;
        })}
      </div>
    </div>

    {error && <div className="alert alert-danger" role="alert">{error}</div>}

    <div aria-live="polite">
      {ans && <div ref={fbRef} className={ans.isCorrect ? 'feedback good' : 'feedback bad'}>
        <Mascot mood={ans.isCorrect ? 'cheer' : 'oops'} size={64} />
        <div className="fb-body">
          <b>{ans.isCorrect ? RIGHT[idx % RIGHT.length] : WRONG[idx % WRONG.length]}</b>
          {gain?.id === q.id && <span className="xp-float">+{gain.xp} XP</span>}
          {ans.explanation && <p><strong>Vì sao? </strong>{ans.explanation}</p>}
          {(ans.document || ans.reference) && <p className="fb-ref">Căn cứ: {ans.document && (ans.document.url
            ? <a href={ans.document.url} target="_blank" rel="noopener noreferrer">{[ans.document.code, ans.document.title].filter(Boolean).join(' · ')}</a>
            : [ans.document.code, ans.document.title].filter(Boolean).join(' · '))}{ans.document && ans.reference && ' — '}{ans.reference}</p>}
        </div>
      </div>}
    </div>

    <div className="play-actions">
      {!ans
        ? <button ref={checkRef} className="big-btn" disabled={!picked.length || busy} onClick={check}>{busy ? 'Đang kiểm tra…' : 'Kiểm tra'}</button>
        : <button ref={nextRef} className={ans.isCorrect ? 'big-btn good' : 'big-btn bad'} onClick={next}>
          {summary || isLast ? 'Xem kết quả' : 'Câu tiếp theo'} <ArrowRight />
        </button>}
    </div>
  </div>;
}
