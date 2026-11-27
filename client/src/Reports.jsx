import { useEffect, useState } from 'react';
import { api } from './api.js';

function Bar({ percent }) {
  const tone = percent >= 70 ? 'ok' : percent >= 50 ? 'mid' : 'bad';
  return <div className="meter" role="img" aria-label={`${percent}%`}><span className={tone} style={{ width: `${percent}%` }} /></div>;
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

  return <div className="panel panel-body">
    <div className="actions-row">
      <select value={examId} onChange={e => setExamId(e.target.value)}>
        <option value="">Tất cả đề thi</option>
        {exams.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}
      </select>
      {who && <span className="muted">Đang xem: <b>{who.fullName}</b> <button className="btn btn-link" onClick={() => setWho(null)}>Bỏ lọc</button></span>}
    </div>
    {error && <div className="alert alert-danger" role="alert">{error}</div>}
    <h3>Tỷ lệ đúng theo chủ đề {who ? `— ${who.fullName}` : ''}</h3>
    <p className="muted">Sắp từ yếu đến mạnh để biết chủ đề cần đào tạo thêm. Chỉ tính các bài đã nộp.</p>
    <div className="table-wrap"><table>
      <thead><tr><th>Chủ đề</th><th className="num">Đúng/Tổng</th><th className="num">Tỷ lệ</th><th></th><th className="num">Số người</th></tr></thead>
      <tbody>
        {topics.map(t => <tr key={t.topic}>
          <td>{t.topic}</td><td className="num">{t.correct}/{t.total}</td><td className="num"><b>{t.percent}%</b></td><td style={{ width: '28%' }}><Bar percent={t.percent} /></td><td className="num">{t.people}</td>
        </tr>)}
        {topics.length === 0 && <tr><td colSpan={5} className="empty">Chưa có dữ liệu.</td></tr>}
      </tbody>
    </table></div>
    <h3>Theo nhân viên</h3>
    <div className="table-wrap"><table>
      <thead><tr><th>Nhân viên</th><th className="num">Số bài</th><th className="num">Điểm TB</th><th className="num">Số bài đạt</th><th></th></tr></thead>
      <tbody>
        {employees.map(e => <tr key={e.id}>
          <td>{e.fullName} <span className="sub">{e.username}</span></td><td className="num">{e.attempts}</td><td className="num">{e.avgPercent}%</td><td className="num">{e.passed}/{e.attempts}</td>
          <td className="actions"><button className="btn btn-link" onClick={() => setWho(e)}>Xem theo chủ đề</button></td>
        </tr>)}
        {employees.length === 0 && <tr><td colSpan={5} className="empty">Chưa có bài nộp nào.</td></tr>}
      </tbody>
    </table></div>
  </div>;
}
