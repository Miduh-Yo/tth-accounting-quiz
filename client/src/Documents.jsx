import { useEffect, useState } from 'react';
import { api } from './api.js';

const blank = () => ({ title: '', code: '', url: '', summary: '', effectiveDate: '', status: 'ACTIVE' });
const toDateInput = d => (d ? String(d).slice(0, 10) : '');
const fmtDate = d => (d ? new Date(d).toLocaleDateString('vi-VN') : '');

export default function Documents({ isAdmin }) {
  const [docs, setDocs] = useState([]);
  const [edit, setEdit] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(true);

  const load = () => api(`/documents${isAdmin ? '?all=1' : ''}`).then(d => setDocs(d.documents)).catch(e => setError(e.message));
  useEffect(() => { if (open) load(); }, [open]);

  async function save(event) {
    event.preventDefault(); setError('');
    const { id, _count, createdAt, updatedAt, createdById, ...body } = edit;
    try {
      await api(id ? `/documents/${id}` : '/documents', { method: id ? 'PUT' : 'POST', body });
      setEdit(null); await load();
    } catch (e) { setError(e.message); }
  }
  async function archive(d) {
    if (!window.confirm(`Lưu trữ tài liệu "${d.title}"?`)) return;
    try { await api(`/documents/${d.id}`, { method: 'DELETE' }); await load(); } catch (e) { setError(e.message); }
  }
  const set = k => e => setEdit({ ...edit, [k]: e.target.value });

  return <div className="card">
    <h2>Tài liệu & quy định <button className="link" onClick={() => setOpen(!open)}>{open ? 'Thu gọn' : 'Mở'}</button></h2>
    {open && <>
      {isAdmin && (edit
        ? <form className="q-form" onSubmit={save}>
            <h3>{edit.id ? 'Sửa tài liệu' : 'Thêm tài liệu'}</h3>
            <input placeholder="Tên tài liệu / văn bản" value={edit.title} onChange={set('title')} required />
            <div className="q-row">
              <input placeholder="Số hiệu (vd: 78/2014/TT-BTC)" value={edit.code || ''} onChange={set('code')} />
              <input type="date" aria-label="Ngày hiệu lực" value={toDateInput(edit.effectiveDate)} onChange={set('effectiveDate')} />
              <select value={edit.status} onChange={set('status')}><option value="ACTIVE">Đang hiệu lực</option><option value="ARCHIVED">Lưu trữ</option></select>
            </div>
            <input placeholder="Liên kết (https://…) — không bắt buộc" value={edit.url || ''} onChange={set('url')} />
            <textarea rows={3} placeholder="Tóm tắt nội dung chính" value={edit.summary || ''} onChange={set('summary')} />
            <div className="q-actions"><button className="submit small" type="submit">Lưu</button><button type="button" className="link" onClick={() => setEdit(null)}>Huỷ</button></div>
          </form>
        : <button className="submit small" onClick={() => setEdit(blank())}>+ Thêm tài liệu</button>)}
      {error && <div className="error" role="alert">{error}</div>}
      <div className="table-wrap"><table>
        <thead><tr><th>Tài liệu</th><th>Số hiệu</th><th>Hiệu lực từ</th><th>Tóm tắt</th>{isAdmin && <><th>Câu hỏi</th><th></th></>}</tr></thead>
        <tbody>
          {docs.map(d => <tr key={d.id} style={d.status === 'ARCHIVED' ? { opacity: 0.55 } : undefined}>
            <td>{d.url ? <a href={d.url} target="_blank" rel="noopener noreferrer">{d.title}</a> : d.title}{d.status === 'ARCHIVED' && ' (lưu trữ)'}</td>
            <td>{d.code}</td><td>{fmtDate(d.effectiveDate)}</td><td>{d.summary}</td>
            {isAdmin && <><td>{d._count?.questions ?? 0}</td><td className="actions">
              <button className="link" onClick={() => setEdit({ ...d })}>Sửa</button>
              {d.status === 'ACTIVE' && <button className="link" onClick={() => archive(d)}>Lưu trữ</button>}
            </td></>}
          </tr>)}
          {docs.length === 0 && <tr><td colSpan={isAdmin ? 6 : 4} className="muted">Chưa có tài liệu nào.</td></tr>}
        </tbody>
      </table></div>
    </>}
  </div>;
}
