import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from './api.js';
import { useDialog } from './ui.jsx';

export default function GroupAdmin() {
  const [groups, setGroups] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [edit, setEdit] = useState(null); // { id?, name, memberIds:Set }
  const { confirm, toast } = useDialog();
  const [error, setError] = useState('');

  const load = () => Promise.all([api('/groups'), api('/users')])
    .then(([g, u]) => { setGroups(g.groups); setEmployees(u.users.filter(x => x.role === 'EMPLOYEE' && x.status === 'ACTIVE')); })
    .catch(e => setError(e.message));
  useEffect(() => { load(); }, []);

  async function save(event) {
    event.preventDefault(); setError('');
    const body = { name: edit.name, memberIds: [...edit.memberIds] };
    try {
      await api(edit.id ? `/groups/${edit.id}` : '/groups', { method: edit.id ? 'PUT' : 'POST', body });
      setEdit(null); await load(); toast('Đã lưu nhóm.');
    } catch (e) { setError(e.message); }
  }
  async function remove(g) {
    if (!await confirm({ title: 'Xoá nhóm', message: `Xoá nhóm "${g.name}"? Thao tác này không thể hoàn tác.`, confirmLabel: 'Xoá nhóm', danger: true })) return;
    setError('');
    try { await api(`/groups/${g.id}`, { method: 'DELETE' }); await load(); toast('Đã xoá nhóm.'); } catch (e) { setError(e.message); }
  }
  const toggle = id => { const s = new Set(edit.memberIds); s.has(id) ? s.delete(id) : s.add(id); setEdit({ ...edit, memberIds: s }); };

  return <div className="panel panel-body">
    <h2>Quản lý nhóm</h2>
    {edit ? <form className="form-panel" onSubmit={save}>
      <h3>{edit.id ? 'Sửa nhóm' : 'Tạo nhóm'}</h3>
      <p className="section-title">Thông tin nhóm</p>
      <label className="field">Tên nhóm
        <input placeholder="Ví dụ: Kế toán thuế" value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} required />
      </label>
      <p className="section-title">Thành viên <span className="muted">— đã chọn {edit.memberIds.size}</span></p>
      <div className="pick-list">
        {employees.map(u => <label key={u.id} className="check-row"><input type="checkbox" checked={edit.memberIds.has(u.id)} onChange={() => toggle(u.id)} /> {u.fullName} ({u.username})</label>)}
        {employees.length === 0 && <span className="muted">Chưa có tài khoản nhân viên nào.</span>}
      </div>
      <div className="actions-row"><button className="btn btn-primary" type="submit">Lưu nhóm</button><button type="button" className="btn btn-link" onClick={() => setEdit(null)}>Huỷ</button></div>
    </form> : <button className="btn btn-primary" onClick={() => setEdit({ name: '', memberIds: new Set() })}><Plus />Tạo nhóm</button>}
    {error && <div className="alert alert-danger" role="alert">{error}</div>}
    <div className="table-wrap"><table>
      <thead><tr><th>Nhóm</th><th className="num">Thành viên</th><th className="num">Đề được giao</th><th></th></tr></thead>
      <tbody>
        {groups.map(g => <tr key={g.id}>
          <td>{g.name}</td><td className="num">{g.members.length}</td><td className="num">{g.examCount}</td>
          <td className="actions">
            <button className="btn btn-link" onClick={() => setEdit({ id: g.id, name: g.name, memberIds: new Set(g.members.map(m => m.id)) })}>Sửa</button>
            <button className="btn btn-link" style={{ color: 'var(--danger-fg)' }} onClick={() => remove(g)}>Xoá</button>
          </td>
        </tr>)}
        {groups.length === 0 && <tr><td colSpan={4} className="empty">Chưa có nhóm nào.</td></tr>}
      </tbody>
    </table></div>
  </div>;
}
