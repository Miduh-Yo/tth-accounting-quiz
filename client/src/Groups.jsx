import { useEffect, useState } from 'react';
import { api } from './api.js';

export default function GroupAdmin() {
  const [groups, setGroups] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [edit, setEdit] = useState(null); // { id?, name, memberIds:Set }
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
      setEdit(null); await load();
    } catch (e) { setError(e.message); }
  }
  async function remove(g) {
    if (!window.confirm(`Xoá nhóm "${g.name}"?`)) return;
    setError('');
    try { await api(`/groups/${g.id}`, { method: 'DELETE' }); await load(); } catch (e) { setError(e.message); }
  }
  const toggle = id => { const s = new Set(edit.memberIds); s.has(id) ? s.delete(id) : s.add(id); setEdit({ ...edit, memberIds: s }); };

  return <div className="card">
    <h2>Quản lý nhóm</h2>
    {edit ? <form className="q-form" onSubmit={save}>
      <h3>{edit.id ? 'Sửa nhóm' : 'Tạo nhóm'}</h3>
      <input placeholder="Tên nhóm (vd: Kế toán thuế)" value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} required />
      <p className="muted">Thành viên ({edit.memberIds.size} đã chọn):</p>
      <div className="pick-list">
        {employees.map(u => <label key={u.id} className="q-opt"><input type="checkbox" checked={edit.memberIds.has(u.id)} onChange={() => toggle(u.id)} /> {u.fullName} ({u.username})</label>)}
        {employees.length === 0 && <span className="muted">Chưa có tài khoản nhân viên nào.</span>}
      </div>
      <div className="q-actions"><button className="submit small" type="submit">Lưu nhóm</button><button type="button" className="link" onClick={() => setEdit(null)}>Huỷ</button></div>
    </form> : <button className="submit small" onClick={() => setEdit({ name: '', memberIds: new Set() })}>+ Tạo nhóm</button>}
    {error && <div className="error" role="alert">{error}</div>}
    <div className="table-wrap"><table>
      <thead><tr><th>Nhóm</th><th>Thành viên</th><th>Đề được giao</th><th></th></tr></thead>
      <tbody>
        {groups.map(g => <tr key={g.id}>
          <td>{g.name}</td><td>{g.members.length}</td><td>{g.examCount}</td>
          <td className="actions">
            <button className="link" onClick={() => setEdit({ id: g.id, name: g.name, memberIds: new Set(g.members.map(m => m.id)) })}>Sửa</button>
            <button className="link" onClick={() => remove(g)}>Xoá</button>
          </td>
        </tr>)}
        {groups.length === 0 && <tr><td colSpan={4} className="muted">Chưa có nhóm nào.</td></tr>}
      </tbody>
    </table></div>
  </div>;
}
