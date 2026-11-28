import { useEffect } from 'react';
import { Award, Flame, Sparkles, TrendingUp, Zap } from 'lucide-react';
import Mascot from './Mascot.jsx';
import { beep, celebrate } from './fx.js';

function headline(s) {
  const pct = s.total ? s.correct / s.total : 0;
  if (s.perfect) return 'Tuyệt đối! Đúng hết rồi!';
  if (pct >= 0.8) return 'Xuất sắc!';
  if (pct >= 0.5) return 'Khá tốt, mai làm tốt hơn nhé!';
  return 'Cố lên, mỗi ngày một chút là tiến bộ!';
}

// quiz: dữ liệu phiên (câu hỏi + câu trả lời); celebrateNow: chỉ bắn pháo ngay sau khi vừa làm xong.
export default function Result({ summary, quiz, celebrateNow, onBack }) {
  useEffect(() => {
    if (celebrateNow && summary.correct > 0) { celebrate(summary.perfect); beep('win'); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const wrong = quiz ? quiz.questions.filter(q => quiz.answers[q.id] && !quiz.answers[q.id].isCorrect) : [];
  const mood = summary.perfect || summary.correct / (summary.total || 1) >= 0.5 ? 'cheer' : 'oops';

  return <div className="daily daily-result">
    <div className="result-hero">
      <Mascot mood={mood} size={110} />
      <div>
        <h2>{headline(summary)}</h2>
        <p className="muted">Bạn trả lời đúng {summary.correct}/{summary.total} câu hôm nay.</p>
      </div>
    </div>

    <div className="stat-row">
      <div className="stat"><span className="stat-ico sun"><Zap /></span><b>+{summary.xpEarned}</b><small>XP hôm nay{summary.bonusXp ? ` (thưởng hoàn thành +${summary.bonusXp})` : ''}</small></div>
      <div className="stat"><span className="stat-ico ok"><TrendingUp /></span><b>{summary.correct}/{summary.total}</b><small>câu đúng</small></div>
      <div className="stat"><span className="stat-ico flame"><Flame /></span><b>{summary.bestCombo}</b><small>combo cao nhất</small></div>
      {summary.streak && <div className="stat"><span className="stat-ico flame"><Flame /></span><b>{summary.streak.current}</b><small>ngày liên tiếp</small></div>}
    </div>

    {summary.levelUp && <div className="banner level-up"><Sparkles /> Lên cấp {summary.level.level}! Chúc mừng bạn.</div>}
    {summary.newBadges?.length > 0 && <div className="banner new-badges">
      <Award /> Huy hiệu mới: {summary.newBadges.map(b => <span className="badge-chip" key={b.code}>{b.label}</span>)}
    </div>}

    {quiz && <div className="review">
      <h3>{wrong.length ? `Câu cần xem lại (${wrong.length})` : 'Bạn không sai câu nào'}</h3>
      {wrong.map(q => {
        const a = quiz.answers[q.id];
        const text = id => q.options.find(o => o.id === id)?.text;
        return <div className="review-item" key={q.id}>
          <p className="q-title">{q.content}</p>
          <p className="r-bad">Bạn chọn: {a.selectedIds.map(text).join('; ') || '—'}</p>
          <p className="r-good">Đáp án đúng: {a.correctIds.map(text).join('; ')}</p>
          {a.explanation && <p className="r-why"><strong>Vì sao? </strong>{a.explanation}</p>}
        </div>;
      })}
    </div>}

    <button className="big-btn" onClick={onBack}>Về trang Hôm nay</button>
  </div>;
}
