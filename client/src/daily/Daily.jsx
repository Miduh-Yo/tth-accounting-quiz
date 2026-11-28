import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, CalendarCheck, Flame, Zap } from 'lucide-react';
import { api } from '../api.js';
import Mascot from './Mascot.jsx';
import Play from './Play.jsx';
import Result from './Result.jsx';
import { Badges, Calendar, Leaderboard, WeekStrip } from './Boards.jsx';

const firstName = u => (u.fullName || u.username).trim().split(/\s+/).pop();

function Home({ user, today, busy, onStart }) {
  const { session, progress, deck } = today;
  const finished = session?.finished;
  const inProgress = session && !finished;
  const label = !deck ? 'Chưa có đề hôm nay'
    : finished ? 'Xem lại kết quả hôm nay'
      : inProgress ? `Tiếp tục (${session.answeredCount}/${session.total})`
        : `Bắt đầu 10 phút · ${deck.questionCount} câu`;
  const hello = finished ? 'Hôm nay bạn đã xong rồi, giỏi lắm!' : inProgress ? 'Bạn đang làm dở, tiếp tục nhé!'
    : progress.streak > 0 ? `Giữ chuỗi ${progress.streak} ngày nào!` : 'Mỗi ngày 10 phút, kiến thức kế toán vững hơn.';
  const pct = Math.min(100, Math.round((progress.into / progress.need) * 100));

  return <div className="daily">
    <section className="hero-card">
      <Mascot mood={finished ? 'cheer' : 'happy'} size={112} />
      <div className="hero-body">
        <h2>Chào {firstName(user)}!</h2>
        <p>{hello}</p>
        {!today.isWorkday && <p className="hero-note">Hôm nay là ngày nghỉ, luyện thêm không bắt buộc nhưng vẫn được cộng XP.</p>}
        {!deck && <div className="alert alert-warning" role="alert"><AlertCircle />Chưa có câu hỏi "Đang dùng" để tạo đề. Hãy báo quản trị viên.</div>}
        <button className="big-btn" disabled={!deck || busy} onClick={onStart}>{busy ? 'Đang tải…' : label} {deck && <ArrowRight />}</button>
      </div>
    </section>

    <div className="stat-row">
      <div className="stat"><span className="stat-ico flame"><Flame /></span><b>{progress.streak}</b><small>ngày liên tiếp{progress.longestStreak > progress.streak ? ` · kỷ lục ${progress.longestStreak}` : ''}</small></div>
      <div className="stat"><span className="stat-ico sun"><Zap /></span><b>{progress.xp}</b><small>tổng XP</small></div>
      <div className="stat level"><span className="stat-ico ok"><CalendarCheck /></span><b>Cấp {progress.level}</b>
        <div className="level-bar" role="progressbar" aria-valuemin={0} aria-valuemax={progress.need} aria-valuenow={progress.into} aria-label="Tiến độ lên cấp"><span style={{ width: `${pct}%` }} /></div>
        <small>{progress.into}/{progress.need} XP để lên cấp {progress.level + 1}</small></div>
    </div>

    <section className="panel daily-panel">
      <div className="panel-head"><div><h2>Tuần này</h2><p>Ngày làm việc chưa luyện sẽ hiện dấu ✗. Cuối tuần và ngày lễ không bắt buộc.</p></div></div>
      <div className="panel-body"><WeekStrip week={today.week} /></div>
    </section>

    <div className="two-col">
      {today.leaderboardEnabled && <Leaderboard />}
      <Badges badges={today.badges} />
    </div>
    <Calendar />
  </div>;
}

export default function Daily({ user }) {
  const [today, setToday] = useState(null);
  const [view, setView] = useState({ name: 'home' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api('/daily/today').then(setToday).catch(e => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { window.scrollTo(0, 0); }, [view.name]);

  const enter = d => d.finished
    ? setView({ name: 'result', summary: d.summary, quiz: { questions: d.questions, answers: d.answers }, fresh: false })
    : setView({ name: 'play', data: d, nonce: Date.now() }); // nonce: tải lại phiên thì dựng lại màn chơi từ dữ liệu mới

  async function start() {
    setBusy(true); setError('');
    try { enter(await api('/daily/start', { method: 'POST' })); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const reload = () => api('/daily/start', { method: 'POST' }).then(enter).catch(e => setError(e.message));
  const home = () => { setView({ name: 'home' }); load(); };

  if (view.name === 'play') return <Play key={view.nonce} data={view.data} onExit={home} onReload={reload}
    onFinished={(summary, quiz) => { setView({ name: 'result', summary, quiz, fresh: true }); load(); }} />;
  if (view.name === 'result') return <Result summary={view.summary} quiz={view.quiz} celebrateNow={view.fresh} onBack={home} />;
  if (error && !today) return <div className="alert alert-danger" role="alert"><AlertCircle />{error}</div>;
  if (!today) return <p className="muted">Đang tải…</p>;
  return <>
    {error && <div className="alert alert-danger" role="alert" style={{ marginBottom: 16 }}><AlertCircle />{error}</div>}
    <Home user={user} today={today} busy={busy} onStart={start} />
  </>;
}
