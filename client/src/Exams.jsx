import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, Minus, Plus, X } from 'lucide-react';
import { api } from './api.js';
import { Chip, EXAM_TONE, useDialog } from './ui.jsx';
import { LiveLobby, LiveMonitor } from './LiveRoom.jsx';

const STATUS_LABEL = { DRAFT: 'Nháp', PUBLISHED: 'Đang mở', CLOSED: 'Đã đóng' };

// ---------- Màn làm bài ----------
function TakeExam({ session, onFinish }) {
  const { confirm, dismiss } = useDialog();
  useEffect(() => dismiss, []);
  const [answers, setAnswers] = useState({});
  // Bù lệch đồng hồ giữa máy thí sinh và máy chủ.
  const skew = useRef(session.serverNow ? new Date(session.serverNow) - Date.now() : 0);
  const remaining = () => Math.max(0, new Date(session.endsAt) - (Date.now() + skew.current));
  const [left, setLeft] = useState(remaining);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const sent = useRef(false);
  const [focusLost, setFocusLost] = useState(0);
  // Ghi nhận khi thí sinh chuyển tab/cửa sổ (chỉ cảnh báo và báo cho quản trị, không tự trừ điểm).
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState !== 'hidden' || sent.current) return;
      setFocusLost(n => n + 1);
      api(`/exams/attempts/${session.attemptId}/focus-lost`, { method: 'POST' }).catch(() => {});
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [session.attemptId]);

  async function submit() {
    if (sent.current) return;
    sent.current = true; setBusy(true); setError('');
    try {
      const r = await api(`/exams/attempts/${session.attemptId}/submit`, { method: 'POST', body: { answers: answersRef.current } });
      onFinish(r);
    } catch (e) { sent.current = false; setError(e.message); setBusy(false); }
  }

  useEffect(() => {
    const t = setInterval(() => setLeft(remaining()), 1000);
    return () => clearInterval(t);
  }, [session.endsAt]);
  useEffect(() => { if (left === 0) submit(); }, [left]);

  function pick(q, id) {
    const cur = answers[q.id] || [];
    const next = q.type === 'MULTIPLE' ? (cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]) : [id];
    setAnswers({ ...answers, [q.id]: next });
  }
  const mm = String(Math.floor(left / 60000)).padStart(2, '0');
  const ss = String(Math.floor(left / 1000) % 60).padStart(2, '0');
  const answered = Object.values(answers).filter(a => a.length).length;

  const total = session.questions.length;
  const jump = id => document.getElementById(`q-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return <div>
    <div className="exam-bar">
      <h2>{session.exam.title}</h2>
      <span className="exam-progress">Đã trả lời {answered}/{total} câu</span>
      <span className={left < 5 * 60000 ? 'timer low' : 'timer'} role="timer" aria-label="Thời gian còn lại">{mm}:{ss}</span>
    </div>
    <div className="exam-layout">
      <div className="exam-main panel panel-body">
        {focusLost > 0 && <div className="alert alert-warning" role="alert"><AlertTriangle />Bạn đã rời khỏi màn hình làm bài {focusLost} lần. Việc này được ghi nhận và quản trị viên có thể xem.</div>}
        {session.questions.map((q, i) => <section key={q.id} id={`q-${q.id}`} className="take-q">
          <p className="q-text"><span className="q-no">Câu {i + 1}.</span>{q.content}</p>
          {q.type === 'MULTIPLE' && <p className="q-hint">Chọn một hoặc nhiều đáp án.</p>}
          <div className="option-list">
            {q.options.map(o => {
              const on = (answers[q.id] || []).includes(o.id);
              return <label key={o.id} className={on ? 'check-row option selected' : 'check-row option'}>
                <input type={q.type === 'MULTIPLE' ? 'checkbox' : 'radio'} name={q.id} checked={on} onChange={() => pick(q, o.id)} />
                <span className="grow">{o.text}</span>
              </label>;
            })}
          </div>
        </section>)}
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        <div className="actions-row">
          <button className={`btn btn-primary${busy ? ' btn-loading' : ''}`} disabled={busy} onClick={async () => {
            if (answered < total && !await confirm({ title: 'Nộp bài', message: `Bạn mới trả lời ${answered}/${total} câu. Các câu chưa trả lời sẽ tính là sai. Vẫn nộp bài?`, confirmLabel: 'Nộp bài' })) return;
            submit();
          }}>Nộp bài</button>
          <span className="muted">Bài sẽ tự nộp khi hết giờ.</span>
        </div>
      </div>
      <aside className="q-nav panel" aria-label="Danh sách câu hỏi">
        <span className="section-title">Danh sách câu</span>
        <div className="q-nav-grid">
          {session.questions.map((q, i) => <a key={q.id} href={`#q-${q.id}`} className={(answers[q.id] || []).length ? 'done' : ''}
            onClick={e => { e.preventDefault(); jump(q.id); }} aria-label={`Câu ${i + 1}${(answers[q.id] || []).length ? ', đã trả lời' : ''}`}>{i + 1}</a>)}
        </div>
        <span className="muted">Ô đặc là câu đã trả lời.</span>
      </aside>
    </div>
  </div>;
}

