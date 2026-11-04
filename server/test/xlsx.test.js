import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { buildTemplate, parseXlsx } from '../src/xlsxImport.js';
import { rowToQuestion } from '../src/importQuestions.js';

test('file mẫu: đọc lại được, mọi dòng ví dụ đều hợp lệ', async () => {
  const rows = await parseXlsx(await buildTemplate());
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(r => r.line), [2, 3, 4]);
  for (const { row } of rows) assert.ok(rowToQuestion(row).data, JSON.stringify(row));
});

test('xlsx tự tạo: số, công thức, rich text, bỏ dòng trống, giữ số dòng thật', async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('S');
  ws.addRow(['h']);
  ws.addRow(['Thuế', 'Một đáp án', '', { richText: [{ text: 'Câu ' }, { text: 'hỏi?' }] }, 10, { formula: '1+1', result: 2 }, '', '', '', '', 'A', '', '', '']);
  ws.addRow([]);
  ws.addRow(['Thuế', 'Một đáp án', '', 'Câu 2', 'x', 'y', '', '', '', '', 'B', '', '', '']);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const rows = await parseXlsx(buf);
  assert.deepEqual(rows.map(r => r.line), [2, 4]);
  assert.equal(rows[0].row[3], 'Câu hỏi?');
  assert.deepEqual(rows[0].row.slice(4, 6), ['10', '2']);
  const q = rowToQuestion(rows[0].row).data;
  assert.deepEqual(q.options.map(o => [o.text, o.isCorrect]), [['10', true], ['2', false]]);
});

test('từ chối file không phải xlsx hoặc quá lớn', async () => {
  await assert.rejects(parseXlsx(Buffer.from('a,b,c\n1,2,3')), e => e.status === 400);
  await assert.rejects(parseXlsx(Buffer.concat([Buffer.from('PK'), Buffer.from('khong phai zip that')])), e => e.status === 400);
  await assert.rejects(parseXlsx(Buffer.alloc(3 * 1024 * 1024 + 1)), /quá lớn/);
});
