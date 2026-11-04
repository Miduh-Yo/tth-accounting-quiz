// Test tích hợp với PostgreSQL thật. Chỉ chạy khi đặt TEST_DATABASE_URL (CSDL RỖNG dành riêng cho test: dữ liệu bị XOÁ!).
//   Trước: DATABASE_URL=<cùng giá trị> npx prisma migrate deploy
//   Chạy:  TEST_DATABASE_URL=postgresql://user:pw@localhost:5432/tth_quiz_test npm test -w server
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { io as ioClient } from 'socket.io-client';

const DB = process.env.TEST_DATABASE_URL;
const PORT = 4100 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORT}/api`;
const PW = 'TestPassw0rd!';
let server, prisma;

function client() {
  let cookie = '';
  const call = async (method, path, body, raw = false) => {
    const res = await fetch(BASE + path, {
      method, headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    if (raw) { const buf = Buffer.from(await res.arrayBuffer()); return { status: res.status, bom: buf.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), text: buf.toString('utf8') }; }
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  return {
    cookie: () => cookie,
    get: (p, raw) => call('GET', p, undefined, raw), post: (p, b) => call('POST', p, b ?? {}),
    patch: (p, b) => call('PATCH', p, b), del: p => call('DELETE', p)
  };
}

const connect = (cookie) => new Promise((resolve, reject) => {
  const sock = ioClient(`http://127.0.0.1:${PORT}`, { transports: ['websocket'], extraHeaders: cookie ? { Cookie: cookie } : {}, reconnection: false });
  sock.once('connect', () => resolve(sock));
  sock.once('connect_error', err => reject(err));
});
const emit = (sock, ev, arg) => new Promise(res => sock.emit(ev, arg, res));
const waitFor = (sock, ev, pred = () => true, ms = 4000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`Hết thời gian chờ sự kiện ${ev}`)), ms);
  const h = data => { if (pred(data)) { clearTimeout(timer); sock.off(ev, h); resolve(data); } };
  sock.on(ev, h);
});

const q = (over = {}) => ({
  topic: 'Thuế', type: 'SINGLE', difficulty: 'EASY', status: 'ACTIVE', content: 'Câu hỏi?',
  options: [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: false }], ...over
});

before(async () => {
  if (!DB) return;
  process.env.DATABASE_URL = DB;
  ({ prisma } = await import('../src/db.js'));
  const { hashPassword } = await import('../src/password.js');
  await prisma.$executeRawUnsafe('TRUNCATE "User","Question","Exam","Group","AuditLog" RESTART IDENTITY CASCADE');
  await prisma.user.create({ data: { username: 'root', fullName: 'Root', role: 'SUPER_ADMIN', passwordHash: await hashPassword(PW) } });
  server = spawn(process.execPath, ['src/index.js'], {
    env: { ...process.env, DATABASE_URL: DB, PORT: String(PORT), JWT_SECRET: 'x'.repeat(40),
      // Khoá giả + địa chỉ không tồn tại: đảm bảo test không bao giờ gọi API thật.
      ANTHROPIC_API_KEY: 'sk-ant-fake-for-tests', ANTHROPIC_BASE_URL: 'http://127.0.0.1:9' }, stdio: 'pipe'
  });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(BASE + '/health')).ok) return; } catch { /* chờ */ }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('Server không khởi động được');
});
after(async () => {
  if (server) { server.kill(); await once(server, 'exit'); }
  if (prisma) await prisma.$disconnect();
});