// ---------- Kết quả chi tiết ----------
function Review({ data, onBack }) {
  const { attempt: a, exam, items } = data;
  return <div className="stack">
    <div className="panel panel-body">
      <button className="btn btn-ghost btn-sm" style={{ justifySelf: 'start' }} onClick={onBack}><ArrowLeft />Quay lại danh sách</button>
      <h2>{exam.title}</h2>
      <div className="score">
        <b>{a.percent}%</b>
        <span className={a.passed ? 'chip chip-success' : 'chip chip-danger'}>{a.passed ? 'Đạt' : 'Chưa đạt'}</span>
        {a.late && <span className="chip chip-warning">Nộp trễ</span>}
        <span className="muted">{a.correct}/{a.total} câu đúng · yêu cầu {exam.passPercent}%</span>
      </div>
    </div>
    <div className="panel panel-body">
      {items.map((q, i) => <section key={q.id} className="take-q">
        <p className="q-text"><span className="q-no">Câu {i + 1}.</span>{q.content} <span className={q.isCorrect ? 'chip chip-success' : 'chip chip-danger'}>{q.isCorrect ? 'Đúng' : 'Sai'}</span></p>
        <div className="option-list">
          {q.options.map(o => {
            const picked = q.selectedIds.includes(o.id);
            const cls = o.isCorrect ? 'correct' : picked ? 'wrong' : 'plain';
            return <div key={o.id} className={`review-opt ${cls}`}>
              {o.isCorrect ? <Check /> : picked ? <X /> : <Minus />}
              <span>{o.text}{picked && <em> (bạn chọn)</em>}{o.isCorrect && !picked && <em> (đáp án đúng)</em>}</span>
            </div>;
          })}
        </div>
        {q.explanation && <p className="note"><b>Giải thích:</b> {q.explanation}</p>}
        {(q.document || q.reference) && <p className="note"><b>Căn cứ:</b> {q.document && (q.document.url
          ? <a href={q.document.url} target="_blank" rel="noopener noreferrer">{[q.document.code, q.document.title].filter(Boolean).join(' · ')}</a>
          : [q.document.code, q.document.title].filter(Boolean).join(' · '))}{q.document && q.reference && ' — '}{q.reference}</p>}
      </section>)}
    </div>
  </div>;
}

