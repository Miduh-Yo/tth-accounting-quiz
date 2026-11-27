import { useEffect, useState } from 'react';
import { api } from './api.js';
import { Chip, USER_TONE, useDialog } from './ui.jsx';

const ROLE_LABEL = { SUPER_ADMIN: 'Super Admin', ADMIN: 'Quản trị viên', EMPLOYEE: 'Nhân viên' };
const STATUS_LABEL = { ACTIVE: 'Hoạt động', LOCKED: 'Đã khoá', DISABLED: 'Vô hiệu' };
const RANK = { EMPLOYEE: 1, ADMIN: 2, SUPER_ADMIN: 3 };

export default function UserAdmin({ me }) {
  const { confirm, prompt, toast } = useDialog();
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
    try { await api(`/users/${id}`, { method: 'PATCH', body }); await load(); return true; }
    catch (e) { setError(e.message); return false; }
  }

  async function resetPassword(u) {
    const pw = await prompt({ title: 'Đặt lại mật khẩu', message: `Tài khoản ${u.username}. Mật khẩu tạm tối thiểu 10 ký tự, gồm chữ hoa, chữ thường và số.`, label: 'Mật khẩu tạm mới', secret: true, confirmLabel: 'Đặt lại' });
    if (pw && await patch(u.id, { newPassword: pw })) toast(`Đã đặt lại mật khẩu cho ${u.username}.`);
  }
  async function setStatus(u, status) {
    if (status === 'LOCKED' && !await confirm({ title: 'Khoá tài khoản', message: `${u.fullName} (${u.username}) sẽ bị đăng xuất và không đăng nhập được cho đến khi mở khoá.`, confirmLabel: 'Khoá', danger: true })) return;
    if (await patch(u.id, { status })) toast(status === 'LOCKED' ? 'Đã khoá tài khoản.' : 'Đã mở khoá tài khoản.');
  }

  const [editId, setEditId] = useState(null);
  const [edit, setEdit] = useState({ username: '', fullName: '', email: '', role: 'EMPLOYEE' });
  const startEdit = u => { setEditId(u.id); setEdit({ username: u.username, fullName: u.fullName, email: u.email || '', role: u.role }); };
  async function saveEdit(u) {
    setError('');
    const body = { username: edit.username, fullName: edit.fullName, email: edit.email };
    if (edit.role !== u.role) body.role = edit.role;
    try { await api(`/users/${u.id}`, { method: 'PATCH', body }); setEditId(null); await load(); }
    catch (e) { setError(e.message); }
  }
  const setE = k => e => setEdit({ ...edit, [k]: e.target.value });

  const set = k => e => setForm({ ...form, [k]: e.target.value });
  const canManage = u => RANK[u.role] < RANK[me.role];

  return <div className="panel panel-body">
    <form className="form-grid cols-3" onSubmit={create}>
      <input placeholder="Tên đăng nhập" value={form.username} onChange={set('username')} required />
      <input placeholder="Họ và tên" value={form.fullName} onChange={set('fullName')} required />
      <input placeholder="Email (không bắt buộc)" type="email" value={form.email} onChange={set('email')} />
      <select value={form.role} onChange={set('role')}>
        <option value="EMPLOYEE">Nhân viên</option>
        {me.role === 'SUPER_ADMIN' && <option value="ADMIN">Quản trị viên</option>}
      </select>
      <input placeholder="Mật khẩu tạm" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} required />
      <button className="btn btn-primary" type="submit" disabled={busy}>Tạo tài khoản</button>
    </form>
    <p className="muted">Người dùng mới phải đổi mật khẩu ở lần đăng nhập đầu tiên.</p>
    {error && <div className="alert alert-danger" role="alert">{error}</div>}
    <div className="table-wrap">
      <table>
        <thead><tr><th>Tài khoản</th><th>Họ tên</th><th>Email</th><th>Vai trò</th><th>Trạng thái</th><th></th></tr></thead>
        <tbody>
          {users.map(u => editId === u.id ? <tr key={u.id} className="editing">
            <td><input value={edit.username} onChange={setE('username')} placeholder="Mã tài khoản" required /></td>
            <td><input value={edit.fullName} onChange={setE('fullName')} placeholder="Họ và tên" required /></td>
            <td><input type="email" value={edit.email} onChange={setE('email')} placeholder="Email" /></td>
            <td><select value={edit.role} onChange={setE('role')}>
              <option value="EMPLOYEE">Nhân viên</option>
              {me.role === 'SUPER_ADMIN' && <option value="ADMIN">Quản trị viên</option>}
            </select></td>
            <td><Chip tone={USER_TONE[u.status]}>{STATUS_LABEL[u.status]}</Chip></td>
            <td className="actions">
              <button className="btn btn-link" onClick={() => saveEdit(u)} disabled={!edit.fullName.trim()}>Lưu</button>
              <button className="btn btn-link" onClick={() => setEditId(null)}>Huỷ</button>
            </td>
          </tr> : <tr key={u.id}>
            <td>{u.username}</td><td>{u.fullName}</td><td>{u.email || '—'}</td><td>{ROLE_LABEL[u.role]}</td><td><Chip tone={USER_TONE[u.status]}>{STATUS_LABEL[u.status]}</Chip></td>
            <td className="actions">
              {u.id !== me.id && canManage(u) && <>
                <button className="btn btn-link" onClick={() => startEdit(u)}>Sửa</button>
                {u.status === 'ACTIVE'
                  ? <button className="btn btn-link" onClick={() => setStatus(u, 'LOCKED')}>Khoá</button>
                  : <button className="btn btn-link" onClick={() => setStatus(u, 'ACTIVE')}>Mở khoá</button>}
                <button className="btn btn-link" onClick={() => resetPassword(u)}>Đặt lại MK</button>
              </>}
            </td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </div>;
}
