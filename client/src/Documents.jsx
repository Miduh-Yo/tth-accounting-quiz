import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from './api.js';
import { Chip, useDialog } from './ui.jsx';

const blank = () => ({ title: '', code: '', url: '', summary: '', effectiveDate: '', status: 'ACTIVE' });
const toDateInput = d => (d ? String(d).slice(0, 10) : '');
const fmtDate = d => (d ? new Date(d).toLocaleDateString('vi-VN') : '');

export default function Documents({ isAdmin }) {
  const [docs, setDocs] = useState([]);
  const [edit, setEdit] = useState(null);
  const { confirm, toast } = useDialog();
  const [error, setError] = useState('');
  const open = true;

  const load = () => api(`/documents${isAdmin ? '?all=1' : ''}`).then(d => setDocs(d.documents)).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);

  async function save(event) {
    event.preventDefault(); setError('');
    const { id, _count, createdAt, updatedAt, createdById, ...body } = edit;
    try {
      await api(id ? `/documents/${id}` : '/documents', { method: id ? 'PUT' : 'POST', body });
      setEdit(null); await load(); toast('Đã lưu tài liệu.');
    } catch (e) { setError(e.message); }
  }
  async function archive(d) {
    if (!await confirm({ title: 'Lưu trữ tài liệu', message: `Lưu trữ "${d.title}"? Tài liệu sẽ không còn hiển thị cho nhân viên.`, confirmLabel: 'Lưu trữ', danger: true })) return;
    try { await api(`/documents/${d.id}`, { method: 'DELETE' }); await load(); toast('Đã lưu trữ tài liệu.'); } catch (e) { setError(e.message); }
  }
  const set = k => e => setEdit({ ...edit, [k]: e.target.value });

  return <div className="panel panel-body">
    {open && <>
      {isAdmin && (edit
        ? <form className="form-panel" onSubmit={save}>
            <h3>{edit.id ? 'Sửa tài liệu' : 'Thêm tài liệu'}</h3>
            <p className="section-title">Thông tin văn bản</p>
            <label className="field">Tên tài liệu / văn bản
              <input value={edit.title} onChange={set('title')} required />
            </label>
            <div className="form-grid cols-3">
              <label className="field">Số hiệu
                <input placeholder="Ví dụ: 78/2014/TT-BTC" value={edit.code || ''} onChange={set('code')} />
              </label>
              <label className="field">Ngày hiệu lực
                <input type="date" value={toDateInput(edit.effectiveDate)} onChange={set('effectiveDate')} />
              </label>
              <label className="field">Tình trạng
                <select value={edit.status} onChange={set('status')}><option value="ACTIVE">Đang hiệu lực</option><option value="ARCHIVED">Lưu trữ</option></select>
              </label>
            </div>
            <label className="field">Liên kết <small>Không bắt buộc, dạng https://…</small>
              <input value={edit.url || ''} onChange={set('url')} />
            </label>
            <p className="section-title">Nội dung</p>
            <label className="field">Tóm tắt nội dung chính
              <textarea rows={3} value={edit.summary || ''} onChange={set('summary')} />
            </label>
            <div className="actions-row"><button className="btn btn-primary" type="submit">Lưu</button><button type="button" className="btn btn-link" onClick={() => setEdit(null)}>Huỷ</button></div>
          </form>
        : <button className="btn btn-primary" onClick={() => setEdit(blank())}><Plus />Thêm tài liệu</button>)}
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      <div className="table-wrap"><table>
        <thead><tr><th>Tài liệu</th><th>Số hiệu</th><th>Hiệu lực từ</th><th>Tóm tắt</th>{isAdmin && <><th className="num">Câu hỏi</th><th></th></>}</tr></thead>
        <tbody>
          {docs.map(d => <tr key={d.id} className={d.status === 'ARCHIVED' ? 'dim' : undefined}>
            <td>{d.url ? <a href={d.url} target="_blank" rel="noopener noreferrer">{d.title}</a> : d.title}{d.status === 'ARCHIVED' && <> <Chip tone="neutral">Lưu trữ</Chip></>}</td>
            <td>{d.code}</td><td>{fmtDate(d.effectiveDate)}</td><td>{d.summary}</td>
            {isAdmin && <><td className="num">{d._count?.questions ?? 0}</td><td className="actions">
              <button className="btn btn-link" onClick={() => setEdit({ ...d })}>Sửa</button>
              {d.status === 'ACTIVE' && <button className="btn btn-link" onClick={() => archive(d)}>Lưu trữ</button>}
            </td></>}
          </tr>)}
          {docs.length === 0 && <tr><td colSpan={isAdmin ? 6 : 4} className="empty">Chưa có tài liệu nào.</td></tr>}
        </tbody>
      </table></div>
    </>}
  </div>;
}