// ---------- Nhân viên ----------
export function MyExams() {
  const [exams, setExams] = useState([]);
  const [view, setView] = useState(null);
  const [error, setError] = useState('');
  const load = () => api('/exams').then(d => setExams(d.exams)).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);

  async function open(e, retake = false) {
    setError('');
    try {
      const s = await api(`/exams/${e.id}/start`, { method: 'POST', body: retake ? { retake: true } : {} });
      if (s.done) setView({ review: await api(`/exams/attempts/${s.attemptId}/review`) });
      else setView({ take: s });
    } catch (err) { setError(err.message); }
  }
  const back = () => { setView(null); load(); };

  if (view?.lobby) return <LiveLobby exam={view.lobby} onBack={back} onStarted={() => open(view.lobby)} />;
  if (view?.take) return <TakeExam session={view.take} onFinish={r => setView({ review: r })} />;
  if (view?.review) return <Review data={view.review} onBack={back} />;
  return <div className="panel panel-body">
    {error && <div className="alert alert-danger" role="alert">{error}</div>}
    <div className="table-wrap"><table>
      <thead><tr><th>Đề thi</th><th className="num">Số câu</th><th className="num">Thời gian</th><th>Kết quả</th><th></th></tr></thead>
      <tbody>
        {exams.map(e => <tr key={e.id}>
          <td>{e.title}{e.live && <> <Chip tone="info">Trực tiếp</Chip></>}</td><td className="num">{e.questionCount}</td><td className="num">{e.durationMinutes} phút</td>
          <td>{e.attempt?.submitted ? <><b className="num">{e.attempt.percent ?? 0}%</b> <Chip tone={e.attempt.passed ? 'success' : 'danger'}>{e.attempt.passed ? 'Đạt' : 'Chưa đạt'}</Chip>{e.attemptCount > 1 && <span className="sub">cao nhất trong {e.attemptCount} lần</span>}</> : e.attempt ? <Chip tone="warning">Đang làm dở</Chip> : <span className="muted">Chưa làm</span>}</td>
          <td className="actions">
            {e.attempt?.submitted ? <>
              <button className="btn btn-secondary btn-sm" onClick={() => open(e)}>Xem kết quả</button>
              {e.canRetake && <button className="btn btn-secondary btn-sm" onClick={() => open(e, true)}>Thi lại</button>}
            </>
              : e.status === 'PUBLISHED' && (e.live && !e.attempt && !e.liveStartedAt
                ? <button className="btn btn-primary btn-sm" onClick={() => setView({ lobby: e })}>Vào phòng chờ</button>
                : <button className="btn btn-primary btn-sm" onClick={() => open(e)}>{e.attempt ? 'Làm tiếp' : e.live ? 'Vào thi ngay' : 'Bắt đầu'}</button>)}
          </td>
        </tr>)}
        {exams.length === 0 && <tr><td colSpan={5} className="empty">Chưa có đề thi nào.</td></tr>}
      </tbody>
    </table></div>
  </div>;
}

