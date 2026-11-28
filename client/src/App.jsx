import { Fragment, useEffect, useState } from 'react';
import { AlertCircle, BarChart3, BookOpen, CalendarCheck, ClipboardCheck, Eye, EyeOff, FileText, KeyRound, ListChecks, LogOut, Menu, ScrollText, Sparkles, Users } from 'lucide-react';
import logo from './assets/tth-logo.jpg';
import { api } from './api.js';
import UserAdmin from './UserAdmin.jsx';
import QuestionBank from './QuestionBank.jsx';
import { MyExams, ExamAdmin } from './Exams.jsx';
import AuditLog from './AuditLog.jsx';
import GroupAdmin from './Groups.jsx';
import Reports from './Reports.jsx';
import Documents from './Documents.jsx';
import Daily from './daily/Daily.jsx';
import DailyAdmin from './daily/DailyAdmin.jsx';

const ROLE_LABEL = { SUPER_ADMIN: 'Super Admin', ADMIN: 'Quản trị viên', EMPLOYEE: 'Nhân viên' };

function PasswordInput({ id, value, onChange, autoComplete }) {
  const [show, setShow] = useState(false);
  return <div className="password-wrap">
    <input id={id} type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)}
      autoComplete={autoComplete} required />
    <button type="button" className="eye" onClick={() => setShow(!show)} aria-label="Hiện hoặc ẩn mật khẩu">
      {show ? <EyeOff /> : <Eye />}
    </button>
  </div>;
}

