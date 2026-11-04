import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { LiveLobby, LiveMonitor } from './LiveRoom.jsx';

const STATUS_LABEL = { DRAFT: 'Nháp', PUBLISHED: 'Đang mở', CLOSED: 'Đã đóng' };

// ---------- Màn làm bài ----------
function TakeExam({ session, onFinish }) {
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

  return <div className="card">
    <div className="q-actions"><h2 style={{ flex: 1 }}>{session.exam.title}</h2><b>⏱ {mm}:{ss}</b></div>
    {focusLost > 0 && <div className="error" role="alert">Bạn đã rời khỏi màn hình làm bài {focusLost} lần. Việc này được ghi nhận và quản trị viên có thể xem.</div>}
    {session.questions.map((q, i) => <div key={q.id} className="take-q">
      <p><b>Câu {i + 1}.</b> {q.content} {q.type === 'MULTIPLE' && <em className="muted">(chọn nhiều đáp án)</em>}</p>
      {q.options.map(o => <label key={o.id} className="q-opt">
        <input type={q.type === 'MULTIPLE' ? 'checkbox' : 'radio'} name={q.id}
          checked={(answers[q.id] || []).includes(o.id)} onChange={() => pick(q, o.id)} /> {o.text}
      </label>)}
    </div>)}
    {error && <div className="error" role="alert">{error}</div>}
    <button className="submit small" disabled={busy} onClick={() => {
      if (answered < session.questions.length && !window.confirm(`Bạn mới trả lời ${answered}/${session.questions.length} câu. Vẫn nộp bài?`)) return;
      submit();
    }}>Nộp bài</button>
  </div>;
}

// ---------- Kết quả chi tiết ----------
function Review({ data, onBack }) {
  const { attempt: a, exam, items } = data;
  return <div className="card">
    <h2>{exam.title}</h2>
    <p><b>{a.correct}/{a.total} câu đúng ({a.percent}%)</b> — {a.passed ? 'ĐẠT' : 'CHƯA ĐẠT'} (yêu cầu {exam.passPercent}%){a.late && ' · nộp trễ'}</p>
    {items.map((q, i) => <div key={q.id} className="take-q">
      <p><b>Câu {i + 1}.</b> {q.content} {q.isCorrect ? '✅' : '❌'}</p>
      {q.options.map(o => <div key={o.id} className="q-opt" style={{ color: o.isCorrect ? '#0a7a3d' : q.selectedIds.includes(o.id) ? '#b42318' : undefined }}>
        {o.isCorrect ? '✔' : q.selectedIds.includes(o.id) ? '✘' : '•'} {o.text}{q.selectedIds.includes(o.id) && ' (bạn chọn)'}
      </div>)}
      {q.explanation && <p className="muted">Giải thích: {q.explanation}</p>}
      {(q.document || q.reference) && <p className="muted">Căn cứ: {q.document && (q.document.url
        ? <a href={q.document.url} target="_blank" rel="noopener noreferrer">{[q.document.code, q.document.title].filter(Boolean).join(' · ')}</a>
        : [q.document.code, q.document.title].filter(Boolean).join(' · '))}{q.document && q.reference && ' — '}{q.reference}</p>}
    </div>)}
    <button className="link" onClick={onBack}>← Quay lại</button>
  </div>;
}

