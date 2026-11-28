import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Download, Plus } from 'lucide-react';
import { api } from '../api.js';
import { Chip, useDialog } from '../ui.jsx';
import { DayMark } from './Boards.jsx';

const todayStr = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10); // giờ Việt Nam
const thisMonth = () => todayStr().slice(0, 7);
const shiftMonth = (m, n) => { const d = new Date(Number(m.slice(0, 4)), Number(m.slice(5)) - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const dow = date => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = Thứ 2
const fmtDate = d => `${d.slice(8)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

// ---------- Tổng quan ----------
function Overview() {
  const [st, setSt] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('/daily/stats').then(setSt).catch(e => setError(e.message)); }, []);
  if (error) return <div className="alert alert-danger" role="alert">{error}</div>;
  if (!st) return <p className="muted">Đang tải…</p>;
  const pct = st.employeeCount ? Math.round((st.playedToday / st.employeeCount) * 100) : 0;
  return <div className="stack">
    <div className="admin-cards">
      <div className="panel panel-body"><span className="muted">Hôm nay đã luyện</span><b className="big-num">{st.playedToday}/{st.employeeCount}</b>
        <div className="meter" role="img" aria-label={`${pct}%`}><span className={pct >= 70 ? 'ok' : pct >= 40 ? 'mid' : 'bad'} style={{ width: `${pct}%` }} /></div>
        <span className="muted">{pct}% nhân viên đang hoạt động · {fmtDate(st.date)}</span></div>
      <div className="panel panel-body"><span className="muted">Kho câu hỏi</span><b className="big-num">{st.poolCount} câu</b>
        <span className="muted">{st.freshCount} câu chưa dùng trong {st.repeatGapDays} ngày qua · {st.perDeck} câu mỗi đề</span></div>
      <div className="panel panel-body"><span className="muted">Kho còn đủ cho</span><b className="big-num">{st.daysLeft} ngày</b>
        {st.lowStock ? <Chip tone="warning">Sắp cạn, nên bổ sung câu hỏi</Chip> : <Chip tone="success">Đủ dùng</Chip>}</div>
      <div className="panel panel-body"><span className="muted">Đề hôm nay</span><b className="big-num">{st.deckCreated ? 'Đã tạo' : 'Chưa tạo'}</b>
        <span className="muted">{st.deckCreated ? (st.pinned ? 'Đề do quản trị ghim' : 'Tự động tạo') : 'Sẽ tự tạo khi có người mở trang Hôm nay'}</span></div>
    </div>
    {st.lowStock && <div className="alert alert-warning"><AlertTriangle />Kho còn ít câu chưa dùng. Hãy nhập thêm câu hỏi (Excel hoặc sinh bằng AI) ở mục Câu hỏi và chuyển sang "Đang dùng".</div>}
    <section className="panel">
      <div className="panel-head"><div><h2>Hôm nay chưa luyện ({st.notPlayed.length})</h2><p>Nhân viên đang hoạt động chưa hoàn thành bài hôm nay. Chỉ để nhắc nhở, không bắt buộc.</p></div></div>
      <div className="panel-body">
        {st.notPlayed.length === 0 ? <p className="muted">Mọi người đều đã luyện hôm nay.</p>
          : <div className="name-chips">{st.notPlayed.map(u => <span key={u.id} className="name-chip">{u.fullName}<small>{u.username}</small></span>)}</div>}
      </div>
    </section>
  </div>;
}

// ---------- Điểm danh ✓/✗ ----------
function Attendance() {
  const [month, setMonth] = useState(thisMonth());
  const [groupId, setGroupId] = useState('');
  const [groups, setGroups] = useState([]);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('/groups').then(d => setGroups(d.groups)).catch(() => {}); }, []);
  useEffect(() => {
    setData(null);
    api(`/daily/attendance?month=${month}${groupId ? `&groupId=${groupId}` : ''}`).then(d => { setData(d); setError(''); }).catch(e => setError(e.message));
  }, [month, groupId]);
  const csv = `/api/daily/attendance.csv?month=${month}${groupId ? `&groupId=${groupId}` : ''}`;
  const holidays = useMemo(() => new Set(data?.holidays ?? []), [data]);

  return <section className="panel">
    <div className="panel-head">
      <div><h2>Bảng điểm danh</h2><p>✓ đã luyện · ✗ ngày làm việc chưa luyện · – nghỉ (T7, CN, ngày lễ). Tỷ lệ chỉ tính ngày làm việc.</p></div>
      <div className="toolbar">
        <select value={groupId} onChange={e => setGroupId(e.target.value)} aria-label="Lọc theo nhóm">
          <option value="">Tất cả nhân viên</option>
          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <div className="cal-nav">
          <button className="icon-btn" aria-label="Tháng trước" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft /></button>
          <b>Tháng {Number(month.slice(5))}/{month.slice(0, 4)}</b>
          <button className="icon-btn" aria-label="Tháng sau" onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight /></button>
        </div>
        <a className="btn btn-secondary btn-sm" href={csv} download><Download />Tải CSV</a>
      </div>
    </div>
    <div className="panel-body flush">
      {error && <div className="alert alert-danger" role="alert" style={{ margin: 16 }}>{error}</div>}
      {data && <div className="table-wrap"><table className="att">
        <thead><tr>
          <th className="att-name">Nhân viên</th>
          {data.dates.map(d => <th key={d} className={dow(d) >= 5 || holidays.has(d) ? 'att-day off' : 'att-day'} title={fmtDate(d)}>{Number(d.slice(8))}</th>)}
          <th className="num">Đã luyện</th><th className="num">Bỏ lỡ</th><th className="num">Tỷ lệ</th>
        </tr></thead>
        <tbody>
          {data.rows.map(r => <tr key={r.userId}>
            <td className="att-name">{r.fullName}<span className="sub">{r.username}</span></td>
            {r.days.map((s, i) => <td key={i} className={dow(data.dates[i]) >= 5 || holidays.has(data.dates[i]) ? 'att-cell off' : 'att-cell'}><DayMark status={s} /></td>)}
            <td className="num">{r.doneCount}</td><td className="num">{r.missedCount}</td>
            <td className="num"><b>{r.rate == null ? '—' : `${r.rate}%`}</b></td>
          </tr>)}
          {data.rows.length === 0 && <tr><td className="empty" colSpan={data.dates.length + 4}>Không có nhân viên nào.</td></tr>}
        </tbody>
      </table></div>}
    </div>
  </section>;
}

// ---------- Cài đặt, ngày lễ, ghim đề ----------
function SettingsForm() {
  const { toast } = useDialog();
  const [f, setF] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('/daily/settings').then(d => setF(d.settings)).catch(e => setError(e.message)); }, []);
  async function save(e) {
    e.preventDefault(); setError('');
    try {
      const d = await api('/daily/settings', { method: 'PUT', body: { questionsPerDeck: Number(f.questionsPerDeck), repeatGapDays: Number(f.repeatGapDays), leaderboardEnabled: f.leaderboardEnabled } });
      setF(d.settings); toast('Đã lưu cài đặt.');
    } catch (err) { setError(err.message); }
  }
  if (!f) return error ? <div className="alert alert-danger" role="alert">{error}</div> : null;
  return <form className="panel" onSubmit={save}>
    <div className="panel-head"><div><h2>Cài đặt</h2><p>Áp dụng cho các đề được tạo từ ngày mai trở đi.</p></div></div>
    <div className="panel-body">
      <div className="form-grid cols-2">
        <label className="field">Số câu mỗi đề<input type="number" min="5" max="20" value={f.questionsPerDeck} onChange={e => setF({ ...f, questionsPerDeck: e.target.value })} /><small>Từ 5 đến 20. Mặc định 10 câu (khoảng 10 phút).</small></label>
        <label className="field">Không lặp lại câu trong (ngày)<input type="number" min="7" max="120" value={f.repeatGapDays} onChange={e => setF({ ...f, repeatGapDays: e.target.value })} /><small>Dùng để tính "kho còn đủ cho bao nhiêu ngày".</small></label>
      </div>
      <label className="check-row"><input type="checkbox" checked={f.leaderboardEnabled} onChange={e => setF({ ...f, leaderboardEnabled: e.target.checked })} />Hiện bảng xếp hạng cho nhân viên</label>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      <div className="actions-row"><button className="btn btn-primary" type="submit">Lưu cài đặt</button></div>
    </div>
  </form>;
}

function Holidays() {
  const { confirm, toast } = useDialog();
  const [list, setList] = useState([]);
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const load = () => api('/daily/holidays').then(d => setList(d.holidays)).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);
  async function add(e) {
    e.preventDefault(); setError('');
    try { await api('/daily/holidays', { method: 'POST', body: { date, note } }); setDate(''); setNote(''); await load(); toast('Đã thêm ngày nghỉ.'); } catch (err) { setError(err.message); }
  }
  async function remove(h) {
    if (!await confirm({ title: 'Xoá ngày nghỉ', message: `Xoá ngày nghỉ ${fmtDate(h.date)}? Ngày này sẽ tính như ngày làm việc bình thường.`, confirmLabel: 'Xoá', danger: true })) return;
    try { await api(`/daily/holidays/${h.date}`, { method: 'DELETE' }); await load(); toast('Đã xoá.'); } catch (err) { setError(err.message); }
  }
  return <section className="panel">
    <div className="panel-head"><div><h2>Ngày lễ / ngày nghỉ</h2><p>Ngày nghỉ không bị đánh dấu ✗ và không làm đứt chuỗi ngày. T7 và CN luôn là ngày nghỉ.</p></div></div>
    <div className="panel-body">
      <form className="toolbar" onSubmit={add}>
        <label className="field">Ngày<input type="date" value={date} onChange={e => setDate(e.target.value)} required /></label>
        <label className="field grow">Ghi chú<input value={note} maxLength={200} placeholder="Ví dụ: Quốc khánh" onChange={e => setNote(e.target.value)} /></label>
        <button className="btn btn-primary" type="submit" style={{ alignSelf: 'end' }}><Plus />Thêm</button>
      </form>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      <div className="table-wrap"><table>
        <thead><tr><th>Ngày</th><th>Ghi chú</th><th></th></tr></thead>
        <tbody>
          {list.map(h => <tr key={h.date}><td>{fmtDate(h.date)}</td><td>{h.note || '—'}</td>
            <td className="actions"><button className="btn btn-link" style={{ color: 'var(--danger-fg)' }} onClick={() => remove(h)}>Xoá</button></td></tr>)}
          {list.length === 0 && <tr><td colSpan={3} className="empty">Chưa có ngày nghỉ nào.</td></tr>}
        </tbody>
      </table></div>
    </div>
  </section>;
}

function PinDeck() {
  const { toast } = useDialog();
  const [open, setOpen] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [picked, setPicked] = useState(new Set());
  const [date, setDate] = useState(todayStr());
  const [kw, setKw] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { if (open && !questions.length) api('/questions?status=ACTIVE').then(d => setQuestions(d.questions)).catch(e => setError(e.message)); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = questions.filter(q => !kw.trim() || kw.toLowerCase().split(/\s+/).filter(Boolean).every(w => `${q.topic} ${q.content}`.toLowerCase().includes(w)));
  const toggle = id => { const s = new Set(picked); s.has(id) ? s.delete(id) : s.add(id); setPicked(s); };
  async function save(e) {
    e.preventDefault(); setError('');
    try {
      await api('/daily/pin', { method: 'POST', body: { date, questionIds: [...picked] } });
      toast(`Đã ghim đề cho ngày ${fmtDate(date)}.`); setOpen(false); setPicked(new Set());
    } catch (err) { setError(err.message); }
  }
  return <section className="panel">
    <div className="panel-head"><div><h2>Ghim đề riêng cho một ngày</h2><p>Không bắt buộc. Dùng khi muốn ra đề riêng, ví dụ ngày có quy định mới. Nếu không ghim, hệ thống tự tạo đề.</p></div>
      {!open && <button className="btn btn-secondary" onClick={() => setOpen(true)}>Ghim đề</button>}</div>
    {open && <form className="panel-body" onSubmit={save}>
      <div className="form-grid cols-2">
        <label className="field">Ngày áp dụng<input type="date" value={date} min={todayStr()} onChange={e => setDate(e.target.value)} required /><small>Hôm nay hoặc ngày sau. Không đổi được nếu đã có người làm.</small></label>
        <label className="field">Lọc câu hỏi<input value={kw} placeholder="Chủ đề hoặc từ khoá" onChange={e => setKw(e.target.value)} /></label>
      </div>
      <p className="section-title">Chọn 5–20 câu <span className="muted">— đã chọn {picked.size}</span></p>
      <div className="pick-list">
        {shown.map(q => <label key={q.id} className="check-row"><input type="checkbox" checked={picked.has(q.id)} onChange={() => toggle(q.id)} />[{q.topic}] {q.content}</label>)}
        {questions.length === 0 && <span className="muted">Chưa có câu hỏi "Đang dùng".</span>}
      </div>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      <div className="actions-row"><button className="btn btn-primary" type="submit" disabled={picked.size < 5 || picked.size > 20}>Ghim đề</button><button type="button" className="btn btn-link" onClick={() => setOpen(false)}>Huỷ</button></div>
    </form>}
  </section>;
}

export default function DailyAdmin() {
  const [tab, setTab] = useState('overview');
  const tabs = [['overview', 'Tổng quan'], ['attendance', 'Điểm danh'], ['settings', 'Cài đặt']];
  return <div className="stack">
    <div className="seg seg-wide" role="tablist" aria-label="Luyện hàng ngày">
      {tabs.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>)}
    </div>
    {tab === 'overview' && <Overview />}
    {tab === 'attendance' && <Attendance />}
    {tab === 'settings' && <><SettingsForm /><Holidays /><PinDeck /></>}
  </div>;
}