function Login({ onLogin }) {
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError(''); setBusy(true);
    try {
      const { user } = await api('/auth/login', { method: 'POST', body: { username: account, password } });
      onLogin(user);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return <form className="auth-card" onSubmit={submit}>
    <img className="logo" src={logo} alt="TTH Group" />
    <h1>Đăng nhập</h1>
    <p className="lead">Hệ thống đào tạo nội bộ TTH Accounting Quiz</p>
    <div style={{ display: 'grid', gap: 16 }}>
      <label className="field">Tên đăng nhập
        <input value={account} onChange={e => setAccount(e.target.value)} autoComplete="username" autoFocus required />
      </label>
      <div className="field"><label htmlFor="pw-login">Mật khẩu</label>
        <PasswordInput id="pw-login" value={password} onChange={setPassword} autoComplete="current-password" />
      </div>
      {error && <div className="alert alert-danger" role="alert"><AlertCircle />{error}</div>}
    </div>
    <button className={`btn btn-primary btn-block${busy ? ' btn-loading' : ''}`} type="submit" disabled={busy}>{busy ? 'Đang xử lý' : 'Đăng nhập'}</button>
    <p className="auth-foot">Tài khoản do quản trị viên cấp, không tự đăng ký.</p>
  </form>;
}

function ChangePassword({ forced, onDone, onCancel }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError(''); setBusy(true);
    try {
      const { user } = await api('/auth/change-password', { method: 'POST', body: { currentPassword: cur, newPassword: next } });
      onDone(user);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return <form className="auth-card" onSubmit={submit}>
    <img className="logo" src={logo} alt="TTH Group" />
    <h1>Đổi mật khẩu</h1>
    <p className="lead">{forced ? 'Bạn cần đổi mật khẩu tạm trước khi tiếp tục.' : 'Nhập mật khẩu hiện tại và mật khẩu mới.'} Tối thiểu 10 ký tự, gồm chữ hoa, chữ thường và số.</p>
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="field"><label htmlFor="pw-current">Mật khẩu hiện tại</label>
        <PasswordInput id="pw-current" value={cur} onChange={setCur} autoComplete="current-password" />
      </div>
      <div className="field"><label htmlFor="pw-new">Mật khẩu mới</label>
        <PasswordInput id="pw-new" value={next} onChange={setNext} autoComplete="new-password" />
      </div>
      {error && <div className="alert alert-danger" role="alert"><AlertCircle />{error}</div>}
    </div>
    <button className={`btn btn-primary btn-block${busy ? ' btn-loading' : ''}`} type="submit" disabled={busy}>{busy ? 'Đang xử lý' : 'Cập nhật mật khẩu'}</button>
    {!forced && <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={onCancel}>Huỷ</button>}
  </form>;
}

const NAV = [
  { group: 'Làm bài', items: [
    { id: 'daily', label: 'Hôm nay', icon: Sparkles, title: 'Luyện mỗi ngày', desc: '10 phút kiến thức kế toán mỗi ngày: trả lời, xem đáp án ngay và tích lũy chuỗi ngày.' },
    { id: 'exams', label: 'Bài thi', icon: ClipboardCheck, title: 'Bài thi của tôi', desc: 'Các đề thi được giao và kết quả của bạn.' },
    { id: 'docs', label: 'Tài liệu', icon: BookOpen, title: 'Tài liệu & quy định', desc: 'Văn bản làm căn cứ cho câu hỏi.' }] },
  { group: 'Quản trị', admin: true, items: [
    { id: 'questions', label: 'Câu hỏi', icon: ListChecks, title: 'Ngân hàng câu hỏi', desc: 'Soạn, nhập và duyệt câu hỏi.' },
    { id: 'manage', label: 'Đề thi & nhóm', icon: FileText, title: 'Đề thi & nhóm', desc: 'Tạo đề, giao đề và quản lý nhóm nhân viên.' },
    { id: 'dailyadmin', label: 'Luyện hàng ngày', icon: CalendarCheck, title: 'Luyện hàng ngày', desc: 'Tham gia, điểm danh, kho câu hỏi, ngày nghỉ và cài đặt.' },
    { id: 'reports', label: 'Báo cáo', icon: BarChart3, title: 'Báo cáo tổng hợp', desc: 'Tỷ lệ đúng theo chủ đề và theo nhân viên.' },
    { id: 'users', label: 'Tài khoản', icon: Users, title: 'Quản lý tài khoản', desc: 'Tạo, khoá và đặt lại mật khẩu người dùng.' },
    { id: 'audit', label: 'Nhật ký', icon: ScrollText, title: 'Nhật ký hoạt động', desc: 'Lịch sử thao tác trên hệ thống.', superOnly: true }] }
];

function Shell({ user, onChangePassword, onLogout }) {
  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
  const groups = NAV.map(g => ({ ...g, items: g.items.filter(i => (!g.admin || isAdmin) && (!i.superOnly || user.role === 'SUPER_ADMIN')) })).filter(g => g.items.length);
  const all = groups.flatMap(g => g.items);
  const views = {
    daily: <Daily user={user} />, exams: <MyExams />, docs: <Documents isAdmin={isAdmin} />, questions: <QuestionBank />,
    manage: <div className="stack"><ExamAdmin /><GroupAdmin /></div>, dailyadmin: <DailyAdmin />, reports: <Reports />, users: <UserAdmin me={user} />, audit: <AuditLog />
  };
  // Tab hiện tại nằm trên URL (#exams…) nên tải lại vẫn giữ.
  const fromHash = () => { const h = window.location.hash.slice(1); return all.some(t => t.id === h) ? h : 'daily'; };
  const [tab, setTab] = useState(fromHash);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onHash = () => setTab(fromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = id => { window.location.hash = id; setTab(id); setOpen(false); };
  const current = all.find(t => t.id === tab) ?? all[0];

  return <div className="app">
    <aside className={open ? 'sidebar open' : 'sidebar'} aria-label="Điều hướng">
      <div className="sidebar-brand"><img src={logo} alt="TTH Group" /><small>Đào tạo nội bộ · Kế toán</small></div>
      <nav className="nav">
        {groups.map(g => <Fragment key={g.group}>
          <div className="nav-group">{g.group}</div>
          {g.items.map(i => <button key={i.id} className={i.id === current.id ? 'nav-item active' : 'nav-item'}
            aria-current={i.id === current.id ? 'page' : undefined} onClick={() => go(i.id)}><i.icon />{i.label}</button>)}
        </Fragment>)}
      </nav>
      <div className="sidebar-user">
        <div className="user-name">{user.fullName}</div>
        <div className="user-meta">{ROLE_LABEL[user.role]} · {user.username}</div>
        <button className="nav-item" onClick={onChangePassword}><KeyRound />Đổi mật khẩu</button>
        <button className="nav-item" onClick={onLogout}><LogOut />Đăng xuất</button>
      </div>
    </aside>
    {open && <div className="scrim" onClick={() => setOpen(false)} />}
    <div className="main">
      <div className="mobile-bar">
        <button className="btn btn-secondary btn-sm" aria-label="Mở menu" onClick={() => setOpen(true)}><Menu /></button>
        <span className="title">{current.label}</span>
      </div>
      <main className="content">
        <header className="page-head"><div><h1>{current.title}</h1><p>{current.desc}</p></div></header>
        {views[current.id]}
      </main>
      <footer className="footer"><span>© {new Date().getFullYear()} TTH Group</span><span>TTH Accounting Quiz · Phiên bản 0.11</span></footer>
    </div>
  </div>;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    api('/auth/me').then(d => setUser(d.user)).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null); setChanging(false);
  }

  if (!loading && user && !user.mustChangePassword && !changing) return <Shell user={user} onChangePassword={() => setChanging(true)} onLogout={logout} />;
  let body;
  if (loading) body = <p className="muted">Đang tải…</p>;
  else if (!user) body = <Login onLogin={setUser} />;
  else body = <ChangePassword forced={user.mustChangePassword} onDone={u => { setUser(u); setChanging(false); }} onCancel={() => setChanging(false)} />;
  return <main className="auth">{body}{user && <button className="btn btn-ghost btn-sm" style={{ marginTop: 16 }} onClick={logout}>Đăng xuất</button>}</main>;
}
