import { useEffect, useState } from 'react';
import { api } from './api.js';

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [action, setAction] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    api(`/audit${action ? `?action=${encodeURIComponent(action)}` : ''}`)
      .then(d => { setLogs(d.logs); setError(''); }).catch(e => setError(e.message));
  }, [action]);
  return <div className="card">
    <h2>Nhật ký hoạt động</h2>
    <select value={action} onChange={e => setAction(e.target.value)}>
      <option value="">Tất cả</option>
      {['LOGIN', 'LOGIN_FAILED', 'PASSWORD_CHANGED', 'USER_CREATED', 'USER_UPDATED', 'QUESTION_CREATED', 'QUESTION_UPDATED',
        'QUESTION_ARCHIVED', 'EXAM_CREATED', 'EXAM_STATUS', 'EXAM_SUBMITTED', 'RESULTS_EXPORTED', 'GROUP_CREATED', 'GROUP_UPDATED', 'GROUP_DELETED', 'QUESTIONS_IMPORTED', 'DOCUMENT_CREATED', 'DOCUMENT_UPDATED', 'DOCUMENT_ARCHIVED', 'LIVE_STARTED', 'QUESTIONS_GENERATED'].map(a => <option key={a}>{a}</option>)}
    </select>
    {error && <div className="error" role="alert">{error}</div>}
    <div className="table-wrap"><table>
      <thead><tr><th>Thời gian</th><th>Hành động</th><th>Người thực hiện</th><th>Chi tiết</th><th>IP</th></tr></thead>
      <tbody>{logs.map(l => <tr key={l.id}>
        <td>{new Date(l.createdAt).toLocaleString('vi-VN')}</td><td>{l.action}</td><td>{l.actorName || '—'}</td>
        <td>{l.targetType ? `${l.targetType} ` : ''}{l.detail || ''}</td><td>{l.ip}</td>
      </tr>)}</tbody>
    </table></div>
  </div>;
}
