// Test tích hợp với PostgreSQL thật. Chỉ chạy khi đặt TEST_DATABASE_URL (CSDL RỖNG dành riêng cho test: dữ liệu bị XOÁ!).
//   Trước: DATABASE_URL=<cùng giá trị> npx prisma migrate deploy
//   Chạy:  TEST_DATABASE_URL=postgresql://user:pw@localhost:5432/tth_quiz_test npm test -w server
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

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
    get: (p, raw) => call('GET', p, undefined, raw), post: (p, b) => call('POST', p, b ?? {}),
    patch: (p, b) => call('PATCH', p, b), del: p => call('DELETE', p)
  };
}

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
    env: { ...process.env, DATABASE_URL: DB, PORT: String(PORT), JWT_SECRET: 'x'.repeat(40) }, stdio: 'pipe'
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
    const tp = (await admin.get('/reports/topics')).body.topics;
    // Bài của nv1: 2/3 đúng, bài trễ của nv2: 0/1 — cùng chủ đề "Thuế" => 2/4
    assert.deepEqual(tp.map(x => [x.topic, x.correct, x.total, x.percent]), [['Thuế', 2, 4, 50]]);
    const users = (await admin.get('/users')).body.users;
    const nv1 = users.find(u => u.username === 'nv1').id;
    assert.equal((await admin.get(`/reports/topics?userId=${nv1}`)).body.topics[0].percent, 67);
    assert.equal((await admin.get(`/reports/topics?examId=${exam.id}`)).body.topics[0].total, 3);
    const emp = (await admin.get('/reports/employees')).body.employees;
    assert.deepEqual(emp.map(x => [x.username, x.attempts, x.avgPercent, x.passed]), [['nv2', 1, 0, 0], ['nv1', 1, 67, 0]]);
  });

  await t.test('khoá tài khoản làm mất hiệu lực phiên', async () => {
    const users = (await admin.get('/users')).body.users;
    assert.equal((await admin.patch(`/users/${users.find(u => u.username === 'nv1').id}`, { status: 'LOCKED' })).status, 200);
    assert.equal((await e1.get('/exams')).status, 401);
  });
});