// ---------- Quản trị ----------
function ExamForm({ onSaved, onCancel }) {
  const [questions, setQuestions] = useState([]);
  const [f, setF] = useState({ title: '', description: '', durationMinutes: 30, passPercent: 70 });
  const [picked, setPicked] = useState(new Set());
  const [groups, setGroups] = useState([]);
  const [assignAll, setAssignAll] = useState(true);
  const [live, setLive] = useState(false);
  const [groupIds, setGroupIds] = useState(new Set());
  const [error, setError] = useState('');
  const [kw, setKw] = useState('');
  const [topic, setTopic] = useState('');
  const [topics, setTopics] = useState([]);
  useEffect(() => { api('/groups').then(d => setGroups(d.groups)).catch(() => {}); }, []);
  useEffect(() => { api('/questions?status=ACTIVE').then(d => { setQuestions(d.questions); setTopics([...new Set(d.questions.map(q => q.topic))].sort()); }).catch(e => setError(e.message)); }, []);

  const norm = t => (t || '').toLowerCase();
  const shown = questions.filter(q => (!topic || q.topic === topic)
    && (!kw.trim() || kw.toLowerCase().split(/\s+/).filter(Boolean).every(w => norm(`${q.topic} ${q.content} ${q.reference || ''}`).includes(w))));
  const allShownPicked = shown.length > 0 && shown.every(q => picked.has(q.id));
  const toggleShown = () => { const s = new Set(picked); shown.forEach(q => allShownPicked ? s.delete(q.id) : s.add(q.id)); setPicked(s); };
  const toggle = id => { const s = new Set(picked); s.has(id) ? s.delete(id) : s.add(id); setPicked(s); };
  async function submit(event) {
    event.preventDefault(); setError('');
    try {
      await api('/exams', { method: 'POST', body: { ...f, durationMinutes: Number(f.durationMinutes), passPercent: Number(f.passPercent), questionIds: [...picked], assignAll, live, groupIds: [...groupIds] } });
      onSaved();
    } catch (e) { setError(e.message); }
  }
  const set = k => e => setF({ ...f, [k]: e.target.value });
  return <form className="form-panel" onSubmit={submit}>
    <h3>Tạo đề thi</h3>
    <p className="section-title">Thông tin đề thi</p>
    <label className="field">Tên đề thi
      <input value={f.title} onChange={set('title')} required />
    </label>
    <label className="field">Mô tả <small>Không bắt buộc.</small>
      <input value={f.description} onChange={set('description')} />
    </label>
    <div className="form-grid cols-2">
      <label className="field">Thời gian làm bài (phút)<input type="number" min="1" max="240" value={f.durationMinutes} onChange={set('durationMinutes')} /></label>
      <label className="field">Điểm đạt (%)<input type="number" min="1" max="100" value={f.passPercent} onChange={set('passPercent')} /></label>
    </div>
    <p className="section-title">Hình thức và đối tượng</p>
    <label className="check-row"><input type="checkbox" checked={live} onChange={e => setLive(e.target.checked)} /> Phòng thi trực tiếp (quản trị bấm bắt đầu, mọi người vào thi cùng lúc)</label>
    <div>
      <label className="check-row"><input type="checkbox" checked={assignAll} onChange={e => setAssignAll(e.target.checked)} /> Giao cho tất cả nhân viên</label>
      {!assignAll && <div className="pick-list">
        {groups.map(g => <label key={g.id} className="check-row"><input type="checkbox" checked={groupIds.has(g.id)}
          onChange={() => { const s = new Set(groupIds); s.has(g.id) ? s.delete(g.id) : s.add(g.id); setGroupIds(s); }} /> {g.name} ({g.members.length} người)</label>)}
        {groups.length === 0 && <span className="muted">Chưa có nhóm nào. Hãy tạo nhóm ở mục "Quản lý nhóm".</span>}
      </div>}
    </div>
    <p className="section-title">Câu hỏi <span className="muted">— đã chọn {picked.size}, chỉ hiện câu "Đang dùng"</span></p>
    <div className="form-grid cols-3">
      <input aria-label="Lọc câu hỏi" placeholder="Lọc theo từ khoá (tên chủ đề, nội dung...)" value={kw} onChange={e => setKw(e.target.value)} />
      <select aria-label="Chủ đề" value={topic} onChange={e => setTopic(e.target.value)}>
        <option value="">Tất cả chủ đề</option>
        {topics.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
      <button type="button" className="btn btn-link" onClick={toggleShown} disabled={shown.length === 0}>
        {allShownPicked ? 'Bỏ chọn' : 'Chọn'} tất cả {shown.length} câu đang hiện
      </button>
    </div>
    <div className="pick-list">
      {shown.map(q => <label key={q.id} className="check-row"><input type="checkbox" checked={picked.has(q.id)} onChange={() => toggle(q.id)} /> [{q.topic}] {q.content}</label>)}
      {questions.length > 0 && shown.length === 0 && <span className="muted">Không có câu hỏi khớp bộ lọc.</span>}
      {questions.length === 0 && <span className="muted">Chưa có câu hỏi "Đang dùng". Hãy đặt trạng thái câu hỏi thành Đang dùng trước.</span>}
    </div>
    {error && <div className="alert alert-danger" role="alert">{error}</div>}
    <div className="actions-row"><button className="btn btn-primary" type="submit">Tạo đề (nháp)</button><button type="button" className="btn btn-link" onClick={onCancel}>Huỷ</button></div>
  </form>;
}

export function ExamAdmin() {
  const { toast } = useDialog();
  const [exams, setExams] = useState([]);
  const [creating, setCreating] = useState(false);
  const [results, setResults] = useState(null);
  const [room, setRoom] = useState(null);
  const [error, setError] = useState('');
  const load = () => api('/exams/manage').then(d => setExams(d.exams)).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);

  async function setStatus(id, status) {
    setError('');
    try { await api(`/exams/${id}/status`, { method: 'PATCH', body: { status } }); await load(); toast(status === 'PUBLISHED' ? 'Đã mở đề thi.' : 'Đã đóng đề thi.'); } catch (e) { setError(e.message); }
  }
  async function showResults(e) {
    try { setResults({ exam: e, rows: (await api(`/exams/${e.id}/results`)).results }); } catch (err) { setError(err.message); }
  }

  if (room) return <LiveMonitor exam={room} onBack={() => { setRoom(null); load(); }} />;
  return <div className="panel panel-body">
    <h2>Quản lý đề thi</h2>
    {creating ? <ExamForm onSaved={() => { setCreating(false); load(); }} onCancel={() => setCreating(false)} />
      : <button className="btn btn-primary" style={{ justifySelf: 'start' }} onClick={() => setCreating(true)}><Plus />Tạo đề thi</button>}
    {error && <div className="alert alert-danger" role="alert">{error}</div>}
    <div className="table-wrap"><table>
      <thead><tr><th>Đề thi</th><th className="num">Câu</th><th className="num">Phút</th><th>Trạng thái</th><th className="num">Lượt làm</th><th>Giao cho</th><th></th></tr></thead>
      <tbody>
        {exams.map(e => <tr key={e.id}>
          <td>{e.title}{e.live && <> <Chip tone="info">Trực tiếp</Chip></>}</td><td className="num">{e._count.questions}</td><td className="num">{e.durationMinutes}</td><td><Chip tone={EXAM_TONE[e.status]}>{STATUS_LABEL[e.status]}</Chip></td><td className="num">{e._count.attempts}</td>
          <td>{e.assignAll ? 'Tất cả' : e.groups.map(g => g.group.name).join(', ') || '—'}</td>
          <td className="actions">
            {e.status === 'DRAFT' && <button className="btn btn-link" onClick={() => setStatus(e.id, 'PUBLISHED')}>Mở thi</button>}
            {e.status === 'PUBLISHED' && <button className="btn btn-link" onClick={() => setStatus(e.id, 'CLOSED')}>Đóng</button>}
            {e.status === 'CLOSED' && <button className="btn btn-link" onClick={() => setStatus(e.id, 'PUBLISHED')}>Mở lại</button>}
            {e.live && e.status === 'PUBLISHED' && <button className="btn btn-link" onClick={() => setRoom(e)}>Vào phòng</button>}
            <button className="btn btn-link" onClick={() => showResults(e)}>Kết quả</button>
          </td>
        </tr>)}
        {exams.length === 0 && <tr><td colSpan={7} className="empty">Chưa có đề thi nào.</td></tr>}
      </tbody>
    </table></div>
    {results && <>
      <h3>Kết quả: {results.exam.title} <a className="btn btn-link" href={`/api/exams/${results.exam.id}/results.csv`}>Tải CSV</a> <button className="btn btn-link" onClick={() => setResults(null)}>Ẩn</button></h3>
      <div className="table-wrap"><table>
        <thead><tr><th>Nhân viên</th><th className="num">Số lần thi</th><th>Điểm cao nhất</th><th>Kết quả</th><th>Trạng thái</th><th className="num">Rời tab</th></tr></thead>
        <tbody>{results.rows.map(r => <tr key={r.id}>
          <td>{r.fullName} <span className="sub">{r.username}</span></td><td className="num">{r.attemptCount}</td>
          <td>{r.submittedAt ? `${r.correct}/${r.total} (${r.percent}%)` : '—'}</td>
          <td>{r.submittedAt ? <Chip tone={r.passed ? 'success' : 'danger'}>{r.passed ? 'Đạt' : 'Chưa đạt'}</Chip> : '—'}</td>
          <td>{r.submittedAt ? (r.late ? <Chip tone="warning">Nộp trễ</Chip> : <Chip tone="neutral">Đã nộp</Chip>) : <Chip tone="info">Đang làm</Chip>}</td>
          <td className="num">{r.focusLosses || ''}</td>
        </tr>)}
        {results.rows.length === 0 && <tr><td colSpan={6} className="empty">Chưa có ai làm bài.</td></tr>}</tbody>
      </table></div>
    </>}
  </div>;
}
