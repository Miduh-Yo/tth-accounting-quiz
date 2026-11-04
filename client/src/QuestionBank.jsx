import { useEffect, useState } from 'react';
import { api } from './api.js';

const esc = c => (/[",\n;]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
const TEMPLATE = '\uFEFF' + [
  ['Chủ đề', 'Loại', 'Độ khó', 'Câu hỏi', 'Đáp án A', 'Đáp án B', 'Đáp án C', 'Đáp án D', 'Đáp án E', 'Đáp án F', 'Đáp án đúng', 'Giải thích', 'Căn cứ', 'Tài liệu'],
  ['Thuế GTGT', 'Một đáp án', 'Dễ', 'Thuế suất GTGT phổ thông là bao nhiêu?', '5%', '8%', '10%', '15%', '', '', 'C', 'Mức phổ thông 10%', 'Điều 8', ''],
  ['Thuế GTGT', 'Nhiều đáp án', 'Trung bình', 'Chọn các khoản được khấu trừ', 'Khoản 1', 'Khoản 2', 'Khoản 3', '', '', '', 'A;C', '', '', ''],
  ['Kế toán chung', 'Đúng/Sai', 'Khó', 'Tài sản = Nợ phải trả + Vốn chủ sở hữu', '', '', '', '', '', '', 'Đúng', '', '', '']
].map(r => r.map(esc).join(',')).join('\r\n') + '\r\n';

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: 'mau-nhap-cau-hoi.csv' });
  a.click(); URL.revokeObjectURL(url);
}

