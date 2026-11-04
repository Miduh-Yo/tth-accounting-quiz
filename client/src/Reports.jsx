import { useEffect, useState } from 'react';
import { api } from './api.js';

function Bar({ percent }) {
  const color = percent >= 70 ? '#0a7a3d' : percent >= 50 ? '#b7791f' : '#b42318';
  return <div style={{ background: '#eef2f6', borderRadius: 6, height: 10, minWidth: 80 }} role="img" aria-label={`${percent}%`}>
    <div style={{ width: `${percent}%`, background: color, height: 10, borderRadius: 6 }} />
  </div>;
}

export default function Reports() {
  const [exams, setExams] = useState([]);
  const [examId, setExamId] = useState('');
  const [topics, setTopics] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [who, setWho] = useState(null); // nhân viên đang xem theo chủ đề
  const [error, setError] = useState('');

  useEffect(() => { api('/exams/manage').then(d => setExams(d.exams)).catch(e => setError(e.message)); }, []);
  useEffect(() => {
    const p = new URLSearchParams();
    if (examId) p.set('examId', examId);
    if (who) p.set('userId', who.id);
    Promise.all([api(`/reports/topics?${p}`), api(`/reports/employees${examId ? `?examId=${examId}` : ''}`)])
      .then(([t, e]) => { setTopics(t.topics); setEmployees(e.employees); setError(''); })
      .catch(e => setError(e.message));
  }, [examId, who]);

  return <div className="card">
    <h2>Báo cáo tổng hợp</h2>
    <div className="q-actions">
      <select value={examId} onChange={e => setExamId(e.target.value)}>
        <option value="">Tất cả đề thi</option>
        {exams.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}
      </select>
      {who && <span className="muted">Đang xem: <b>{who.fullName}</b> <button className="link" onClick={() => setWho(null)}>Bỏ lọc</button></span>}
    </div>
    {error && <div className="error" role="alert">{error}</div>}
    <h3>Tỷ lệ đúng theo chủ đề {who ? `— ${who.fullName}` : ''}</h3>
    <p className="muted">Sắp từ yếu đến mạnh để biết chủ đề cần đào tạo thêm. Chỉ tính các bài đã nộp.</p>
    <div className="table-wrap"><table>
      <thead><tr><th>Chủ đề</th><th>Đúng/Tổng</th><th>Tỷ lệ</th><th></th><th>Số người</th></tr></thead>
      <tbody>
        {topics.map(t => <tr key={t.topic}>
          <td>{t.topic}</td><td>{t.correct}/{t.total}</td><td>{t.percent}%</td><td><Bar percent={t.percent} /></td><td>{t.people}</td>
        </tr>)}
        {topics.length === 0 && <tr><td colSpan={5} className="muted">Chưa có dữ liệu.</td></tr>}
      </tbody>
    </table></div>
    <h3>Theo nhân viên</h3>
    <div className="table-wrap"><table>
      <thead><tr><th>Nhân viên</th><th>Số bài</th><th>Điểm TB</th><th>Số bài đạt</th><th></th></tr></thead>
      <tbody>
        {employees.map(e => <tr key={e.id}>
          <td>{e.fullName} ({e.username})</td><td>{e.attempts}</td><td>{e.avgPercent}%</td><td>{e.passed}/{e.attempts}</td>
          <td className="actions"><button className="link" onClick={() => setWho(e)}>Xem theo chủ đề</button></td>
        </tr>)}
        {employees.length === 0 && <tr><td colSpan={5} className="muted">Chưa có bài nộp nào.</td></tr>}
      </tbody>
    </table></div>
  </div>;
}
