import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api } from './api.js';

// Kết nối realtime dùng chung cookie phiên (cùng origin; khi dev đi qua proxy của Vite).
function useRoomSocket(examId, role, handlers) {
  const [state, setState] = useState({ connected: false, error: '' });
  const h = useRef(handlers);
  h.current = handlers;
  useEffect(() => {
    const socket = io({ withCredentials: true });
    const join = () => socket.emit(role === 'monitor' ? 'room:monitor' : 'room:join', examId, res => {
      if (res?.error) setState({ connected: true, error: res.error });
      else { setState({ connected: true, error: '' }); h.current.onJoined?.(res); }
    });
    socket.on('connect', join); // tự vào lại phòng khi mạng chập chờn
    socket.on('disconnect', () => setState(s => ({ ...s, connected: false })));
    socket.on('connect_error', () => setState({ connected: false, error: 'Không kết nối được máy chủ realtime' }));
    for (const ev of ['room:started', 'room:update', 'room:count']) socket.on(ev, d => h.current[ev]?.(d));
    return () => { socket.emit('room:leave', examId); socket.close(); };
  }, [examId, role]);
  return state;
}

const useCountdown = endsAt => {
  const [left, setLeft] = useState(null);
  useEffect(() => {
    if (!endsAt) { setLeft(null); return; }
    const tick = () => setLeft(Math.max(0, new Date(endsAt) - Date.now()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [endsAt]);
  return left;
};
const fmt = ms => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

// ---------- Thí sinh: phòng chờ ----------
export function LiveLobby({ exam, onStarted, onBack }) {
  const [online, setOnline] = useState(null);
  const fired = useRef(false);
  const go = () => { if (!fired.current) { fired.current = true; onStarted(); } };
  const st = useRoomSocket(exam.id, 'candidate', {
    onJoined: r => { if (r.room.started) go(); },
    'room:started': go,
    'room:count': d => setOnline(d.online)
  });
  return <div className="card">
    <h2>Phòng chờ: {exam.title}</h2>
    {st.error ? <div className="error" role="alert">{st.error}</div>
      : <p className="muted">{st.connected ? 'Đã vào phòng. Vui lòng chờ quản trị viên bấm bắt đầu — bài thi sẽ tự mở.' : 'Đang kết nối…'}</p>}
    <p>Thời gian làm bài: <b>{exam.durationMinutes} phút</b> · {exam.questionCount} câu{online != null && <> · Đang online: <b>{online}</b></>}</p>
    <button className="link" onClick={onBack}>← Rời phòng</button>
  </div>;
}

// ---------- Quản trị: giám sát ----------
export function LiveMonitor({ exam, onBack }) {
  const [room, setRoom] = useState(null);
  const [snap, setSnap] = useState({ online: [], submitted: [] });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const st = useRoomSocket(exam.id, 'monitor', {
    onJoined: r => { setRoom(r.room); setSnap({ online: r.online, submitted: r.submitted }); },
    'room:update': setSnap
  });
  const left = useCountdown(room?.endsAt);

  async function start() {
    if (!window.confirm(`Bắt đầu phòng thi cho ${snap.online.length} người đang trong phòng chờ? Không thể hoàn tác.`)) return;
    setBusy(true); setError('');
    try { const r = await api(`/exams/${exam.id}/live/start`, { method: 'POST' }); setRoom(r.room); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const submittedIds = new Set(snap.submitted.map(u => u.id));
  const onlineIds = new Set(snap.online.map(u => u.id));
  const people = [...snap.online, ...snap.submitted.filter(u => !onlineIds.has(u.id))];

  return <div className="card">
    <h2>Giám sát phòng thi: {exam.title}</h2>
    {(st.error || error) && <div className="error" role="alert">{st.error || error}</div>}
    <p className="muted">{st.connected ? 'Đang kết nối realtime.' : 'Mất kết nối, đang thử lại…'}</p>
    {room && !room.started && <button className="submit small" disabled={busy || !st.connected} onClick={start}>Bắt đầu phòng thi</button>}
    {room?.started && <p><b>Đã bắt đầu.</b> {left != null && (left > 0 ? <>Còn lại: <b>{fmt(left)}</b></> : 'Đã hết giờ.')}</p>}
    <p>Đang online: <b>{snap.online.length}</b> · Đã nộp: <b>{snap.submitted.length}</b></p>
    <div className="table-wrap"><table>
      <thead><tr><th>Thí sinh</th><th>Kết nối</th><th>Bài thi</th></tr></thead>
      <tbody>
        {people.map(u => <tr key={u.id}>
          <td>{u.fullName}</td><td>{onlineIds.has(u.id) ? '🟢 Online' : '⚪ Offline'}</td>
          <td>{submittedIds.has(u.id) ? 'Đã nộp' : room?.started ? 'Đang làm / chưa vào' : 'Chờ bắt đầu'}</td>
        </tr>)}
        {people.length === 0 && <tr><td colSpan={3} className="muted">Chưa có ai vào phòng.</td></tr>}
      </tbody>
    </table></div>
    <button className="link" onClick={onBack}>← Quay lại</button>
  </div>;
}