// ---------- Nhân viên ----------
export function MyExams() {
  const [exams, setExams] = useState([]);
  const [view, setView] = useState(null);
  const [error, setError] = useState('');
  const load = () => api('/exams').then(d => setExams(d.exams)).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);

  async function open(e) {
    setError('');
    try {
      const s = await api(`/exams/${e.id}/start`, { method: 'POST' });
      if (s.done) setView({ review: await api(`/exams/attempts/${s.attemptId}/review`) });
      else setView({ take: s });
    } catch (err) { setError(err.message); }
  }
  const back = () => { setView(null); load(); };

  if (view?.lobby) return <LiveLobby exam={view.lobby} onBack={back} onStarted={() => open(view.lobby)} />;
  if (view?.take) return <TakeExam session={view.take} onFinish={r => setView({ review: r })} />;
  if (view?.review) return <Review data={view.review} onBack={back} />;
  return <div className="card">
    <h2>Bài thi của tôi</h2>
    {error && <div className="error" role="alert">{error}</div>}
    <div className="table-wrap"><table>
      <thead><tr><th>Đề thi</th><th>Số câu</th><th>Thời gian</th><th>Kết quả</th><th></th></tr></thead>
      <tbody>
        {exams.map(e => <tr key={e.id}>
          <td>{e.title}{e.live && ' 🔴 Trực tiếp'}</td><td>{e.questionCount}</td><td>{e.durationMinutes} phút</td>
          <td>{e.attempt?.submitted ? `${e.attempt.percent ?? 0}% · ${e.attempt.passed ? 'Đạt' : 'Chưa đạt'}` : e.attempt ? 'Đang làm dở' : '—'}</td>
          <td className="actions">
            {e.attempt?.submitted ? <button className="link" onClick={() => open(e)}>Xem kết quả</button>
              : e.status === 'PUBLISHED' && (e.live && !e.attempt && !e.liveStartedAt
                ? <button className="link" onClick={() => setView({ lobby: e })}>Vào phòng chờ</button>
                : <button className="link" onClick={() => open(e)}>{e.attempt ? 'Làm tiếp' : e.live ? 'Vào thi ngay' : 'Bắt đầu'}</button>)}
          </td>
        </tr>)}
        {exams.length === 0 && <tr><td colSpan={5} className="muted">Chưa có đề thi nào.</td></tr>}
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
  useEffect(() => { api('/groups').then(d => setGroups(d.groups)).catch(() => {}); }, []);
  useEffect(() => { api('/questions?status=ACTIVE').then(d => setQuestions(d.questions)).catch(e => setError(e.message)); }, []);

  const toggle = id => { const s = new Set(picked); s.has(id) ? s.delete(id) : s.add(id); setPicked(s); };
  async function submit(event) {
    event.preventDefault(); setError('');
    try {
      await api('/exams', { method: 'POST', body: { ...f, durationMinutes: Number(f.durationMinutes), passPercent: Number(f.passPercent), questionIds: [...picked], assignAll, live, groupIds: [...groupIds] } });
      onSaved();
    } catch (e) { setError(e.message); }
  }
  const set = k => e => setF({ ...f, [k]: e.target.value });
  return <form className="q-form" onSubmit={submit}>
    <h3>Tạo đề thi</h3>
    <input placeholder="Tên đề thi" value={f.title} onChange={set('title')} required />
    <input placeholder="Mô tả (không bắt buộc)" value={f.description} onChange={set('description')} />
    <div className="q-row">
      <label>Thời gian (phút)<input type="number" min="1" max="240" value={f.durationMinutes} onChange={set('durationMinutes')} /></label>
      <label>Điểm đạt (%)<input type="number" min="1" max="100" value={f.passPercent} onChange={set('passPercent')} /></label>
    </div>
    <label className="q-opt"><input type="checkbox" checked={live} onChange={e => setLive(e.target.checked)} /> Phòng thi trực tiếp (quản trị bấm bắt đầu, mọi người vào thi cùng lúc)</label>
    <div>
      <label className="q-opt"><input type="checkbox" checked={assignAll} onChange={e => setAssignAll(e.target.checked)} /> Giao cho tất cả nhân viên</label>
      {!assignAll && <div className="pick-list">
        {groups.map(g => <label key={g.id} className="q-opt"><input type="checkbox" checked={groupIds.has(g.id)}
          onChange={() => { const s = new Set(groupIds); s.has(g.id) ? s.delete(g.id) : s.add(g.id); setGroupIds(s); }} /> {g.name} ({g.members.length} người)</label>)}
        {groups.length === 0 && <span className="muted">Chưa có nhóm nào. Hãy tạo nhóm ở mục "Quản lý nhóm".</span>}
      </div>}
    </div>
    <p className="muted">Chọn câu hỏi ({picked.size} đã chọn) — chỉ hiện câu "Đang dùng":</p>
    <div className="pick-list">
      {questions.map(q => <label key={q.id} className="q-opt"><input type="checkbox" checked={picked.has(q.id)} onChange={() => toggle(q.id)} /> [{q.topic}] {q.content}</label>)}
      {questions.length === 0 && <span className="muted">Chưa có câu hỏi "Đang dùng". Hãy đặt trạng thái câu hỏi thành Đang dùng trước.</span>}
    </div>
    {error && <div className="error" role="alert">{error}</div>}
    <div className="q-actions"><button className="submit small" type="submit">Tạo đề (nháp)</button><button type="button" className="link" onClick={onCancel}>Huỷ</button></div>
  </form>;
}