test('luồng đầy đủ: RBAC, câu hỏi, nhập CSV, nhóm, giao đề, làm bài, chấm điểm, báo cáo, nhật ký', { skip: !DB }, async t => {
  const root = client(), admin = client(), e1 = client(), e2 = client();

  await t.test('đăng nhập & tạo tài khoản theo cấp', async () => {
    assert.equal((await root.post('/auth/login', { username: 'root', password: 'sai' })).status, 401);
    assert.equal((await root.post('/auth/login', { username: 'root', password: PW })).status, 200);
    assert.equal((await root.post('/users', { username: 'adm', fullName: 'Admin', role: 'ADMIN', password: PW })).status, 201);
    assert.equal((await admin.post('/auth/login', { username: 'adm', password: PW })).status, 200);
    assert.equal((await admin.post('/users', { username: 'xxx', fullName: 'X', role: 'ADMIN', password: PW })).status, 403);
    for (const u of ['nv1', 'nv2']) assert.equal((await admin.post('/users', { username: u, fullName: u, role: 'EMPLOYEE', password: PW })).status, 201);
    assert.equal((await e1.post('/auth/login', { username: 'nv1', password: PW })).status, 200);
    assert.equal((await e2.post('/auth/login', { username: 'nv2', password: PW })).status, 200);
  });

  await t.test('RBAC: nhân viên không vào được khu quản trị; ADMIN không xem nhật ký', async () => {
    for (const p of ['/users', '/questions', '/groups', '/exams/manage']) assert.equal((await e1.get(p)).status, 403, p);
    assert.equal((await admin.get('/audit')).status, 403);
    assert.equal((await client().get('/exams')).status, 401);
  });

  const ids = {};
  await t.test('câu hỏi: kiểm tra hợp lệ & tạo', async () => {
    assert.equal((await admin.post('/questions', q({ options: [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: true }] }))).status, 400);
    ids.s = (await admin.post('/questions', q({ content: 'Một đáp án' }))).body.question.id;
    ids.m = (await admin.post('/questions', q({ type: 'MULTIPLE', content: 'Nhiều đáp án',
      options: [{ text: '1', isCorrect: true }, { text: '2', isCorrect: true }, { text: '3', isCorrect: false }] }))).body.question.id;
    ids.t = (await admin.post('/questions', q({ type: 'TRUE_FALSE', content: 'Đúng sai',
      options: [{ text: 'Đúng', isCorrect: true }, { text: 'Sai', isCorrect: false }] }))).body.question.id;
    assert.ok(ids.s && ids.m && ids.t);
    assert.equal((await admin.get('/questions?status=ACTIVE')).body.questions.length, 3);
  });

  await t.test('nhập CSV: báo lỗi theo dòng, có lỗi thì không nhập gì', async () => {
    const head = 'Chủ đề,Loại,Độ khó,Câu hỏi,A,B,C,D,E,F,Đúng,GT,CC\n';
    const bad = await admin.post('/questions/import', { csv: head + 'T,Một đáp án,Dễ,Q1,a,b,,,,,A,,\nT,Loại sai,Dễ,Q2,a,b,,,,,A,,\n' });
    assert.deepEqual(bad.body.errors.map(e => e.line), [3]);
    const withErr = await admin.post('/questions/import', { csv: head + 'T,Một đáp án,Dễ,Q3,a,b,,,,,A,,\nT,x,,Q4,a,b,,,,,A,,\n', commit: true });
    assert.equal(withErr.body.imported, 0);
    assert.equal((await admin.get('/questions?q=Q3')).body.questions.length, 0);
    const ok = await admin.post('/questions/import', { csv: head + 'T,Một đáp án,Dễ,Q1,a,b,,,,,A,,\n', commit: true });
    assert.equal(ok.body.imported, 1);
    const got = (await admin.get('/questions?q=Q1')).body.questions;
    assert.equal(got[0].status, 'DRAFT');
    assert.equal((await e1.post('/questions/import', { csv: head })).status, 403);
  });

  const gid = {};
  await t.test('nhóm: chỉ nhận nhân viên hợp lệ', async () => {
    const users = (await admin.get('/users')).body.users;
    const nv1 = users.find(u => u.username === 'nv1').id, adm = users.find(u => u.username === 'adm').id;
    const g = await admin.post('/groups', { name: 'Nhóm 1', memberIds: [nv1, adm, 'khong-ton-tai'] });
    assert.equal(g.status, 201);
    assert.deepEqual(g.body.group.members.map(m => m.username), ['nv1']);
    gid.g = g.body.group.id;
    assert.equal((await admin.post('/groups', { name: 'Nhóm 1', memberIds: [] })).status, 409);
  });

  const exam = {};
  await t.test('giao đề theo nhóm: chỉ thành viên thấy và vào được', async () => {
    assert.equal((await admin.post('/exams', { title: 'Sai', durationMinutes: 10, questionIds: [ids.s], assignAll: false, groupIds: [] })).status, 400);
    const c = await admin.post('/exams', { title: 'Đề nhóm', durationMinutes: 10, passPercent: 70,
      questionIds: [ids.s, ids.m, ids.t], assignAll: false, groupIds: [gid.g] });
    assert.equal(c.status, 201);
    exam.id = c.body.exam.id;
    assert.equal((await e1.get('/exams')).body.exams.length, 0);
    assert.equal((await admin.patch(`/exams/${exam.id}/status`, { status: 'PUBLISHED' })).status, 200);
    assert.equal((await e1.get('/exams')).body.exams.length, 1);
    assert.equal((await e2.get('/exams')).body.exams.length, 0);
    assert.equal((await e2.post(`/exams/${exam.id}/start`)).status, 404);
    assert.equal((await admin.del(`/groups/${gid.g}`)).status, 400);
  });

  await t.test('làm bài: không lộ đáp án, chấm đúng, không nộp hai lần', async () => {
    const s = await e1.post(`/exams/${exam.id}/start`);
    assert.equal(s.status, 200);
    assert.equal(s.body.questions.length, 3);
    assert.ok(!JSON.stringify(s.body).includes('isCorrect'));
    const opt = (qid, text) => s.body.questions.find(x => x.id === qid).options.find(o => o.text === text).id;
    // đúng câu 1 và 3; câu nhiều đáp án chọn thiếu nên sai => 2/3 = 67% < 70
    const answers = { [ids.s]: [opt(ids.s, 'A')], [ids.m]: [opt(ids.m, '1')], [ids.t]: [opt(ids.t, 'Đúng')] };
    assert.equal((await e1.get(`/exams/attempts/${s.body.attemptId}/review`)).status, 400);
    const r = await e1.post(`/exams/attempts/${s.body.attemptId}/submit`, { answers });
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.attempt.correct, r.body.attempt.total, r.body.attempt.percent, r.body.attempt.passed], [2, 3, 67, false]);
    assert.equal((await e1.post(`/exams/attempts/${s.body.attemptId}/submit`, { answers })).status, 409);
    assert.equal((await e1.post(`/exams/${exam.id}/start`)).body.done, true);
    exam.attempt = s.body.attemptId;
  });

  await t.test('xem lại: chỉ chủ bài hoặc quản trị', async () => {
    assert.equal((await e1.get(`/exams/attempts/${exam.attempt}/review`)).status, 200);
    assert.equal((await e2.get(`/exams/attempts/${exam.attempt}/review`)).status, 404);
    assert.equal((await admin.get(`/exams/attempts/${exam.attempt}/review`)).status, 200);
  });

  await t.test('nộp trễ quá hạn: chấm 0 và đánh dấu late', async () => {
    const all = await admin.post('/exams', { title: 'Đề chung', durationMinutes: 5, questionIds: [ids.s], assignAll: true });
    await admin.patch(`/exams/${all.body.exam.id}/status`, { status: 'PUBLISHED' });
    const s = await e2.post(`/exams/${all.body.exam.id}/start`);
    await prisma.attempt.update({ where: { id: s.body.attemptId }, data: { startedAt: new Date(Date.now() - 2 * 3600_000) } });
    const optA = s.body.questions[0].options.find(o => o.text === 'A').id;
    const r = await e2.post(`/exams/attempts/${s.body.attemptId}/submit`, { answers: { [ids.s]: [optA] } });
    assert.deepEqual([r.body.attempt.late, r.body.attempt.correct], [true, 0]);
  });

  await t.test('cảnh báo rời tab: đếm trong lúc làm bài, chỉ chủ bài, dừng sau khi nộp, hiện ở kết quả', async () => {
    const ex = await admin.post('/exams', { title: 'Đề rời tab', durationMinutes: 5, questionIds: [ids.s], assignAll: true });
    await admin.patch(`/exams/${ex.body.exam.id}/status`, { status: 'PUBLISHED' });
    const s = await e2.post(`/exams/${ex.body.exam.id}/start`);
    const url = `/exams/attempts/${s.body.attemptId}/focus-lost`;
    assert.equal((await e2.post(url)).body.focusLosses, 1);
    assert.equal((await e2.post(url)).body.focusLosses, 2);
    assert.equal((await admin.post(url)).status, 404);
    await e2.post(`/exams/attempts/${s.body.attemptId}/submit`, { answers: {} });
    assert.equal((await e2.post(url)).body.focusLosses, 2);
    const row = (await admin.get(`/exams/${ex.body.exam.id}/results`)).body.results[0];
    assert.equal(row.focusLosses, 2);
    assert.ok((await admin.get(`/exams/${ex.body.exam.id}/results.csv`, true)).text.includes('Số lần rời tab'));
  });

  await t.test('báo cáo CSV & nhật ký', async () => {
    const csv = await admin.get(`/exams/${exam.id}/results.csv`, true);
    assert.equal(csv.status, 200);
    assert.ok(csv.bom, 'CSV phải có BOM cho Excel');
    assert.ok(csv.text.includes('nv1') && csv.text.includes('Chưa đạt'));
    assert.equal((await e1.get(`/exams/${exam.id}/results.csv`, true)).status, 403);
    const logs = (await root.get('/audit')).body.logs.map(l => l.action);
    for (const a of ['LOGIN', 'LOGIN_FAILED', 'USER_CREATED', 'QUESTION_CREATED', 'QUESTIONS_IMPORTED', 'GROUP_CREATED', 'EXAM_CREATED', 'EXAM_STATUS', 'EXAM_SUBMITTED', 'RESULTS_EXPORTED']) {
      assert.ok(logs.includes(a), `thiếu log ${a}`);
    }
  });

  await t.test('báo cáo theo chủ đề và nhân viên', async () => {
    assert.equal((await e2.get('/reports/topics')).status, 403);
    const tp = (await admin.get(`/reports/topics?examId=${exam.id}`)).body.topics;
    // Đề nhóm: nv1 đúng 2/3 câu, cùng chủ đề "Thuế"
    assert.deepEqual(tp.map(x => [x.topic, x.correct, x.total, x.percent]), [['Thuế', 2, 3, 67]]);
    const all = (await admin.get('/reports/topics')).body.topics;
    assert.equal(all.length, 1);
    assert.ok(all[0].total > 3 && all[0].percent < 100); // gộp thêm các bài khác
    const users = (await admin.get('/users')).body.users;
    const nv1 = users.find(u => u.username === 'nv1').id;
    assert.equal((await admin.get(`/reports/topics?userId=${nv1}`)).body.topics[0].percent, 67);
    assert.equal((await admin.get(`/reports/topics?examId=${exam.id}`)).body.topics[0].total, 3);
    const emp = (await admin.get(`/reports/employees?examId=${exam.id}`)).body.employees;
    assert.deepEqual(emp.map(x => [x.username, x.attempts, x.avgPercent, x.passed]), [['nv1', 1, 67, 0]]);
  });

  await t.test('tài liệu: chặn URL nguy hiểm, phân quyền, gắn vào câu hỏi và hiện khi xem lại', async () => {
    const bad = await admin.post('/documents', { title: 'Xấu', url: 'javascript:alert(1)' });
    assert.equal(bad.status, 400);
    assert.equal((await e2.post('/documents', { title: 'x' })).status, 403);
    const d = await admin.post('/documents', { title: 'Thông tư 78', code: '78/2014/TT-BTC', url: 'https://example.com/tt78', effectiveDate: '2014-08-02', summary: '' });
    assert.equal(d.status, 201);
    assert.equal(d.body.document.summary, null);
    const arch = await admin.post('/documents', { title: 'Cũ', status: 'ARCHIVED' });
    assert.equal((await e2.get('/documents')).body.documents.length, 1); // nhân viên chỉ thấy tài liệu hiệu lực
    assert.equal((await admin.get('/documents?all=1')).body.documents.length, 2);
    assert.equal((await e2.get('/documents?all=1')).body.documents.length, 1);
    // gắn vào câu hỏi (mới tạo, dùng cho đề riêng) rồi làm bài để xem lại
    assert.equal((await admin.post('/questions', q({ documentId: 'khong-co' }))).status, 400);
    const qq = await admin.post('/questions', q({ content: 'Có căn cứ', documentId: d.body.document.id, reference: 'Điều 5' }));
    assert.equal(qq.body.question.document.code, '78/2014/TT-BTC');
    const ex = await admin.post('/exams', { title: 'Đề căn cứ', durationMinutes: 5, questionIds: [qq.body.question.id], assignAll: true });
    await admin.patch(`/exams/${ex.body.exam.id}/status`, { status: 'PUBLISHED' });
    const e3 = client();
    await admin.post('/users', { username: 'nv3', fullName: 'nv3', role: 'EMPLOYEE', password: PW });
    await e3.post('/auth/login', { username: 'nv3', password: PW });
    const st = await e3.post(`/exams/${ex.body.exam.id}/start`);
    assert.ok(!JSON.stringify(st.body).includes('78/2014')); // chưa nộp thì không lộ căn cứ
    const r = await e3.post(`/exams/attempts/${st.body.attemptId}/submit`, { answers: {} });
    assert.equal(r.body.items[0].document.url, 'https://example.com/tt78');
    assert.equal(r.body.items[0].reference, 'Điều 5');
    assert.equal((await admin.del(`/documents/${arch.body.document.id}`)).body.document.status, 'ARCHIVED');
  });

  await t.test('phòng thi trực tiếp: phòng chờ, bắt đầu đồng loạt, giám sát realtime', async () => {
    await assert.rejects(connect(''), /unauthorized/); // chưa đăng nhập: không kết nối được
    const live = await admin.post('/exams', { title: 'Phòng live', durationMinutes: 10, questionIds: [ids.s], assignAll: true, live: true });
    const id = live.body.exam.id;
    assert.equal((await admin.post(`/exams/${id}/live/start`)).status, 400); // chưa mở thi
    await admin.patch(`/exams/${id}/status`, { status: 'PUBLISHED' });
    assert.equal((await e2.post(`/exams/${id}/start`)).status, 409); // phòng chưa bắt đầu
    assert.equal((await e2.post(`/exams/${id}/live/start`)).status, 403);

    const sMon = await connect(admin.cookie()), sNv = await connect(e2.cookie());
    try {
      const mon = await emit(sMon, 'room:monitor', id);
      assert.equal(mon.room.started, false);
      assert.deepEqual(mon.online, []);
      assert.ok((await emit(sNv, 'room:monitor', id)).error); // nhân viên không giám sát được

      const upd = waitFor(sMon, 'room:update', d => d.online.some(u => u.fullName === 'nv2'));
      const joined = await emit(sNv, 'room:join', id);
      assert.equal(joined.room.started, false);
      await upd;
      assert.ok((await emit(sNv, 'room:join', exam.id)).error); // đề không phải phòng live

      const started = waitFor(sNv, 'room:started');
      const st = await admin.post(`/exams/${id}/live/start`);
      assert.equal(st.status, 200);
      const ev = await started;
      assert.ok(new Date(ev.endsAt) > new Date());
      assert.equal((await admin.post(`/exams/${id}/live/start`)).status, 409);

      const run = await e2.post(`/exams/${id}/start`);
      assert.equal(run.status, 200);
      const at = await prisma.attempt.findUnique({ where: { id: run.body.attemptId } });
      assert.equal(at.startedAt.toISOString(), new Date(ev.startedAt).toISOString()); // cùng mốc giờ

      const sub = waitFor(sMon, 'room:update', d => d.submitted.some(u => u.fullName === 'nv2'));
      const optA = run.body.questions[0].options.find(o => o.text === 'A').id;
      assert.equal((await e2.post(`/exams/attempts/${run.body.attemptId}/submit`, { answers: { [ids.s]: [optA] } })).status, 200);
      await sub;
    } finally { sMon.close(); sNv.close(); }
  });

  await t.test('nhập CSV với cột Tài liệu: khớp theo số hiệu, báo lỗi nếu không thấy', async () => {
    const head = 'Chủ đề,Loại,Độ khó,Câu hỏi,A,B,C,D,E,F,Đúng,GT,CC,Tài liệu\n';
    const miss = await admin.post('/questions/import', { csv: head + 'T,Một đáp án,Dễ,QD1,a,b,,,,,A,,,Không có\n' });
    assert.match(miss.body.errors[0].error, /Không tìm thấy tài liệu/);
    const ok = await admin.post('/questions/import', { csv: head + 'T,Một đáp án,Dễ,QD2,a,b,,,,,A,,Điều 3,78/2014/tt-btc\n', commit: true });
    assert.equal(ok.body.imported, 1);
    const got = (await admin.get('/questions?q=QD2')).body.questions[0];
    assert.equal(got.document.code, '78/2014/TT-BTC');
  });

  await t.test('sinh câu hỏi bằng AI: phân quyền, kiểm tra đầu vào, lỗi dịch vụ không làm hỏng dữ liệu', async () => {
    const body = { topic: 'Thuế', count: 3, text: 'Điều 8. Thuế suất thuế GTGT phổ thông là 10%. '.repeat(10) };
    assert.equal((await e2.post('/questions/generate', body)).status, 403);
    assert.equal((await admin.post('/questions/generate', { ...body, topic: '' })).status, 400);
    assert.equal((await admin.post('/questions/generate', { ...body, count: 99 })).status, 400);
    assert.equal((await admin.post('/questions/generate', { ...body, documentId: 'khong-co' })).status, 400);
    assert.equal((await admin.post('/questions/generate', { ...body, text: 'ngắn' })).status, 400);
    assert.equal((await admin.post('/questions/generate', { ...body, text: undefined, filename: 'x.docx', base64: Buffer.from('rác').toString('base64') })).status, 400);
    const before = (await admin.get('/questions')).body.questions.length;
    const r = await admin.post('/questions/generate', body); // API giả không kết nối được
    assert.equal(r.status, 502);
    assert.equal((await admin.get('/questions')).body.questions.length, before);
  });

  await t.test('nhập Excel (.xlsx): file mẫu, lỗi theo dòng thật trong Excel, nhập thật', async () => {
    const tpl = await fetch(`${BASE}/questions/import-template.xlsx`, { headers: { Cookie: admin.cookie() } });
    assert.equal(tpl.status, 200);
    const bytes = Buffer.from(await tpl.arrayBuffer());
    assert.equal(bytes.subarray(0, 2).toString(), 'PK');
    assert.equal((await fetch(`${BASE}/questions/import-template.xlsx`, { headers: { Cookie: e2.cookie() } })).status, 403);
    const x = bytes.toString('base64');
    const dry = await admin.post('/questions/import', { xlsxBase64: x });
    assert.deepEqual([dry.status, dry.body.total, dry.body.valid, dry.body.errors.length, dry.body.imported], [200, 3, 3, 0, 0]);
    const done = await admin.post('/questions/import', { xlsxBase64: x, commit: true });
    assert.equal(done.body.imported, 3);
    assert.equal((await admin.post('/questions/import', { xlsxBase64: Buffer.from('rác không phải zip').toString('base64') })).status, 400);
    assert.equal((await admin.post('/questions/import', { csv: 'a', xlsxBase64: x })).status, 400); // chỉ một nguồn
  });

  await t.test('khoá tài khoản làm mất hiệu lực phiên', async () => {
    const users = (await admin.get('/users')).body.users;
    assert.equal((await admin.patch(`/users/${users.find(u => u.username === 'nv1').id}`, { status: 'LOCKED' })).status, 200);
    assert.equal((await e1.get('/exams')).status, 401);
  });
});
