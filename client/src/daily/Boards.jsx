import { useEffect, useState } from 'react';
import { Award, Check, ChevronLeft, ChevronRight, Lock, Medal, Minus, X } from 'lucide-react';
import { api } from '../api.js';

const STATUS_TEXT = { done: 'Đã luyện', missed: 'Chưa luyện', pending: 'Hôm nay', rest: 'Nghỉ', future: '', off: '' };

// Một ô ngày: ✓ đã luyện, ✗ bỏ lỡ ngày làm việc, – nghỉ cuối tuần/lễ.
export function DayMark({ status }) {
  const icon = status === 'done' ? <Check /> : status === 'missed' ? <X /> : status === 'rest' ? <Minus /> : null;
  return <span className={`mark mark-${status}`} aria-label={STATUS_TEXT[status]} title={STATUS_TEXT[status]}>{icon}</span>;
}

export function WeekStrip({ week }) {
  return <div className="week" role="list" aria-label="Tuần này">
    {week.map(d => <div key={d.date} role="listitem" className={d.today ? 'week-day today' : 'week-day'}>
      <small>{d.label}</small><DayMark status={d.status} /><small className="wd-num">{Number(d.date.slice(8))}</small>
    </div>)}
  </div>;
}

const MONTHS = m => `Tháng ${Number(m.slice(5))}/${m.slice(0, 4)}`;
const shiftMonth = (m, n) => { const d = new Date(Number(m.slice(0, 4)), Number(m.slice(5)) - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

export function Calendar() {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { setData(null); api(`/daily/calendar?month=${month}`).then(setData).catch(e => setError(e.message)); }, [month]);
  const lead = data ? (new Date(Number(month.slice(0, 4)), Number(month.slice(5)) - 1, 1).getDay() + 6) % 7 : 0;
  return <section className="panel daily-panel">
    <div className="panel-head">
      <div><h2>Lịch luyện tập</h2>{data && <p>{data.doneCount} ngày đã luyện{data.missedCount ? ` · ${data.missedCount} ngày làm việc chưa luyện` : ''}</p>}</div>
      <div className="cal-nav">
        <button className="icon-btn" aria-label="Tháng trước" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft /></button>
        <b>{MONTHS(month)}</b>
        <button className="icon-btn" aria-label="Tháng sau" onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight /></button>
      </div>
    </div>
    <div className="panel-body">
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      <div className="cal-grid">
        {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(l => <small key={l} className="cal-h">{l}</small>)}
        {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
        {data?.days.map(d => <div key={d.date} className="cal-cell"><DayMark status={d.status} /><small>{Number(d.date.slice(8))}</small></div>)}
      </div>
      <div className="legend"><span><DayMark status="done" /> Đã luyện</span><span><DayMark status="missed" /> Chưa luyện</span><span><DayMark status="rest" /> Nghỉ (T7, CN, lễ)</span></div>
    </div>
  </section>;
}

const MEDAL = ['gold', 'silver', 'bronze'];

export function Leaderboard() {
  const [scope, setScope] = useState('week');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { setData(null); api(`/daily/leaderboard?scope=${scope}`).then(setData).catch(e => setError(e.message)); }, [scope]);
  const row = r => <li key={r.rank} className={r.me ? 'lb-row me' : 'lb-row'}>
    <span className="lb-rank">{r.rank <= 3 ? <Medal className={`medal ${MEDAL[r.rank - 1]}`} aria-label={`Hạng ${r.rank}`} /> : r.rank}</span>
    <span className="lb-name"><span className="lb-fn">{r.fullName}{r.me && <small> (bạn)</small>}</span><span className="lb-days">{r.days} ngày luyện</span></span>
    <b className="lb-xp">{r.xp} XP</b>
  </li>;
  return <section className="panel daily-panel">
    <div className="panel-head">
      <div><h2>Bảng xếp hạng</h2><p>Theo XP của các bài đã hoàn thành</p></div>
      <div className="seg" role="tablist" aria-label="Phạm vi">
        <button role="tab" aria-selected={scope === 'week'} className={scope === 'week' ? 'on' : ''} onClick={() => setScope('week')}>Tuần này</button>
        <button role="tab" aria-selected={scope === 'month'} className={scope === 'month' ? 'on' : ''} onClick={() => setScope('month')}>Tháng này</button>
      </div>
    </div>
    <div className="panel-body">
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {data && !data.enabled && <p className="muted">Bảng xếp hạng đang được tắt.</p>}
      {data?.enabled && data.rows.length === 0 && <p className="muted">Chưa có ai hoàn thành bài trong {scope === 'week' ? 'tuần' : 'tháng'} này. Hãy là người đầu tiên!</p>}
      {data?.enabled && data.rows.length > 0 && <ol className="lb">{data.rows.map(row)}{data.me && <><li className="lb-gap" aria-hidden="true">…</li>{row(data.me)}</>}</ol>}
    </div>
  </section>;
}

export function Badges({ badges }) {
  return <section className="panel daily-panel">
    <div className="panel-head"><div><h2>Huy hiệu</h2><p>{badges.earned.length}/{badges.earned.length + badges.locked.length} huy hiệu</p></div></div>
    <div className="panel-body">
      <div className="badge-grid">
        {badges.earned.map(b => <div key={b.code} className="badge got"><Award /><b>{b.label}</b><small>{b.hint}</small></div>)}
        {badges.locked.map(b => <div key={b.code} className="badge locked"><Lock /><b>{b.label}</b><small>{b.hint}</small></div>)}
      </div>
    </div>
  </section>;
}