export function ExamAdmin() {
  const [exams, setExams] = useState([]);
  const [creating, setCreating] = useState(false);
  const [results, setResults] = useState(null);
  const [room, setRoom] = useState(null);
  const [error, setError] = useState('');
  const load = () => api('/exams/manage').then(d => setExams(d.exams)).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);

  async function setStatus(id, status) {
    setError('');
    try { await api(`/exams/${id}/status`, { method: 'PATCH', body: { status } }); await load(); } catch (e) { setError(e.message); }
  }
  async function showResults(e) {
    try { setResults({ exam: e, rows: (await api(`/exams/${e.id}/results`)).results }); } catch (err) { setError(err.message); }
  }

  if (room) return <LiveMonitor exam={room} onBack={() => { setRoom(null); load(); }} />;
  return <div className="card">
    <h2>Quản lý đề thi</h2>
    {creating ? <ExamForm onSaved={() => { setCreating(false); load(); }} onCancel={() => setCreating(false)} />
      : <button className="submit small" onClick={() => setCreating(true)}>+ Tạo đề thi</button>}
    {error && <div className="error" role="alert">{error}</div>}
    <div className="table-wrap"><table>
      <thead><tr><th>Đề thi</th><th>Câu</th><th>Phút</th><th>Trạng thái</th><th>Lượt làm</th><th>Giao cho</th><th></th></tr></thead>
      <tbody>
        {exams.map(e => <tr key={e.id}>
          <td>{e.title}{e.live && ' 🔴'}</td><td>{e._count.questions}</td><td>{e.durationMinutes}</td><td>{STATUS_LABEL[e.status]}</td><td>{e._count.attempts}</td>
          <td>{e.assignAll ? 'Tất cả' : e.groups.map(g => g.group.name).join(', ') || '—'}</td>
          <td className="actions">
            {e.status === 'DRAFT' && <button className="link" onClick={() => setStatus(e.id, 'PUBLISHED')}>Mở thi</button>}
            {e.status === 'PUBLISHED' && <button className="link" onClick={() => setStatus(e.id, 'CLOSED')}>Đóng</button>}
            {e.status === 'CLOSED' && <button className="link" onClick={() => setStatus(e.id, 'PUBLISHED')}>Mở lại</button>}
            {e.live && e.status === 'PUBLISHED' && <button className="link" onClick={() => setRoom(e)}>Vào phòng</button>}
            <button className="link" onClick={() => showResults(e)}>Kết quả</button>
          </td>
        </tr>)}
        {exams.length === 0 && <tr><td colSpan={7} className="muted">Chưa có đề thi nào.</td></tr>}
      </tbody>
    </table></div>
    {results && <>
      <h3>Kết quả: {results.exam.title} <a className="link" href={`/api/exams/${results.exam.id}/results.csv`}>Tải CSV</a> <button className="link" onClick={() => setResults(null)}>Ẩn</button></h3>
      <div className="table-wrap"><table>
        <thead><tr><th>Nhân viên</th><th>Điểm</th><th>Kết quả</th><th>Trạng thái</th><th>Rời tab</th></tr></thead>
        <tbody>{results.rows.map(r => <tr key={r.id}>
          <td>{r.fullName} ({r.username})</td>
          <td>{r.submittedAt ? `${r.correct}/${r.total} (${r.percent}%)` : '—'}</td>
          <td>{r.submittedAt ? (r.passed ? 'Đạt' : 'Chưa đạt') : '—'}</td>
          <td>{r.submittedAt ? (r.late ? 'Nộp trễ' : 'Đã nộp') : 'Đang làm'}</td>
          <td>{r.focusLosses || ''}</td>
        </tr>)}
        {results.rows.length === 0 && <tr><td colSpan={5} className="muted">Chưa có ai làm bài.</td></tr>}</tbody>
      </table></div>
    </>}
  </div>;
}