function ImportPanel({ onDone, onCancel }) {
  const [csv, setCsv] = useState('');
  const [name, setName] = useState('');
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function pick(e) {
    const f = e.target.files[0];
    if (!f) return;
    setName(f.name); setReport(null); setError(''); setCsv(await f.text());
  }
  async function run(commit) {
    setBusy(true); setError('');
    try {
      const r = await api('/questions/import', { method: 'POST', body: { csv, commit } });
      setReport(r);
      if (commit && r.imported > 0) onDone(r.imported);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <div className="q-form">
    <h3>Nhập câu hỏi từ CSV</h3>
    <p className="muted">Lưu file Excel dạng CSV UTF-8. Cột "Đáp án đúng" ghi chữ cái (A, hoặc A;C cho nhiều đáp án). Câu nhập vào ở trạng thái Nháp. Cột "Tài liệu" ghi số hiệu hoặc tên tài liệu có trong thư viện (không bắt buộc). Tối đa 500 câu. <button type="button" className="link" onClick={downloadTemplate}>Tải file mẫu</button></p>
    <input type="file" accept=".csv,text/csv" onChange={pick} />
    {error && <div className="error" role="alert">{error}</div>}
    {report && <div>
      <p><b>{report.total}</b> dòng · <b>{report.valid}</b> hợp lệ · <b>{report.errors.length}</b> lỗi</p>
      {report.errors.length > 0 && <><p className="muted">Sửa các lỗi sau rồi chọn lại file (không nhập gì cho đến khi hết lỗi):</p>
        <ul>{report.errors.slice(0, 50).map(x => <li key={x.line}>Dòng {x.line}: {x.error}</li>)}</ul></>}
    </div>}
    <div className="q-actions">
      <button type="button" className="submit small" disabled={!csv || busy} onClick={() => run(false)}>Kiểm tra</button>
      <button type="button" className="submit small" disabled={!report || report.errors.length > 0 || report.valid === 0 || busy} onClick={() => run(true)}>Nhập {report?.valid || ''} câu</button>
      <button type="button" className="link" onClick={onCancel}>Đóng</button>
    </div>
  </div>;
}

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
  const [docs, setDocs] = useState([]);
  useEffect(() => { api('/documents').then(d => setDocs(d.documents)).catch(() => {}); }, []);
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
      const { id, createdAt, updatedAt, createdById, document, ...body } = f;
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
    <select value={f.documentId || ''} onChange={set('documentId')}>
      <option value="">— Không gắn tài liệu —</option>
      {docs.map(d => <option key={d.id} value={d.id}>{d.code ? `${d.code} · ` : ''}{d.title}</option>)}
    </select>
    <input placeholder="Điều/khoản cụ thể (không bắt buộc)" value={f.reference || ''} onChange={set('reference')} />
    {error && <div className="error" role="alert">{error}</div>}
    <div className="q-actions">
      <button className="submit small" type="submit" disabled={busy}>{editing ? 'Lưu thay đổi' : 'Thêm câu hỏi'}</button>
      <button type="button" className="link" onClick={onCancel}>Huỷ</button>
    </div>
  </form>;
}

function GeneratePanel({ topics, onDone, onCancel }) {
  const [docs, setDocs] = useState([]);
  const [f, setF] = useState({ topic: '', count: 5, difficulty: '', documentId: '' });
  const [text, setText] = useState('');
  const [file, setFile] = useState(null); // { filename, text } hoặc { filename, base64 }
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api('/documents').then(d => setDocs(d.documents)).catch(() => {}); }, []);

  async function pick(e) {
    const picked = e.target.files[0];
    setError(''); setFile(null);
    if (!picked) return;
    const ext = picked.name.toLowerCase().split('.').pop();
    if (picked.size > 4 * 1024 * 1024) return setError('File quá lớn (tối đa 4MB).');
    if (ext === 'txt' || ext === 'md') setFile({ filename: picked.name, text: await picked.text() });
    else if (ext === 'docx') {
      const bytes = new Uint8Array(await picked.arrayBuffer());
      let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      setFile({ filename: picked.name, base64: btoa(bin) });
    } else setError('Chỉ hỗ trợ .txt, .md, .docx. Với NotebookLM: xuất/sao chép ghi chú ra văn bản rồi dán hoặc lưu thành .txt/.md.');
  }
  async function run(event) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const body = { topic: f.topic, count: Number(f.count), documentId: f.documentId || undefined, difficulty: f.difficulty || undefined,
        ...(file ? file : { text }) };
      const r = await api('/questions/generate', { method: 'POST', body });
      onDone(r);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const set = k => e => setF({ ...f, [k]: e.target.value });
  return <form className="q-form" onSubmit={run}>
    <h3>Sinh câu hỏi bằng AI từ ghi chú</h3>
    <p className="muted">Dán nội dung ghi chú/quy định (hoặc tải file .txt, .md, .docx; tối đa ~60.000 ký tự). AI chỉ dùng thông tin trong văn bản; câu hỏi vào ở trạng thái <b>Nháp</b> — bạn cần rà soát từng câu trước khi chuyển sang "Đang dùng".</p>
    <div className="q-row">
      <input list="topics-gen" placeholder="Chủ đề" value={f.topic} onChange={set('topic')} required />
      <datalist id="topics-gen">{topics.map(t => <option key={t} value={t} />)}</datalist>
      <label>Số câu<input type="number" min="1" max="20" value={f.count} onChange={set('count')} /></label>
      <select value={f.difficulty} onChange={set('difficulty')}><option value="">Độ khó: tuỳ AI</option><option value="EASY">Dễ</option><option value="MEDIUM">Trung bình</option><option value="HARD">Khó</option></select>
      <select value={f.documentId} onChange={set('documentId')}><option value="">— Không gắn tài liệu —</option>{docs.map(d => <option key={d.id} value={d.id}>{d.code ? `${d.code} · ` : ''}{d.title}</option>)}</select>
    </div>
    <input type="file" accept=".txt,.md,.docx" onChange={pick} />
    {file ? <p className="muted">Đã chọn file: <b>{file.filename}</b></p>
      : <textarea rows={8} placeholder="…hoặc dán nội dung ghi chú vào đây" value={text} onChange={e => setText(e.target.value)} />}
    {error && <div className="error" role="alert">{error}</div>}
    <div className="q-actions">
      <button className="submit small" type="submit" disabled={busy || (!file && text.trim().length === 0)}>{busy ? 'Đang sinh câu hỏi… (có thể mất tới 1 phút)' : 'Sinh câu hỏi'}</button>
      <button type="button" className="link" onClick={onCancel} disabled={busy}>Đóng</button>
    </div>
  </form>;
}

export default function QuestionBank() {
  const [questions, setQuestions] = useState([]);
  const [topics, setTopics] = useState([]);
  const [filter, setFilter] = useState({ topic: '', status: '', difficulty: '', q: '' });
  const [editing, setEditing] = useState(null);
  const [importing, setImporting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState('');
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
      : <div className="q-actions">
          <button className="submit small" onClick={() => setEditing(blank())}>+ Thêm câu hỏi</button>
          <button className="link" onClick={() => { setImporting(!importing); setGenerating(false); setNotice(''); }}>Nhập từ CSV</button>
          <button className="link" onClick={() => { setGenerating(!generating); setImporting(false); setNotice(''); }}>Sinh bằng AI</button>
        </div>}
    {importing && !editing && <ImportPanel onCancel={() => setImporting(false)} onDone={n => { setImporting(false); setNotice(`Đã nhập ${n} câu hỏi (trạng thái Nháp).`); load(); }} />}
    {generating && !editing && <GeneratePanel topics={topics} onCancel={() => setGenerating(false)}
      onDone={r => { setGenerating(false); setNotice(`AI đã tạo ${r.created} câu hỏi (trạng thái Nháp)${r.skipped ? `, bỏ ${r.skipped} câu không hợp lệ` : ''}. Hãy lọc "Nháp" để rà soát.`); setFilter(f => ({ ...f, status: 'DRAFT' })); }} />}
    {notice && <p className="muted">{notice}</p>}
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
