import { useEffect, useState } from 'react';
import { api } from './api.js';

const ROLE_LABEL = { SUPER_ADMIN: 'Super Admin', ADMIN: 'Quản trị viên', EMPLOYEE: 'Nhân viên' };
const STATUS_LABEL = { ACTIVE: 'Hoạt động', LOCKED: 'Đã khoá', DISABLED: 'Vô hiệu' };
const RANK = { EMPLOYEE: 1, ADMIN: 2, SUPER_ADMIN: 3 };

export default function UserAdmin({ me }) {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ username: '', fullName: '', email: '', role: 'EMPLOYEE', password: '' });
  const [busy, setBusy] = useState(false);

  const load = () => api('/users').then(d => setUsers(d.users)).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);

  async function create(event) {
    event.preventDefault();
    setError(''); setBusy(true);
    try {
      await api('/users', { method: 'POST', body: form });
      setForm({ username: '', fullName: '', email: '', role: 'EMPLOYEE', password: '' });
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function patch(id, body) {
    setError('');
    try { await api(`/users/${id}`, { method: 'PATCH', body }); await load(); }
    catch (e) { setError(e.message); }
  }

  function resetPassword(u) {
    const pw = window.prompt(`Nhập mật khẩu tạm mới cho ${u.username} (≥10 ký tự, có hoa, thường, số):`);
    if (pw) patch(u.id, { newPassword: pw });
  }

  const set = k => e => setForm({ ...form, [k]: e.target.value });
  const canManage = u => RANK[u.role] < RANK[me.role];

  return <div className="card">
    <h2>Quản lý tài khoản</h2>
    <form className="user-form" onSubmit={create}>
      <input placeholder="Tên đăng nhập" value={form.username} onChange={set('username')} required />
      <input placeholder="Họ và tên" value={form.fullName} onChange={set('fullName')} required />
      <input placeholder="Email (không bắt buộc)" type="email" value={form.email} onChange={set('email')} />
      <select value={form.role} onChange={set('role')}>
        <option value="EMPLOYEE">Nhân viên</option>
        {me.role === 'SUPER_ADMIN' && <option value="ADMIN">Quản trị viên</option>}
      </select>
      <input placeholder="Mật khẩu tạm" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} required />
      <button className="submit small" type="submit" disabled={busy}>Tạo tài khoản</button>
    </form>
    <p className="muted">Người dùng mới phải đổi mật khẩu ở lần đăng nhập đầu tiên.</p>
    {error && <div className="error" role="alert">{error}</div>}
    <div className="table-wrap">
      <table>
        <thead><tr><th>Tài khoản</th><th>Họ tên</th><th>Vai trò</th><th>Trạng thái</th><th></th></tr></thead>
        <tbody>
          {users.map(u => <tr key={u.id}>
            <td>{u.username}</td><td>{u.fullName}</td><td>{ROLE_LABEL[u.role]}</td><td>{STATUS_LABEL[u.status]}</td>
            <td className="actions">
              {u.id !== me.id && canManage(u) && <>
                {u.status === 'ACTIVE'
                  ? <button className="link" onClick={() => patch(u.id, { status: 'LOCKED' })}>Khoá</button>
                  : <button className="link" onClick={() => patch(u.id, { status: 'ACTIVE' })}>Mở khoá</button>}
                <button className="link" onClick={() => resetPassword(u)}>Đặt lại MK</button>
              </>}
            </td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </div>;
}
