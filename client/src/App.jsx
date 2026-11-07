import { useEffect, useState } from 'react';
import { BookOpenCheck, ShieldCheck, Users, Eye, EyeOff, ArrowRight, LogOut, KeyRound } from 'lucide-react';
import logo from './assets/tth-logo.jpg';
import { api } from './api.js';
import UserAdmin from './UserAdmin.jsx';
import QuestionBank from './QuestionBank.jsx';
import { MyExams, ExamAdmin } from './Exams.jsx';
import AuditLog from './AuditLog.jsx';
import GroupAdmin from './Groups.jsx';
import Reports from './Reports.jsx';
import Documents from './Documents.jsx';

const ROLE_LABEL = { SUPER_ADMIN: 'Super Admin', ADMIN: 'Quản trị viên', EMPLOYEE: 'Nhân viên' };

function PasswordInput({ value, onChange, placeholder, autoComplete }) {
  const [show, setShow] = useState(false);
  return <div className="password-wrap">
    <input type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} autoComplete={autoComplete} required />
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

  return <section className="hero">
    <div className="intro">
      <div className="eyebrow"><BookOpenCheck size={16} /> TTH GROUP · ACCOUNTING</div>
      <h1>Kiến thức vững vàng.<br /><em>Nghiệp vụ chuẩn xác.</em></h1>
      <p>Nền tảng kiểm tra và đánh giá kiến thức kế toán dành cho đội ngũ TTH Group.</p>
      <div className="features">
        <div><ShieldCheck /><span><b>Đánh giá có căn cứ</b><small>Câu hỏi gắn với tài liệu và quy định được duyệt.</small></span></div>
        <div><Users /><span><b>Thi tập trung</b><small>Tổ chức phòng thi đồng bộ cho nhân sự.</small></span></div>
      </div>
    </div>
    <form className="login" onSubmit={submit}>
      <div className="login-mark"><BookOpenCheck size={23} /></div>
      <h2>Đăng nhập hệ thống</h2>
      <p className="muted">Sử dụng tài khoản được cấp bởi quản trị viên.</p>
      <label>Tên đăng nhập</label>
      <input value={account} onChange={e => setAccount(e.target.value)} placeholder="Nhập tên đăng nhập" autoComplete="username" required />
      <label>Mật khẩu</label>
      <PasswordInput value={password} onChange={setPassword} placeholder="Nhập mật khẩu" autoComplete="current-password" />
      {error && <div className="error" role="alert">{error}</div>}
      <button className="submit" type="submit" disabled={busy}>{busy ? 'Đang xử lý…' : 'Đăng nhập'} <ArrowRight size={18} /></button>
      <div className="secure"><ShieldCheck size={15} /> Tài khoản nội bộ · Không tự đăng ký</div>
    </form>
  </section>;
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

  return <section className="center">
    <form className="login" onSubmit={submit}>
      <div className="login-mark"><KeyRound size={23} /></div>
      <h2>Đổi mật khẩu</h2>
      <p className="muted">{forced ? 'Bạn cần đổi mật khẩu tạm trước khi tiếp tục.' : 'Nhập mật khẩu hiện tại và mật khẩu mới.'} Tối thiểu 10 ký tự, gồm chữ hoa, chữ thường và chữ số.</p>
      <label>Mật khẩu hiện tại</label>
      <PasswordInput value={cur} onChange={setCur} placeholder="Mật khẩu hiện tại" autoComplete="current-password" />
      <label>Mật khẩu mới</label>
      <PasswordInput value={next} onChange={setNext} placeholder="Mật khẩu mới" autoComplete="new-password" />
      {error && <div className="error" role="alert">{error}</div>}
      <button className="submit" type="submit" disabled={busy}>{busy ? 'Đang xử lý…' : 'Cập nhật mật khẩu'}</button>
      {!forced && <button type="button" className="link" onClick={onCancel}>Huỷ</button>}
    </form>
  </section>;
}

function Home({ user, onChangePassword }) {
  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
  // Mỗi nhóm chức năng một tab để trang không quá dài; tab hiện tại nằm trên URL (#exams…) nên tải lại vẫn giữ.
  const tabs = [
    { id: 'exams', label: 'Bài thi', show: true, view: <MyExams /> },
    { id: 'docs', label: 'Tài liệu', show: true, view: <Documents isAdmin={isAdmin} /> },
    { id: 'questions', label: 'Câu hỏi', show: isAdmin, view: <QuestionBank /> },
    { id: 'manage', label: 'Đề thi & nhóm', show: isAdmin, view: <><ExamAdmin /><GroupAdmin /></> },
    { id: 'reports', label: 'Báo cáo', show: isAdmin, view: <Reports /> },
    { id: 'users', label: 'Tài khoản', show: isAdmin, view: <UserAdmin me={user} /> },
    { id: 'audit', label: 'Nhật ký', show: user.role === 'SUPER_ADMIN', view: <AuditLog /> }
  ].filter(t => t.show);
  const fromHash = () => { const h = window.location.hash.slice(1); return tabs.some(t => t.id === h) ? h : 'exams'; };
  const [tab, setTab] = useState(fromHash);
  useEffect(() => {
    const onHash = () => setTab(fromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = id => { window.location.hash = id; setTab(id); };
  const current = tabs.find(t => t.id === tab) ?? tabs[0];

  return <section className="dash">
    <div className="card">
      <h2>Xin chào, {user.fullName}</h2>
      <p className="muted">Vai trò: <b>{ROLE_LABEL[user.role]}</b> · Tài khoản: {user.username}</p>
      <button className="link" onClick={onChangePassword}><KeyRound size={14} /> Đổi mật khẩu</button>
    </div>
    <nav className="tabs" aria-label="Chức năng">
      {tabs.map(t => <button key={t.id} className={t.id === current.id ? 'tab active' : 'tab'}
        aria-current={t.id === current.id ? 'page' : undefined} onClick={() => go(t.id)}>{t.label}</button>)}
    </nav>
    {current.view}
  </section>;
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

  let body;
  if (loading) body = <section className="center"><p className="muted">Đang tải…</p></section>;
  else if (!user) body = <Login onLogin={setUser} />;
  else if (user.mustChangePassword || changing) {
    body = <ChangePassword forced={user.mustChangePassword} onDone={u => { setUser(u); setChanging(false); }} onCancel={() => setChanging(false)} />;
  } else body = <Home user={user} onChangePassword={() => setChanging(true)} />;

  return <main className="page">
    <div className="topbar">
      <img src={logo} alt="TTH Group" />
      {user ? <button className="link" onClick={logout}><LogOut size={14} /> Đăng xuất ({user.username})</button>
            : <span>HỆ THỐNG ĐÀO TẠO NỘI BỘ</span>}
    </div>
    {body}
    <footer>© {new Date().getFullYear()} TTH Group · TTH Accounting Quiz <span>Phiên bản 0.11</span></footer>
  </main>;
}
