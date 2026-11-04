import { useEffect, useState } from 'react';
import { api } from './api.js';

const TYPE_LABEL = { SINGLE: 'Một đáp án', MULTIPLE: 'Nhiều đáp án', TRUE_FALSE: 'Đúng/Sai' };
const DIFF_LABEL = { EASY: 'Dễ', MEDIUM: 'Trung bình', HARD: 'Khó' };
const STATUS_LABEL = { DRAFT: 'Nháp', ACTIVE: 'Đang dùng', ARCHIVED: 'Lưu trữ' };

const tfOptions = () => [{ text: 'Đúng', isCorrect: true }, { text: 'Sai', isCorrect: false }];
const blank = () => ({
  topic: '', type: 'SINGLE', difficulty: 'MEDIUM', status: 'DRAFT', content: '', explanation: '', reference: '',
  options: [{ text: '', isCorrect: true }, { text: '', isCorrect: false }, { text: '', isCorrect: false }, { text: '', isCorrect: false }]
});

function QuestionForm({ initial, topics, onSaved, onCancel }) {
  const [f, setF] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const editing = Boolean(initial.id);
  const set = k => e => setF({ ...f, [k]: e.target.value });

  function changeType(e) {
    const type = e.target.value;
    if (type === 'TRUE_FALSE') return setF({ ...f, type, options: tfOptions() });
    // Chuyển sang SINGLE: chỉ giữ đáp án đúng đầu tiên.
    let options = f.type === 'TRUE_FALSE' ? blank().options : f.options;
    if (type === 'SINGLE') { let seen = false; options = options.map(o => { const c = o.isCorrect && !seen; seen ||= o.isCorrect; return { ...o, isCorrect: c }; }); }
    setF({ ...f, type, options });
  }
  function toggleCorrect(i) {
    setF({ ...f, options: f.options.map((o, j) =>
      f.type === 'MULTIPLE' ? (j === i ? { ...o, isCorrect: !o.isCorrect } : o) : { ...o, isCorrect: j === i }) });
  }
  const setOptText = (i, text) => setF({ ...f, options: f.options.map((o, j) => j === i ? { ...o, text } : o) });
  const addOpt = () => setF({ ...f, options: [...f.options, { text: '', isCorrect: false }] });
  const delOpt = i => setF({ ...f, options: f.options.filter((_, j) => j !== i) });

  async function submit(event) {
    event.preventDefault();
    setError(''); setBusy(true);
    try {
      const { id, createdAt, updatedAt, createdById, ...body } = f;
      body.options = body.options.map(({ text, isCorrect }) => ({ text, isCorrect }));
      await api(editing ? `/questions/${id}` : '/questions', { method: editing ? 'PUT' : 'POST', body });
      onSaved();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return <form className="q-form" onSubmit={submit}>
    <h3>{editing ? 'Sửa câu hỏi' : 'Thêm câu hỏi'}</h3>
    <div className="q-row">
      <input list="topics" placeholder="Chủ đề (vd: Thuế GTGT)" value={f.topic} onChange={set('topic')} required />
      <datalist id="topics">{topics.map(t => <option key={t} value={t} />)}</datalist>
      <select value={f.type} onChange={changeType}>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <select value={f.difficulty} onChange={set('difficulty')}>{Object.entries(DIFF_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <select value={f.status} onChange={set('status')}>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
    </div>
    <textarea rows={3} placeholder="Nội dung câu hỏi" value={f.content} onChange={set('content')} required />
    <div className="q-options">
      {f.options.map((o, i) => <div key={i} className="q-opt">
        <input type={f.type === 'MULTIPLE' ? 'checkbox' : 'radio'} checked={o.isCorrect} onChange={() => toggleCorrect(i)} aria-label="Đáp án đúng" />
        <input value={o.text} onChange={e => setOptText(i, e.target.value)} placeholder={`Đáp án ${i + 1}`} readOnly={f.type === 'TRUE_FALSE'} required />
        {f.type !== 'TRUE_FALSE' && f.options.length > 2 && <button type="button" className="link" onClick={() => delOpt(i)}>Xoá</button>}
      </div>)}
      {f.type !== 'TRUE_FALSE' && f.options.length < 8 && <button type="button" className="link" onClick={addOpt}>+ Thêm đáp án</button>}
    </div>
    <textarea rows={2} placeholder="Giải thích đáp án (không bắt buộc)" value={f.explanation || ''} onChange={set('explanation')} />
    <input placeholder="Căn cứ / điều khoản tham chiếu (không bắt buộc)" value={f.reference || ''} onChange={set('reference')} />
    {error && <div className="error" role="alert">{error}</div>}
    <div className="q-actions">
      <button className="submit small" type="submit" disabled={busy}>{editing ? 'Lưu thay đổi' : 'Thêm câu hỏi'}</button>
      <button type="button" className="link" onClick={onCancel}>Huỷ</button>
    </div>
  </form>;
}

export default function QuestionBank() {
  const [questions, setQuestions] = useState([]);
  const [topics, setTopics] = useState([]);
  const [filter, setFilter] = useState({ topic: '', status: '', difficulty: '', q: '' });
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    const params = new URLSearchParams(Object.entries(filter).filter(([, v]) => v));
    try {
      const d = await api(`/questions?${params}`);
      setQuestions(d.questions); setTopics(d.topics); setError('');
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, [filter]);

  async function archive(id) {
    if (!window.confirm('Lưu trữ câu hỏi này? Câu hỏi sẽ không còn được dùng cho đề thi mới.')) return;
    try { await api(`/questions/${id}`, { method: 'DELETE' }); await load(); } catch (e) { setError(e.message); }
  }
  const setFil = k => e => setFilter({ ...filter, [k]: e.target.value });

  return <div className="card">
    <h2>Ngân hàng câu hỏi</h2>
    {editing
      ? <QuestionForm key={editing.id || 'new'} initial={editing} topics={topics}
          onSaved={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />
      : <button className="submit small" onClick={() => setEditing(blank())}>+ Thêm câu hỏi</button>}
    <div className="q-row q-filter">
      <input placeholder="Tìm theo nội dung…" value={filter.q} onChange={setFil('q')} />
      <select value={filter.topic} onChange={setFil('topic')}><option value="">Mọi chủ đề</option>{topics.map(t => <option key={t}>{t}</option>)}</select>
      <select value={filter.difficulty} onChange={setFil('difficulty')}><option value="">Mọi độ khó</option>{Object.entries(DIFF_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <select value={filter.status} onChange={setFil('status')}><option value="">Mọi trạng thái</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
    </div>
    {error && <div className="error" role="alert">{error}</div>}
    <div className="table-wrap">
      <table>
        <thead><tr><th>Câu hỏi</th><th>Chủ đề</th><th>Loại</th><th>Độ khó</th><th>Trạng thái</th><th></th></tr></thead>
        <tbody>
          {questions.map(q => <tr key={q.id}>
            <td title={q.options.map(o => (o.isCorrect ? '✔ ' : '• ') + o.text).join('\n')}>{q.content}</td>
            <td>{q.topic}</td><td>{TYPE_LABEL[q.type]}</td><td>{DIFF_LABEL[q.difficulty]}</td><td>{STATUS_LABEL[q.status]}</td>
            <td className="actions">
              <button className="link" onClick={() => setEditing(q)}>Sửa</button>
              {q.status !== 'ARCHIVED' && <button className="link" onClick={() => archive(q.id)}>Lưu trữ</button>}
            </td>
          </tr>)}
          {questions.length === 0 && <tr><td colSpan={6} className="muted">Chưa có câu hỏi nào.</td></tr>}
        </tbody>
      </table>
    </div>
  </div>;
}
